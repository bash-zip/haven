using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Haven;

public sealed record GameEntry(string Id, string Name, string? Image, string Uri);

/// <summary>Finds installed Steam games by reading Steam's library files on disk.</summary>
static partial class Steam
{
    static readonly string[] SkipNames = { "redistributable", "proton", "steam linux runtime", "steamworks" };

    public static List<GameEntry> Load()
    {
        var games = new List<GameEntry>();
        if (Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamPath", null) is not string root)
            return games;
        root = root.Replace('/', '\\');

        var libraries = new List<string> { root };
        var vdf = Path.Combine(root, "steamapps", "libraryfolders.vdf");
        if (File.Exists(vdf))
            foreach (Match m in LibraryPath().Matches(File.ReadAllText(vdf)))
                libraries.Add(m.Groups[1].Value.Replace(@"\\", @"\"));

        var seen = new HashSet<string>();
        foreach (var lib in libraries.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var steamapps = Path.Combine(lib, "steamapps");
            if (!Directory.Exists(steamapps)) continue;
            foreach (var manifest in Directory.EnumerateFiles(steamapps, "appmanifest_*.acf"))
            {
                string text;
                try { text = File.ReadAllText(manifest); } catch { continue; }
                var id = AppId().Match(text).Groups[1].Value;
                var name = AppName().Match(text).Groups[1].Value;
                if (id.Length == 0 || name.Length == 0 || id == "228980" || !seen.Add(id)) continue;
                if (SkipNames.Any(s => name.Contains(s, StringComparison.OrdinalIgnoreCase))) continue;
                games.Add(new GameEntry(id, name, CopyArt(root, id), $"steam://rungameid/{id}"));
            }
        }
        return games.OrderBy(g => g.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    static string? CopyArt(string steamRoot, string id)
    {
        var target = Path.Combine(Paths.Games, id + ".jpg");
        if (File.Exists(target)) return Paths.Url(target);

        // Steam has used both flat and per-game folder layouts for its artwork cache.
        var cache = Path.Combine(steamRoot, "appcache", "librarycache");
        var candidates = new[]
        {
            Path.Combine(cache, $"{id}_library_600x900.jpg"),
            Path.Combine(cache, id, "library_600x900.jpg"),
            Path.Combine(cache, $"{id}_header.jpg"),
            Path.Combine(cache, id, "header.jpg"),
        };
        var source = candidates.FirstOrDefault(File.Exists);
        if (source == null) return null;
        try
        {
            File.Copy(source, target, overwrite: true);
            return Paths.Url(target);
        }
        catch
        {
            return null;
        }
    }

    public static bool IsLaunchUri(string uri) => RunGameUri().IsMatch(uri);

    [GeneratedRegex("\"path\"\\s+\"([^\"]+)\"")] private static partial Regex LibraryPath();
    [GeneratedRegex("\"appid\"\\s+\"(\\d+)\"")] private static partial Regex AppId();
    [GeneratedRegex("\"name\"\\s+\"([^\"]+)\"")] private static partial Regex AppName();
    [GeneratedRegex(@"^steam://rungameid/\d+$")] private static partial Regex RunGameUri();
}
