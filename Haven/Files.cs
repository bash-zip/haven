using System.Data.OleDb;
using System.Diagnostics;

namespace Haven;

public sealed record FileHit(string Path, string Name, string Kind, string? Icon);
public sealed record FolderEntry(string Path, string Name, string? Icon, bool IsFolder, long Modified);

/// <summary>File search through the Windows Search index, Quick Look previews, and recent-file stacks.</summary>
sealed class Files
{
    static readonly string Profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    static readonly HashSet<string> TextExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".txt", ".md", ".log", ".json", ".xml", ".csv", ".ini", ".cfg", ".yml", ".yaml", ".js", ".ts", ".css", ".html",
        ".cs", ".py", ".java", ".c", ".cpp", ".h", ".ps1", ".bat", ".sh", ".sql", ".toml",
    };

    readonly StaWorker _sta = new("Haven files");

    public static string? KnownFolder(string name) => name switch
    {
        "downloads" => Path.Combine(Profile, "Downloads"),
        "documents" => Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "pictures" => Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
        "desktop" => Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
        // Folders you added to the Dock are passed by their full path.
        _ when Path.IsPathRooted(name) && Directory.Exists(name) => name,
        _ => null,
    };

    /// <summary>Files under your user folder whose names contain every word of the query.</summary>
    public Task<List<FileHit>> SearchAsync(string query, int max = 8) => _sta.Run(() =>
    {
        var hits = new List<FileHit>();
        var words = query.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => new string(w.Where(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_').ToArray()))
            .Where(w => w.Length > 0).Take(4).ToList();
        if (words.Count == 0) return hits;

        var where = string.Join(" AND ", words.Select(w => $"System.FileName LIKE '%{w.Replace("'", "''")}%'"));
        var scope = "file:" + Profile.Replace('\\', '/');
        var sql = $"SELECT TOP {max} System.ItemPathDisplay, System.ItemNameDisplay, System.ItemTypeText FROM SystemIndex " +
                  $"WHERE SCOPE='{scope}' AND {where} ORDER BY System.Search.Rank DESC, System.DateModified DESC";
        try
        {
            using var conn = new OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';");
            conn.Open();
            using var cmd = new OleDbCommand(sql, conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                var path = reader[0] as string;
                if (string.IsNullOrEmpty(path)) continue;
                var icon = Path.Combine(Paths.Icons, "file-" + Paths.Hash(path) + ".png");
                hits.Add(new FileHit(path, reader[1] as string ?? Path.GetFileName(path), reader[2] as string ?? "",
                    ShellIcons.TrySave(path, icon, 64) ? Paths.Url(icon) : null));
            }
        }
        catch { /* Windows Search unavailable */ }
        return hits;
    });

    /// <summary>Everything Quick Look needs: a large preview image, text for plain-text files, and basic details.</summary>
    public Task<object> PreviewAsync(string path) => _sta.Run<object>(() =>
    {
        bool isFolder = Directory.Exists(path);
        if (!isFolder && !File.Exists(path)) throw new InvalidOperationException("That file no longer exists.");
        var stamp = isFolder ? Directory.GetLastWriteTimeUtc(path) : File.GetLastWriteTimeUtc(path);
        Directory.CreateDirectory(Path.Combine(Paths.Public, "preview"));
        var image = Path.Combine(Paths.Public, "preview", Paths.Hash(path + stamp.Ticks) + ".png");
        var hasImage = ShellIcons.TrySave(path, image, 1024, iconOnly: false);

        string? text = null;
        long size = 0;
        int? items = null;
        if (isFolder)
        {
            try { items = Directory.EnumerateFileSystemEntries(path).Count(); } catch { }
        }
        else
        {
            size = new FileInfo(path).Length;
            if (TextExtensions.Contains(Path.GetExtension(path)) && size < 4_000_000)
            {
                using var reader = new StreamReader(path);
                var buffer = new char[40_000];
                text = new string(buffer, 0, reader.Read(buffer, 0, buffer.Length));
            }
        }
        return new
        {
            path,
            name = Path.GetFileName(path),
            isFolder,
            size,
            items,
            modified = new DateTimeOffset(stamp).ToUnixTimeMilliseconds(),
            image = hasImage ? Paths.Url(image) : null,
            text,
        };
    });

    /// <summary>The newest files in a known folder, for the Downloads stack and the photo widget.</summary>
    public Task<List<FolderEntry>> RecentAsync(string folder, int count, bool imagesOnly) => _sta.Run(() =>
    {
        var dir = KnownFolder(folder) ?? throw new InvalidOperationException("Unknown folder.");
        var list = new List<FolderEntry>();
        if (!Directory.Exists(dir)) return list;
        var exts = new[] { ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".heic" };
        var entries = new DirectoryInfo(dir).EnumerateFileSystemInfos("*", imagesOnly ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly)
            .Where(f => (f.Attributes & (FileAttributes.Hidden | FileAttributes.System)) == 0)
            .Where(f => !imagesOnly || (f is FileInfo && exts.Contains(f.Extension.ToLowerInvariant())))
            .Where(f => !f.Name.EndsWith(".crdownload", StringComparison.OrdinalIgnoreCase) && !f.Name.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(f => f.LastWriteTimeUtc).Take(count);
        foreach (var f in entries)
        {
            var icon = Path.Combine(Paths.Icons, "recent-" + Paths.Hash(f.FullName + f.LastWriteTimeUtc.Ticks) + ".png");
            var ok = ShellIcons.TrySave(f.FullName, icon, imagesOnly ? 512 : 128, iconOnly: false);
            list.Add(new FolderEntry(f.FullName, f.Name, ok ? Paths.Url(icon) : null, f is DirectoryInfo,
                new DateTimeOffset(f.LastWriteTimeUtc).ToUnixTimeMilliseconds()));
        }
        return list;
    });

    public static void Open(string path)
    {
        if (!File.Exists(path) && !Directory.Exists(path)) throw new InvalidOperationException("That file no longer exists.");
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }

    public static void Reveal(string path)
    {
        if (!File.Exists(path) && !Directory.Exists(path)) throw new InvalidOperationException("That file no longer exists.");
        Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
    }

    /// <summary>Opens files with a particular program (dropping files on a Dock icon).</summary>
    public static void OpenWith(string? exe, IReadOnlyList<string> files)
    {
        var existing = files.Where(f => File.Exists(f) || Directory.Exists(f)).ToList();
        if (existing.Count == 0) return;
        if (exe != null && File.Exists(exe))
        {
            Process.Start(new ProcessStartInfo(exe, string.Join(' ', existing.Select(f => $"\"{f}\""))) { UseShellExecute = true });
            return;
        }
        foreach (var f in existing) Open(f); // Store apps: fall back to each file's default app
    }
}
