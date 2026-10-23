using System.Runtime.InteropServices;

namespace Haven;

/// <summary>Moves the window in front into halves, quarters, the centre, or full screen.</summary>
static class WindowSnap
{
    public static readonly (int Id, uint Vk, string Where)[] Shortcuts =
    {
        (10, 0x25, "left"), (11, 0x27, "right"), (12, 0x26, "top"), (13, 0x28, "bottom"),
        (14, 0x0D, "fill"), (15, 0x43 /* C */, "center"),
        (16, 0x55 /* U */, "top-left"), (17, 0x49 /* I */, "top-right"), (18, 0x4A /* J */, "bottom-left"), (19, 0x4B /* K */, "bottom-right"),
    };

    public static void Snap(string where, IntPtr ignoreA, IntPtr ignoreB)
    {
        var hwnd = Native.GetForegroundWindow();
        if (hwnd == IntPtr.Zero || hwnd == ignoreA || hwnd == ignoreB) return;

        if (where == "fill")
        {
            Native.ShowWindow(hwnd, 3 /* SW_MAXIMIZE */);
            return;
        }
        if (IsZoomed(hwnd)) Native.ShowWindow(hwnd, Native.SW_RESTORE);

        var mon = MonitorFromWindow(hwnd, 2 /* NEAREST */);
        var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        if (!GetMonitorInfo(mon, ref info)) return;
        var wa = info.rcWork;
        int w = wa.Width, h = wa.Height, hw = w / 2, hh = h / 2;

        Native.GetWindowRect(hwnd, out var outer);
        Native.RECT target = where switch
        {
            "left" => new(wa.Left, wa.Top, wa.Left + hw, wa.Bottom),
            "right" => new(wa.Left + hw, wa.Top, wa.Right, wa.Bottom),
            "top" => new(wa.Left, wa.Top, wa.Right, wa.Top + hh),
            "bottom" => new(wa.Left, wa.Top + hh, wa.Right, wa.Bottom),
            "top-left" => new(wa.Left, wa.Top, wa.Left + hw, wa.Top + hh),
            "top-right" => new(wa.Left + hw, wa.Top, wa.Right, wa.Top + hh),
            "bottom-left" => new(wa.Left, wa.Top + hh, wa.Left + hw, wa.Bottom),
            "bottom-right" => new(wa.Left + hw, wa.Top + hh, wa.Right, wa.Bottom),
            "center" => Centered(wa, outer),
            _ => outer,
        };

        // Windows draws invisible resize borders outside the visible frame; compensate so edges line up.
        if (DwmGetWindowAttribute(hwnd, 9 /* EXTENDED_FRAME_BOUNDS */, out var visible, Marshal.SizeOf<Native.RECT>()) == 0)
        {
            target.Left -= visible.Left - outer.Left;
            target.Top -= visible.Top - outer.Top;
            target.Right += outer.Right - visible.Right;
            target.Bottom += outer.Bottom - visible.Bottom;
        }
        Native.SetWindowPos(hwnd, IntPtr.Zero, target.Left, target.Top, target.Width, target.Height,
            Native.SWP_NOZORDER | Native.SWP_NOACTIVATE);
    }

    static Native.RECT Centered(Native.RECT wa, Native.RECT win)
    {
        int w = Math.Min(win.Width, wa.Width), h = Math.Min(win.Height, wa.Height);
        int x = wa.Left + (wa.Width - w) / 2, y = wa.Top + (wa.Height - h) / 2;
        return new Native.RECT(x, y, x + w, y + h);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MONITORINFO { public int cbSize; public Native.RECT rcMonitor, rcWork; public uint dwFlags; }

    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr mon, ref MONITORINFO info);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out Native.RECT value, int size);
}
