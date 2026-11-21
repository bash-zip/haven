using System.Diagnostics;
using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace Haven;

/// <summary>
/// Request/response channel between one web layer and Windows. The page posts
/// <c>{ id, type, args }</c>; we answer with <c>{ id, result | error }</c>.
/// Unsolicited notifications go out as <c>{ event, data }</c>.
/// </summary>
sealed class Bridge
{
    static readonly Dictionary<string, string> SettingsPages = new()
    {
        ["network"] = "ms-settings:network",
        ["bluetooth"] = "ms-settings:bluetooth",
        ["sound"] = "ms-settings:sound",
        ["display"] = "ms-settings:display",
        ["notifications"] = "ms-settings:notifications",
        ["personalization"] = "ms-settings:personalization",
        ["mouse"] = "ms-settings:mousetouchpad",
        ["keyboard"] = "ms-settings:typing",
        ["accessibility"] = "ms-settings:easeofaccess",
        ["language"] = "ms-settings:regionlanguage",
        ["power"] = "ms-settings:powersleep",
        ["accounts"] = "ms-settings:yourinfo",
        ["touchpad"] = "ms-settings:devices-touchpad",
        ["windows"] = "ms-settings:",
    };

    readonly ShellHost _host;
    readonly string _part;
    readonly CoreWebView2 _core;

    public Bridge(ShellHost host, string part, CoreWebView2 core)
    {
        _host = host;
        _part = part;
        _core = core;
    }

    public void Emit(string name, object? data = null)
    {
        // A web view being torn down (display change, quit, crash recovery) can still be
        // poked by timers and other pages; that must never take the desktop down with it.
        try { _core.PostWebMessageAsJson(JsonSerializer.Serialize(new { @event = name, data }, Json.Options)); }
        catch (Exception ex) when (IsDisposed(ex)) { Log.Info($"[{_part}] emit '{name}' skipped: web view closed"); }
    }

    /// <summary>True for exceptions from touching a WebView2 that has already been disposed.</summary>
    public static bool IsDisposed(Exception ex) =>
        ex.Message.Contains("CoreWebView2 members cannot be accessed")
        || (ex is System.Runtime.InteropServices.COMException ce && ce.HResult == unchecked((int)0x8007139F));

    public async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        int id = 0;
        object? result = null;
        string? error = null;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            id = root.GetProperty("id").GetInt32();
            var type = root.GetProperty("type").GetString() ?? "";
            var args = root.TryGetProperty("args", out var a) ? a.Clone() : default;
            // Files dropped on the page arrive alongside the message (with their real paths).
            var files = e.AdditionalObjects?.OfType<CoreWebView2File>().Select(f => f.Path).ToList() ?? new List<string>();
            result = await HandleAsync(type, args, files);
        }
        catch (Exception ex)
        {
            error = ex.Message;
            // Expected refusals (a bad file, no key yet) are plain messages; anything else gets its stack logged.
            if (ex is InvalidOperationException) Log.Info($"[{_part}] request {id} refused: {ex.Message}");
            else Log.Error(_part, ex.ToString());
        }
        try { _core.PostWebMessageAsJson(JsonSerializer.Serialize(new { id, result, error }, Json.Options)); }
        catch (Exception ex) when (IsDisposed(ex)) { Log.Info($"[{_part}] reply {id} skipped: web view closed"); }
    }

    async Task<object?> HandleAsync(string type, JsonElement args, List<string> files)
    {
        switch (type)
        {
            // ----- Environment -----
            case "env":
                var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                return new
                {
                    part = _part,
                    user = Environment.UserName,
                    downloads = Path.Combine(profile, "Downloads"),
                    documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                    desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    pictures = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
                    version = typeof(Bridge).Assembly.GetName().Version?.ToString(3),
                    taskbarHidden = Taskbar.IsHidden,
                    autostart = ShellHost.Autostart,
                    dataDir = Paths.Root,
                };
            case "account": return SystemInfo.Account();
            case "windowsWallpaper": return SystemInfo.WindowsWallpaper();
            case "wallpaperLibrary": return await Task.Run(SystemInfo.WindowsWallpaperLibrary);
            case "batteries": return await SystemInfo.DeviceBatteriesAsync();
            case "location": return await SystemInfo.LocationAsync();

            // ----- State, shared by both layers -----
            case "getState":
                return await StateStore.LoadAsync();
            case "setState":
                // Whole state (importing a setup): replace, and tell every other page.
                await StateStore.ReplaceAsync(args);
                _host.EmitToOthers(_part, "state", args);
                return null;
            case "patchState":
            {
                var set = args.TryGetProperty("set", out var st) ? st : default;
                var del = args.TryGetProperty("del", out var dl) && dl.ValueKind == JsonValueKind.Array
                    ? dl.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToList() : new List<string>();
                await StateStore.PatchAsync(set, del);
                _host.EmitToOthers(_part, "statePatch", args);
                return null;
            }
            case "send":
                // Lets one layer ask the other to do something (open Settings, show a menu…).
                _host.Emit(Str(args, "to"), "command", new
                {
                    name = Str(args, "name"),
                    data = args.TryGetProperty("data", out var d) ? (object)d : null,
                    from = _part,
                });
                return null;

            // ----- Shell layer geometry -----
            case "setRegion":
                var rects = new List<Native.RECT>();
                if (args.TryGetProperty("rects", out var list))
                    foreach (var r in list.EnumerateArray())
                        rects.Add(new Native.RECT(r[0].GetInt32(), r[1].GetInt32(), r[2].GetInt32(), r[3].GetInt32()));
                _host.SetShellRegion(Bool(args, "full"), rects);
                return null;
            case "setGlass":
                var plates = new List<GlassPlates.Plate>();
                if (args.TryGetProperty("plates", out var plateList))
                    foreach (var p in plateList.EnumerateArray())
                        plates.Add(new GlassPlates.Plate(p[0].GetInt32(), p[1].GetInt32(), p[2].GetInt32(), p[3].GetInt32(), p[4].GetInt32()));
                uint? tint = null;
                if (args.TryGetProperty("tint", out var tn) && tn.ValueKind == JsonValueKind.Array && tn.GetArrayLength() == 4)
                    tint = (uint)(Math.Clamp(tn[3].GetInt32(), 1, 255) << 24 | Math.Clamp(tn[2].GetInt32(), 0, 255) << 16 | Math.Clamp(tn[1].GetInt32(), 0, 255) << 8 | Math.Clamp(tn[0].GetInt32(), 0, 255));
                _host.SetGlass(plates, tint);
                return null;
            case "setDockRect":
                _host.SetDockRect(args.TryGetProperty("rect", out var dr) && dr.ValueKind == JsonValueKind.Array
                    ? new Native.RECT(dr[0].GetInt32(), dr[1].GetInt32(), dr[2].GetInt32(), dr[3].GetInt32())
                    : null);
                return null;
            case "setAutostart":
                ShellHost.Autostart = Bool(args, "on");
                return ShellHost.Autostart;
            case "updateStatus": return await Updater.StatusAsync(Bool(args, "force"));
            case "installHaven":
                if (Installer.Install(start: false))
                {
                    // Hand over to the installed copy.
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(Updater.InstallDir, "Haven.exe")) { UseShellExecute = true });
                    _host.Quit();
                }
                return null;
            case "uninstallHaven":
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(AppContext.BaseDirectory, "Haven.exe"), "--uninstall") { UseShellExecute = false });
                return null;
            case "applyUpdate":
                await Updater.ApplyAndRestartAsync(_host.Quit);
                return null;
            // ----- Idle time, spaces, app menus, tray, Stage Manager -----
            case "idle":
                var info = new LASTINPUTINFO { cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<LASTINPUTINFO>() };
                GetLastInputInfo(ref info);
                return new { seconds = (Environment.TickCount - (int)info.dwTime) / 1000.0 };
            case "desktops":
                var (spaces, currentSpace) = VirtualDesktops.Read();
                return new { list = spaces, current = currentSpace };
            case "switchDesktop":
                await VirtualDesktops.SwitchTo(args.GetProperty("index").GetInt32());
                return null;
            case "stepDesktop":
                VirtualDesktops.Step(args.GetProperty("direction").GetInt32());
                return null;
            case "newDesktop":
                VirtualDesktops.Add();
                return null;
            case "closeDesktop":
                VirtualDesktops.CloseCurrent();
                return null;
            case "appMenus":
                return await AppMenus.NamesAsync(new IntPtr(args.GetProperty("hwnd").GetInt64()));
            case "openAppMenu":
                await AppMenus.OpenAsync(new IntPtr(args.GetProperty("hwnd").GetInt64()), args.GetProperty("index").GetInt32());
                return null;
            case "trayIcons": return _host.Tray.Snapshot();
            case "trayClick":
                _host.Tray.Click(Str(args, "id"), Str(args, "button"), args.GetProperty("x").GetInt32(), args.GetProperty("y").GetInt32());
                return null;
            case "setTray":
                _host.SetTray(Bool(args, "on"));
                return _host.Tray.Snapshot();
            case "setStage":
                _host.SetStage(Bool(args, "on"));
                return _host.StageEnabled;
            case "setLocked":
                _host.SetLocked(Bool(args, "on"));
                return null;
            case "setInteractive":
                _host.SetShellInteractive(Bool(args, "on"));
                return null;
            case "reserve":
                if (_part.StartsWith("secondary")) _host.ReserveSecondary(_part, args.GetProperty("top").GetInt32(), args.GetProperty("bottom").GetInt32());
                else _host.Reserve(args.GetProperty("top").GetInt32(), args.GetProperty("bottom").GetInt32(),
                    args.TryGetProperty("left", out var l) ? l.GetInt32() : 0, args.TryGetProperty("right", out var r) ? r.GetInt32() : 0);
                return null;
            case "setZoom":
                _host.SetZoom(_part, args.GetProperty("zoom").GetDouble());
                return null;
            case "setTaskbarHidden":
                _host.SetTaskbarHidden(Bool(args, "hidden"));
                return null;

            // ----- Apps & windows -----
            case "apps": return await _host.Apps.GetAsync(refresh: Bool(args, "refresh"));
            case "games": return await Task.Run(Steam.Load);
            case "launchApp":
                await _host.Apps.LaunchAsync(Str(args, "id"));
                return null;
            case "launchUri":
                var uri = Str(args, "uri");
                if (!Steam.IsLaunchUri(uri)) throw new InvalidOperationException("Unsupported link.");
                Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
                return null;
            case "windows":
                var fgWindow = new IntPtr(WindowTracker.Foreground());
                // Clicking the wallpaper makes Progman/WorkerW the foreground; they cover the
                // monitor but are the desktop, not a fullscreen app.
                return new
                {
                    windows = await _host.Windows.ListAsync(),
                    foreground = WindowTracker.Foreground(),
                    language = SystemInfo.InputLanguage(),
                    fullscreen = Native.CoversPrimaryMonitor(fgWindow) && !ShellHost.IsShellWindow(fgWindow),
                };
            case "activateApp":
                WindowTracker.ActivateApp(args.GetProperty("hwnd").GetInt64());
                return null;
            case "focus":
                WindowTracker.Focus(args.GetProperty("hwnd").GetInt64());
                return null;
            case "minimize":
                WindowTracker.Minimize(args.GetProperty("hwnd").GetInt64());
                return null;
            case "closeWindow":
                WindowTracker.Close(args.GetProperty("hwnd").GetInt64());
                return null;

            // ----- Files & places -----
            case "openFolder":
                var folder = Str(args, "path");
                if (!Directory.Exists(folder)) throw new InvalidOperationException("That folder doesn't exist.");
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{folder}\"") { UseShellExecute = true });
                return null;
            case "openShell":
                var shellTarget = Str(args, "target") switch
                {
                    "trash" => "shell:RecycleBinFolder",
                    "thispc" => "shell:MyComputerFolder",
                    "explorer" => "",
                    _ => throw new InvalidOperationException("Unsupported location."),
                };
                Process.Start(new ProcessStartInfo("explorer.exe", shellTarget) { UseShellExecute = true });
                return null;
            case "openSettingsPage":
                if (!SettingsPages.TryGetValue(Str(args, "page"), out var settingsUri))
                    throw new InvalidOperationException("Unknown settings page.");
                Process.Start(new ProcessStartInfo(settingsUri) { UseShellExecute = true });
                return null;

            // ----- Desktop icons -----
            case "desktopItems": return await _host.Desktop.ListAsync();
            case "desktopOpen":
                DesktopItems.Open(Str(args, "path"));
                return null;
            case "desktopReveal":
                DesktopItems.Reveal(Str(args, "path"));
                return null;
            case "desktopNewFolder": return DesktopItems.NewFolder();
            case "desktopRename": return DesktopItems.Rename(Str(args, "path"), Str(args, "name"));

            // ----- Control Center & status -----
            case "volume": return SystemControls.Volume();
            case "setVolume":
                SystemControls.SetVolume(args.GetProperty("level").GetDouble());
                return SystemControls.Volume();
            case "setMute":
                SystemControls.SetMute(Bool(args, "muted"));
                return SystemControls.Volume();
            case "brightness": return SystemControls.Brightness();
            case "setBrightness":
                await Task.Run(() => SystemControls.SetBrightness(args.GetProperty("level").GetInt32()));
                return null;
            case "radios": return await SystemControls.RadiosAsync();
            case "setRadio":
                await SystemControls.SetRadioAsync(Str(args, "kind"), Bool(args, "on"));
                return await SystemControls.RadiosAsync();
            case "network": return SystemControls.Network();
            case "stats": return SystemControls.Stats();
            case "events": return await SystemControls.EventsAsync();

            // ----- Files: search, Quick Look, stacks, open with -----
            case "searchFiles": return await _host.Files.SearchAsync(Str(args, "query"));
            case "preview": return await _host.Files.PreviewAsync(Str(args, "path"));
            case "recentFiles":
                return await _host.Files.RecentAsync(Str(args, "folder"),
                    args.TryGetProperty("count", out var cnt) ? cnt.GetInt32() : 12, Bool(args, "images"));
            case "openPath":
                Files.Open(Str(args, "path"));
                return null;
            case "revealPath":
                Files.Reveal(Str(args, "path"));
                return null;
            case "openWith":
                var exe = args.TryGetProperty("exePath", out var ep) && ep.ValueKind == JsonValueKind.String ? ep.GetString()
                    : args.TryGetProperty("appId", out var ai) && ai.ValueKind == JsonValueKind.String ? AppCatalog.ResolveExe(ai.GetString()!) : null;
                Files.OpenWith(exe, files);
                return files.Count;
            case "webSearch":
                var url = "https://www.bing.com/search?q=" + Uri.EscapeDataString(Str(args, "query"));
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                return null;

            // ----- Windows: snapping, Mission Control, input -----
            case "snap":
                _host.Snap(Str(args, "where"));
                return null;
            case "missionControl":
                if (Bool(args, "app")) await _host.ShowAppExposeAsync();
                else await _host.ShowMissionControlAsync(args.TryGetProperty("exe", out var mx) && mx.ValueKind == JsonValueKind.String ? mx.GetString() : null);
                return null;
            case "slide":
                _host.Slide(args.GetProperty("hwnd").GetInt64(), args.GetProperty("direction").GetInt32());
                return null;
            case "setSwipeOrder":
                var order = new List<(string, long)>();
                foreach (var o in args.GetProperty("apps").EnumerateArray())
                    order.Add((o.GetProperty("exe").GetString()!.ToLowerInvariant(), o.GetProperty("hwnd").GetInt64()));
                _host.SetSwipeOrder(order);
                return null;
            case "pickImage":
                return PickImage();

            // ----- Clipboard history -----
            case "clipHistory": return ClipboardHistory.Items();
            case "clipPaste": await _host.PasteClipAsync(Str(args, "id"), Bool(args, "paste")); return null;
            case "clipPin": ClipboardHistory.Pin(Str(args, "id"), Bool(args, "pinned")); return null;
            case "clipDelete": ClipboardHistory.Delete(Str(args, "id")); return null;
            case "clipClear": ClipboardHistory.Clear(Bool(args, "pinned")); return null;
            case "clipSnippet": ClipboardHistory.AddSnippet(Str(args, "text")); return null;
            case "clipCopy": return ClipboardHistory.Copy(Str(args, "id"));
            case "setClipboardHistory": _host.SetClipboardHistory(Bool(args, "on")); return null;
            case "systemCheck": return await _host.RunChecksAsync();
            case "logError": Log.Error(_part, Str(args, "message")); return null;
            case "diagnosticReport": return Log.Report(await _host.RunChecksAsync());
            case "openLogs":
                Directory.CreateDirectory(Log.Folder);
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"\"{Log.Folder}\"") { UseShellExecute = true });
                return null;

            case "stocks":
                return await Stocks.GetAsync(args.GetProperty("symbols").EnumerateArray().Select(e => e.GetString() ?? ""));
            case "currentSpace":
            {
                var (spaceList, cur) = VirtualDesktops.Read();
                return new { id = spaceList[cur].Id, name = spaceList[cur].Name, index = cur };
            }

            // ----- Window animations -----
            case "setDockIcons":
            {
                var map = new Dictionary<string, Native.RECT>();
                foreach (var p in args.GetProperty("icons").EnumerateObject())
                {
                    var a = p.Value.EnumerateArray().Select(v => v.GetInt32()).ToArray();
                    if (a.Length == 4) map[p.Name] = new Native.RECT(a[0], a[1], a[2], a[3]);
                }
                _host.SetDockIcons(map);
                return null;
            }
            case "setWindowStyle":
                _host.SetWindowStyle(Str(args, "corners"), Str(args, "border"), Str(args, "accent"), Str(args, "hairline"));
                return null;
            case "setWindowAnimations": _host.SetWindowAnimations(Bool(args, "on")); return null;

            // ----- Other displays -----
            case "setOtherDisplays": _host.SetOtherDisplays(Bool(args, "on")); return null;
            case "windowScreens":
            {
                var map = new Dictionary<string, int>();
                foreach (var e in args.GetProperty("hwnds").EnumerateArray()) { var h = e.GetInt64(); map[h.ToString()] = _host.ScreenOf(new IntPtr(h)); }
                return map;
            }

            // ----- Audio visualizers -----
            case "audioViz": _host.SetAudioViz(_part, Bool(args, "on")); return null;

            // ----- Setup backup -----
            case "exportSetup": return SetupPackage.Export();
            case "importSetup": return SetupPackage.Import();
            case "exportTheme": return SetupPackage.ExportTheme(Str(args, "name"), args.GetProperty("look"));
            case "importTheme": return SetupPackage.ImportTheme();

            // ----- Claude -----
            case "askClaude": _host.AskClaude(Str(args, "id"), Str(args, "question")); return null;
            case "cancelClaude": ClaudeAsk.Cancel(); return null;
            case "claudeStatus": return new { hasKey = ClaudeAsk.HasKey };
            case "setClaudeKey": ClaudeAsk.SaveKey(args.TryGetProperty("key", out var ck) ? ck.GetString() : null); return new { hasKey = ClaudeAsk.HasKey };

            // ----- Windows Hello -----
            case "helloAvailable": return await LockAuth.HelloAvailableAsync();
            case "helloVerify": return await _host.HelloVerifyAsync();
            case "pickFolder":
            {
                var dialog = new OpenFolderDialog { Title = args.TryGetProperty("title", out var t) ? t.GetString() : "Choose a folder" };
                return dialog.ShowDialog() == true ? dialog.FolderName : null;
            }
            case "setInput":
                _host.SetInput(Bool(args, "gestures"), args.TryGetProperty("fingers", out var fg) ? fg.GetInt32() : 3, Bool(args, "switcher"),
                    !args.TryGetProperty("windowsKeys", out var wk) || wk.ValueKind != System.Text.Json.JsonValueKind.False);
                return new { touchpad = _host.Touchpad.Detected };
            case "touchpadStatus": return new { touchpad = _host.Touchpad.Detected };

            // ----- Media -----
            case "media": return await Media.NowPlayingAsync();
            case "mediaControl":
                await Media.ControlAsync(Str(args, "action"));
                return null;

            // ----- System -----
            case "system":
                RunSystemAction(Str(args, "action"));
                return null;
            case "pickWallpaper":
                return PickWallpaper();
            case "pickLiveWallpaper":
                return PickLiveWallpaper();
            case "quit":
                _host.Quit();
                return null;
            case "restartHaven":
                _host.Restart();
                return null;

            default:
                throw new InvalidOperationException($"Unknown request '{type}'.");
        }
    }

    static void RunSystemAction(string action)
    {
        switch (action)
        {
            case "start": Native.PressWindowsKey(); break;
            case "language": Native.PressKeys(0x5B, 0x20); break; // Win+Space: next keyboard language
            case "desktop": // show the desktop (minimize every app, but not Haven), or bring them back
                WindowTracker.ToggleDesktop();
                break;
            case "taskmgr": Process.Start(new ProcessStartInfo("taskmgr.exe") { UseShellExecute = true }); break;
            case "lock": Native.LockWorkStation(); break;
            case "signout": Process.Start(new ProcessStartInfo("shutdown.exe", "/l") { CreateNoWindow = true }); break;
            case "restart": Process.Start(new ProcessStartInfo("shutdown.exe", "/r /t 0") { CreateNoWindow = true }); break;
            case "shutdown": Process.Start(new ProcessStartInfo("shutdown.exe", "/s /t 0") { CreateNoWindow = true }); break;
            default: throw new InvalidOperationException("Unknown action.");
        }
    }

    /// <summary>Lets you choose a picture for a custom icon (PNG, SVG, JPEG, ICO, WebP, GIF).</summary>
    string? PickImage()
    {
        var dialog = new OpenFileDialog
        {
            Title = "Choose an icon",
            Filter = "Images|*.png;*.svg;*.jpg;*.jpeg;*.ico;*.webp;*.gif;*.bmp",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
        };
        if (dialog.ShowDialog() != true) return null;
        var dir = Path.Combine(Paths.Public, "custom");
        Directory.CreateDirectory(dir);
        var target = Path.Combine(dir, Guid.NewGuid().ToString("n") + Path.GetExtension(dialog.FileName).ToLowerInvariant());
        File.Copy(dialog.FileName, target);
        return Paths.Url(target);
    }

    string? PickWallpaper()
    {
        var dialog = new OpenFileDialog
        {
            Title = "Choose a wallpaper",
            Filter = "Images|*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.gif",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
        };
        if (dialog.ShowDialog() != true) return null;
        var target = Path.Combine(Paths.Wallpapers, Guid.NewGuid().ToString("n") + Path.GetExtension(dialog.FileName));
        File.Copy(dialog.FileName, target);
        return Paths.Url(target);
    }

    string? PickLiveWallpaper()
    {
        var dialog = new OpenFileDialog
        {
            Title = "Choose a live wallpaper video",
            Filter = "Video files|*.mp4;*.webm;*.avi;*.mov;*.wmv;*.m4v",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos),
        };
        if (dialog.ShowDialog() != true) return null;
        var target = Path.Combine(Paths.Wallpapers, Guid.NewGuid().ToString("n") + Path.GetExtension(dialog.FileName).ToLowerInvariant());
        File.Copy(dialog.FileName, target);
        return Paths.Url(target);
    }

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    struct LASTINPUTINFO { public uint cbSize, dwTime; }
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    static string Str(JsonElement args, string name) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()!
            : throw new ArgumentException($"Missing '{name}'.");

    static bool Bool(JsonElement args, string name) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
}
