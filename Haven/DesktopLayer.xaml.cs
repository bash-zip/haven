using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace Haven;

/// <summary>
/// The bottom layer: wallpaper, widgets and desktop icons. It always stays behind every other
/// window, never appears in Alt+Tab, and covers the whole primary monitor.
/// </summary>
public partial class DesktopLayer : Window
{
    public IntPtr Handle { get; private set; }
    public event Action? DisplayChanged;
    public event Action<int>? Hotkey;
    public event Action<IntPtr>? RawInput;
    /// <summary>Shell notifications: window created/destroyed/activated, or an app asking for attention.</summary>
    public event Action<int, IntPtr>? ShellEvent;
    uint _shellMessage, _taskbarCreated;
    /// <summary>Explorer started (at sign-in) or restarted, and rebuilt the taskbar.</summary>
    public event Action? ExplorerRestarted;

    public DesktopLayer()
    {
        InitializeComponent();
        FitToMonitor();
        SourceInitialized += (_, _) =>
        {
            Handle = new WindowInteropHelper(this).Handle;
            Native.SetExStyle(Handle, Native.WS_EX_TOOLWINDOW, Native.WS_EX_APPWINDOW);
            HwndSource.FromHwnd(Handle).AddHook(WndProc);
            _shellMessage = Native.RegisterWindowMessage("SHELLHOOK");
            _taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
            RegisterShellHookWindow(Handle);
            FitToMonitor(); // now with a real hwnd: exact physical rect, not DIU guesses
            SendToBottom();
        };
        // "Show desktop" and similar can try to minimize us; the desktop never minimizes.
        StateChanged += (_, _) => { if (WindowState != WindowState.Normal) WindowState = WindowState.Normal; };
    }

    public void FitToMonitor() => ScreenFit.CoverMonitor(this);

    public void SendToBottom() =>
        Native.SetWindowPos(Handle, Native.HWND_BOTTOM, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);

    IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == Touchpad.WM_INPUT) RawInput?.Invoke(lParam);
        else if (_shellMessage != 0 && msg == (int)_shellMessage) ShellEvent?.Invoke(wParam.ToInt32(), lParam);
        else if (_taskbarCreated != 0 && msg == (int)_taskbarCreated) Dispatcher.BeginInvoke(() => ExplorerRestarted?.Invoke());

        switch (msg)
        {
            case Native.WM_WINDOWPOSCHANGING:
                // Whatever asks to move us in the stack (a click, Alt+Tab), stay at the very bottom.
                var pos = Marshal.PtrToStructure<Native.WINDOWPOS>(lParam);
                if ((pos.flags & Native.SWP_NOZORDER) == 0)
                {
                    pos.hwndInsertAfter = Native.HWND_BOTTOM;
                    Marshal.StructureToPtr(pos, lParam, false);
                }
                break;
            case Native.WM_DISPLAYCHANGE:
            case Native.WM_DPICHANGED:
                Dispatcher.BeginInvoke(() => DisplayChanged?.Invoke());
                break;
            case Native.WM_SETTINGCHANGE when wParam.ToInt32() == 0x2F /* SPI_SETWORKAREA */:
                Dispatcher.BeginInvoke(() => DisplayChanged?.Invoke());
                break;
            case ClipboardHistory.WM_CLIPBOARDUPDATE:
                Dispatcher.BeginInvoke(ClipboardHistory.OnUpdate);
                break;
            case Native.WM_HOTKEY:
                handled = true;
                Hotkey?.Invoke(wParam.ToInt32());
                break;
        }
        return IntPtr.Zero;
    }

    [DllImport("user32.dll")] static extern bool RegisterShellHookWindow(IntPtr h);
}
