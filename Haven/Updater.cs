using System.Diagnostics;

namespace Haven;

/// <summary>
/// Updates for an installed Haven (see install.ps1): when a newer build appears in the folder it
/// was installed from, Haven can copy it in and restart itself.
/// </summary>
static class Updater
{
    public static readonly string InstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Haven");

    public static bool IsInstalled =>
        AppContext.BaseDirectory.TrimEnd('\\').Equals(InstallDir, StringComparison.OrdinalIgnoreCase);

    static string? Source()
    {
        var file = Path.Combine(AppContext.BaseDirectory, "update-source.txt");
        if (!File.Exists(file)) return null;
        var dir = File.ReadAllText(file).Trim();
        return Directory.Exists(dir) ? dir : null;
    }

    public static object Status()
    {
        var source = Source();
        DateTime Stamp(string dir) => File.GetLastWriteTimeUtc(Path.Combine(dir, "Haven.dll"));
        bool available = IsInstalled && source != null && File.Exists(Path.Combine(source, "Haven.dll"))
            && Stamp(source) > Stamp(AppContext.BaseDirectory).AddSeconds(5);
        return new
        {
            installed = IsInstalled,
            location = AppContext.BaseDirectory.TrimEnd('\\'),
            source,
            available,
            version = typeof(Updater).Assembly.GetName().Version?.ToString(3),
        };
    }

    /// <summary>Copies the new build in once Haven has closed, then starts it again.</summary>
    public static void ApplyAndRestart(Action quit)
    {
        var source = Source() ?? throw new InvalidOperationException("No update source found.");
        var target = AppContext.BaseDirectory.TrimEnd('\\');
        var script = Path.Combine(Path.GetTempPath(), "haven-update.ps1");
        File.WriteAllText(script, $$"""
            $p = Get-Process -Id {{Environment.ProcessId}} -ErrorAction SilentlyContinue
            if ($p) { $p.WaitForExit(15000) }
            Start-Sleep -Milliseconds 800
            robocopy "{{source}}" "{{target}}" /E /NFL /NDL /NJH /NJS /NP | Out-Null
            Set-Content (Join-Path "{{target}}" 'update-source.txt') "{{source}}" -Encoding utf8
            Start-Process (Join-Path "{{target}}" 'Haven.exe')
            """);
        Process.Start(new ProcessStartInfo("powershell.exe", $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{script}\"")
        {
            CreateNoWindow = true,
            UseShellExecute = false,
        });
        quit();
    }
}
