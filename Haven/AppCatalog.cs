using System.Diagnostics;

namespace Haven;

/// <param name="Exe">Program file name (e.g. "Code.exe"), used to match running windows to apps.</param>
/// <param name="Target">Full path of that program, when known.</param>
public sealed record AppEntry(string Id, string Name, string? Icon, string? Exe, string? Target = null);

/// <summary>
/// Lists installed apps the same way the Start menu does, by reading the shell's AppsFolder.
/// That covers classic desktop programs and Store apps alike.
/// </summary>
public sealed class AppCatalog
{
    static readonly string[] NoiseWords =
        { "uninstall", "readme", "read me", "release notes", "documentation", "website", "license", "help" };
    static readonly string[] NoiseExtensions = { ".url", ".txt", ".htm", ".html", ".chm", ".pdf", ".rtf" };

    readonly StaWorker _sta = new("Haven app catalog");
    static AppCatalog? Instance;

    public AppCatalog() { Instance = this; }
    List<AppEntry>? _cache;
    Dictionary<string, AppEntry> _byId = new();

    public Task<List<AppEntry>> GetAsync(bool refresh = false) => _sta.Run(() =>
    {
        if (_cache == null || refresh)
        {
            _cache = Load();
            _byId = _cache.ToDictionary(a => a.Id, StringComparer.OrdinalIgnoreCase);
        }
        return _cache;
    });

    public async Task LaunchAsync(string id)
    {
        await GetAsync();
        if (!_byId.ContainsKey(id)) throw new InvalidOperationException("That app is no longer installed.");
        Process.Start(new ProcessStartInfo("explorer.exe", $"shell:AppsFolder\\{id}") { UseShellExecute = true });
    }

    /// <summary>The program file behind an app, when it's a classic desktop app (null for Store apps).</summary>
    public static string? ResolveExe(string id)
    {
        if (Instance?._byId.TryGetValue(id, out var entry) == true && entry.Target != null) return entry.Target;
        if (Path.IsPathRooted(id)) return File.Exists(id) ? id : null;
        // Paths like "{6D809377-6AF0-444B-8957-A3773F02200E}\App\app.exe" start with a known-folder id.
        if (id.Length > 38 && id[0] == '{' && id[37] == '}' && Guid.TryParse(id[1..37], out var folderId)
            && SHGetKnownFolderPath(folderId, 0, IntPtr.Zero, out var folder) == 0)
        {
            var full = Path.Combine(folder, id[39..]);
            return File.Exists(full) ? full : null;
        }
        return null;
    }

    [System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    static extern int SHGetKnownFolderPath([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStruct)] Guid id,
        uint flags, IntPtr token, out string path);

    static List<AppEntry> Load()
    {
        var shellType = Type.GetTypeFromProgID("Shell.Application")
            ?? throw new InvalidOperationException("Windows shell automation is unavailable.");
        dynamic shell = Activator.CreateInstance(shellType)!;
        dynamic items = shell.NameSpace("shell:AppsFolder").Items();

        var list = new List<AppEntry>();
        var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int count = items.Count;
        for (int i = 0; i < count; i++)
        {
            dynamic item = items.Item(i);
            string name = item.Name ?? "";
            string path = item.Path ?? "";
            if (name.Length == 0 || path.Length == 0 || IsNoise(name, path) || !seenNames.Add(name)) continue;

            var iconFile = Path.Combine(Paths.Icons, Paths.Hash(path) + ".png");
            var icon = ShellIcons.TrySave("shell:AppsFolder\\" + path, iconFile) ? Paths.Url(iconFile) : null;
            // Entries like "Microsoft.VisualStudioCode" hide the real program behind a Start menu shortcut;
            // its target tells us which running windows (Code.exe) belong to this app.
            string? target = path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? path : null;
            if (target == null)
            {
                try { target = item.ExtendedProperty("System.Link.TargetParsingPath") as string; } catch { }
                if (target != null && !target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) target = null;
            }
            var exe = target != null ? Path.GetFileName(target) : null;
            list.Add(new AppEntry(path, name, icon, exe, target != null && File.Exists(target) ? target : null));
        }
        return list.OrderBy(a => a.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    static bool IsNoise(string name, string path)
    {
        var lower = name.ToLowerInvariant();
        return NoiseWords.Any(lower.Contains)
            || NoiseExtensions.Any(ext => path.EndsWith(ext, StringComparison.OrdinalIgnoreCase));
    }
}
