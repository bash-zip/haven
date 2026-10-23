using System.Runtime.InteropServices;

namespace Haven;

/// <summary>
/// Reserves a strip along a screen edge, the way the taskbar does, so maximized windows
/// stop at Haven's menu bar and Dock instead of sliding underneath them.
/// </summary>
sealed class AppBar : IDisposable
{
    public const uint Left = 0, Top = 1, Bottom = 3;

    const uint ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3;
    const int ABN_POSCHANGED = 1;

    [StructLayout(LayoutKind.Sequential)]
    struct APPBARDATA
    {
        public int cbSize;
        public IntPtr hWnd;
        public uint uCallbackMessage, uEdge;
        public Native.RECT rc;
        public IntPtr lParam;
    }

    [DllImport("shell32.dll")] static extern IntPtr SHAppBarMessage(uint msg, ref APPBARDATA data);

    readonly Native.RawWindow _window;
    readonly uint _edge;
    readonly uint _callback;
    int _thickness;
    bool _registered;

    readonly Func<Native.RECT> _monitor;

    /// <param name="monitor">Which display to reserve space on (the primary one unless given).</param>
    public AppBar(uint edge, Func<Native.RECT>? monitor = null)
    {
        _edge = edge;
        _monitor = monitor ?? Native.PrimaryMonitor;
        _callback = Native.RegisterWindowMessage("HavenAppBarNotify");
        _window = new Native.RawWindow("HavenAppBar", Native.WS_POPUP, Native.WS_EX_TOOLWINDOW, new Native.RECT());
        _window.Hook = (msg, wParam, _) =>
        {
            if (msg == _callback && wParam.ToInt32() == ABN_POSCHANGED) Apply();
            return null;
        };
        Register();
    }

    public bool Registered => _registered;

    /// <summary>
    /// Registers with Explorer. At sign-in Explorer may not be ready yet, and when Explorer restarts
    /// it forgets every app bar, so this is retried and repeated as needed.
    /// </summary>
    public void Register()
    {
        if (_registered) { var old = Data(); SHAppBarMessage(ABM_REMOVE, ref old); }
        var data = Data();
        _registered = SHAppBarMessage(ABM_NEW, ref data) != IntPtr.Zero;
        if (_registered && _thickness > 0) Apply();
    }

    public void SetThickness(int pixels)
    {
        if (pixels == _thickness) return;
        _thickness = pixels;
        Apply();
    }

    public void Apply()
    {
        if (!_registered) return;
        var data = Data();
        var m = _monitor();
        data.rc = m;
        Clamp(ref data.rc, m);
        SHAppBarMessage(ABM_QUERYPOS, ref data);
        Clamp(ref data.rc, m);
        SHAppBarMessage(ABM_SETPOS, ref data);
    }

    void Clamp(ref Native.RECT rc, Native.RECT monitor)
    {
        if (_edge == Left)
        {
            rc.Right = rc.Left + _thickness;
            rc.Top = monitor.Top;
            rc.Bottom = monitor.Bottom;
            return;
        }
        if (_edge == Top) rc.Bottom = rc.Top + _thickness;
        else rc.Top = rc.Bottom - _thickness;
        rc.Left = monitor.Left;
        rc.Right = monitor.Right;
    }

    APPBARDATA Data() => new()
    {
        cbSize = Marshal.SizeOf<APPBARDATA>(),
        hWnd = _window.Handle,
        uCallbackMessage = _callback,
        uEdge = _edge,
    };

    public void Dispose()
    {
        if (_registered)
        {
            var data = Data();
            SHAppBarMessage(ABM_REMOVE, ref data);
            _registered = false;
        }
        _window.Dispose();
    }
}
