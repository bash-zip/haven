using System.Diagnostics;

namespace Haven;

public sealed record DesktopItem(string Id, string Name, string? Icon, bool IsFolder);

/// <summary>The files and shortcuts on the Windows desktop, shown as Haven's desktop icons.</summary>
sealed class DesktopItems : IDisposable
{
    static readonly string UserDesktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
    static readonly string CommonDesktop = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);

    readonly StaWorker _sta = new("Haven desktop icons");
    readonly List<FileSystemWatcher> _watchers = new();
    readonly System.Timers.Timer _debounce = new(400) { AutoReset = false };

    /// <summary>Raised (on a background thread) shortly after anything on the desktop changes.</summary>
    public event Action? Changed;

    public DesktopItems()
    {
        _debounce.Elapsed += (_, _) => Changed?.Invoke();
        foreach (var dir in Folders())
        {
            var w = new FileSystemWatcher(dir) { IncludeSubdirectories = false, EnableRaisingEvents = true };
            w.Created += Touch; w.Deleted += Touch; w.Renamed += Touch; w.Changed += Touch;
            _watchers.Add(w);
        }
    }

    void Touch(object sender, FileSystemEventArgs e) { _debounce.Stop(); _debounce.Start(); }

    static IEnumerable<string> Folders() =>
        new[] { UserDesktop, CommonDesktop }.Where(d => !string.IsNullOrEmpty(d) && Directory.Exists(d))
            .Distinct(StringComparer.OrdinalIgnoreCase);

    public Task<List<DesktopItem>> ListAsync() => _sta.Run(() =>
    {
        var items = new List<DesktopItem>();
        foreach (var dir in Folders())
        {
            foreach (var path in Directory.EnumerateFileSystemEntries(dir))
            {
                FileAttributes attrs;
                try { attrs = File.GetAttributes(path); } catch { continue; }
                if ((attrs & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;
                if (Path.GetFileName(path).Equals("desktop.ini", StringComparison.OrdinalIgnoreCase)) continue;

                bool isFolder = (attrs & FileAttributes.Directory) != 0;
                var ext = Path.GetExtension(path);
                var name = !isFolder && (ext.Equals(".lnk", StringComparison.OrdinalIgnoreCase) || ext.Equals(".url", StringComparison.OrdinalIgnoreCase))
                    ? Path.GetFileNameWithoutExtension(path)
                    : Path.GetFileName(path);

                var stamp = (isFolder ? Directory.GetLastWriteTimeUtc(path) : File.GetLastWriteTimeUtc(path)).Ticks;
                var iconFile = Path.Combine(Paths.Icons, "desk-" + Paths.Hash(path + stamp) + ".png");
                // Thumbnails for pictures and documents, regular icons for everything else.
                var icon = ShellIcons.TrySave(path, iconFile, 128, iconOnly: false) ? Paths.Url(iconFile) : null;
                items.Add(new DesktopItem(path, name, icon, isFolder));
            }
        }
        return items.OrderBy(i => i.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
    });

    public static bool IsOnDesktop(string path)
    {
        var dir = Path.GetDirectoryName(Path.GetFullPath(path));
        return dir != null && Folders().Any(f => string.Equals(f.TrimEnd('\\'), dir.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
            && (File.Exists(path) || Directory.Exists(path));
    }

    public static void Open(string path)
    {
        if (!IsOnDesktop(path)) throw new InvalidOperationException("That item is no longer on the desktop.");
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }

    public static void Reveal(string path)
    {
        if (!IsOnDesktop(path)) throw new InvalidOperationException("That item is no longer on the desktop.");
        Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
    }

    public static string NewFolder()
    {
        var path = Path.Combine(UserDesktop, "New folder");
        for (int n = 2; Directory.Exists(path) || File.Exists(path); n++)
            path = Path.Combine(UserDesktop, $"New folder ({n})");
        Directory.CreateDirectory(path);
        return path;
    }

    public static string Rename(string path, string newName)
    {
        if (!IsOnDesktop(path)) throw new InvalidOperationException("That item is no longer on the desktop.");
        newName = newName.Trim();
        if (newName.Length == 0 || newName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || newName is "." or "..")
            throw new InvalidOperationException("A name can't contain \\ / : * ? \" < > |");

        bool isFolder = Directory.Exists(path);
        var ext = Path.GetExtension(path);
        // Shortcuts are shown without their extension, so keep it when renaming.
        if (!isFolder && (ext.Equals(".lnk", StringComparison.OrdinalIgnoreCase) || ext.Equals(".url", StringComparison.OrdinalIgnoreCase)))
            newName += ext;

        var target = Path.Combine(Path.GetDirectoryName(path)!, newName);
        if (string.Equals(target, path, StringComparison.Ordinal)) return path;
        if ((File.Exists(target) || Directory.Exists(target)) && !string.Equals(target, path, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"There's already an item named “{newName}”.");

        if (isFolder) Directory.Move(path, target); else File.Move(path, target);
        return target;
    }

    public void Dispose()
    {
        foreach (var w in _watchers) w.Dispose();
        _debounce.Dispose();
    }
}
