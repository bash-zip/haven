using System.Text;

namespace Haven;

/// <summary>
/// Haven's log: crashes, errors from the interface and notable events, one file per day in
/// %LOCALAPPDATA%\Haven\logs (kept for a week). Settings → About can copy a diagnostic report
/// for bug reports. Nothing leaves the PC unless you paste it somewhere yourself.
/// </summary>
static class Log
{
    static readonly object Gate = new();
    public static string Folder => Path.Combine(Paths.Root, "logs");
    static string Today => Path.Combine(Folder, $"haven-{DateTime.Now:yyyy-MM-dd}.log");

    public static void Info(string message) => Write("info", message);
    public static void Error(string source, string message) => Write("error", $"[{source}] {message}");
    public static void Crash(string source, Exception? e) => Write("crash", $"[{source}] {e}");

    static void Write(string level, string message)
    {
        try
        {
            lock (Gate)
            {
                Directory.CreateDirectory(Folder);
                File.AppendAllText(Today, $"{DateTime.Now:HH:mm:ss.fff} {level,-5} {message.Replace("\r", "")}\n");
            }
        }
        catch { /* logging must never cause a problem of its own */ }
    }

    public static void Prune()
    {
        try
        {
            foreach (var f in Directory.GetFiles(Folder, "haven-*.log").Where(f => File.GetLastWriteTime(f) < DateTime.Now.AddDays(-7)))
                File.Delete(f);
        }
        catch { }
    }

    /// <summary>The newest log lines, newest last.</summary>
    public static IEnumerable<string> Recent(int lines)
    {
        try
        {
            var files = Directory.Exists(Folder) ? Directory.GetFiles(Folder, "haven-*.log").OrderByDescending(f => f).Take(2).Reverse() : Enumerable.Empty<string>();
            return files.SelectMany(f => File.ReadAllLines(f)).TakeLast(lines).ToList();
        }
        catch { return Array.Empty<string>(); }
    }

    /// <summary>Everything a bug report needs, as plain text (no personal files or settings values).</summary>
    public static string Report(IEnumerable<CheckResult> checks)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Haven {typeof(Log).Assembly.GetName().Version} ({(Updater.IsInstalled ? "installed" : "development build")})");
        sb.AppendLine($"Windows {Environment.OSVersion.Version} · {(Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit")} · .NET {Environment.Version}");
        try { sb.AppendLine("WebView2 " + Microsoft.Web.WebView2.Core.CoreWebView2Environment.GetAvailableBrowserVersionString()); } catch { }
        foreach (var m in Native.Monitors()) sb.AppendLine($"Display {m.Bounds.Width}×{m.Bounds.Height}{(m.Primary ? " (primary)" : "")}");
        sb.AppendLine();
        sb.AppendLine("System check:");
        foreach (var c in checks) sb.AppendLine($"  {(c.Ok == true ? "OK  " : c.Ok == false ? "FAIL" : "info")} {c.Area} / {c.Name}: {c.Detail}");
        sb.AppendLine();
        sb.AppendLine("Recent log:");
        foreach (var l in Recent(120)) sb.AppendLine("  " + l);
        return sb.ToString();
    }
}
