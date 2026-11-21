using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Haven;

/// <summary>
/// Hides the Windows taskbar while Haven is the desktop, and puts it back exactly as it was.
/// The original setting is written to disk first, so a crash or a killed process can always be
/// undone: by the watchdog process, or the next time Haven starts.
/// </summary>
static class Taskbar
{
    static readonly string Marker = Path.Combine(Paths.Root, "taskbar-state.txt");

    const uint ABM_GETSTATE = 4, ABM_SETSTATE = 10;
    const int ABS_AUTOHIDE = 1, ABS_ALWAYSONTOP = 2;

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

    public static bool IsHidden => File.Exists(Marker);

    /// <summary>The taskbar's appbar state (1 = auto-hide, 2 = always on top).</summary>
    public static int State()
    {
        var data = new APPBARDATA { cbSize = Marshal.SizeOf<APPBARDATA>(), hWnd = Native.FindWindow("Shell_TrayWnd", null) };
        return (int)SHAppBarMessage(ABM_GETSTATE, ref data);
    }

    public static void Hide()
    {
        var tray = Native.FindWindow("Shell_TrayWnd", null);
        if (tray == IntPtr.Zero) return;

        if (!File.Exists(Marker))
        {
            var data = new APPBARDATA { cbSize = Marshal.SizeOf<APPBARDATA>(), hWnd = tray };
            int original = (int)SHAppBarMessage(ABM_GETSTATE, ref data);
            File.WriteAllText(Marker, original.ToString());

            // Auto-hide releases the screen space the taskbar reserves; hiding the window removes it from view.
            data.lParam = new IntPtr(ABS_AUTOHIDE | (original & ABS_ALWAYSONTOP));
            SHAppBarMessage(ABM_SETSTATE, ref data);
        }
        ShowTrays(Native.SW_HIDE);
    }

    /// <summary>Re-hides the taskbar if Explorer brought it back (it does after restarts and some shortcuts).</summary>
    public static void KeepHidden()
    {
        if (!IsHidden) return;
        var tray = Native.FindWindow("Shell_TrayWnd", null);
        if (tray == IntPtr.Zero) return;
        if (Native.IsWindowVisible(tray)) ShowTrays(Native.SW_HIDE);

        // Explorer sometimes turns auto-hide back off (after restarts, or a settings change). The
        // hidden taskbar then still keeps its strip of screen free, and windows stop short of the
        // bottom edge. Put auto-hide back whenever that happens.
        var data = new APPBARDATA { cbSize = Marshal.SizeOf<APPBARDATA>(), hWnd = tray };
        int state = (int)SHAppBarMessage(ABM_GETSTATE, ref data);
        if ((state & ABS_AUTOHIDE) == 0)
        {
            data.lParam = new IntPtr(ABS_AUTOHIDE | (state & ABS_ALWAYSONTOP));
            SHAppBarMessage(ABM_SETSTATE, ref data);
        }
    }

    public static void Restore()
    {
        if (!File.Exists(Marker)) return;
        int original = int.TryParse(File.ReadAllText(Marker).Trim(), out var v) ? v : ABS_ALWAYSONTOP;

        var tray = Native.FindWindow("Shell_TrayWnd", null);
        if (tray != IntPtr.Zero)
        {
            ShowTrays(Native.SW_SHOW);
            var data = new APPBARDATA { cbSize = Marshal.SizeOf<APPBARDATA>(), hWnd = tray, lParam = new IntPtr(original) };
            SHAppBarMessage(ABM_SETSTATE, ref data);
        }
        File.Delete(Marker);
    }

    static void ShowTrays(int cmd)
    {
        var tray = Native.FindWindow("Shell_TrayWnd", null);
        if (tray != IntPtr.Zero) Native.ShowWindow(tray, cmd);
        var secondary = IntPtr.Zero;
        while ((secondary = Native.FindWindowEx(IntPtr.Zero, secondary, "Shell_SecondaryTrayWnd", null)) != IntPtr.Zero)
            Native.ShowWindow(secondary, cmd);
    }

    /// <summary>Starts a tiny copy of Haven that restores the taskbar if this process ever dies.</summary>
    static bool _watchdogStarted;

    public static void StartWatchdog()
    {
        if (_watchdogStarted) return;
        _watchdogStarted = true;
        var exe = Environment.ProcessPath;
        if (exe == null) return;
        Process.Start(new ProcessStartInfo(exe, $"--watchdog {Environment.ProcessId}") { UseShellExecute = false });
    }

    public static void RunWatchdog(int pid)
    {
        try { Process.GetProcessById(pid).WaitForExit(); }
        catch (ArgumentException) { /* already gone */ }
        Restore();
        WindowsGestures.Restore();
        WindowAnimator.RestoreOsAnimation();
        if (File.Exists(Path.Combine(Paths.Root, "window-style.txt"))) WindowStyler.ResetEverything();
        StageManager.RecoverFromDisk();
        // Apps re-register their tray icons with Explorer when they hear this.
        Native.PostMessage(new IntPtr(0xFFFF), (int)Native.RegisterWindowMessage("TaskbarCreated"), IntPtr.Zero, IntPtr.Zero);
    }
}
