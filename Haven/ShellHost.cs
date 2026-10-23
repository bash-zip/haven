using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;

namespace Haven;

/// <summary>
/// Runs Haven as the desktop: the desktop layer (wallpaper, widgets, icons) behind every window,
/// the shell layer (menu bar, Dock, overlays) above them, screen-edge reservations, and the
/// hidden Windows taskbar. Both layers load the same web UI in different modes.
/// </summary>
sealed partial class ShellHost
{
    public const string AppHost = "haven.example";
    public const string DataHost = "data.haven.example";

    const int HotkeySearch = 1, HotkeyQuit = 2, HotkeyMissionControl = 3, HotkeyAppExpose = 4, HotkeyLock = 5,
        HotkeyShotFull = 6, HotkeyShotRegion = 7, HotkeyWallpapers = 8;
    bool _locked;
    const uint MOD_ALT = 0x1, MOD_CONTROL = 0x2, MOD_NOREPEAT = 0x4000;

    public AppCatalog Apps { get; } = new();
    public WindowTracker Windows { get; } = new();
    public DesktopItems Desktop { get; } = new();
    public Files Files { get; } = new();
    public Touchpad Touchpad { get; } = new();
    SwitcherHook? _switcher;
    SpaceSlide? _slide;
    public TrayHost Tray { get; } = new();
    public AudioViz Audio { get; } = new();
    StageManager? _stage;
    List<(string Exe, long Hwnd)> _swipeOrder = new();
    IntPtr _slideTarget;
    int _slideDir;
    double _slideProgress;
    readonly DispatcherTimer _corners = new() { Interval = TimeSpan.FromMilliseconds(50) };
    string? _corner;
    DateTime _cornerSince;
    bool _cornerFired;

    DesktopLayer _desktop = null!;
    ShellLayer _shell = null!;
    AppBar? _topBar, _bottomBar;
    readonly GlassPlates _glass = new();
    Native.RECT? _dockRect;
    bool? _dockOverlap;
    readonly Dictionary<string, Bridge> _bridges = new();
    readonly List<string> _notices = new();
    readonly DispatcherTimer _watch = new() { Interval = TimeSpan.FromMilliseconds(800) };
    bool _quitting;
    bool _wantTaskbarHidden;

    public async Task StartAsync()
    {
        // Undo anything a previous crash left behind before changing the taskbar again.
        Taskbar.Restore();
        WindowsGestures.Restore();
        StageManager.RecoverFromDisk();
        _wantTaskbarHidden = ReadSetting("hideTaskbar", true);
        if (_wantTaskbarHidden) HideTaskbar();

        // Interface sounds (and the startup chime) play without waiting for a click.
        var options = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
        var env = await CoreWebView2Environment.CreateAsync(null, Paths.WebViewData, options);

        _desktop = new DesktopLayer();
        _desktop.DisplayChanged += OnDisplayChanged;
        _desktop.Hotkey += OnHotkey;
        _desktop.RawInput += Touchpad.OnInput;
        _desktop.ShellEvent += OnShellEvent;
        _desktop.ExplorerRestarted += OnExplorerRestarted;
        Touchpad.Swipe += (dir, fingers) => Emit("shell", "gesture", new { direction = dir, fingers });
        Touchpad.Pan += OnPan;
        Touchpad.Tap += fingers => Emit("shell", "tap", fingers);
        _desktop.Show();
        _desktop.SendToBottom();
        RegisterHotkeys();
        _ = Task.Run(() => { try { _ = Autostart; } catch { } });
        Touchpad.Register(_desktop.Handle);
        _switcher = new SwitcherHook();
        _switcher.Command += cmd => Emit("shell", "switcher", cmd);
        _switcher.Shortcut += OnWindowsShortcut;

        _env = env;
        await _desktop.Web.EnsureCoreWebView2Async(env);
        // The UI ships with the app, so never serve a stale copy from a previous version.
        await _desktop.Web.CoreWebView2.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);
        Configure(_desktop.Web.CoreWebView2, "desktop");

        _shell = new ShellLayer();
        await _shell.InitAsync(env);
        Configure(_shell.Core!, "shell");

        _slide = new SpaceSlide();
        _animator = new WindowAnimator(DockIconFor, () => _desktop.Handle, RaiseShell) { Enabled = ReadSetting("windowAnimations", true) };
        if (_animator.Enabled) WindowAnimator.SuppressOsAnimation();
        _stage = new StageManager(h => h == _desktop.Handle || h == _shell.Handle || IsShellWindow(h));
        if (ReadSetting("stageManager", false)) _stage.Enable(_desktop.Handle);
        Tray.Changed += icons => Emit("shell", "tray", icons);
        ClipboardHistory.Changed += () => Emit("shell", "clipboard");
        Audio.Frame += (b, w, beat) =>
        {
            var data = new { b, w, beat };
            if (_audioParts.Contains("desktop")) Emit("desktop", "audio", data);
            if (_audioParts.Contains("shell")) Emit("shell", "audio", data);
        };
        if (ReadSetting("clipboardHistory", true)) ClipboardHistory.Start(_desktop.Handle);
        if (ReadSetting("trayIcons", true)) Tray.Start();
        _topBar = new AppBar(AppBar.Top);
        _bottomBar = new AppBar(AppBar.Bottom);

        Desktop.Changed += () => Application.Current.Dispatcher.BeginInvoke(() => Emit("desktop", "desktopChanged"));

        _ = SyncDisplaysAsync();
        _watch.Tick += (_, _) => Watch();
        _watch.Start();
        _corners.Tick += (_, _) => { CheckCorners(); Touchpad.CheckTimeout(); };
        _corners.Start();
    }

    void Configure(CoreWebView2 core, string part)
    {
        core.SetVirtualHostNameToFolderMapping(AppHost,
            Path.Combine(AppContext.BaseDirectory, "wwwroot"), CoreWebView2HostResourceAccessKind.Allow);
        // Icons, wallpapers and other pictures are handed to the page directly rather than through a
        // folder mapping: newer WebView2 versions can refuse to read the folder itself (ERR_ACCESS_DENIED).
        core.AddWebResourceRequestedFilter($"https://{DataHost}/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, e) => ServeData(core, e);

        var s = core.Settings;
        s.AreDefaultContextMenusEnabled = false;
        s.IsStatusBarEnabled = false;
        s.IsZoomControlEnabled = false;
        s.IsPinchZoomEnabled = false;
        s.IsSwipeNavigationEnabled = false;
#if !DEBUG
        s.AreDevToolsEnabled = false;
        s.AreBrowserAcceleratorKeysEnabled = false;
#endif
        core.NavigationStarting += (_, e) =>
        {
            if (!e.Uri.StartsWith($"https://{AppHost}/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
        };
        core.NewWindowRequested += (_, e) => e.Handled = true;

        var bridge = new Bridge(this, part, core);
        _bridges[part] = bridge;
        core.WebMessageReceived += bridge.OnMessage;
        if (part == "shell")
            core.NavigationCompleted += (_, _) => { foreach (var n in _notices) Emit("shell", "notice", n); };

        var query = part.StartsWith("secondary") ? $"part=secondary&screen={part["secondary".Length..]}" : $"part={part}";
        core.Navigate($"https://{AppHost}/index.html?{query}");
    }

    static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".gif"] = "image/gif",
        [".webp"] = "image/webp", [".bmp"] = "image/bmp", [".ico"] = "image/x-icon", [".svg"] = "image/svg+xml",
    };

    /// <summary>Answers a request for https://data.haven.example/… with the matching file under Paths.Public.</summary>
    static void ServeData(CoreWebView2 core, CoreWebView2WebResourceRequestedEventArgs e)
    {
        try
        {
            var uri = new Uri(e.Request.Uri);
            var relative = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')).Replace('/', '\\');
            var root = Path.GetFullPath(Paths.Public) + Path.DirectorySeparatorChar;
            var file = Path.GetFullPath(Path.Combine(root, relative));
            // Only files inside Haven's public folder, never anything elsewhere on disk.
            if (!file.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(file))
            {
                e.Response = core.Environment.CreateWebResourceResponse(null, 404, "Not Found", "");
                return;
            }
            var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var type = ContentTypes.TryGetValue(Path.GetExtension(file), out var t) ? t : "application/octet-stream";
            e.Response = core.Environment.CreateWebResourceResponse(stream, 200, "OK",
                $"Content-Type: {type}\nAccess-Control-Allow-Origin: *\nCache-Control: max-age=86400");
        }
        catch
        {
            e.Response = core.Environment.CreateWebResourceResponse(null, 500, "Error", "");
        }
    }

    public void Emit(string part, string name, object? data = null)
    {
        if (_bridges.TryGetValue(part, out var b)) b.Emit(name, data);
    }

    public string Other(string part) => part == "shell" ? "desktop" : "shell";

    /// <summary>Settings changed in one page: every other page (both layers, every display) hears it.</summary>
    public void EmitToOthers(string part, string name, object? data)
    {
        foreach (var p in _bridges.Keys.ToList()) if (p != part) Emit(p, name, data);
    }

    // ----- Other displays -----

    readonly List<SecondaryScreen> _secondaries = new();
    CoreWebView2Environment? _env;

    async Task SyncDisplaysAsync()
    {
        if (_env == null || _quitting) return;
        var others = Native.Monitors().Where(m => !m.Primary).ToList();
        bool same = others.Count == _secondaries.Count && others.Zip(_secondaries).All(p => p.First.Bounds.Equals(p.Second.Bounds));
        if (same) return;
        foreach (var old in _secondaries) { _bridges.Remove(old.Part); old.Shutdown(); }
        _secondaries.Clear();
        if (!ReadSetting("otherDisplays", true)) return;
        int n = 1;
        foreach (var m in others)
        {
            var screen = new SecondaryScreen("secondary" + n++, m.Bounds);
            _secondaries.Add(screen);
            screen.Show();
            screen.Place();
            await screen.Web.EnsureCoreWebView2Async(_env);
            Configure(screen.Web.CoreWebView2, screen.Part);
        }
    }

    public void ReserveSecondary(string part, int top, int bottom) =>
        _secondaries.FirstOrDefault(s => s.Part == part)?.Reserve(top, bottom);

    public void SetOtherDisplays(bool on)
    {
        if (!on) { foreach (var old in _secondaries) { _bridges.Remove(old.Part); old.Shutdown(); } _secondaries.Clear(); }
        else _ = SyncDisplaysAsync();
    }

    /// <summary>Which display a window is on: 0 = primary, 1… = the others in order.</summary>
    public int ScreenOf(IntPtr hwnd)
    {
        if (!Native.GetWindowRect(hwnd, out var r)) return 0;
        int cx = (r.Left + r.Right) / 2, cy = (r.Top + r.Bottom) / 2;
        for (int i = 0; i < _secondaries.Count; i++)
        {
            var b = _secondaries[i].Bounds;
            if (cx >= b.Left && cx < b.Right && cy >= b.Top && cy < b.Bottom) return i + 1;
        }
        return 0;
    }

    // ----- Shell layer -----

    public void SetShellRegion(bool full, IReadOnlyList<Native.RECT> rects) => _shell.SetRegion(full, rects);
    public void SetGlass(IReadOnlyList<GlassPlates.Plate> plates) => _glass.Set(plates, _shell.Handle);

    /// <summary>Where the Dock is (physical pixels), so we can tell when a window overlaps it.</summary>
    public void SetDockRect(Native.RECT? rect)
    {
        _dockRect = rect;
        _dockOverlap = null; // re-evaluate and re-send on the next tick
    }

    const string RunKey = @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run";

    /// <summary>
    /// Start Haven when you sign in, using a Task Scheduler log-on task. (Windows skipped the classic
    /// "Run" sign-in entry on some PCs; a log-on task is more dependable and starts earlier.)
    /// </summary>
    /// <summary>Last known Autostart value, for moments when running schtasks is too slow (sign-out).</summary>
    public static bool AutostartKnown { get; private set; }

    public static bool Autostart
    {
        get => AutostartKnown = RunSchtasks("/Query /TN \"Haven\"") == 0;
        set
        {
            AutostartKnown = value;
            // Clean up the older sign-in entry so Haven never starts twice.
            using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true))
                key?.DeleteValue("Haven", throwOnMissingValue: false);

            if (!value)
            {
                RunSchtasks("/Delete /TN \"Haven\" /F");
                return;
            }
            if (Environment.ProcessPath is not string exe) return;
            var user = $"{Environment.UserDomainName}\\{Environment.UserName}";
            var esc = (string s) => System.Security.SecurityElement.Escape(s);
            var xml = $"""
                <?xml version="1.0" encoding="UTF-16"?>
                <Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
                  <RegistrationInfo><Description>Starts Haven, your desktop, when you sign in.</Description></RegistrationInfo>
                  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>{esc(user)}</UserId></LogonTrigger></Triggers>
                  <Principals><Principal id="Author"><UserId>{esc(user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
                  <Settings>
                    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
                    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
                    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
                    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
                    <Priority>4</Priority>
                    <StartWhenAvailable>true</StartWhenAvailable>
                  </Settings>
                  <Actions Context="Author"><Exec><Command>{esc(exe)}</Command><Arguments>--startup</Arguments></Exec></Actions>
                </Task>
                """;
            var file = Path.Combine(Path.GetTempPath(), "haven-task.xml");
            File.WriteAllText(file, xml, System.Text.Encoding.Unicode);
            try
            {
                if (RunSchtasks($"/Create /TN \"Haven\" /XML \"{file}\" /F") != 0)
                    throw new InvalidOperationException("Windows didn't allow Haven to start at sign-in.");
            }
            finally { File.Delete(file); }
        }
    }

    static int RunSchtasks(string args)
    {
        var psi = new System.Diagnostics.ProcessStartInfo("schtasks.exe", args)
        {
            CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true,
        };
        using var p = System.Diagnostics.Process.Start(psi)!;
        p.StandardOutput.ReadToEnd();
        p.StandardError.ReadToEnd();
        p.WaitForExit(10_000);
        return p.ExitCode;
    }
    public void SetShellInteractive(bool on) => _shell.SetInteractive(on);

    public void Reserve(int top, int bottom)
    {
        _topBar?.SetThickness(top);
        _bottomBar?.SetThickness(bottom);
    }

    public void SetZoom(string part, double zoom)
    {
        zoom = Math.Clamp(zoom, 0.5, 2.5);
        if (part == "shell") _shell.SetZoom(zoom);
        else _desktop.Web.ZoomFactor = zoom;
    }

    /// <summary>Explorer rebuilt the taskbar: hide it again and re-reserve the menu bar and Dock space.</summary>
    void OnExplorerRestarted()
    {
        if (_wantTaskbarHidden) { Taskbar.Restore(); HideTaskbar(); }
        _topBar?.Register();
        _bottomBar?.Register();
        foreach (var sc in _secondaries) sc.Reregister();
        _desktop.SendToBottom();
        _shell.Reshow();
    }

    public void SetTaskbarHidden(bool hidden)
    {
        _wantTaskbarHidden = hidden;
        if (hidden) HideTaskbar();
        else Taskbar.Restore();
    }

    static void HideTaskbar()
    {
        Taskbar.StartWatchdog();
        Taskbar.Hide();
    }

    void Watch()
    {
        Taskbar.KeepHidden();
        if (_locked)
        {
            // Nothing gets in front of the lock screen (except the Windows Hello prompt we asked for).
            if (!_helloActive && Native.GetForegroundWindow() != _shell.Handle) { _shell.Reshow(); _shell.SetInteractive(true); }
            return;
        }
        // Started at sign-in before Explorer was ready? Finish setting up as soon as it is.
        if (Native.FindWindow("Shell_TrayWnd", null) != IntPtr.Zero)
        {
            if (_wantTaskbarHidden && !Taskbar.IsHidden) HideTaskbar();
            if (_topBar is { Registered: false }) _topBar.Register();
            if (_bottomBar is { Registered: false }) _bottomBar.Register();
        }

        // Step the menu bar and Dock aside while a full-screen app (video, game) is in front.
        var fg = Native.GetForegroundWindow();
        _stage?.Tick();
        bool ours = fg == IntPtr.Zero || fg == _desktop.Handle || fg == _shell.Handle || IsShellWindow(fg);
        bool fullScreenApp = !ours && Native.CoversPrimaryMonitor(fg);
        _shell.SetSuspended(fullScreenApp);
        _glass.SetSuspended(fullScreenApp, _shell.Handle);

        // Speed: while an app fills the screen, the desktop behind it can't be seen. Pause its
        // animations and audio, and let the web engine trim its memory.
        bool covered = !ours && (fullScreenApp || IsZoomed(fg));
        if (covered != _desktopCovered)
        {
            _desktopCovered = covered;
            Emit("desktop", "covered", covered);
            Emit("shell", "covered", fullScreenApp);
            try
            {
                _desktop.Web.CoreWebView2.MemoryUsageTargetLevel = covered ? CoreWebView2MemoryUsageTargetLevel.Low : CoreWebView2MemoryUsageTargetLevel.Normal;
                if (_shell.Core != null) _shell.Core.MemoryUsageTargetLevel = fullScreenApp ? CoreWebView2MemoryUsageTargetLevel.Low : CoreWebView2MemoryUsageTargetLevel.Normal;
            }
            catch { }
        }

        // Tell the Dock when the app in front overlaps it, so it can tuck itself away.
        bool overlap = false;
        if (!ours && _dockRect is { } d && !IsIconic(fg) && VisibleBounds(fg, out var w))
            overlap = w.Left < d.Right && w.Right > d.Left && w.Top < d.Bottom && w.Bottom > d.Top;
        if (overlap != _dockOverlap)
        {
            _dockOverlap = overlap;
            Emit("shell", "dockOverlap", overlap);
        }
    }

    /// <summary>The window's visible frame, without the invisible resize borders Windows adds around it.</summary>
    static bool VisibleBounds(IntPtr h, out Native.RECT r) =>
        DwmGetWindowAttribute(h, 9 /* DWMWA_EXTENDED_FRAME_BOUNDS */, out r, System.Runtime.InteropServices.Marshal.SizeOf<Native.RECT>()) == 0
        || Native.GetWindowRect(h, out r);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool IsIconic(IntPtr h);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool IsZoomed(IntPtr h);
    bool? _desktopCovered;
    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]
    static extern int DwmGetWindowAttribute(IntPtr h, int attr, out Native.RECT value, int size);

    static bool IsShellWindow(IntPtr h)
    {
        var sb = new System.Text.StringBuilder(64);
        GetClassName(h, sb, sb.Capacity);
        var cls = sb.ToString();
        return cls is "Progman" or "WorkerW" or "Shell_TrayWnd";
    }

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int max);

    void OnDisplayChanged()
    {
        _ = SyncDisplaysAsync();
        _desktop.FitToMonitor();
        _desktop.SendToBottom();
        _shell.Resize();
        _topBar?.Apply();
        _bottomBar?.Apply();
        Emit("shell", "displayChanged");
        Emit("desktop", "displayChanged");
    }

    // ----- Hotkeys -----

    readonly List<string> _hotkeyFailures = new();

    void RegisterHotkeys()
    {
        bool Reg(string name, int id, uint mods, uint vk)
        {
            bool ok = Native.RegisterHotKey(_desktop.Handle, id, mods | MOD_NOREPEAT, vk);
            if (!ok) _hotkeyFailures.Add(name);
            return ok;
        }
        const uint SHIFT = 0x4;
        if (!Reg("Alt + Space (search)", HotkeySearch, MOD_ALT, 0x20))
            _notices.Add("Alt + Space is taken by another app (PowerToys Run?). Use Win + S or the search icon instead.");
        if (!Reg("Ctrl + Alt + Q (exit)", HotkeyQuit, MOD_CONTROL | MOD_ALT, 0x51))
            _notices.Add("Ctrl + Alt + Q is taken by another app. Exit from the Haven menu instead.");
        // Mission Control and App Exposé, as on a Mac.
        Reg("Ctrl + Up (Mission Control)", HotkeyMissionControl, MOD_CONTROL, 0x26);
        Reg("Ctrl + Down (App Exposé)", HotkeyAppExpose, MOD_CONTROL, 0x28);
        // Screenshots, as on a Mac (with Ctrl in place of Cmd).
        Reg("Ctrl + Shift + 3 (screenshot)", HotkeyShotFull, MOD_CONTROL | SHIFT, 0x33);
        Reg("Ctrl + Shift + 4 (area screenshot)", HotkeyShotRegion, MOD_CONTROL | SHIFT, 0x34);
        Reg("Ctrl + Alt + W (wallpaper switcher)", HotkeyWallpapers, MOD_CONTROL | MOD_ALT, 0x57);
        if (!Reg("Ctrl + L (lock)", HotkeyLock, MOD_CONTROL, 0x4C))
            _notices.Add("Ctrl + L is taken by another app. Lock Haven from the Windows-logo menu instead.");
        // Window snapping: Ctrl + Alt + arrows, Enter, C, U/I/J/K.
        foreach (var (id, vk, where) in WindowSnap.Shortcuts)
            Reg($"Ctrl + Alt snapping ({where})", id, MOD_CONTROL | MOD_ALT, vk);
    }

    void OnHotkey(int id)
    {
        if (id == HotkeySearch)
        {
            _shell.SetInteractive(true);
            Emit("shell", "search");
        }
        else if (id == HotkeyQuit) Quit();
        else if (id == HotkeyMissionControl) _ = ShowMissionControlAsync(null);
        else if (id == HotkeyAppExpose) _ = ShowAppExposeAsync();
        else if (id == HotkeyLock && !_locked) { SetLocked(true); Emit("shell", "lock"); }
        else if (id == HotkeyShotFull) TakeScreenshot(region: false);
        else if (id == HotkeyWallpapers) { _shell.SetInteractive(true); Emit("shell", "wallpaperSwitcher"); }
        else if (id == HotkeyShotRegion) TakeScreenshot(region: true);
        else if (WindowSnap.Shortcuts.FirstOrDefault(s => s.Id == id) is { Where: not null } snap) Snap(snap.Where);
    }

    /// <summary>A Windows shortcut (Start, Task View, Search…) that Haven answers instead.</summary>
    void OnWindowsShortcut(string action)
    {
        if (_locked || _quitting) return;
        if (action == "none") return;
        if (action == "mission") { _ = ShowMissionControlAsync(null); return; }
        if (action == "shotFull") { TakeScreenshot(region: false); return; }
        if (action == "shotRegion") { TakeScreenshot(region: true); return; }
        if (action.StartsWith("snap:")) { Snap(action[5..]); return; }
        if (action is "launchpad" or "search" or "settings" or "logo" or "notifications" or "control") _shell.SetInteractive(true);
        Emit("shell", "shortcut", action);
    }

    readonly HashSet<string> _audioParts = new();
    WindowAnimator? _animator;
    Dictionary<string, Native.RECT> _dockIcons = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Where an app's Dock icon is (screen pixels); null exe = the middle of the Dock.</summary>
    Native.RECT? DockIconFor(string? exe)
    {
        if (exe != null && _dockIcons.TryGetValue(exe, out var r)) return r;
        if (exe != null) return null;
        if (_dockRect is { } d) { int cx = (d.Left + d.Right) / 2; return new Native.RECT(cx - 24, d.Top, cx + 24, d.Top + 48); }
        var m = Native.PrimaryMonitor();
        return new Native.RECT((m.Left + m.Right) / 2 - 24, m.Bottom - 60, (m.Left + m.Right) / 2 + 24, m.Bottom - 12);
    }

    /// <summary>Alt+W style wallpaper switcher hotkey and other Deep Customization bits.</summary>
    public void SetWindowStyle(string corners, string border, string accent, string hairline) =>
        WindowStyler.Configure(corners, border, accent, hairline);

    public void SetDockIcons(Dictionary<string, Native.RECT> icons) => _dockIcons = new(icons, StringComparer.OrdinalIgnoreCase);

    public void SetWindowAnimations(bool on)
    {
        if (_animator == null) return;
        _animator.Enabled = on;
        if (on) WindowAnimator.SuppressOsAnimation(); else WindowAnimator.RestoreOsAnimation();
    }

    public void SetAudioViz(string part, bool on)
    {
        if (on) _audioParts.Add(part); else _audioParts.Remove(part);
        Audio.Subscribe(part, on);
    }

    public IntPtr ShellHandle => _shell.Handle;
    bool _helloActive;

    public async Task<bool> HelloVerifyAsync()
    {
        _helloActive = true;
        try { return await LockAuth.VerifyAsync(_shell.Handle, "Unlock Haven"); }
        finally { _helloActive = false; }
    }

    public void AskClaude(string id, string question)
    {
        _ = ClaudeAsk.AskAsync(question,
            text => Application.Current.Dispatcher.BeginInvoke(() => Emit("shell", "claude", new { id, text })),
            error => Application.Current.Dispatcher.BeginInvoke(() => Emit("shell", "claude", new { id, done = true, error })));
    }

    public void SetClipboardHistory(bool on) => ClipboardHistory.SetEnabled(on, _desktop.Handle);

    /// <summary>Copies a history item and pastes it into the app that was in front before Haven.</summary>
    public async Task PasteClipAsync(string id, bool paste)
    {
        if (!ClipboardHistory.Copy(id) || !paste) return;
        var target = WindowTracker.VisibleWindowsBottomUp().LastOrDefault();
        _shell.SetInteractive(false);
        if (target == IntPtr.Zero) return;
        WindowTracker.Focus(target.ToInt64());
        await Task.Delay(140);
        Native.PressKeys(0x11, 0x56); // Ctrl + V
    }

    public void Snap(string where) => WindowSnap.Snap(where, _desktop.Handle, _shell.Handle);

    // ----- Mission Control -----

    public async Task ShowMissionControlAsync(string? onlyExe)
    {
        var windows = await Windows.ListAsync();
        MissionControl.Spaces = VirtualDesktops.Read();
        MissionControl.SwitchSpace = i => _ = VirtualDesktops.SwitchTo(i);
        MissionControl.AddSpace = VirtualDesktops.Add;
        MissionControl.Toggle(windows, onlyExe, hwnd => { if (hwnd != null) WindowTracker.Focus(hwnd.Value); });
    }

    /// <summary>App ExposÃ©: Mission Control for just the app in front.</summary>
    public async Task ShowAppExposeAsync()
    {
        var windows = await Windows.ListAsync();
        var fg = Native.GetForegroundWindow().ToInt64();
        var exe = windows.FirstOrDefault(w => w.Hwnd == fg)?.Exe;
        MissionControl.Toggle(windows, exe, hwnd => { if (hwnd != null) WindowTracker.Focus(hwnd.Value); });
    }

    /// <summary>
    /// Slides from the current screen to another app's window, like switching spaces on a Mac.
    /// hwnd 0 plays the "nothing further this way" bounce.
    /// </summary>
    public void Slide(long hwnd, int direction)
    {
        if (_slide == null) return;
        var target = new IntPtr(hwnd);
        _slide.Play(target, direction, _desktop.Handle, WindowTracker.VisibleWindowsBottomUp(), RaiseShell,
            () => WindowTracker.Focus(hwnd));
    }

    /// <summary>Running apps in Dock order (from the shell page), for swiping between them.</summary>
    public void SetSwipeOrder(List<(string Exe, long Hwnd)> order) => _swipeOrder = order;

    void RaiseShell()
    {
        _shell.Reshow();
        _glass.Reapply(_shell.Handle);
    }

    /// <summary>Trackpad: the slide follows the fingers, then settles or springs back.</summary>
    void OnPan(string phase, double dx, double velocity)
    {
        if (_slide == null) return;
        const double FullSwipe = 0.32; // finger travel (fraction of the pad) for a whole screen
        switch (phase)
        {
            case "begin":
                _slideDir = dx < 0 ? 1 : -1; // fingers move left: the next app comes in from the right
                _slideTarget = Neighbor(_slideDir);
                _slideProgress = 0;
                _slide.Begin(_slideTarget, _slideDir, _desktop.Handle, WindowTracker.VisibleWindowsBottomUp(), RaiseShell);
                break;
            case "move":
                _slideProgress = -dx * _slideDir / FullSwipe;
                _slide.Update(_slideProgress);
                break;
            case "end":
                double towards = -velocity * _slideDir; // pad widths per second, in the slide's direction
                bool commit = _slideProgress > 0.4 || (towards > 0.6 && _slideProgress > 0.05);
                var target = _slideTarget;
                _slide.Finish(commit, () => { if (target != IntPtr.Zero) WindowTracker.Focus(target.ToInt64()); });
                if (commit && target != IntPtr.Zero) Emit("shell", "slid", target.ToInt64());
                break;
        }
    }

    IntPtr Neighbor(int dir)
    {
        if (_swipeOrder.Count == 0) return IntPtr.Zero;
        var exe = WindowTracker.ExeOf(Native.GetForegroundWindow());
        int i = exe == null ? -1 : _swipeOrder.FindIndex(o => o.Exe == exe);
        int j = i < 0 ? (dir > 0 ? 0 : _swipeOrder.Count - 1) : i + dir;
        return j >= 0 && j < _swipeOrder.Count ? new IntPtr(_swipeOrder[j].Hwnd) : IntPtr.Zero;
    }

    // ----- Screenshots -----

    public void TakeScreenshot(bool region)
    {
        Screenshots.Destination = ReadString("screenshotSave", "pictures");
        void Saved(string? path, System.Windows.Media.Imaging.BitmapSource image)
        {
            // A copy the menu bar can show as a little preview.
            var dir = Path.Combine(Paths.Public, "screens");
            Directory.CreateDirectory(dir);
            foreach (var old in Directory.GetFiles(dir).Where(f => File.GetCreationTime(f) < DateTime.Now.AddDays(-1)))
                try { File.Delete(old); } catch { }
            var copy = Path.Combine(dir, Guid.NewGuid().ToString("N") + ".png");
            try { Screenshots.WritePng(image, copy); } catch { }
            Emit("shell", "screenshot", new { path, url = Paths.Url(copy) });
        }
        if (region) Screenshots.Region(Saved); else Screenshots.FullScreen(Saved);
    }

    // ----- Stage Manager -----

    public bool StageEnabled => _stage?.Enabled == true;

    public void SetStage(bool on)
    {
        if (_stage == null) return;
        if (on) _stage.Enable(_desktop.Handle); else _stage.Disable();
    }

    public void SetTray(bool on)
    {
        if (on && !Tray.Running) Tray.Start();
        else if (!on) Tray.Dispose();
    }

    /// <summary>Haven's lock screen is up (or gone): hold the keyboard and stay in front until unlocked.</summary>
    public void SetLocked(bool locked)
    {
        _locked = locked;
        if (_switcher != null) _switcher.Locked = locked;
        if (locked) { _shell.SetSuspended(false); _shell.Reshow(); _shell.SetInteractive(true); }
    }

    public void SetInput(bool gestures, int fingers, bool switcher, bool windowsKeys = true)
    {
        if (_switcher != null) _switcher.TakeOver = windowsKeys;
        Touchpad.Enabled = gestures;
        Touchpad.Fingers = fingers is 3 or 4 ? fingers : 3;
        // Stop Windows reacting to the same swipe (it would open its own app switcher).
        if (gestures) { Taskbar.StartWatchdog(); WindowsGestures.Suppress(); }
        else WindowsGestures.Restore();
        if (_switcher != null) _switcher.Enabled = switcher;
    }

    // ----- Shell notifications -----

    void OnShellEvent(int code, IntPtr hwnd)
    {
        switch (code)
        {
            case 0x8006: // HSHELL_FLASH: an app wants attention
                Emit("shell", "attention", hwnd.ToInt64());
                break;
            case 1: case 2: case 4: case 0x8004: // created, destroyed, activated
                Emit("shell", "windowsChanged");
                WindowStyler.OnWindowsChanged();
                break;
        }
    }

    // ----- Hot corners -----

    void CheckCorners()
    {
        if (!GetCursorPos(out var p)) return;
        var m = Native.PrimaryMonitor();
        const int z = 2;
        bool left = p.X <= m.Left + z, right = p.X >= m.Right - 1 - z, top = p.Y <= m.Top + z, bottom = p.Y >= m.Bottom - 1 - z;
        string? corner = top && left ? "tl" : top && right ? "tr" : bottom && left ? "bl" : bottom && right ? "br" : null;
        var now = DateTime.Now;
        if (corner != _corner) { _corner = corner; _cornerSince = now; _cornerFired = false; return; }
        // Dwell briefly so passing through a corner doesn't trigger it, and never while dragging.
        if (corner != null && !_cornerFired && (now - _cornerSince).TotalMilliseconds > 180 && GetAsyncKeyState(0x01) >= 0)
        {
            _cornerFired = true;
            Emit("shell", "hotCorner", corner);
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool GetCursorPos(out Native.POINT p);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);

    // ----- Lifetime -----

    public void Quit()
    {
        if (_quitting) return;
        _quitting = true;
        _watch.Stop();
        _corners.Stop();
        _switcher?.Dispose();
        _animator?.Shutdown();
        foreach (var sc in _secondaries) sc.Shutdown();
        WindowStyler.RestoreAll();
        WindowAnimator.RestoreOsAnimation();
        Audio.Dispose();
        ClipboardHistory.Stop();
        _stage?.Disable();
        Tray.Dispose();
        Native.UnregisterHotKey(_desktop.Handle, HotkeySearch);
        Native.UnregisterHotKey(_desktop.Handle, HotkeyQuit);
        _topBar?.Dispose();
        _bottomBar?.Dispose();
        Taskbar.Restore();
        WindowsGestures.Restore();
        Desktop.Dispose();
        _glass.Close();
        _shell.Close();
        _desktop.Close();
        Application.Current.Shutdown();
    }

    internal static string ReadString(string name, string fallback)
    {
        try
        {
            if (!File.Exists(Paths.State)) return fallback;
            using var doc = JsonDocument.Parse(File.ReadAllText(Paths.State));
            return doc.RootElement.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? fallback : fallback;
        }
        catch { return fallback; }
    }

    static bool ReadSetting(string name, bool fallback)
    {
        try
        {
            if (!File.Exists(Paths.State)) return fallback;
            using var doc = JsonDocument.Parse(File.ReadAllText(Paths.State));
            return doc.RootElement.TryGetProperty(name, out var v) && v.ValueKind is JsonValueKind.True or JsonValueKind.False
                ? v.GetBoolean()
                : fallback;
        }
        catch { return fallback; }
    }
}
