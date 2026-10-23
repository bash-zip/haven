using Microsoft.Web.WebView2.Core;

namespace Haven;

/// <summary>
/// The always-on-top layer: menu bar, Dock, Launchpad, search and menus. It is a see-through
/// window over the whole screen whose clickable area is cut down to just the bar and the Dock,
/// so everything else on screen stays usable. While a menu or overlay is open it takes the
/// whole screen, so a click anywhere closes it.
/// </summary>
sealed class ShellLayer
{
    readonly Native.RawWindow _window;
    CoreWebView2Controller? _controller;
    bool _interactive;
    bool _suspended;

    public IntPtr Handle => _window.Handle;
    public CoreWebView2? Core => _controller?.CoreWebView2;

    public ShellLayer()
    {
        var m = Native.PrimaryMonitor();
        _window = new Native.RawWindow("HavenShellLayer", Native.WS_POPUP | Native.WS_CLIPCHILDREN,
            Native.WS_EX_NOREDIRECTIONBITMAP | Native.WS_EX_TOOLWINDOW | Native.WS_EX_TOPMOST | Native.WS_EX_NOACTIVATE, m);
        _window.Hook = (msg, wParam, _) =>
        {
            if (msg == Native.WM_MOUSEACTIVATE && !_interactive) return new IntPtr(Native.MA_NOACTIVATE);
            // The shell layer is part of the desktop: Alt+F4 or a close request must never remove it.
            if (msg == Native.WM_CLOSE) return IntPtr.Zero;
            if (msg == 0x0112 /* WM_SYSCOMMAND */ && (wParam.ToInt64() & 0xFFF0) == 0xF060 /* SC_CLOSE */) return IntPtr.Zero;
            return null;
        };
        SetRegion(full: false, Array.Empty<Native.RECT>());
        Native.ShowWindow(Handle, Native.SW_SHOWNOACTIVATE);
    }

    public async Task InitAsync(CoreWebView2Environment env)
    {
        _controller = await env.CreateCoreWebView2ControllerAsync(Handle);
        _controller.DefaultBackgroundColor = System.Drawing.Color.Transparent;
        Resize();
    }

    public void Resize()
    {
        var m = Native.PrimaryMonitor();
        Native.SetWindowPos(Handle, Native.HWND_TOPMOST, m.Left, m.Top, m.Width, m.Height, Native.SWP_NOACTIVATE);
        if (_controller == null) return;
        _controller.Bounds = new System.Drawing.Rectangle(0, 0, m.Width, m.Height);
        _controller.NotifyParentWindowPositionChanged();
    }

    public void SetRegion(bool full, IReadOnlyList<Native.RECT> rects)
    {
        var m = Native.PrimaryMonitor();
        IntPtr region;
        if (full)
        {
            region = Native.CreateRectRgn(0, 0, m.Width, m.Height);
        }
        else
        {
            region = Native.CreateRectRgn(0, 0, 0, 0);
            foreach (var r in rects)
            {
                var part = Native.CreateRectRgn(r.Left, r.Top, r.Right, r.Bottom);
                Native.CombineRgn(region, region, part, 2 /* RGN_OR */);
                Native.DeleteObject(part);
            }
        }
        // The window owns the region after this call; don't delete it.
        Native.SetWindowRgn(Handle, region, true);
    }

    /// <summary>Lets the layer take keyboard focus (search, Launchpad, dialogs) or go back to never stealing it.</summary>
    public void SetInteractive(bool on)
    {
        _interactive = on;
        if (on)
        {
            Native.SetExStyle(Handle, 0, Native.WS_EX_NOACTIVATE);
            if (!Native.SetForegroundWindow(Handle))
            {
                // Windows only lets the process that sent the last input take the foreground.
                Native.PressKeys(0xE8);
                Native.SetForegroundWindow(Handle);
            }
            _controller?.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);
        }
        else
        {
            Native.SetExStyle(Handle, Native.WS_EX_NOACTIVATE, 0);
        }
    }

    /// <summary>Steps aside while a full-screen app (a video or a game) is in front.</summary>
    public void SetSuspended(bool suspended)
    {
        if (suspended == _suspended) return;
        _suspended = suspended;
        Native.ShowWindow(Handle, suspended ? Native.SW_HIDE : Native.SW_SHOWNOACTIVATE);
        if (!suspended) Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0,
            Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
    }

    /// <summary>Hide for a moment (for a clean screen snapshot); Reshow puts it back on top of everything.</summary>
    public void Hide() => Native.ShowWindow(Handle, Native.SW_HIDE);

    public void Reshow()
    {
        if (_suspended) return;
        Native.ShowWindow(Handle, Native.SW_SHOWNOACTIVATE);
        Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
    }

    public void SetZoom(double zoom)
    {
        if (_controller != null) _controller.ZoomFactor = zoom;
    }

    public void Close()
    {
        _controller?.Close();
        _window.Dispose();
    }
}
