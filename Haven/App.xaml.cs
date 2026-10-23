using System.Text.Json;
using System.Windows;

namespace Haven;

public partial class App : Application
{
    static Mutex? _single;
    ShellHost? _shell;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        // `Haven.exe --watchdog <pid>`: wait for Haven to exit and make sure the taskbar comes back.
        if (e.Args.Length >= 2 && e.Args[0] == "--watchdog" && int.TryParse(e.Args[1], out var pid))
        {
            await Task.Run(() => Taskbar.RunWatchdog(pid));
            Shutdown();
            return;
        }

        // `Haven.exe --restore-taskbar`: manual escape hatch.
        if (e.Args.Length >= 1 && e.Args[0] == "--restore-taskbar")
        {
            Taskbar.Restore();
            WindowsGestures.RestoreNow();
            WindowAnimator.RestoreOsAnimation();
            Shutdown();
            return;
        }

        // `Haven.exe --install` / `--uninstall`: the built-in installer (see Installer.cs).
        if (e.Args.Length >= 1 && e.Args[0] == "--install") { Installer.Install(start: true); Shutdown(); return; }
        if (e.Args.Length >= 1 && e.Args[0] == "--uninstall") { Installer.Uninstall(); Shutdown(); return; }

        // `Haven.exe --autostart on|off`: turn starting at sign-in on or off without opening Haven.
        if (e.Args.Length >= 2 && e.Args[0] == "--autostart")
        {
            try { ShellHost.Autostart = e.Args[1] == "on"; } catch { }
            Shutdown();
            return;
        }

        // `Haven.exe --selftest <file>` exercises every native service and writes the results
        // to a JSON file, without opening the desktop. Handy for checking a machine quickly.
        if (e.Args.Length >= 2 && e.Args[0] == "--selftest")
        {
            await RunSelfTestAsync(e.Args[1]);
            Shutdown();
            return;
        }

        // A downloaded copy offers to install itself on first run.
        if (Installer.OfferOnFirstRun(e.Args)) { Shutdown(); return; }

        _single = new Mutex(true, @"Local\Haven.Desktop", out bool first);
        if (!first)
        {
            Shutdown();
            return;
        }

        // Whatever happens, never leave the user without a taskbar.
        AppDomain.CurrentDomain.ProcessExit += (_, _) => { Taskbar.Restore(); WindowsGestures.Restore(); WindowAnimator.RestoreOsAnimation(); WindowStyler.RestoreAll(); };
        AppDomain.CurrentDomain.UnhandledException += (_, args) => { Log.Crash("app", args.ExceptionObject as Exception); Taskbar.Restore(); WindowsGestures.Restore(); WindowAnimator.RestoreOsAnimation(); };
        TaskScheduler.UnobservedTaskException += (_, args) => { Log.Error("task", args.Exception?.GetBaseException().ToString() ?? "?"); args.SetObserved(); };
        DispatcherUnhandledException += (_, args) =>
        {
            Log.Crash("ui", args.Exception);
            Taskbar.Restore();
            WindowsGestures.Restore();
            WindowAnimator.RestoreOsAnimation();
            MessageBox.Show(args.Exception.Message, "Haven ran into a problem", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown();
        };

        // Signing out or restarting with Haven set to start at sign-in: keep Windows' own touchpad
        // gestures switched off, because Windows only reads that setting at sign-in.
        SessionEnding += (_, _) => { if (ShellHost.AutostartKnown) WindowsGestures.KeepThroughSignOut(); };

        Log.Prune();
        Log.Info($"Haven {typeof(App).Assembly.GetName().Version} starting ({string.Join(' ', e.Args)})");

        // Started from the sign-in entry ("--startup"): Explorer may still be loading; ShellHost copes with that.
        _shell = new ShellHost();
        await _shell.StartAsync();
    }

    static async Task<Dictionary<string, string>> MenusOf(List<WindowInfo> windows)
    {
        var result = new Dictionary<string, string>();
        foreach (var w in windows.Take(8))
        {
            AppMenus.Forget();
            var names = await AppMenus.NamesAsync(new IntPtr(w.Hwnd));
            result[$"{w.Exe} ({w.Hwnd})"] = names.Count == 0 ? "(none)" : string.Join(", ", names);
        }
        return result;
    }

    static async Task RunSelfTestAsync(string file)
    {
        object report;
        try
        {
            var apps = await new AppCatalog().GetAsync(refresh: true);
            var windows = await new WindowTracker().ListAsync();
            using var desktop = new DesktopItems();
            var icons = await desktop.ListAsync();
            report = new
            {
                apps = apps.Count,
                appsWithIcons = apps.Count(a => a.Icon != null),
                games = Steam.Load().Select(g => g.Name),
                windows = windows.Select(w => $"{w.Exe} [{w.Aumid}]: {w.Title}"),
                desktopItems = icons.Count,
                desktopWithIcons = icons.Count(i => i.Icon != null),
                media = await Media.NowPlayingAsync(includeArt: false),
                batteries = await SystemInfo.DeviceBatteriesAsync(),
                account = SystemInfo.Account(),
                wallpaper = SystemInfo.WindowsWallpaper(),
                volume = SystemControls.Volume(),
                brightness = SystemControls.Brightness(),
                radios = await SystemControls.RadiosAsync(),
                network = SystemControls.Network(),
                stats = SystemControls.Stats(),
                events = await SystemControls.EventsAsync(),
                fileSearch = (await new Files().SearchAsync("linuxmint")).Select(f => f.Path).Take(3),
                downloads = (await new Files().RecentAsync("downloads", 3, false)).Select(f => f.Name),
                spaces = VirtualDesktops.Read(),
                appMenus = await MenusOf(windows),
            };
        }
        catch (Exception ex)
        {
            report = new { error = ex.ToString() };
        }
        File.WriteAllText(file, JsonSerializer.Serialize(report, Json.Options));
    }
}
