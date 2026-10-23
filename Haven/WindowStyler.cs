using System.Runtime.InteropServices;

namespace Haven;

/// <summary>
/// Deep Customization for real app windows (Windows 11): corner rounding and the border colour.
/// The window in front can get the accent colour while the rest get a quiet hairline. Every
/// window touched is put back to Windows' defaults when the setting is turned off or Haven exits.
/// </summary>
static class WindowStyler
{
    const int DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWA_BORDER_COLOR = 34;
    const uint COLOR_DEFAULT = 0xFFFFFFFF, COLOR_NONE = 0xFFFFFFFE;
    static readonly HashSet<IntPtr> Touched = new();

    static string _corners = "default"; // default | round | small | sharp
    static string _border = "default";  // default | none | hairline | accent
    static uint _accent = 0x00F68B3B;    // COLORREF (0x00BBGGRR)
    static uint _hairline = 0x00505050;

    public static bool Active => _corners != "default" || _border != "default";

    public static void Configure(string corners, string border, string accentHex, string hairlineHex)
    {
        bool wasActive = Active;
        _corners = corners;
        _border = border;
        _accent = ToColorRef(accentHex, _accent);
        _hairline = ToColorRef(hairlineHex, _hairline);
        var marker = Path.Combine(Paths.Root, "window-style.txt");
        if (!Active) { if (wasActive) RestoreAll(); try { File.Delete(marker); } catch { } return; }
        File.WriteAllText(marker, $"{corners} {border}"); // tells the watchdog to clean up after a crash
        ApplyAll();
    }

    public static void ApplyAll()
    {
        if (!Active) return;
        var fg = Native.GetForegroundWindow();
        foreach (var h in WindowTracker.VisibleWindowsBottomUp()) Apply(h, h == fg);
    }

    /// <summary>The window in front changed (or a window opened): restyle.</summary>
    public static void OnWindowsChanged() { if (Active) ApplyAll(); }

    static void Apply(IntPtr h, bool front)
    {
        int corner = _corners switch { "round" => 2, "small" => 3, "sharp" => 1, _ => 0 };
        DwmSetWindowAttribute(h, DWMWA_WINDOW_CORNER_PREFERENCE, ref corner, sizeof(int));
        uint color = _border switch
        {
            "none" => COLOR_NONE,
            "hairline" => _hairline,
            "accent" => front ? _accent : _hairline,
            _ => COLOR_DEFAULT,
        };
        DwmSetWindowAttribute(h, DWMWA_BORDER_COLOR, ref color, sizeof(uint));
        lock (Touched) Touched.Add(h);
    }

    public static void RestoreAll()
    {
        try { File.Delete(Path.Combine(Paths.Root, "window-style.txt")); } catch { }
        List<IntPtr> list;
        lock (Touched) { list = Touched.ToList(); Touched.Clear(); }
        foreach (var h in list)
        {
            if (!IsWindow(h)) continue;
            int corner = 0;
            uint color = COLOR_DEFAULT;
            DwmSetWindowAttribute(h, DWMWA_WINDOW_CORNER_PREFERENCE, ref corner, sizeof(int));
            DwmSetWindowAttribute(h, DWMWA_BORDER_COLOR, ref color, sizeof(uint));
        }
    }

    /// <summary>After a crash (from the watchdog): put every open window back to Windows' defaults.</summary>
    public static void ResetEverything()
    {
        lock (Touched) foreach (var h in WindowTracker.VisibleWindowsBottomUp()) Touched.Add(h);
        RestoreAll();
    }

    static uint ToColorRef(string? hex, uint fallback)
    {
        if (string.IsNullOrEmpty(hex) || hex[0] != '#' || hex.Length != 7) return fallback;
        try
        {
            uint rgb = Convert.ToUInt32(hex[1..], 16);
            return ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF);
        }
        catch { return fallback; }
    }

    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int value, int size);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref uint value, int size);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
}
