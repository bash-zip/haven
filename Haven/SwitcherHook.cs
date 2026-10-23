using System.Runtime.InteropServices;

namespace Haven;

/// <summary>
/// Takes over Alt+Tab while Haven runs, so Haven can show an app switcher (one icon per app,
/// like Cmd+Tab on a Mac). Tab and Shift+Tab move the selection, arrows too, Esc cancels,
/// releasing Alt switches.
/// </summary>
sealed class SwitcherHook : IDisposable
{
    const int WH_KEYBOARD_LL = 13, WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_SYSKEYDOWN = 0x104, WM_SYSKEYUP = 0x105;
    const uint VK_TAB = 0x09, VK_ESCAPE = 0x1B, VK_SHIFT = 0x10, VK_MENU = 0x12, VK_LMENU = 0xA4, VK_RMENU = 0xA5, VK_LEFT = 0x25, VK_RIGHT = 0x27;
    const uint LLKHF_ALTDOWN = 0x20, LLKHF_INJECTED = 0x10;

    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr extra; }

    readonly HookProc _proc;
    readonly IntPtr _hook;
    bool _active;

    public bool Enabled { get; set; } = true;
    public bool Installed => _hook != IntPtr.Zero;
    /// <summary>Haven answers the Windows key and its shortcuts instead of Windows (Start, Task View, Search…).</summary>
    public bool TakeOver { get; set; } = true;
    /// <summary>A Windows shortcut Haven took over: launchpad, mission, desktop, control, notifications,
    /// search, settings, logo, shotFull, shotRegion, snap:&lt;where&gt;, dock:&lt;n&gt;, none.</summary>
    public event Action<string>? Shortcut;

    bool _winDown, _winUsed, _maskSeen, _lockWin;
    long _realWinDownAt;

    /// <summary>Safety net: if Windows still thinks the key is down after we released it, release it again.</summary>
    void UnstickLater(ushort vk, long downAt)
    {
        var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
        t.Tick += (_, _) =>
        {
            t.Stop();
            if (_realWinDownAt == downAt && GetAsyncKeyState(vk) < 0) Native.KeyUp(vk);
        };
        t.Start();
    }
    readonly HashSet<uint> _swallowed = new();
    /// <summary>While Haven's lock screen is up: block Alt+Tab, the Windows key, Ctrl/Alt+Esc and Alt+F4.</summary>
    public bool Locked { get; set; }
    /// <summary>open, next, prev, commit, cancel</summary>
    public event Action<string>? Command;

    public SwitcherHook()
    {
        _proc = OnKey;
        _hook = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(null), 0);
    }

    IntPtr OnKey(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0 && Locked)
        {
            var lk = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            bool altHeld = (lk.flags & LLKHF_ALTDOWN) != 0, ctrlHeld = GetAsyncKeyState(0x11) < 0;
            int lmsg = wParam.ToInt32();
            // The Windows key is held back while Haven is locked, so Windows can't see Win + L.
            // Do it for Windows: Haven's lock never stops you locking Windows itself.
            if (lk.vkCode is 0x5B or 0x5C) _lockWin = lmsg is WM_KEYDOWN or WM_SYSKEYDOWN;
            if (_lockWin && lk.vkCode == 0x4C && lmsg is WM_KEYDOWN or WM_SYSKEYDOWN)
            {
                System.Windows.Application.Current.Dispatcher.BeginInvoke(() => Native.LockWorkStation());
                return new IntPtr(1);
            }
            if (lk.vkCode is 0x5B or 0x5C                                   // Windows keys
                || (lk.vkCode == VK_TAB && altHeld)                         // Alt+Tab
                || (lk.vkCode == VK_ESCAPE && (altHeld || ctrlHeld))        // Alt+Esc, Ctrl+Esc
                || (lk.vkCode == 0x73 /* F4 */ && altHeld))                 // Alt+F4
                return new IntPtr(1);
            return CallNextHookEx(_hook, code, wParam, lParam);
        }
        if (code >= 0 && TakeOver && !Locked)
        {
            var w = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            if ((w.flags & LLKHF_INJECTED) != 0 && w.vkCode == 0xE8 && _winDown) _maskSeen = true;
            if ((w.flags & LLKHF_INJECTED) == 0 && OnWindowsKey(w, wParam.ToInt32())) return new IntPtr(1);
        }
        if (code >= 0 && Enabled)
        {
            var k = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            int msg = wParam.ToInt32();
            bool down = msg is WM_KEYDOWN or WM_SYSKEYDOWN;
            bool up = msg is WM_KEYUP or WM_SYSKEYUP;
            bool alt = (k.flags & LLKHF_ALTDOWN) != 0;

            if (down && k.vkCode == VK_TAB && alt)
            {
                bool shift = GetAsyncKeyState((int)VK_SHIFT) < 0;
                if (!_active)
                {
                    _active = true;
                    // A harmless key press, so releasing Alt later doesn't open the app's menu bar.
                    Native.PressKeys(0xE8);
                    Raise("open");
                    if (shift) Raise("prev");
                }
                else Raise(shift ? "prev" : "next");
                return new IntPtr(1);
            }
            if (_active && down && k.vkCode is VK_LEFT or VK_RIGHT)
            {
                Raise(k.vkCode == VK_LEFT ? "prev" : "next");
                return new IntPtr(1);
            }
            if (_active && down && k.vkCode == VK_ESCAPE)
            {
                _active = false;
                Raise("cancel");
                return new IntPtr(1);
            }
            if (_active && up && k.vkCode is VK_MENU or VK_LMENU or VK_RMENU)
            {
                _active = false;
                Raise("commit");
            }
        }
        return CallNextHookEx(_hook, code, wParam, lParam);
    }

    /// <summary>Returns true to swallow the key so Windows never sees it.</summary>
    bool OnWindowsKey(KBDLLHOOKSTRUCT k, int msg)
    {
        bool down = msg is WM_KEYDOWN or WM_SYSKEYDOWN, up = msg is WM_KEYUP or WM_SYSKEYUP;
        bool isWin = k.vkCode is 0x5B or 0x5C;

        // Key-ups of keys we swallowed are swallowed too.
        if (up && _swallowed.Remove(k.vkCode)) return true;

        if (isWin)
        {
            // The Windows key itself always goes through untouched, so it can never get stuck.
            bool already = GetAsyncKeyState(0x5B) < 0 || GetAsyncKeyState(0x5C) < 0;
            if (down && !already)
            {
                _winDown = true;
                _winUsed = false;
                _maskSeen = false;
                _realWinDownAt = Environment.TickCount64;
                // A harmless key press while it's held tells Windows the key was "used", so
                // releasing it doesn't open Start. Sent from outside this hook, so it arrives after
                // the Windows key itself (sent from in here it can arrive first and do nothing).
                System.Windows.Application.Current.Dispatcher.BeginInvoke(() => { if (_winDown) Native.PressKeys(0xE8); });
            }
            if (up)
            {
                bool tapped = _winDown && !_winUsed;
                _winDown = false;
                if (tapped) RaiseShortcut("launchpad"); // tapped on its own: Launchpad instead of Start
                if (tapped && !_maskSeen)
                {
                    // A very quick tap beat the harmless key press: hold this release back, send the
                    // press, then release, so Start still stays shut.
                    var vk = (ushort)k.vkCode;
                    long since = _realWinDownAt;
                    System.Windows.Application.Current.Dispatcher.BeginInvoke(() =>
                    {
                        Native.PressKeys(0xE8);
                        Native.KeyUp(vk);
                        UnstickLater(vk, since);
                    });
                    return true;
                }
            }
            return false;
        }

        bool ctrl = GetAsyncKeyState(0x11) < 0, shift = GetAsyncKeyState((int)VK_SHIFT) < 0, alt = (k.flags & LLKHF_ALTDOWN) != 0;

        // Ask Windows whether the key is really down, rather than trusting what we saw: a release
        // can go missing (Win+L, for one), and a stale flag would turn every letter into a shortcut.
        bool winHeld = GetAsyncKeyState(0x5B) < 0 || GetAsyncKeyState(0x5C) < 0;
        if (!winHeld) _winDown = false;

        if (down && !winHeld)
        {
            string? plain = k.vkCode switch
            {
                VK_ESCAPE when ctrl && !alt => "launchpad",          // Ctrl+Esc opens Start
                0x2C when !ctrl && !alt => "shotFull",              // Print Screen opens the Snipping Tool
                _ => null,
            };
            if (plain == null) return false;
            _swallowed.Add(k.vkCode);
            RaiseShortcut(plain);
            return true;
        }

        if (!down || !winHeld) return false;
        _winUsed = true;
        // Win+Ctrl (desktops) and Win+Alt combinations stay Windows'.
        if (ctrl || alt) return false;
        string? action = k.vkCode switch
        {
            VK_TAB => "mission",                                    // Task View
            0x44 /* D */ => "desktop",
            0x4D /* M */ => "desktop",                              // minimise all
            0x57 /* W */ => "desktop",                              // Widgets board: Haven's widgets live on the desktop
            0x41 /* A */ => "control",                              // Quick Settings
            0x4E /* N */ => "notifications",
            0x53 /* S */ => shift ? "shotRegion" : "search",
            0x51 /* Q */ => "search",
            0x56 /* V */ when ClipboardHistory.Listening => "clipboard", // Haven's clipboard history instead of Windows'
            0x86 /* F23, the Copilot key */ => "search",
            0x49 /* I */ => "settings",
            0x58 /* X */ => "logo",
            0x2C /* Print Screen */ => "shotFull",
            0x54 /* T */ or 0x42 /* B */ or 0xBC /* , */ => "none", // these would pop up the hidden taskbar
            VK_LEFT when !shift => "snap:left",
            VK_RIGHT when !shift => "snap:right",
            0x26 /* Up */ when !shift => "snap:fill",
            >= 0x31 and <= 0x39 when !shift => "dock:" + (k.vkCode - 0x30), // Win+1…9: the Nth Dock app
            _ => null,
        };
        if (action == null) return false;
        _swallowed.Add(k.vkCode);
        RaiseShortcut(action);
        return true;
    }

    void RaiseShortcut(string action) =>
        System.Windows.Application.Current.Dispatcher.BeginInvoke(() => Shortcut?.Invoke(action));

    // Hooks must return quickly; hand the work to the UI thread.
    void Raise(string command) =>
        System.Windows.Application.Current.Dispatcher.BeginInvoke(() => Command?.Invoke(command));

    public void Dispose() => UnhookWindowsHookEx(_hook);

    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr mod, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? name);
}
