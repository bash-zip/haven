using System.Diagnostics;
using System.Reflection;
using HavenSetup;

internal static class Program
{
    // STA: WebView2's environment/controller creation requires it on the UI thread.
    [STAThread]
    static int Main(string[] args)
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "";
        var payload = Installer.ReadPayload();
        if (payload == null)
        {
            Host.MessageBox("This setup file is damaged (no payload). Download it again.");
            return 2;
        }

        // A previously-opened Setup window behind this one looks like a rendering bug — close them.
        foreach (var p in Process.GetProcessesByName("HavenSetup").Where(p => p.Id != Environment.ProcessId))
            try { p.Kill(); } catch { }

        int extractAt = Array.IndexOf(args, "--extract");
        if (extractAt >= 0)
        {
            Installer.ExtractPayload(payload, Path.GetFullPath(args[extractAt + 1]));
            return 0;
        }

        if (args.Contains("--quiet"))
        {
            var tmp = Path.Combine(Path.GetTempPath(), "HavenSetup-" + version + "-" + Environment.ProcessId);
            Installer.ExtractPayload(payload, tmp);
            var exe = Directory.EnumerateFiles(tmp, "Haven.exe", SearchOption.AllDirectories).FirstOrDefault();
            if (exe == null) { try { Directory.Delete(tmp, true); } catch { } return 2; }
            var proc = Process.Start(new ProcessStartInfo(exe, "--install") { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe)! });
            proc?.WaitForExit();
            try { Directory.Delete(tmp, true); } catch { }
            return proc?.ExitCode ?? 0;
        }

        // Wizard: a raw Win32 frameless window hosting an embedded WebView2 UI.
        var host = Host.Create();
        host.Show();
        using var ui = new WebUI(payload, version, host);
        if (!ui.Start())
        {
            Host.MessageBox(
                "Haven Setup needs the Microsoft WebView2 Runtime, which doesn't seem to be installed.\n\n" +
                "Get it from https://developer.microsoft.com/microsoft-edge/webview2 and run setup again.");
            return 3;
        }
        host.Run();
        return string.IsNullOrEmpty(ui.Failure) ? 0 : 2;
    }
}
