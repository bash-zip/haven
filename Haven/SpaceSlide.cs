using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace Haven;

/// <summary>
/// The Mac "spaces" slide between apps. The current screen slides off to one side while the
/// next app slides in from the other; the menu bar and Dock stay put on top. Both screens are
/// live DWM thumbnails (no snapshot, so it starts instantly), drawn once per display refresh.
/// During a trackpad swipe the slide follows your fingers; on release it settles to the new
/// app or springs back, depending on how far and how fast you swiped. With nothing further in
/// that direction it rubber-bands.
/// </summary>
sealed class SpaceSlide : Window
{
    sealed class Thumb { public IntPtr Handle; public Native.RECT Rect; public bool Incoming; }

    readonly List<Thumb> _thumbs = new();
    readonly Native.RECT _monitor;
    IntPtr _hwnd, _target;
    int _dir;
    bool _bounce, _active, _settling, _rendering, _restoredTarget;
    double _progress, _from, _to;
    TimeSpan _settleStart, _settleDuration;
    TimeSpan _now;
    Action? _onDone;

    public bool Active => _active;

    public SpaceSlide()
    {
        _monitor = Native.PrimaryMonitor();
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        ShowActivated = false;
        Topmost = true;
        Left = 0;
        Top = 0;
        Width = SystemParameters.PrimaryScreenWidth;
        Height = SystemParameters.PrimaryScreenHeight;
        Background = new SolidColorBrush(Color.FromRgb(12, 12, 14));
        _hwnd = new WindowInteropHelper(this).EnsureHandle();
        ScreenFit.CoverMonitor(this);
        Native.SetExStyle(_hwnd, Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW, 0);
    }

    /// <param name="outgoing">Visible windows on the current screen, bottom-most first.</param>
    /// <param name="raiseShell">Puts Haven's menu bar and Dock back above the slide.</param>
    public void Begin(IntPtr target, int dir, IntPtr desktop, IReadOnlyList<IntPtr> outgoing, Action raiseShell)
    {
        if (_active) End();
        _active = true;
        _settling = false;
        _target = target;
        _dir = dir >= 0 ? 1 : -1;
        _bounce = target == IntPtr.Zero;
        _progress = 0;
        _restoredTarget = false;

        Add(desktop, false);
        foreach (var w in outgoing) Add(w, false);
        if (!_bounce)
        {
            // A minimized window has nothing to show; bring it back (without activating it) for the preview.
            if (IsIconic(target)) { WindowAnimator.Skip(target); Native.ShowWindow(target, Native.SW_SHOWNOACTIVATE); _restoredTarget = true; }
            Add(desktop, true);
            Add(target, true);
        }

        Native.ShowWindow(_hwnd, Native.SW_SHOWNOACTIVATE);
        Native.SetWindowPos(_hwnd, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
        raiseShell();
        Render();
        if (!_rendering) { CompositionTarget.Rendering += OnFrame; _rendering = true; }
    }

    /// <summary>Follow the fingers. 0 = current screen, 1 = fully on the next app.</summary>
    public void Update(double progress)
    {
        if (!_active || _settling) return;
        // With nothing further this way, resist more and more the further you pull.
        _progress = _bounce ? Math.Sign(progress) * 0.13 * (1 - 1 / (Math.Abs(progress) * 3 + 1)) : Math.Clamp(progress, -0.04, 1.04);
        Render();
    }

    /// <summary>Settle to the next app (commit) or back to where we were.</summary>
    public void Finish(bool commit, Action? onCommit, Action? onDone = null)
    {
        if (!_active) { onDone?.Invoke(); return; }
        commit &= !_bounce;
        if (commit) onCommit?.Invoke(); // bring the app forward now, underneath, so it's ready when we lift away
        _onDone = onDone;
        _settling = true;
        _from = _progress;
        _to = commit ? 1 : 0;
        // Shorter when there's less distance left; quick but never abrupt.
        _settleDuration = TimeSpan.FromMilliseconds(Math.Max(150, 300 * Math.Abs(_to - _from)));
        _settleStart = TimeSpan.Zero;
    }

    /// <summary>A complete slide in one go (no fingers), e.g. from a keyboard shortcut.</summary>
    public void Play(IntPtr target, int dir, IntPtr desktop, IReadOnlyList<IntPtr> outgoing, Action raiseShell, Action onCommit)
    {
        Begin(target, dir, desktop, outgoing, raiseShell);
        if (_bounce) { _progress = 0.1; Render(); }
        Finish(true, onCommit);
    }

    void OnFrame(object? sender, EventArgs e)
    {
        _now = ((RenderingEventArgs)e).RenderingTime;
        if (!_settling) return;
        if (_settleStart == TimeSpan.Zero) _settleStart = _now;
        double t = Math.Min(1, (_now - _settleStart).TotalMilliseconds / _settleDuration.TotalMilliseconds);
        double eased = 1 - Math.Pow(1 - t, 3);
        _progress = _from + (_to - _from) * eased;
        Render();
        if (t >= 1) End();
    }

    void Render()
    {
        double W = _monitor.Width;
        int outX = (int)Math.Round(-_dir * W * _progress), inX = outX + (int)(_dir * W);
        foreach (var t in _thumbs)
        {
            int dx = t.Incoming ? inX : outX;
            var props = new DWM_THUMBNAIL_PROPERTIES
            {
                dwFlags = 0x1 | 0x4 | 0x8, // RECTDESTINATION | OPACITY | VISIBLE
                rcDestination = new Native.RECT(t.Rect.Left + dx, t.Rect.Top, t.Rect.Right + dx, t.Rect.Bottom),
                opacity = 255,
                fVisible = true,
            };
            DwmUpdateThumbnailProperties(t.Handle, ref props);
        }
    }

    void Add(IntPtr source, bool incoming)
    {
        if (source == IntPtr.Zero || DwmRegisterThumbnail(_hwnd, source, out var thumb) != 0) return;
        Native.GetWindowRect(source, out var r);
        _thumbs.Add(new Thumb
        {
            Handle = thumb,
            Incoming = incoming,
            Rect = new Native.RECT(r.Left - _monitor.Left, r.Top - _monitor.Top, r.Right - _monitor.Left, r.Bottom - _monitor.Top),
        });
    }

    void End()
    {
        bool cancelled = _to == 0;
        foreach (var t in _thumbs) DwmUnregisterThumbnail(t.Handle);
        _thumbs.Clear();
        Native.ShowWindow(_hwnd, Native.SW_HIDE);
        if (_rendering) { CompositionTarget.Rendering -= OnFrame; _rendering = false; }
        if (cancelled && _restoredTarget) { WindowAnimator.Skip(_target); Native.ShowWindow(_target, Native.SW_MINIMIZE); }
        _active = false;
        _settling = false;
        var done = _onDone;
        _onDone = null;
        done?.Invoke();
    }

    [StructLayout(LayoutKind.Sequential)]
    struct DWM_THUMBNAIL_PROPERTIES
    {
        public uint dwFlags;
        public Native.RECT rcDestination, rcSource;
        public byte opacity;
        [MarshalAs(UnmanagedType.Bool)] public bool fVisible;
        [MarshalAs(UnmanagedType.Bool)] public bool fSourceClientAreaOnly;
    }

    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("dwmapi.dll")] static extern int DwmRegisterThumbnail(IntPtr dest, IntPtr src, out IntPtr thumb);
    [DllImport("dwmapi.dll")] static extern int DwmUnregisterThumbnail(IntPtr thumb);
    [DllImport("dwmapi.dll")] static extern int DwmUpdateThumbnailProperties(IntPtr thumb, ref DWM_THUMBNAIL_PROPERTIES props);
}
