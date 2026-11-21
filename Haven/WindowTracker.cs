using System.Runtime.InteropServices;
using System.Text;

namespace Haven;

public sealed record WindowInfo(long Hwnd, string Title, string Exe, string ExePath, string? Icon, bool Minimized, string? Aumid);

/// <summary>I find the top-level windows you'd see in Alt+Tab, and I bring one to the front.</summary>
public sealed class WindowTracker
{
    static readonly HashSet<string> ShellClasses = new(StringComparer.Ordinal)
        { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd" };

    readonly StaWorker _sta = new("Haven windows");

    public Task<List<WindowInfo>> ListAsync() => _sta.Run(() =>
    {
        var result = new List<WindowInfo>();
        uint self = (uint)Environment.ProcessId;
        EnumWindows((h, _) =>
        {
            if (!IsAltTabWindow(h)) return true;
            GetWindowThreadProcessId(h, out uint pid);
            if (pid == self) return true;
            var path = ProcessPath(pid);
            if (path == null) return true;

            var iconFile = Path.Combine(Paths.Icons, "exe-" + Paths.Hash(path) + ".png");
            var icon = ShellIcons.TrySave(path, iconFile) ? Paths.Url(iconFile) : null;
            result.Add(new WindowInfo(h.ToInt64(), Title(h), Path.GetFileName(path), path, icon, IsIconic(h), AppId(h)));
            return true;
        }, IntPtr.Zero);
        return result;
    });

    public static long Foreground() => Native.GetForegroundWindow().ToInt64();

    /// <summary>
    /// The window's App User Model ID, the same id Windows uses to group taskbar buttons and to name
    /// apps in the Start menu (e.g. "Microsoft.VisualStudioCode"). Null when the app doesn't set one.
    /// </summary>
    static string? AppId(IntPtr hwnd)
    {
        var iid = typeof(IPropertyStore).GUID;
        if (SHGetPropertyStoreForWindow(hwnd, ref iid, out var store) != 0 || store == null) return null;
        try
        {
            var key = new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
            if (store.GetValue(ref key, out var value) != 0) return null;
            try { return value.vt == 31 /* VT_LPWSTR */ ? Marshal.PtrToStringUni(value.pointer) : null; }
            finally { PropVariantClear(ref value); }
        }
        finally { Marshal.ReleaseComObject(store); }
    }

    [StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public uint pid; }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr pointer; }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PROPERTYKEY key);
        [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
    }

    [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);

    /// <summary>Visible, non-minimized app windows, bottom-most first (fast; no icons). For the space slide.</summary>
    public static List<IntPtr> VisibleWindowsBottomUp()
    {
        var list = new List<IntPtr>();
        uint self = (uint)Environment.ProcessId;
        EnumWindows((h, _) =>
        {
            if (IsAltTabWindow(h) && !IsIconic(h))
            {
                GetWindowThreadProcessId(h, out uint pid);
                if (pid != self) list.Add(h);
            }
            return true;
        }, IntPtr.Zero);
        list.Reverse(); // EnumWindows goes top-down
        return list;
    }

    /// <summary>The program file name (e.g. "spotify.exe") of the process that owns a window.</summary>
    public static string? ExeOf(IntPtr hwnd)
    {
        GetWindowThreadProcessId(hwnd, out uint pid);
        var path = ProcessPath(pid);
        return path == null ? null : Path.GetFileName(path).ToLowerInvariant();
    }

    static List<IntPtr> _desktopShown = new();

    /// <summary>
    /// Show Desktop that leaves Haven alone: Windows' own version (Win+D, Shell.ToggleDesktop) also
    /// hides Haven's menu bar, Dock and desktop. This minimizes just the apps, and a second call
    /// brings back the same windows in the same order.
    /// </summary>
    public static void ToggleDesktop()
    {
        var back = _desktopShown.Where(h => IsWindow(h) && IsIconic(h)).ToList();
        _desktopShown = new();
        if (back.Count > 0)
        {
            // Bottom-most first, so the window that was in front ends up in front again.
            foreach (var h in back) { WindowAnimator.Skip(h); ShowWindow(h, 4 /* SW_SHOWNOACTIVATE */); }
            Focus(back[^1].ToInt64());
            return;
        }
        var shown = VisibleWindowsBottomUp();
        foreach (var h in shown) { WindowAnimator.Skip(h); ShowWindow(h, 7 /* SW_SHOWMINNOACTIVE */); }
        _desktopShown = shown;
    }

    public static void Minimize(long hwnd)
    {
        var h = new IntPtr(hwnd);
        if (IsWindow(h)) ShowWindow(h, Native.SW_MINIMIZE);
    }

    /// <summary>Asks a window to close, exactly like clicking its X button (the app may ask to save).</summary>
    public static void Close(long hwnd)
    {
        var h = new IntPtr(hwnd);
        if (IsWindow(h)) Native.PostMessage(h, Native.WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
    }

    public static void Focus(long hwnd)
    {
        var h = new IntPtr(hwnd);
        if (!IsWindow(h)) return;
        if (IsIconic(h)) ShowWindow(h, SW_RESTORE);
        if (GetForegroundWindow() == h) return;
        if (SetForegroundWindow(h)) return;
        // Windows only lets the process that received the last input change the foreground window.
        // A tap of Alt counts as input, which makes the switch allowed.
        Native.PressKeys(0x12);
        if (SetForegroundWindow(h)) return;
        // Still refused (elevated apps, stubborn ghosts): borrow the foreground thread's input
        // state while bringing the window up, then let SwitchToThisWindow finish the job.
        GetWindowThreadProcessId(Native.GetForegroundWindow(), out var fgThread);
        var me = GetCurrentThreadId();
        var attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
        BringWindowToTop(h);
        SetForegroundWindow(h);
        if (attached) AttachThreadInput(me, fgThread, false);
        if (GetForegroundWindow() != h) SwitchToThisWindow(h, true);
    }

    const int SW_MINIMIZE = 6;

    /// <summary>
    /// Dock clicks go here: focus the app behind a window, picking its best one — topmost,
    /// visible, not a ghost. A ghost foreground window (an app's hidden one while another app
    /// shows on screen) is never focused or minimized, which made the Dock feel dead.
    /// </summary>
    public static void ActivateApp(long hwnd)
    {
        var h = new IntPtr(hwnd);
        if (!IsWindow(h)) return;
        var exe = ExeOf(h);
        IntPtr best = IntPtr.Zero;
        var list = VisibleWindowsBottomUp();
        for (var i = list.Count - 1; i >= 0; i--) // topmost first
        {
            var w = list[i];
            if (w == h) continue;
            if (!string.Equals(ExeOf(w), exe, StringComparison.OrdinalIgnoreCase)) continue;
            if (IsIconic(w) && list.Count > 1) continue;
            best = w;
            break;
        }
        if (best == IntPtr.Zero) best = h;
        if (GetForegroundWindow() == best && !IsIconic(best))
        {
            ShowWindow(best, SW_MINIMIZE); // genuinely already in front: the click means "put it away"
            return;
        }
        Focus(best);
    }

    /// <summary>A real app window (as Alt+Tab would list it), whether minimized or not.</summary>
    public static bool IsAppWindow(IntPtr h)
    {
        if (!IsWindow(h)) return false;
        if (!IsIconic(h)) return IsAltTabWindow(h);
        // Minimized windows fail the visibility checks below only because they're minimized.
        if (GetWindow(h, GW_OWNER) != IntPtr.Zero || GetWindowTextLength(h) == 0) return false;
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        return (ex & WS_EX_TOOLWINDOW) == 0;
    }

    static bool IsAltTabWindow(IntPtr h)
    {
        if (!IsWindowVisible(h) || GetWindow(h, GW_OWNER) != IntPtr.Zero) return false;
        if (GetWindowTextLength(h) == 0) return false;

        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        if ((ex & WS_EX_TOOLWINDOW) != 0) return false;
        if ((ex & WS_EX_NOACTIVATE) != 0 && (ex & WS_EX_APPWINDOW) == 0) return false;

        // Store apps keep hidden ("cloaked") windows around; skip those.
        if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out int cloaked, sizeof(int)) == 0 && cloaked != 0) return false;

        var cls = new StringBuilder(64);
        GetClassName(h, cls, cls.Capacity);
        return !ShellClasses.Contains(cls.ToString());
    }

    static string Title(IntPtr h)
    {
        var sb = new StringBuilder(GetWindowTextLength(h) + 1);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    static string? ProcessPath(uint pid)
    {
        var handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (handle == IntPtr.Zero) return null;
        try
        {
            var sb = new StringBuilder(1024);
            int size = sb.Capacity;
            return QueryFullProcessImageName(handle, 0, sb, ref size) ? sb.ToString() : null;
        }
        finally { CloseHandle(handle); }
    }

    const int GW_OWNER = 4, GWL_EXSTYLE = -20, SW_RESTORE = 9, DWMWA_CLOAKED = 14;
    const long WS_EX_TOOLWINDOW = 0x80, WS_EX_APPWINDOW = 0x40000, WS_EX_NOACTIVATE = 0x8000000;
    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int max);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool altTab);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW")]
    static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder exe, ref int size);
}
