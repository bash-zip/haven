using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;

namespace Haven;

/// <summary>
/// Updates for an installed Haven.
///
/// Releases publish a small manifest (latest.json: version, download url, SHA-256, notes). Haven
/// checks it, downloads the zip, verifies the checksum, unpacks it, then swaps the files in after
/// it closes and starts the new version. The manifest's address ships with each release in
/// update-feed.txt (release.ps1 writes it). A development install can instead point the feed at a
/// local publish folder, which is copied straight in.
/// </summary>
static class Updater
{
    public static readonly string InstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Haven");
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };
    static Manifest? _latest;
    static DateTime _checkedAt;
    static string? _error;

    public sealed record Manifest(string Version, string Url, string Sha256, string? Notes);

    public static bool IsInstalled =>
        AppContext.BaseDirectory.TrimEnd('\\').Equals(InstallDir, StringComparison.OrdinalIgnoreCase);

    public static bool IsDevBuild =>
        AppContext.BaseDirectory.Contains(@"\bin\Debug\", StringComparison.OrdinalIgnoreCase) ||
        AppContext.BaseDirectory.Contains(@"\bin\Release\", StringComparison.OrdinalIgnoreCase);

    public static Version Current => typeof(Updater).Assembly.GetName().Version ?? new Version(0, 0);

    /// <summary>Where updates come from: a manifest URL, or a local folder (development).</summary>
    public static string? Feed
    {
        get
        {
            foreach (var name in new[] { "update-feed.txt", "update-source.txt" })
            {
                var file = Path.Combine(AppContext.BaseDirectory, name);
                if (File.Exists(file)) { var v = File.ReadAllText(file).Trim(); if (v.Length > 0) return v; }
            }
            return null;
        }
    }

    static bool FeedIsFolder => Feed is { } f && !f.StartsWith("http", StringComparison.OrdinalIgnoreCase) && Directory.Exists(f);

    public static async Task<object> StatusAsync(bool force)
    {
        if (force || DateTime.Now - _checkedAt > TimeSpan.FromHours(6)) await CheckAsync();
        bool available = IsInstalled && (FeedIsFolder ? FolderIsNewer() : _latest != null && ParseVersion(_latest.Version) > Current);
        return new
        {
            installed = IsInstalled,
            dev = IsDevBuild,
            location = AppContext.BaseDirectory.TrimEnd('\\'),
            source = Feed,
            version = Current.ToString(3),
            latest = _latest?.Version,
            notes = _latest?.Notes,
            available,
            error = _error,
        };
    }

    static async Task CheckAsync()
    {
        _checkedAt = DateTime.Now;
        _error = null;
        var feed = Feed;
        if (feed == null || FeedIsFolder) return;
        try
        {
            var json = await Http.GetStringAsync(feed);
            using var doc = JsonDocument.Parse(json);
            var r = doc.RootElement;
            _latest = new Manifest(r.GetProperty("version").GetString() ?? "0", r.GetProperty("url").GetString() ?? "",
                r.GetProperty("sha256").GetString() ?? "", r.TryGetProperty("notes", out var n) ? n.GetString() : null);
        }
        catch (Exception e) { _error = "Couldn't check for updates: " + e.Message; Log.Info(_error); }
    }

    static Version ParseVersion(string v) => Version.TryParse(v.TrimStart('v', 'V'), out var x) ? x : new Version(0, 0);

    static bool FolderIsNewer()
    {
        DateTime Stamp(string dir) => File.GetLastWriteTimeUtc(Path.Combine(dir, "Haven.dll"));
        return Feed is { } f && File.Exists(Path.Combine(f, "Haven.dll")) && Stamp(f) > Stamp(AppContext.BaseDirectory).AddSeconds(5);
    }

    /// <summary>Downloads and verifies the update, then swaps it in after Haven closes and restarts.</summary>
    public static async Task ApplyAndRestartAsync(Action quit)
    {
        string source;
        if (FeedIsFolder) source = Feed!;
        else
        {
            if (_latest == null) await CheckAsync();
            var m = _latest ?? throw new InvalidOperationException(_error ?? "No update information.");
            var work = Path.Combine(Path.GetTempPath(), "haven-update");
            if (Directory.Exists(work)) Directory.Delete(work, recursive: true);
            Directory.CreateDirectory(work);
            var zip = Path.Combine(work, "update.zip");
            await using (var s = await Http.GetStreamAsync(m.Url))
            await using (var f = File.Create(zip)) await s.CopyToAsync(f);
            string hash;
            await using (var f = File.OpenRead(zip)) hash = Convert.ToHexString(await SHA256.HashDataAsync(f));
            if (!hash.Equals(m.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The download didn't match its checksum, so it wasn't installed. Try again later.");
            source = Path.Combine(work, "files");
            ZipFile.ExtractToDirectory(zip, source);
            // Releases zip a single "Haven" folder.
            var inner = Path.Combine(source, "Haven");
            if (File.Exists(Path.Combine(inner, "Haven.exe"))) source = inner;
            if (!File.Exists(Path.Combine(source, "Haven.exe"))) throw new InvalidOperationException("The update didn't contain Haven.");
        }
        Log.Info($"Updating from {source}");
        var target = AppContext.BaseDirectory.TrimEnd('\\');
        var script = Path.Combine(Path.GetTempPath(), "haven-update.ps1");
        File.WriteAllText(script, $$"""
            $p = Get-Process -Id {{Environment.ProcessId}} -ErrorAction SilentlyContinue
            if ($p) { $p.WaitForExit(20000) }
            Start-Sleep -Milliseconds 800
            robocopy "{{source}}" "{{target}}" /E /NFL /NDL /NJH /NJS /NP | Out-Null
            Start-Process (Join-Path "{{target}}" 'Haven.exe') -ArgumentList '--updated'
            """);
        Process.Start(new ProcessStartInfo("powershell.exe", $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{script}\"")
        {
            CreateNoWindow = true,
            UseShellExecute = false,
        });
        quit();
    }
}
