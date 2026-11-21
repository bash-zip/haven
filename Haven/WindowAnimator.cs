using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace Haven;

/// <summary>
/// Mac-style window animations: a window shrinks into its Dock icon when minimized and grows
/// back out when restored ("scale effect"). The screen is redrawn from live DWM thumbnails
/// (desktop + other windows) with the animated window on top, so the real window never shows
/// mid-animation. Windows' own minimize animation is switched off while this runs, and put
/// back when Haven exits (the original is saved to disk first, like the taskbar setting).
/// </summary>
sealed class WindowAnimator : Window
{
    sealed class Thumb { public IntPtr Handle; public Native.RECT Rect; }

    readonly IntPtr _hwnd;
    readonly Native.RECT _monitor;
    readonly List<Thumb> _thumbs = new();
    readonly Func<string?, Native.RECT?> _iconFor;
    readonly Func<IntPtr> _desktop;
    readonly Action _raiseShell;
    readonly WinEventDelegate _proc;
    IntPtr _hook;
    Thumb? _moving;
    Native.RECT _from, _to;
    TimeSpan _start, _duration;
    bool _rendering, _minimizing;
    IntPtr _target;
    // Windows we're moving ourselves: their minimize/restore events are ours, not the user's.
    static readonly Dictionary<IntPtr, DateTime> _ignoreUntil = new();
    static void Ignore(IntPtr h) { lock (_ignoreUntil) _ignoreUntil[h] = DateTime.UtcNow.AddMilliseconds(1200); }
    int _generation;

    /// <summary>Haven is about to minimize/restore this window itself (Show Desktop, Stage View): don't animate it.</summary>
    public static void Skip(IntPtr h) => Ignore(h);

    public bool Enabled { get; set; } = true;

    public WindowAnimator(Func<string?, Native.RECT?> iconFor, Func<IntPtr> desktop, Action raiseShell)
    {
        _iconFor = iconFor;
        _desktop = desktop;
        _raiseShell = raiseShell;
        _monitor = Native.PrimaryMonitor();
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        ShowActivated = false;
        Topmost = true;
        Left = 0; Top = 0;
        Width = SystemParameters.PrimaryScreenWidth;
        Height = SystemParameters.PrimaryScreenHeight;
        Background = new SolidColorBrush(Color.FromRgb(12, 12, 14));
        _hwnd = new WindowInteropHelper(this).EnsureHandle();
        ScreenFit.CoverMonitor(this);
        Native.SetExStyle(_hwnd, Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT, 0);
        _proc = OnWinEvent;
        _hook = SetWinEventHook(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, IntPtr.Zero, _proc, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
    }

    void OnWinEvent(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (idObject != 0 || hwnd == IntPtr.Zero || !Enabled) return;
        lock (_ignoreUntil)
        {
            if (_ignoreUntil.TryGetValue(hwnd, out var until) && DateTime.UtcNow < until) return;
            foreach (var old in _ignoreUntil.Where(p => p.Value < DateTime.UtcNow).Select(p => p.Key).ToList()) _ignoreUntil.Remove(old);
        }
        if (_rendering) return; // one at a time
        if (!WindowTracker.IsAppWindow(hwnd)) return; // only real app windows, not helpers or tool windows
        Dispatcher.BeginInvoke(() =>
        {
            if (ev == EVENT_SYSTEM_MINIMIZESTART) Minimize(hwnd);
            else Restore(hwnd);
        });
    }

    Native.RECT? IconRect(IntPtr hwnd)
    {
        var r = _iconFor(WindowTracker.ExeOf(hwnd)) ?? _iconFor(null);
        return r is { } x ? Local(x) : null;
    }

    void Minimize(IntPtr hwnd)
    {
        if (_rendering) return;
        var icon = IconRect(hwnd);
        if (icon == null) return;
        var place = new WINDOWPLACEMENT { length = Marshal.SizeOf<WINDOWPLACEMENT>() };
        if (!GetWindowPlacement(hwnd, ref place)) return;
        bool wasMax = (place.flags & 2) != 0 || place.showCmd == 3;

        Compose(except: hwnd);
        Show();
        Native.ShowWindow(_hwnd, Native.SW_SHOWNOACTIVATE);
        Native.SetWindowPos(_hwnd, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
        _raiseShell();

        // Bring the window back (hidden under this overlay) just long enough to draw it shrinking.
        Ignore(hwnd);
        Native.ShowWindow(hwnd, wasMax ? SW_SHOWMAXNOACTIVE : Native.SW_SHOWNOACTIVATE);
        Native.GetWindowRect(hwnd, out var rect);
        _moving = AddThumb(hwnd);
        if (_moving == null) { End(); return; }
        _from = Local(rect);
        _to = icon.Value;
        _target = hwnd;
        _minimizing = true;
        Begin(TimeSpan.FromMilliseconds(320));
    }

    void Restore(IntPtr hwnd)
    {
        if (_rendering) return;
        var icon = IconRect(hwnd);
        if (icon == null) return;
        Native.GetWindowRect(hwnd, out var rect);
        Compose(except: hwnd);
        _moving = AddThumb(hwnd);
        if (_moving == null) { _thumbs.ForEach(t => DwmUnregisterThumbnail(t.Handle)); _thumbs.Clear(); return; }
        Show();
        Native.ShowWindow(_hwnd, Native.SW_SHOWNOACTIVATE);
        Native.SetWindowPos(_hwnd, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
        _raiseShell();
        _from = icon.Value;
        _to = Local(rect);
        _target = hwnd;
        _minimizing = false;
        Begin(TimeSpan.FromMilliseconds(300));
    }

    /// <summary>Redraws the screen from live thumbnails: the desktop, then every other window bottom-up.</summary>
    void Compose(IntPtr except)
    {
        foreach (var t in _thumbs) DwmUnregisterThumbnail(t.Handle);
        _thumbs.Clear();
        var d = AddThumb(_desktop());
        foreach (var w in WindowTracker.VisibleWindowsBottomUp()) if (w != except) AddThumb(w);
        _ = d;
        foreach (var t in _thumbs) Place(t, t.Rect, 255);
    }

    Thumb? AddThumb(IntPtr source)
    {
        if (source == IntPtr.Zero || DwmRegisterThumbnail(_hwnd, source, out var h) != 0) return null;
        Native.GetWindowRect(source, out var r);
        var t = new Thumb { Handle = h, Rect = Local(r) };
        _thumbs.Add(t);
        return t;
    }

    Native.RECT Local(Native.RECT r) => new(r.Left - _monitor.Left, r.Top - _monitor.Top, r.Right - _monitor.Left, r.Bottom - _monitor.Top);

    readonly System.Windows.Threading.DispatcherTimer _safety = new() { Interval = TimeSpan.FromMilliseconds(1500) };
    bool _safetyHooked;

    void Begin(TimeSpan duration)
    {
        // Whatever happens, never leave the overlay up: it sits above the windows and would block clicks.
        if (!_safetyHooked) { _safetyHooked = true; _safety.Tick += (_, _) => { _safety.Stop(); ForceHide(); }; }
        _safety.Stop();
        _safety.Start();
        _generation++;
        _duration = duration;
        _start = TimeSpan.Zero;
        if (_moving != null) Place(_moving, _from, 255);
        if (!_rendering) { CompositionTarget.Rendering += OnFrame; _rendering = true; }
    }

    void OnFrame(object? sender, EventArgs e)
    {
        var now = ((RenderingEventArgs)e).RenderingTime;
        if (_start == TimeSpan.Zero) _start = now;
        double t = Math.Min(1, (now - _start).TotalMilliseconds / _duration.TotalMilliseconds);
        // Minimize accelerates into the Dock; restore decelerates out of it.
        double k = _minimizing ? t * t : 1 - Math.Pow(1 - t, 3);
        var r = Lerp(_from, _to, k);
        byte alpha = (byte)Math.Round(255 * (_minimizing ? 1 - 0.55 * k : 0.45 + 0.55 * k));
        if (_moving != null) Place(_moving, r, alpha);
        if (t >= 1) End();
    }

    static Native.RECT Lerp(Native.RECT a, Native.RECT b, double k) => new(
        (int)Math.Round(a.Left + (b.Left - a.Left) * k), (int)Math.Round(a.Top + (b.Top - a.Top) * k),
        (int)Math.Round(a.Right + (b.Right - a.Right) * k), (int)Math.Round(a.Bottom + (b.Bottom - a.Bottom) * k));

    void Place(Thumb t, Native.RECT r, byte opacity)
    {
        var props = new DWM_THUMBNAIL_PROPERTIES { dwFlags = 0x1 | 0x4 | 0x8, rcDestination = r, opacity = opacity, fVisible = true };
        DwmUpdateThumbnailProperties(t.Handle, ref props);
    }

    void End()
    {
        if (_rendering) { CompositionTarget.Rendering -= OnFrame; _rendering = false; }
        if (_minimizing && _target != IntPtr.Zero)
        {
            Ignore(_target);
            Native.ShowWindow(_target, SW_SHOWMINNOACTIVE);
        }
        // Give the real windows a frame to draw before lifting the overlay
        // (unless another animation has started meanwhile: then the overlay is its).
        int gen = _generation;
        Dispatcher.BeginInvoke(() =>
        {
            if (gen != _generation || _rendering) return;
            foreach (var t in _thumbs) DwmUnregisterThumbnail(t.Handle);
            _thumbs.Clear();
            _moving = null;
            Native.ShowWindow(_hwnd, Native.SW_HIDE);
            _target = IntPtr.Zero;
            _safety.Stop();
        }, System.Windows.Threading.DispatcherPriority.Background);
    }

    void ForceHide()
    {
        if (_rendering) { CompositionTarget.Rendering -= OnFrame; _rendering = false; }
        if (_minimizing && _target != IntPtr.Zero && !IsIconic(_target)) { Ignore(_target); Native.ShowWindow(_target, SW_SHOWMINNOACTIVE); }
        foreach (var t in _thumbs) DwmUnregisterThumbnail(t.Handle);
        _thumbs.Clear();
        _moving = null;
        _target = IntPtr.Zero;
        Native.ShowWindow(_hwnd, Native.SW_HIDE);
    }

    public void Shutdown()
    {
        if (_hook != IntPtr.Zero) UnhookWinEvent(_hook);
        _hook = IntPtr.Zero;
        Close();
    }

    // ----- Windows' own minimize animation -----

    static readonly string Marker = Path.Combine(Paths.Root, "animation-state.txt");

    public static void SuppressOsAnimation()
    {
        var info = new ANIMATIONINFO { cbSize = (uint)Marshal.SizeOf<ANIMATIONINFO>() };
        if (!SystemParametersInfo(SPI_GETANIMATION, info.cbSize, ref info, 0)) return;
        if (!File.Exists(Marker)) File.WriteAllText(Marker, info.iMinAnimate.ToString());
        if (info.iMinAnimate == 0) return;
        info.iMinAnimate = 0;
        SystemParametersInfo(SPI_SETANIMATION, info.cbSize, ref info, SPIF_SENDCHANGE);
    }

    public static void RestoreOsAnimation()
    {
        if (!File.Exists(Marker)) return;
        try
        {
            if (int.TryParse(File.ReadAllText(Marker).Trim(), out var v) && v != 0)
            {
                var info = new ANIMATIONINFO { cbSize = (uint)Marshal.SizeOf<ANIMATIONINFO>(), iMinAnimate = v };
                SystemParametersInfo(SPI_SETANIMATION, info.cbSize, ref info, SPIF_SENDCHANGE);
            }
            File.Delete(Marker);
        }
        catch { }
    }

    // ----- Interop -----

    const uint EVENT_SYSTEM_MINIMIZESTART = 0x0016, EVENT_SYSTEM_MINIMIZEEND = 0x0017, WINEVENT_OUTOFCONTEXT = 0, WINEVENT_SKIPOWNPROCESS = 2;
    const int WS_EX_TRANSPARENT = 0x20, SW_SHOWMINNOACTIVE = 7, SW_SHOWMAXNOACTIVE = 3;
    const uint SPI_GETANIMATION = 0x0048, SPI_SETANIMATION = 0x0049, SPIF_SENDCHANGE = 0x2;

    delegate void WinEventDelegate(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);

    [StructLayout(LayoutKind.Sequential)] struct ANIMATIONINFO { public uint cbSize; public int iMinAnimate; }
    [StructLayout(LayoutKind.Sequential)]
    struct WINDOWPLACEMENT { public int length, flags, showCmd; public Native.POINT min, max; public Native.RECT normal; }
    [StructLayout(LayoutKind.Sequential)]
    struct DWM_THUMBNAIL_PROPERTIES
    {
        public uint dwFlags;
        public Native.RECT rcDestination, rcSource;
        public byte opacity;
        [MarshalAs(UnmanagedType.Bool)] public bool fVisible;
        [MarshalAs(UnmanagedType.Bool)] public bool fSourceClientAreaOnly;
    }

    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEventDelegate proc, uint pid, uint tid, uint flags);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h, ref WINDOWPLACEMENT p);
    [DllImport("user32.dll", SetLastError = true)] static extern bool SystemParametersInfo(uint action, uint param, ref ANIMATIONINFO info, uint winIni);
    [DllImport("dwmapi.dll")] static extern int DwmRegisterThumbnail(IntPtr dest, IntPtr src, out IntPtr thumb);
    [DllImport("dwmapi.dll")] static extern int DwmUnregisterThumbnail(IntPtr thumb);
    [DllImport("dwmapi.dll")] static extern int DwmUpdateThumbnailProperties(IntPtr thumb, ref DWM_THUMBNAIL_PROPERTIES props);
}
