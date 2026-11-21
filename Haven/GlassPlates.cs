using System.Runtime.InteropServices;

namespace Haven;

/// <summary>
/// Frosted-glass panes that sit directly behind the menu bar and Dock. A web page can only blur
/// its own content, so I get real "glass" over other apps' windows from these small native
/// windows, which ask Windows to draw an acrylic blur of whatever is behind them.
/// </summary>
sealed class GlassPlates
{
    public readonly record struct Plate(int X, int Y, int Width, int Height, int Radius);

    readonly List<Native.RawWindow> _windows = new();
    readonly List<Plate> _current = new();
    bool _suspended;
    uint _tint = 0x01000000;

    /// <summary>Colour mixed into the blur, as AABBGGRR (follows the theme, so the bar matches it).</summary>
    public void SetTint(uint tint)
    {
        if (tint == _tint) return;
        _tint = tint;
        foreach (var w in _windows) EnableAcrylic(w.Handle, _tint);
    }

    public void Set(IReadOnlyList<Plate> plates, IntPtr shellLayer)
    {
        _current.Clear();
        _current.AddRange(plates);

        // Windows' acrylic blur ignores rounded window shapes and always fills the full rectangle,
        // so panes are only used behind square-cornered surfaces (the menu bar).
        var rects = plates.Where(p => p.Width > 0 && p.Height > 0)
            .Select(p => new Native.RECT(p.X, p.Y, p.X + p.Width, p.Y + p.Height)).ToList();

        while (_windows.Count < rects.Count) _windows.Add(CreatePlate(_tint));
        for (int i = 0; i < _windows.Count; i++)
        {
            var h = _windows[i].Handle;
            if (i >= rects.Count || _suspended)
            {
                Native.ShowWindow(h, Native.SW_HIDE);
                continue;
            }
            var r = rects[i];
            // Directly beneath the shell layer, so the bar and Dock draw on top of the blur.
            Native.SetWindowPos(h, shellLayer, r.Left, r.Top, r.Width, r.Height, Native.SWP_NOACTIVATE | 0x40 /* SHOWWINDOW */);
        }
    }

    public void SetSuspended(bool suspended, IntPtr shellLayer)
    {
        if (suspended == _suspended) return;
        _suspended = suspended;
        Set(_current.ToList(), shellLayer);
    }

    /// <summary>Briefly hide the panes (for a clean screen snapshot); Reapply brings them back.</summary>
    public void HideAll()
    {
        foreach (var w in _windows) Native.ShowWindow(w.Handle, Native.SW_HIDE);
    }

    public void Reapply(IntPtr shellLayer) => Set(_current.ToList(), shellLayer);

    public void Close()
    {
        foreach (var w in _windows) w.Dispose();
        _windows.Clear();
    }

    static Native.RawWindow CreatePlate(uint tint)
    {
        var w = new Native.RawWindow("HavenGlassPlate", Native.WS_POPUP,
            Native.WS_EX_TOOLWINDOW | Native.WS_EX_TOPMOST | Native.WS_EX_NOACTIVATE | 0x20 /* TRANSPARENT: clicks pass */,
            new Native.RECT());
        EnableAcrylic(w.Handle, tint);
        return w;
    }

    static void EnableAcrylic(IntPtr hwnd, uint tint)
    {
        // Acrylic blur behind the window, tinted with the theme colour; the shell layer adds its own tint on top.
        var accent = new ACCENT_POLICY { AccentState = 4 /* ACRYLICBLURBEHIND */, GradientColor = tint };
        int size = Marshal.SizeOf<ACCENT_POLICY>();
        var ptr = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(accent, ptr, false);
            var data = new WINCOMPATTRDATA { Attribute = 19 /* WCA_ACCENT_POLICY */, Data = ptr, SizeOfData = size };
            SetWindowCompositionAttribute(hwnd, ref data);
        }
        finally { Marshal.FreeHGlobal(ptr); }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ACCENT_POLICY { public int AccentState, AccentFlags; public uint GradientColor; public int AnimationId; }

    [StructLayout(LayoutKind.Sequential)]
    struct WINCOMPATTRDATA { public int Attribute; public IntPtr Data; public int SizeOfData; }

    [DllImport("user32.dll")] static extern int SetWindowCompositionAttribute(IntPtr hwnd, ref WINCOMPATTRDATA data);
    [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int l, int t, int r, int b, int w, int h);
}
