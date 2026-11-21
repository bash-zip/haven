using System.Collections.Concurrent;
using System.Runtime.InteropServices;

namespace HavenSetup;

/// <summary>
/// Raw Win32 window host for the installer UI — no WinForms, no WPF, no framework.
/// Frameless: WM_NCCALCSIZE removes the native frame and the web layer draws its own
/// chrome, while WM_NCHITTEST re-adds resize borders and a drag strip so Windows
/// snap/shadow/rounded corners keep working. Per-Monitor V2 DPI aware.
/// </summary>
public sealed class Host : IDisposable
{
    public const int LogicalWidth = 920, LogicalHeight = 620;
    public const int MinLogicalWidth = 840, MinLogicalHeight = 560;
    /// <summary>Top strip (logical px) that drags the window. The web layer keeps the
    /// close button inside the right <see cref="DragStripExcludeRight"/> px of it.</summary>
    public const int DragStripHeight = 46;
    public const int DragStripExcludeRight = 150;

    const int WM_CLOSE = 0x0010, WM_DESTROY = 0x0002, WM_SIZE = 0x0005, WM_MOVE = 0x0003;
    const int WM_DPICHANGED = 0x02E0, WM_GETMINMAXINFO = 0x0024, WM_NCCALCSIZE = 0x0083;
    const int WM_NCHITTEST = 0x0084, WM_ACTIVATE = 0x0006, WM_ERASEBKGND = 0x0014;
    const int WM_APP_POST = 0x8001;

    const int HTCLIENT = 1, HTCAPTION = 2;
    const int HTLEFT = 10, HTRIGHT = 11, HTTOP = 12, HTTOPLEFT = 13, HTTOPRIGHT = 14,
              HTBOTTOM = 15, HTBOTTOMLEFT = 16, HTBOTTOMRIGHT = 17;
    const uint WS_OVERLAPPEDWINDOW = 0x00CF0000;
    const int SW_SHOW = 5, IDC_ARROW = 32512, MONITOR_DEFAULTTOPRIMARY = 1;
    const int SM_CXFRAME = 32, SM_CYFRAME = 33, SM_CXPADDEDBORDER = 92;

    static bool _dpiSet;
    static Host? _current;
    static readonly WNDPROC _proc = Proc;
    static readonly ConcurrentQueue<Action> _posted = new();

    Host() { }

    // ---------------------------------------------------------------- public surface

    public IntPtr Hwnd { get; private set; }
    public int Dpi { get; private set; } = 96;

    /// <summary>True while the install runs: Alt+F4 and WM_CLOSE are ignored.</summary>
    public static bool CloseBlocked;

    public event Action? BoundsChanged;
    public event Action? Closed;

    /// <summary>Runs <paramref name="a"/> on the window thread (safe from any thread).</summary>
    public void Post(Action a) { _posted.Enqueue(a); PostMessageW(Hwnd, WM_APP_POST, 0, 0); }

    public RECT ClientRect() { GetClientRect(Hwnd, out var r); return r; }

    public int Scale(int logical) => logical * Dpi / 96;

    /// <summary>Call once before window creation. Returns false if the OS predates it.</summary>
    public static bool EnableDpiAwareness()
    {
        if (_dpiSet) return true;
        _dpiSet = true;
        try { return SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        try { return SetProcessDPIAware(); } catch { }
        return false;
    }

    public static Host Create()
    {
        EnableDpiAwareness();
        var h = new Host();
        _current = h;

        var cls = new WNDCLASSEXW
        {
            cbSize = (uint)Marshal.SizeOf<WNDCLASSEXW>(),
            lpfnWndProc = _proc,
            hInstance = GetModuleHandleW(null),
            lpszClassName = "HavenSetupWindow",
            hbrBackground = CreateSolidBrush(0x000D0B0B), // matches the UI's --bg: no white flash
            hCursor = LoadCursorW(0, IDC_ARROW),
        };
        RegisterClassExW(ref cls);

        h.Hwnd = CreateWindowExW(0, "HavenSetupWindow", "Haven Setup", WS_OVERLAPPEDWINDOW,
            0, 0, 100, 100, 0, 0, cls.hInstance, 0);
        h.Dpi = (int)GetDpiForWindow(h.Hwnd);
        if (h.Dpi <= 0) h.Dpi = 96;

        // Center on the primary monitor's work area.
        var mi = new MONITORINFO { cbSize = (uint)Marshal.SizeOf<MONITORINFO>() };
        GetMonitorInfoW(MonitorFromWindow(h.Hwnd, MONITOR_DEFAULTTOPRIMARY), ref mi);
        int w = h.Scale(LogicalWidth), ht = h.Scale(LogicalHeight);
        MoveWindow(h.Hwnd,
            mi.rcWork.Left + ((mi.rcWork.Right - mi.rcWork.Left) - w) / 2,
            mi.rcWork.Top + ((mi.rcWork.Bottom - mi.rcWork.Top) - ht) / 2,
            w, ht, false);

        int on = 1; DwmSetWindowAttribute(h.Hwnd, 20, ref on, 4);        // dark mode
        int round = 2; DwmSetWindowAttribute(h.Hwnd, 33, ref round, 4);  // DWMWCP_ROUND corners
        int noBorder = unchecked((int)0xFFFFFFFE);                        // DWMWA_COLOR_NONE
        DwmSetWindowAttribute(h.Hwnd, 34, ref noBorder, 4);
        return h;
    }

    public void Show() => ShowWindow(Hwnd, SW_SHOW);
    public void Close() => PostMessageW(Hwnd, WM_CLOSE, 0, 0);
    public void Dispose() { if (Hwnd != 0) { DestroyWindow(Hwnd); Hwnd = 0; } }

    /// <summary>Message loop; returns when the window is destroyed.</summary>
    public void Run()
    {
        while (GetMessageW(out var msg, 0, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessageW(ref msg);
        }
    }

    /// <summary>Native error box for pre-UI failures (no payload, missing WebView2).</summary>
    public static void MessageBox(string text, bool error = true) =>
        MessageBoxW(0, text, "Haven Setup", (uint)(error ? 0x10 : 0));

    // ---------------------------------------------------------------- window proc

    static IntPtr Proc(IntPtr hwnd, uint msg, IntPtr w, IntPtr l)
    {
        var h = _current;
        switch (msg)
        {
            case WM_NCCALCSIZE when w != 0:
                if (h != null && IsZoomed(hwnd)) InsetMaximized(l);
                return 0; // no native frame; the client area is the whole window

            case WM_NCHITTEST:
                return HitTest(hwnd, l, h);

            case WM_GETMINMAXINFO:
                if (h != null) unsafe
                {
                    var mmi = (MINMAXINFO*)l;
                    mmi->ptMinTrackSize.X = h.Scale(MinLogicalWidth);
                    mmi->ptMinTrackSize.Y = h.Scale(MinLogicalHeight);
                }
                return 0;

            case WM_DPICHANGED:
                if (h != null) unsafe
                {
                    h.Dpi = (short)(long)w;
                    var r = (RECT*)l;
                    MoveWindow(hwnd, r->Left, r->Top, r->Right - r->Left, r->Bottom - r->Top, false);
                }
                return 0;

            case WM_SIZE:
            case WM_MOVE:
                h?.BoundsChanged?.Invoke();
                break;

            case WM_ACTIVATE:
                if ((short)(long)w != 0) h?.OnActivated();
                break;

            case WM_ERASEBKGND:
                return 1; // class brush covers the background; no flicker

            case WM_APP_POST:
                while (_posted.TryDequeue(out var a)) { try { a(); } catch { } }
                return 0;

            case WM_CLOSE:
                if (CloseBlocked) return 0; // installing: Alt+F4 is ignored
                DestroyWindow(hwnd);
                return 0;

            case WM_DESTROY:
                PostQuitMessage(0);
                h?.Closed?.Invoke();
                return 0;
        }
        return DefWindowProcW(hwnd, msg, w, l);
    }

    static IntPtr HitTest(IntPtr hwnd, IntPtr l, Host? h)
    {
        var pt = new POINT { X = (short)(long)l, Y = (short)((long)l >> 16) };
        ClientToScreen(hwnd, ref pt);
        GetWindowRect(hwnd, out var wr);
        int x = pt.X - wr.Left, y = pt.Y - wr.Top;
        int w = wr.Right - wr.Left, ht = wr.Bottom - wr.Top;
        bool max = IsZoomed(hwnd);
        int b = h?.Scale(8) ?? 8;

        if (!max)
        {
            if (x < b && y < b) return HTTOPLEFT;
            if (x >= w - b && y < b) return HTTOPRIGHT;
            if (x < b && y >= ht - b) return HTBOTTOMLEFT;
            if (x >= w - b && y >= ht - b) return HTBOTTOMRIGHT;
            if (y < b) return HTTOP;
            if (x < b) return HTLEFT;
            if (x >= w - b) return HTRIGHT;
            if (y >= ht - b) return HTBOTTOM;
        }

        int strip = h?.Scale(DragStripHeight) ?? DragStripHeight;
        int exclude = h?.Scale(DragStripExcludeRight) ?? DragStripExcludeRight;
        if (y < strip && x < w - exclude) return HTCAPTION;
        return HTCLIENT;
    }

    static unsafe void InsetMaximized(IntPtr l)
    {
        int fx = GetSystemMetrics(SM_CXFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);
        int fy = GetSystemMetrics(SM_CYFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);
        var p = (NCCALCSIZE_PARAMS*)l;
        p->rgrc0.Left += fx; p->rgrc0.Top += fy; p->rgrc0.Right -= fx; p->rgrc0.Bottom -= fy;
    }

    void OnActivated() => Activated?.Invoke();
    public event Action? Activated;

    // ---------------------------------------------------------------- interop

    public delegate IntPtr WNDPROC(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }

    [StructLayout(LayoutKind.Sequential)]
    public struct MINMAXINFO { public POINT ptReserved, ptMaxSize, ptMaxPosition, ptMinTrackSize, ptMaxTrackSize; }

    [StructLayout(LayoutKind.Sequential)]
    public struct MONITORINFO
    {
        public uint cbSize;
        public RECT rcMonitor, rcWork;
        public uint dwFlags;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct WNDCLASSEXW
    {
        public uint cbSize;
        public uint style;
        public WNDPROC lpfnWndProc;
        public int cbClsExtra, cbWndExtra;
        public IntPtr hInstance, hIcon, hCursor, hbrBackground;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpszMenuName;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpszClassName;
        public IntPtr hIconSm;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct NCCALCSIZE_PARAMS { public RECT rgrc0, rgrc1, rgrc2; public IntPtr lppos; }

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern ushort RegisterClassExW(ref WNDCLASSEXW cls);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "CreateWindowExW")]
    static extern IntPtr CreateWindowExW(uint exStyle, string cls, string title, uint style,
        int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
    [DllImport("user32.dll")] static extern IntPtr DefWindowProcW(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int GetMessageW(out MSG msg, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessageW(ref MSG msg);
    [DllImport("user32.dll")] static extern void PostQuitMessage(int code);
    [DllImport("user32.dll")] static extern bool PostMessageW(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")] static extern bool MoveWindow(IntPtr hwnd, int x, int y, int w, int h, bool repaint);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref POINT p);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadCursorW(IntPtr inst, int id);
    [DllImport("gdi32.dll")] static extern IntPtr CreateSolidBrush(uint color);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfoW(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int MessageBoxW(IntPtr hwnd, string text, string caption, uint type);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandleW(string? name);
}
