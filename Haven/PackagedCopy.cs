using System.Text.Json;

namespace Haven;

/// <summary>
/// Recovers data from a "private copy" of Haven's folder. When Haven is started from inside a
/// packaged (MSIX) app (like the Claude desktop app), Windows silently redirects its AppData
/// writes to %LOCALAPPDATA%\Packages\&lt;app&gt;\LocalCache\Local\Haven. Pictures saved there
/// (wallpapers, icons) go missing from the normal Haven folder, so at startup I copy over any files
/// the real folder lacks and apply a restore.json if one was left there.
/// </summary>
static class PackagedCopy
{
    public static async Task RecoverAsync()
    {
        try
        {
            var packages = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Packages");
            if (!Directory.Exists(packages)) return;
            foreach (var pkg in Directory.GetDirectories(packages))
            {
                var src = Path.Combine(pkg, "LocalCache", "Local", "Haven");
                if (!Directory.Exists(src) || Path.GetFullPath(src).Equals(Path.GetFullPath(Paths.Root), StringComparison.OrdinalIgnoreCase)) continue;

                int copied = 0;
                var pub = Path.Combine(src, "public");
                if (Directory.Exists(pub))
                {
                    foreach (var file in Directory.EnumerateFiles(pub, "*", SearchOption.AllDirectories))
                    {
                        var target = Path.Combine(Paths.Public, Path.GetRelativePath(pub, file));
                        if (File.Exists(target)) continue;
                        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                        File.Copy(file, target);
                        copied++;
                    }
                }
                if (copied > 0) Log.Info($"Recovered {copied} pictures from {src}");

                var restore = Path.Combine(src, "restore.json");
                if (File.Exists(restore))
                {
                    var set = JsonSerializer.Deserialize<JsonElement>(await File.ReadAllTextAsync(restore));
                    await StateStore.PatchAsync(set, Array.Empty<string>());
                    File.Move(restore, restore + $".applied-{DateTime.Now:yyyyMMdd-HHmmss}", overwrite: true);
                    Log.Info($"Applied restore.json from {src}");
                }
            }
        }
        catch (Exception e) { Log.Error("recover", e.Message); }
    }
}
