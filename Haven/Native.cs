using System.Runtime.InteropServices;

namespace Haven;

/// <summary>Win32 declarations shared by the shell windows.</summary>
static class Native
{
    public const int WS_POPUP = unchecked((int)0x80000000);
    public const int WS_CLIPCHILDREN = 0x02000000;
    public const int WS_EX_TOPMOST = 0x8, WS_EX_TOOLWINDOW = 0x80, WS_EX_APPWINDOW = 0x40000;
    public const int WS_EX_NOREDIRECTIONBITMAP = 0x00200000, WS_EX_NOACTIVATE = 0x08000000;
    public const int GWL_EXSTYLE = -20;

    public static readonly IntPtr HWND_TOP = IntPtr.Zero, HWND_BOTTOM = new(1), HWND_TOPMOST = new(-1);
    public const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
    public const int SW_HIDE = 0, SW_SHOWNOACTIVATE = 4, SW_SHOW = 5, SW_MINIMIZE = 6, SW_RESTORE = 9;

    public const int WM_CLOSE = 0x0010, WM_MOUSEACTIVATE = 0x0021, WM_WINDOWPOSCHANGING = 0x0046;
    public const int WM_DISPLAYCHANGE = 0x007E, WM_SETTINGCHANGE = 0x001A, WM_DPICHANGED = 0x02E0, WM_HOTKEY = 0x0312;
    public const int MA_NOACTIVATE = 3;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left, Top, Right, Bottom;
        public RECT(int l, int t, int r, int b) { Left = l; Top = t; Right = r; Bottom = b; }
        public int Width => Right - Left;
        public int Height => Bottom - Top;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct WINDOWPOS
    {
        public IntPtr hwnd, hwndInsertAfter;
        public int x, y, cx, cy;
        public uint flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor, rcWork;
        public uint dwFlags;
    }

    /// <summary>Primary monitor bounds in physical pixels.</summary>
    public static RECT PrimaryMonitor()
    {
        var mon = MonitorFromPoint(new POINT(), 1 /* MONITOR_DEFAULTTOPRIMARY */);
        var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        return GetMonitorInfo(mon, ref info) ? info.rcMonitor : new RECT(0, 0, 1920, 1080);
    }

    /// <summary>Primary monitor work area (the part windows maximize into).</summary>
    public static RECT WorkArea()
    {
        var mon = MonitorFromPoint(new POINT(), 1);
        var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        return GetMonitorInfo(mon, ref info) ? info.rcWork : PrimaryMonitor();
    }

    public sealed record Monitor(IntPtr Handle, RECT Bounds, RECT Work, bool Primary);

    /// <summary>Every display, primary first.</summary>
    public static List<Monitor> Monitors()
    {
        var list = new List<Monitor>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (h, _, _, _) =>
        {
            var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            if (GetMonitorInfo(h, ref info)) list.Add(new Monitor(h, info.rcMonitor, info.rcWork, (info.dwFlags & 1) != 0));
            return true;
        }, IntPtr.Zero);
        return list.OrderByDescending(m => m.Primary).ToList();
    }

    public static int MonitorCount() => Monitors().Count;

    delegate bool MonitorEnumProc(IntPtr monitor, IntPtr hdc, IntPtr rect, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc proc, IntPtr data);

    public static bool CoversPrimaryMonitor(IntPtr hwnd)
    {
        if (!GetWindowRect(hwnd, out var r)) return false;
        var m = PrimaryMonitor();
        return r.Left <= m.Left && r.Top <= m.Top && r.Right >= m.Right && r.Bottom >= m.Bottom;
    }

    public static void SetExStyle(IntPtr hwnd, int add, int remove)
    {
        long ex = GetWindowLongPtr(hwnd, GWL_EXSTYLE).ToInt64();
        ex = (ex | (uint)add) & ~(long)(uint)remove;
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, new IntPtr(ex));
    }

    /// <summary>Presses a key combination, e.g. Win (Start menu) or Win+Space (switch keyboard language).</summary>
    public static void PressKeys(params ushort[] keys)
    {
        var inputs = new List<INPUT>();
        foreach (var k in keys) inputs.Add(new INPUT { type = 1, ki = new KEYBDINPUT { wVk = k } });
        foreach (var k in keys.Reverse()) inputs.Add(new INPUT { type = 1, ki = new KEYBDINPUT { wVk = k, dwFlags = 0x2 /* KEYUP */ } });
        SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<INPUT>());
    }

    public static void PressWindowsKey() => PressKeys(0x5B);

    /// <summary>Releases one key (the Windows keys are "extended" keys).</summary>
    public static void KeyUp(ushort vk)
    {
        uint flags = 0x2 | (vk is 0x5B or 0x5C ? 0x1u : 0u);
        var inputs = new[] { new INPUT { type = 1, ki = new KEYBDINPUT { wVk = vk, dwFlags = flags } } };
        SendInput(1, inputs, Marshal.SizeOf<INPUT>());
    }


    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Explicit, Size = 40)]
    struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT ki; }

    // ----- Raw top-level windows (no WPF), used for the transparent shell layer and app bars -----

    public delegate IntPtr WndProc(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WNDCLASSEX
    {
        public uint cbSize, style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra, cbWndExtra;
        public IntPtr hInstance, hIcon, hCursor, hbrBackground, lpszMenuName;
        public string lpszClassName;
        public IntPtr hIconSm;
    }

    public sealed class RawWindow : IDisposable
    {
        static readonly Dictionary<string, WndProc> Registered = new();
        static readonly Dictionary<IntPtr, RawWindow> Live = new();

        public IntPtr Handle { get; }
        /// <summary>Return a value to handle the message, or null to fall through to DefWindowProc.</summary>
        public Func<uint, IntPtr, IntPtr, IntPtr?>? Hook { get; set; }

        public RawWindow(string className, int style, int exStyle, RECT bounds)
        {
            if (!Registered.ContainsKey(className))
            {
                WndProc proc = Dispatch;
                var wc = new WNDCLASSEX
                {
                    cbSize = (uint)Marshal.SizeOf<WNDCLASSEX>(),
                    lpfnWndProc = Marshal.GetFunctionPointerForDelegate(proc),
                    hInstance = GetModuleHandle(null),
                    hCursor = LoadCursor(IntPtr.Zero, 32512 /* IDC_ARROW */),
                    lpszClassName = className,
                };
                if (RegisterClassEx(ref wc) == 0) throw new InvalidOperationException($"Couldn't register {className}.");
                Registered[className] = proc; // keep the delegate alive
            }
            Handle = CreateWindowEx(exStyle, className, "Haven", style,
                bounds.Left, bounds.Top, bounds.Width, bounds.Height, IntPtr.Zero, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
            if (Handle == IntPtr.Zero) throw new InvalidOperationException($"Couldn't create {className} window.");
            Live[Handle] = this;
        }

        static IntPtr Dispatch(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam)
        {
            if (Live.TryGetValue(hwnd, out var w) && w.Hook?.Invoke(msg, wParam, lParam) is IntPtr handled) return handled;
            return DefWindowProc(hwnd, msg, wParam, lParam);
        }

        public void Dispose()
        {
            Live.Remove(Handle);
            DestroyWindow(Handle);
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern ushort RegisterClassEx(ref WNDCLASSEX wc);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr CreateWindowEx(int exStyle, string cls, string name, int style, int x, int y, int w, int h,
        IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
    [DllImport("user32.dll")] static extern IntPtr DefWindowProc(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr LoadCursor(IntPtr inst, int id);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? name);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT pt, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr mon, ref MONITORINFO info);
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);

    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
    [DllImport("user32.dll")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int index, IntPtr value);
    [DllImport("user32.dll")] public static extern int SetWindowRgn(IntPtr h, IntPtr rgn, bool redraw);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string? cls, string? name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string? cls, string? name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll")] public static extern bool LockWorkStation();
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr h, int id);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int l, int t, int r, int b);
    [DllImport("gdi32.dll")] public static extern int CombineRgn(IntPtr dest, IntPtr a, IntPtr b, int mode);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
}
