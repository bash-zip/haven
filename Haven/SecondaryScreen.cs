using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Haven;

/// <summary>
/// Haven on another display: that screen's own wallpaper, a menu bar (clock, the app in front on
/// this screen, search) and a Dock with your apps. Like the main desktop layer it stays behind every
/// window; the menu bar and Dock strips are reserved so maximized windows stop short of them.
/// </summary>
sealed class SecondaryScreen : Window
{
    public string Part { get; }
    public Native.RECT Bounds { get; }
    public WebView2 Web { get; } = new() { DefaultBackgroundColor = System.Drawing.Color.FromArgb(255, 22, 22, 26) };
    IntPtr _hwnd;
    readonly AppBar _top, _bottom;

    public SecondaryScreen(string part, Native.RECT bounds)
    {
        Part = part;
        Bounds = bounds;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        ShowActivated = false;
        Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(22, 22, 26));
        Content = Web;
        Title = "Haven Display";
        SourceInitialized += (_, _) =>
        {
            _hwnd = new WindowInteropHelper(this).Handle;
            Native.SetExStyle(_hwnd, Native.WS_EX_TOOLWINDOW, Native.WS_EX_APPWINDOW);
            HwndSource.FromHwnd(_hwnd).AddHook(WndProc);
            Place();
        };
        StateChanged += (_, _) => { if (WindowState != WindowState.Normal) WindowState = WindowState.Normal; };
        _top = new AppBar(AppBar.Top, () => Bounds);
        _bottom = new AppBar(AppBar.Bottom, () => Bounds);
    }

    public IntPtr Handle => _hwnd;

    /// <summary>Covers this display exactly (physical pixels), at the very bottom of the window stack.</summary>
    public void Place() =>
        Native.SetWindowPos(_hwnd, Native.HWND_BOTTOM, Bounds.Left, Bounds.Top, Bounds.Width, Bounds.Height, Native.SWP_NOACTIVATE);

    public void Reserve(int top, int bottom)
    {
        _top.SetThickness(top);
        _bottom.SetThickness(bottom);
    }

    public void Reregister() { _top.Register(); _bottom.Register(); }

    IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == Native.WM_WINDOWPOSCHANGING)
        {
            var pos = Marshal.PtrToStructure<Native.WINDOWPOS>(lParam);
            if ((pos.flags & Native.SWP_NOZORDER) == 0)
            {
                pos.hwndInsertAfter = Native.HWND_BOTTOM;
                Marshal.StructureToPtr(pos, lParam, false);
            }
        }
        else if (msg == Native.WM_DPICHANGED)
        {
            // A per-monitor DPI change can nudge the WPF window off its exact physical rect
            // (same class of drift the desktop layer guards against) — pin it back.
            Dispatcher.BeginInvoke(Place);
        }
        return IntPtr.Zero;
    }

    public void Shutdown()
    {
        _top.Dispose();
        _bottom.Dispose();
        try { Web.Dispose(); } catch { }
        Close();
    }
}
