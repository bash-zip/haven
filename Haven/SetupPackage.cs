using System.IO.Compression;
using System.Text.Json;
using Microsoft.Win32;

namespace Haven;

/// <summary>
/// Back up and move a whole Haven setup: one .havensetup file (a zip) with the settings and
/// every picture they point to (wallpapers, custom icons, widget photos). Clipboard pictures and
/// screenshot previews stay behind.
/// </summary>
static class SetupPackage
{
    static readonly string[] Skip = { "clips", "screens" };

    public static string? Export()
    {
        var dialog = new SaveFileDialog
        {
            Title = "Export Haven setup",
            Filter = "Haven setup|*.havensetup",
            FileName = $"Haven setup {DateTime.Now:yyyy-MM-dd}.havensetup",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        };
        if (dialog.ShowDialog() != true) return null;
        if (File.Exists(dialog.FileName)) File.Delete(dialog.FileName);
        using var zip = ZipFile.Open(dialog.FileName, ZipArchiveMode.Create);
        if (File.Exists(Paths.State)) zip.CreateEntryFromFile(Paths.State, "state.json");
        if (Directory.Exists(Paths.Public))
        {
            foreach (var file in Directory.EnumerateFiles(Paths.Public, "*", SearchOption.AllDirectories))
            {
                var rel = Path.GetRelativePath(Paths.Public, file);
                if (Skip.Any(s => rel.StartsWith(s + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))) continue;
                zip.CreateEntryFromFile(file, "public/" + rel.Replace('\\', '/'));
            }
        }
        zip.CreateEntry("haven.txt").Open().Dispose();
        return dialog.FileName;
    }

    /// <summary>Unpacks the pictures and returns the settings, or null if cancelled.</summary>
    public static JsonElement? Import()
    {
        var dialog = new OpenFileDialog
        {
            Title = "Import Haven setup",
            Filter = "Haven setup|*.havensetup",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        };
        if (dialog.ShowDialog() != true) return null;
        using var zip = ZipFile.OpenRead(dialog.FileName);
        var stateEntry = zip.GetEntry("state.json") ?? throw new InvalidOperationException("That file isn't a Haven setup.");
        JsonElement state;
        using (var s = stateEntry.Open()) state = JsonSerializer.Deserialize<JsonElement>(s);

        var root = Path.GetFullPath(Paths.Public) + Path.DirectorySeparatorChar;
        foreach (var entry in zip.Entries.Where(e => e.FullName.StartsWith("public/") && !e.FullName.EndsWith("/")))
        {
            var target = Path.GetFullPath(Path.Combine(Paths.Public, entry.FullName["public/".Length..]));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue; // never write outside Haven's folder
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, overwrite: true);
        }
        return state;
    }

    /// <summary>A shareable theme: the look's settings plus the pictures it uses (wallpaper, icons).</summary>
    public static string? ExportTheme(string name, JsonElement look)
    {
        var safe = string.Concat(name.Split(Path.GetInvalidFileNameChars())).Trim();
        var dialog = new SaveFileDialog
        {
            Title = "Share theme",
            Filter = "Haven theme|*.haventheme",
            FileName = (safe.Length > 0 ? safe : "Theme") + ".haventheme",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        };
        if (dialog.ShowDialog() != true) return null;
        if (File.Exists(dialog.FileName)) File.Delete(dialog.FileName);
        using var zip = ZipFile.Open(dialog.FileName, ZipArchiveMode.Create);
        using (var w = new StreamWriter(zip.CreateEntry("theme.json").Open()))
            w.Write(JsonSerializer.Serialize(new { name, look }));
        // Every picture the theme points at travels with it.
        var prefix = $"https://{ShellHost.DataHost}/";
        foreach (var url in Urls(look).Where(u => u.StartsWith(prefix)).Distinct())
        {
            var rel = Uri.UnescapeDataString(url[prefix.Length..].Split('?')[0]);
            var file = Path.GetFullPath(Path.Combine(Paths.Public, rel));
            if (file.StartsWith(Path.GetFullPath(Paths.Public)) && File.Exists(file)) zip.CreateEntryFromFile(file, "public/" + rel.Replace('\\', '/'));
        }
        return dialog.FileName;
    }

    public static JsonElement? ImportTheme()
    {
        var dialog = new OpenFileDialog { Title = "Add a theme", Filter = "Haven theme|*.haventheme" };
        if (dialog.ShowDialog() != true) return null;
        using var zip = ZipFile.OpenRead(dialog.FileName);
        var entry = zip.GetEntry("theme.json") ?? throw new InvalidOperationException("That file isn't a Haven theme.");
        JsonElement theme;
        using (var s = entry.Open()) theme = JsonSerializer.Deserialize<JsonElement>(s);
        var root = Path.GetFullPath(Paths.Public) + Path.DirectorySeparatorChar;
        foreach (var e in zip.Entries.Where(e => e.FullName.StartsWith("public/") && !e.FullName.EndsWith("/")))
        {
            var target = Path.GetFullPath(Path.Combine(Paths.Public, e.FullName["public/".Length..]));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            e.ExtractToFile(target, overwrite: true);
        }
        return theme;
    }

    static IEnumerable<string> Urls(JsonElement e)
    {
        switch (e.ValueKind)
        {
            case JsonValueKind.String: yield return e.GetString()!; break;
            case JsonValueKind.Object: foreach (var p in e.EnumerateObject()) foreach (var u in Urls(p.Value)) yield return u; break;
            case JsonValueKind.Array: foreach (var i in e.EnumerateArray()) foreach (var u in Urls(i)) yield return u; break;
        }
    }
}
