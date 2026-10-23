using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Media.Imaging;

namespace Haven;

public sealed class ClipItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Kind { get; set; } = "text"; // text | image | files
    public string Text { get; set; } = "";
    public string? Image { get; set; }         // data.haven.example URL of the saved picture
    public string? App { get; set; }           // the app it was copied from
    public DateTime Time { get; set; } = DateTime.Now;
    public bool Pinned { get; set; }
}

/// <summary>
/// Clipboard history: everything you copy (text, pictures, files), searchable from Haven's search
/// and Win + V. Respects apps that mark content as private (password managers do), keeps the
/// newest 80 plus anything pinned, and stays on this PC.
/// </summary>
static class ClipboardHistory
{
    const int Max = 80;
    static readonly string FilePath = Path.Combine(Paths.Root, "clipboard.json");
    static readonly string ImageDir = Path.Combine(Paths.Public, "clips");
    static List<ClipItem> _items = new();
    static IntPtr _hwnd;
    static bool _ignoreNext;
    static uint _excludeFormat, _historyFormat, _cloudFormat;

    public static bool Listening { get; private set; }
    public static int Count => _items.Count;
    public static event Action? Changed;

    public static void Start(IntPtr hwnd)
    {
        _hwnd = hwnd;
        Load();
        _excludeFormat = RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing");
        _historyFormat = RegisterClipboardFormat("CanIncludeInClipboardHistory");
        _cloudFormat = RegisterClipboardFormat("CanUploadToCloudClipboard");
        Listening = AddClipboardFormatListener(hwnd);
    }

    public static void Stop()
    {
        if (Listening) RemoveClipboardFormatListener(_hwnd);
        Listening = false;
    }

    public static void SetEnabled(bool on, IntPtr hwnd)
    {
        if (on && !Listening) Start(hwnd);
        else if (!on) { Stop(); Clear(includePinned: false); }
    }

    public static List<ClipItem> Items() => _items.OrderByDescending(i => i.Pinned).ThenByDescending(i => i.Time).ToList();

    /// <summary>WM_CLIPBOARDUPDATE: read what was just copied.</summary>
    public static void OnUpdate()
    {
        if (_ignoreNext) { _ignoreNext = false; return; }
        try
        {
            if (IsPrivate()) return;
            ClipItem? item = null;
            if (Clipboard.ContainsFileDropList())
            {
                var files = Clipboard.GetFileDropList().Cast<string>().ToList();
                if (files.Count > 0) item = new ClipItem { Kind = "files", Text = string.Join("\n", files) };
            }
            else if (Clipboard.ContainsText())
            {
                var text = Clipboard.GetText();
                if (!string.IsNullOrWhiteSpace(text) && text.Length < 200_000) item = new ClipItem { Kind = "text", Text = text };
            }
            else if (Clipboard.ContainsImage())
            {
                var image = Clipboard.GetImage();
                if (image != null) item = new ClipItem { Kind = "image", Text = $"Image {image.PixelWidth} × {image.PixelHeight}", Image = SaveImage(image) };
            }
            if (item == null) return;
            item.App = WindowTracker.ExeOf(Native.GetForegroundWindow());

            // Copying the same thing again moves it to the top instead of adding a duplicate.
            var same = _items.FirstOrDefault(i => i.Kind == item.Kind && i.Kind != "image" && i.Text == item.Text);
            if (same != null) { same.Time = DateTime.Now; same.App = item.App; }
            else _items.Add(item);
            Trim();
            Save();
            Changed?.Invoke();
        }
        catch { /* the clipboard is often briefly locked by the app that wrote it */ }
    }

    /// <summary>Puts an item back on the clipboard (and optionally pastes it into the app in front).</summary>
    public static bool Copy(string id)
    {
        var item = _items.FirstOrDefault(i => i.Id == id);
        if (item == null) return false;
        _ignoreNext = true;
        try
        {
            switch (item.Kind)
            {
                case "files":
                    var list = new System.Collections.Specialized.StringCollection();
                    list.AddRange(item.Text.Split('\n'));
                    Clipboard.SetFileDropList(list);
                    break;
                case "image" when item.Image != null:
                    var path = Path.Combine(ImageDir, Path.GetFileName(new Uri(item.Image).LocalPath));
                    var bmp = new BitmapImage();
                    bmp.BeginInit(); bmp.CacheOption = BitmapCacheOption.OnLoad; bmp.UriSource = new Uri(path); bmp.EndInit();
                    Clipboard.SetImage(bmp);
                    break;
                default:
                    Clipboard.SetText(item.Text);
                    break;
            }
        }
        catch { _ignoreNext = false; return false; }
        item.Time = DateTime.Now;
        Save();
        Changed?.Invoke();
        return true;
    }

    public static void Pin(string id, bool pinned)
    {
        var item = _items.FirstOrDefault(i => i.Id == id);
        if (item == null) return;
        item.Pinned = pinned;
        Save();
        Changed?.Invoke();
    }

    public static void AddSnippet(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        _items.Add(new ClipItem { Kind = "text", Text = text, Pinned = true, App = "Snippet" });
        Save();
        Changed?.Invoke();
    }

    public static void Delete(string id)
    {
        var item = _items.FirstOrDefault(i => i.Id == id);
        if (item == null) return;
        _items.Remove(item);
        DeleteImage(item);
        Save();
        Changed?.Invoke();
    }

    public static void Clear(bool includePinned)
    {
        foreach (var i in _items.Where(i => includePinned || !i.Pinned).ToList()) { _items.Remove(i); DeleteImage(i); }
        Save();
        Changed?.Invoke();
    }

    static bool IsPrivate()
    {
        // The Windows convention for "don't record this" (password managers, banking apps).
        if (_excludeFormat != 0 && IsClipboardFormatAvailable(_excludeFormat)) return true;
        foreach (var f in new[] { _historyFormat, _cloudFormat })
        {
            if (f == 0 || !IsClipboardFormatAvailable(f)) continue;
            var data = Clipboard.GetData(DataFormats.GetDataFormat((int)f).Name);
            if (data is MemoryStream ms && ms.Length >= 4 && BitConverter.ToInt32(ms.ToArray(), 0) == 0) return true;
        }
        return false;
    }

    static void Trim()
    {
        var old = _items.Where(i => !i.Pinned).OrderByDescending(i => i.Time).Skip(Max).ToList();
        foreach (var i in old) { _items.Remove(i); DeleteImage(i); }
    }

    static string SaveImage(BitmapSource image)
    {
        Directory.CreateDirectory(ImageDir);
        var path = Path.Combine(ImageDir, Guid.NewGuid().ToString("N") + ".png");
        Screenshots.WritePng(image, path);
        return Paths.Url(path);
    }

    static void DeleteImage(ClipItem i)
    {
        if (i.Image == null) return;
        try { File.Delete(Path.Combine(ImageDir, Path.GetFileName(new Uri(i.Image).LocalPath))); } catch { }
    }

    static void Load()
    {
        try { if (File.Exists(FilePath)) _items = JsonSerializer.Deserialize<List<ClipItem>>(File.ReadAllText(FilePath)) ?? new(); }
        catch { _items = new(); }
    }

    static void Save()
    {
        try { File.WriteAllText(FilePath, JsonSerializer.Serialize(_items)); } catch { }
    }

    public const int WM_CLIPBOARDUPDATE = 0x031D;
    [DllImport("user32.dll")] static extern bool AddClipboardFormatListener(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool RemoveClipboardFormatListener(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
    [DllImport("user32.dll")] static extern bool IsClipboardFormatAvailable(uint format);
}
