using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;

namespace HavenSetup;

/// <summary>
/// The installer UI: WebView2 hosted in the frameless <see cref="Host"/> window,
/// rendering ui/index.html + app.css + app.js, which are embedded in the exe and
/// served from memory. The web layer posts commands; this class validates, runs
/// the install and streams progress back. All WebView2 access happens on the
/// window thread (post-await work is marshaled back with Host.Post).
/// </summary>
public sealed class WebUI : IDisposable
{
    const string Origin = "https://install.haven";

    static readonly Dictionary<string, (string name, string mime)> Files = new()
    {
        ["/index.html"] = ("ui.index.html", "text/html"),
        ["/app.css"] = ("ui.app.css", "text/css"),
        ["/app.js"] = ("ui.app.js", "text/javascript"),
        ["/rose.png"] = ("ui.rose.png", "image/png"),
        ["/fonts/sora-400.woff2"] = ("ui.fonts.sora-400.woff2", "font/woff2"),
        ["/fonts/sora-500.woff2"] = ("ui.fonts.sora-500.woff2", "font/woff2"),
        ["/fonts/sora-700.woff2"] = ("ui.fonts.sora-700.woff2", "font/woff2"),
    };

    readonly byte[] _payload;
    readonly string _version;
    readonly Host _host;

    CoreWebView2Environment? _env;
    CoreWebView2Controller? _controller;
    CoreWebView2? _core;

    string _dir = Installer.DefaultDir;
    bool _autostart = true, _desktopShortcut, _launchAfter = true;
    bool _installing, _installed;

    public string? Failure { get; private set; }

    public WebUI(byte[] payload, string version, Host host)
    {
        _payload = payload;
        _version = version;
        _host = host;
        _host.BoundsChanged += ApplyBounds;
    }

    /// <summary>Kicks off the async UI init. Returns false only when the WebView2
    /// runtime is missing (in which case the caller shows a native message).</summary>
    public bool Start()
    {
        try
        {
            if (string.IsNullOrWhiteSpace(CoreWebView2Environment.GetAvailableBrowserVersionString()))
                return false;
        }
        catch { return false; }

        _ = InitAsync();
        return true;
    }

    async Task InitAsync()
    {
        try
        {
            var udf = Path.Combine(Path.GetTempPath(), "HavenSetup-WebView2-" + Environment.ProcessId);
            var opts = new CoreWebView2EnvironmentOptions();
            if (Environment.GetEnvironmentVariable("HAVEN_SETUP_DEBUG") == "1")
                opts.AdditionalBrowserArguments = "--remote-debugging-port=9223";
            // Called on the window thread; completion arrives once the pump runs.
            _env = await CoreWebView2Environment.CreateAsync(null, udf, opts);
            _host.Post(() => _ = CreateControllerAsync());
        }
        catch (Exception ex) { _host.Post(() => Fail(ex.Message)); }
    }

    async Task CreateControllerAsync()
    {
        try
        {
            _controller = await _env!.CreateCoreWebView2ControllerAsync(_host.Hwnd);
            _host.Post(Configure);
        }
        catch (Exception ex) { _host.Post(() => Fail(ex.Message)); }
    }

    void Configure()
    {
        try
        {
            var controller = _controller!;
            controller.DefaultBackgroundColor = System.Drawing.Color.FromArgb(255, 11, 11, 13);
            controller.IsVisible = true;
            ApplyBounds();

            _core = controller.CoreWebView2;
            var s = _core.Settings;
            s.AreDefaultContextMenusEnabled = false;
            s.AreDevToolsEnabled = Environment.GetEnvironmentVariable("HAVEN_SETUP_DEBUG") == "1";
            s.IsZoomControlEnabled = false;
            s.IsPinchZoomEnabled = false;
            s.AreBrowserAcceleratorKeysEnabled = false;
            s.IsStatusBarEnabled = false;

            _core.AddWebResourceRequestedFilter(Origin + "/*", CoreWebView2WebResourceContext.All);
            _core.WebResourceRequested += Serve;
            _core.WebMessageReceived += (_, e) => { try { Handle(e.WebMessageAsJson); } catch { } };

            _core.Navigate(Origin + "/index.html");
        }
        catch (Exception ex) { Fail(ex.Message); }
    }

    void ApplyBounds()
    {
        var controller = _controller;
        if (controller == null) return;
        var r = _host.ClientRect();
        controller.Bounds = new System.Drawing.Rectangle(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
    }

    void Serve(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var path = new Uri(e.Request.Uri).AbsolutePath;
        if (!Files.TryGetValue(path, out var f)) return;
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(f.name);
        if (stream == null) return;
        e.Response = _env!.CreateWebResourceResponse(stream, 200, "OK",
            $"Content-Type: {f.mime}\r\nCache-Control: no-cache");
    }

    void Fail(string message)
    {
        Failure = message;
        try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "HavenSetup-error.txt"), message); } catch { }
        Host.MessageBox("Haven Setup couldn't start its interface:\n\n" + message);
        _host.Close();
    }

    // ---------------------------------------------------------------- bridge

    void Post(object message) => _core?.PostWebMessageAsJson(JsonSerializer.Serialize(message));

    void Handle(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        switch (root.GetProperty("cmd").GetString())
        {
            case "init":
                Post(new { type = "state", version = _version, dir = _dir, free = Installer.FreeSpaceText(_dir) });
                break;

            case "browse":
                var picked = FolderPicker.Show(_host.Hwnd, _dir);
                Post(new { type = "picked", path = picked });
                break;

            case "check":
            {
                var dir = Installer.NormalizeDir(root.GetProperty("dir").GetString() ?? "");
                var (ok, err, free) = Installer.CheckDir(dir);
                if (ok) _dir = dir;
                Post(new { type = "dirInfo", dir, ok, err, free });
                break;
            }

            case "install":
                StartInstall(root);
                break;

            case "launch":
                if (!_installing) TryLaunch();
                break;

            case "close":
                if (_installing) Post(new { type = "deny" });
                else _host.Close();
                break;
        }
    }

    void StartInstall(JsonElement j)
    {
        if (_installing || _installed) return;
        try
        {
            _dir = Installer.NormalizeDir(j.GetProperty("dir").GetString() ?? _dir);
            _autostart = j.GetProperty("autostart").GetBoolean();
            _desktopShortcut = j.GetProperty("desktopShortcut").GetBoolean();
            _launchAfter = j.GetProperty("launch").GetBoolean();
        }
        catch { /* defaults carry the day */ }

        _installing = true;
        Host.CloseBlocked = true;
        var payload = _payload;
        var installer = new Installer(payload, _version)
        {
            TargetDir = _dir,
            Autostart = _autostart,
            DesktopShortcut = _desktopShortcut,
            LaunchAfter = _launchAfter,
        };
        var host = _host;

        _ = Task.Run(() =>
        {
            try
            {
                installer.Install((pct, status, file, phase) =>
                    host.Post(() => Post(new { type = "progress", pct, status, file, phase })));
                host.Post(() =>
                {
                    _installed = true; _installing = false; Host.CloseBlocked = false;
                    Post(new { type = "done" });
                });
            }
            catch (Exception ex)
            {
                var msg = ex.Message;
                host.Post(() =>
                {
                    _installing = false; Host.CloseBlocked = false;
                    Post(new { type = "error", message = msg });
                });
            }
        });
    }

    void TryLaunch()
    {
        try
        {
            var exe = Path.Combine(_dir, "Haven.exe");
            if (File.Exists(exe))
                Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true, WorkingDirectory = _dir });
            _host.Close();
        }
        catch (Exception ex)
        {
            Post(new { type = "error", message = ex.Message });
        }
    }

    public void Dispose()
    {
        _host.BoundsChanged -= ApplyBounds;
        try { _controller?.Close(); } catch { }
        _core = null;
        _controller = null;
        _env = null;
        try { Directory.Delete(Path.Combine(Path.GetTempPath(), "HavenSetup-WebView2-" + Environment.ProcessId), true); } catch { }
    }
}
