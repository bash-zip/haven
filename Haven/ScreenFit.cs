using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace Haven;

/// <summary>
/// Sizes a fullscreen WPF overlay to exactly cover the primary monitor, in physical pixels.
/// SystemParameters.PrimaryScreenWidth is scaled by the LOGON dpi, while a per-monitor-aware
/// window converts device-independent units with its LIVE dpi — after any display-scale
/// change the two disagree and the window covers only part of the screen. Every fullscreen
/// layer and overlay must go through this instead of setting Width/Height directly.
/// </summary>
static class ScreenFit
{
    public static void CoverMonitor(Window w)
    {
        var m = Native.PrimaryMonitor();
        var hwnd = new WindowInteropHelper(w).Handle;
        if (hwnd == IntPtr.Zero)
        {
            // No HWND yet: best effort only; the caller must re-fit once SourceInitialized fires.
            w.Left = 0;
            w.Top = 0;
            w.Width = SystemParameters.PrimaryScreenWidth;
            w.Height = SystemParameters.PrimaryScreenHeight;
            return;
        }
        var dpi = VisualTreeHelper.GetDpi(w).DpiScaleX;
        if (dpi <= 0) dpi = 1;
        // Device-independent units derived from the physical monitor and the window's live dpi.
        w.Left = m.Left / dpi;
        w.Top = m.Top / dpi;
        w.Width = m.Width / dpi;
        w.Height = m.Height / dpi;
        // The last word: the hwnd covers the monitor in physical pixels, no conversion involved.
        Native.SetWindowPos(hwnd, IntPtr.Zero, m.Left, m.Top, m.Width, m.Height,
            Native.SWP_NOZORDER | Native.SWP_NOACTIVATE);
    }
}
