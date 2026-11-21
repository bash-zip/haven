using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace Haven;

/// <summary>
/// Stage Manager: the app you're using sits on stage; I keep your other recent apps waiting as live
/// previews in a strip on the left. Click one to bring it on stage.
///
/// Apps off stage are moved just beyond the right edge of the screen (so their previews stay live);
/// maximized ones are minimized instead. Every moved window's original place is written to disk
/// before it moves, so windows always come back: when Stage Manager is turned off, when Haven
/// exits, by the watchdog after a crash, or the next time Haven starts.
/// </summary>
sealed class StageManager
{
    static readonly string StateFile = Path.Combine(Paths.Root, "stage.json");

    sealed record Parked(long Hwnd, string Exe, int L, int T, int R, int B, bool Minimized, long Order);

    readonly Dictionary<long, Parked> _parked = new();
    readonly Func<IntPtr, bool> _isOurs;
    StageStrip? _strip;
    AppBar? _bar;
    string? _activeExe;
    long _order;

    public bool Enabled { get; private set; }
    public int StripWidth { get; private set; }

    public StageManager(Func<IntPtr, bool> isOurs) { _isOurs = isOurs; }

    public void Enable(IntPtr desktopLayer)
    {
        if (Enabled) return;
        Enabled = true;
        var m = Native.PrimaryMonitor();
        StripWidth = (int)(m.Width * 0.11);
        _bar = new AppBar(AppBar.Left);
        _bar.SetThickness(StripWidth);
        _strip = new StageStrip(this, desktopLayer, StripWidth);
        _strip.Show();
        _activeExe = WindowTracker.ExeOf(Native.GetForegroundWindow());
        Tick();
    }

    public void Disable()
    {
        if (!Enabled) return;
        Enabled = false;
        RestoreAll();
        _strip?.Close();
        _strip = null;
        _bar?.Dispose();
        _bar = null;
    }

    /// <summary>Called regularly: when a different app comes to the front, swap who's on stage.</summary>
    public void Tick()
    {
        if (!Enabled) return;
        var fg = Native.GetForegroundWindow();
        if (fg == IntPtr.Zero || _isOurs(fg) || (_strip != null && fg == _strip.Handle)) return;
        var exe = WindowTracker.ExeOf(fg);
        if (exe == null) return;

        if (exe != _activeExe)
        {
            // Everything of the previous app leaves the stage; everything of the new one returns.
            foreach (var h in WindowTracker.VisibleWindowsBottomUp())
            {
                var e = WindowTracker.ExeOf(h);
                if (e != null && e == _activeExe && e != exe) Park(h, e);
            }
            _activeExe = exe;
            foreach (var p in _parked.Values.Where(p => p.Exe == exe).ToList()) Unpark(p);
        }
        _strip?.Refresh(Waiting());
    }

    /// <summary>Apps waiting in the strip, most recent first: one window (the latest) each.</summary>
    List<(IntPtr Hwnd, string Exe)> Waiting() =>
        _parked.Values.Where(p => IsWindow(new IntPtr(p.Hwnd)))
            .GroupBy(p => p.Exe).Select(g => g.OrderByDescending(p => p.Order).First())
            .OrderByDescending(p => p.Order).Take(5)
            .Select(p => (new IntPtr(p.Hwnd), p.Exe)).ToList();

    public void BringOnStage(IntPtr hwnd)
    {
        if (_parked.TryGetValue(hwnd.ToInt64(), out var p)) Unpark(p);
        WindowTracker.Focus(hwnd.ToInt64());
        Tick();
    }

    void Park(IntPtr h, string exe)
    {
        if (_parked.ContainsKey(h.ToInt64())) return;
        Native.GetWindowRect(h, out var r);
        bool maximized = IsZoomed(h);
        var p = new Parked(h.ToInt64(), exe, r.Left, r.Top, r.Right, r.Bottom, maximized, ++_order);
        _parked[p.Hwnd] = p;
        Save();
        if (maximized) { WindowAnimator.Skip(h); Native.ShowWindow(h, Native.SW_MINIMIZE); }
        else
        {
            var m = Native.PrimaryMonitor();
            Native.SetWindowPos(h, IntPtr.Zero, m.Right + 400 + r.Left - m.Left, r.Top, 0, 0,
                Native.SWP_NOSIZE | Native.SWP_NOZORDER | Native.SWP_NOACTIVATE);
        }
    }

    void Unpark(Parked p)
    {
        var h = new IntPtr(p.Hwnd);
        _parked.Remove(p.Hwnd);
        Save();
        if (!IsWindow(h)) return;
        if (p.Minimized) { WindowAnimator.Skip(h); Native.ShowWindow(h, Native.SW_RESTORE); }
        else Native.SetWindowPos(h, IntPtr.Zero, p.L, p.T, 0, 0, Native.SWP_NOSIZE | Native.SWP_NOZORDER | Native.SWP_NOACTIVATE);
    }

    void RestoreAll()
    {
        foreach (var p in _parked.Values.ToList()) Unpark(p);
        _parked.Clear();
        Save();
    }

    void Save()
    {
        try
        {
            if (_parked.Count == 0) { File.Delete(StateFile); return; }
            File.WriteAllText(StateFile, JsonSerializer.Serialize(_parked.Values.ToList()));
        }
        catch { }
    }

    /// <summary>Puts back any windows left off-screen (after a crash). Safe to call any time.</summary>
    public static void RecoverFromDisk()
    {
        try
        {
            if (!File.Exists(StateFile)) return;
            var list = JsonSerializer.Deserialize<List<Parked>>(File.ReadAllText(StateFile)) ?? new();
            foreach (var p in list)
            {
                var h = new IntPtr(p.Hwnd);
                if (!IsWindow(h)) continue;
                if (p.Minimized) { WindowAnimator.Skip(h); Native.ShowWindow(h, Native.SW_RESTORE); }
                else Native.SetWindowPos(h, IntPtr.Zero, p.L, p.T, 0, 0, Native.SWP_NOSIZE | Native.SWP_NOZORDER | Native.SWP_NOACTIVATE);
            }
            File.Delete(StateFile);
        }
        catch { }
    }

    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);

    /// <summary>The strip of waiting apps: live previews over a live copy of the wallpaper.</summary>
    sealed class StageStrip : Window
    {
        readonly StageManager _owner;
        readonly IntPtr _desktop;
        readonly int _widthPx;
        readonly List<(IntPtr Thumb, IntPtr Source, Native.RECT Rect)> _thumbs = new();
        IntPtr _background;
        Native.RECT _area;
        public IntPtr Handle { get; private set; }
        int _hover = -1;

        public StageStrip(StageManager owner, IntPtr desktop, int widthPx)
        {
            _owner = owner;
            _desktop = desktop;
            _widthPx = widthPx;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            ShowInTaskbar = false;
            ShowActivated = false;
            Topmost = true;
            Background = Brushes.Black;
            SourceInitialized += (_, _) =>
            {
                Handle = new WindowInteropHelper(this).Handle;
                Native.SetExStyle(Handle, Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE, 0);
                var m = Native.PrimaryMonitor();
                double scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
                // Between the menu bar and the Dock area, along the left edge.
                int top = (int)(40 * scale), bottom = m.Height - (int)(90 * scale);
                _area = new Native.RECT(m.Left, m.Top + top, m.Left + _widthPx, m.Top + bottom);
                Native.SetWindowPos(Handle, Native.HWND_TOPMOST, _area.Left, _area.Top, _area.Width, _area.Height, Native.SWP_NOACTIVATE);
                // The wallpaper behind the strip, live from Haven's desktop layer.
                if (DwmRegisterThumbnail(Handle, _desktop, out _background) == 0)
                    Place(_background, new Native.RECT(0, top, _widthPx, bottom), new Native.RECT(0, 0, _area.Width, _area.Height), 255);
            };
            MouseMove += (_, e) => SetHover(HitTest(e.GetPosition(this)));
            MouseLeave += (_, _) => SetHover(-1);
            MouseLeftButtonUp += (_, e) =>
            {
                int i = HitTest(e.GetPosition(this));
                if (i >= 0) _owner.BringOnStage(_thumbs[i].Source);
            };
        }

        public void Refresh(List<(IntPtr Hwnd, string Exe)> waiting)
        {
            if (Handle == IntPtr.Zero) return;
            var wanted = waiting.Select(w => w.Hwnd).ToList();
            if (wanted.SequenceEqual(_thumbs.Select(t => t.Source))) return;
            foreach (var t in _thumbs) DwmUnregisterThumbnail(t.Thumb);
            _thumbs.Clear();

            int pad = (int)(_widthPx * 0.12), w = _widthPx - pad * 2, y = pad;
            foreach (var h in wanted)
            {
                if (DwmRegisterThumbnail(Handle, h, out var thumb) != 0) continue;
                DwmQueryThumbnailSourceSize(thumb, out var size);
                double aspect = size.cx > 0 ? size.cy / (double)size.cx : 0.65;
                int hgt = (int)Math.Min(w * aspect, _area.Height / 4.5);
                int ww = (int)Math.Min(w, hgt / Math.Max(0.1, aspect));
                var rect = new Native.RECT(pad + (w - ww) / 2, y, pad + (w - ww) / 2 + ww, y + hgt);
                _thumbs.Add((thumb, h, rect));
                y += hgt + pad;
            }
            Paint();
        }

        void Paint()
        {
            for (int i = 0; i < _thumbs.Count; i++)
                Place(_thumbs[i].Thumb, null, _thumbs[i].Rect, (byte)(i == _hover ? 255 : 215));
        }

        void SetHover(int i)
        {
            if (i == _hover) return;
            _hover = i;
            Paint();
        }

        int HitTest(Point p)
        {
            double s = VisualTreeHelper.GetDpi(this).DpiScaleX;
            int x = (int)(p.X * s), y = (int)(p.Y * s);
            return _thumbs.FindIndex(t => x >= t.Rect.Left && x <= t.Rect.Right && y >= t.Rect.Top && y <= t.Rect.Bottom);
        }

        void Place(IntPtr thumb, Native.RECT? source, Native.RECT dest, byte opacity)
        {
            var props = new DWM_THUMBNAIL_PROPERTIES
            {
                dwFlags = 0x1 | 0x4 | 0x8 | (source != null ? 0x2u : 0), // DEST | OPACITY | VISIBLE | SOURCE
                rcDestination = dest, rcSource = source ?? default, opacity = opacity, fVisible = true,
            };
            DwmUpdateThumbnailProperties(thumb, ref props);
        }

        protected override void OnClosed(EventArgs e)
        {
            foreach (var t in _thumbs) DwmUnregisterThumbnail(t.Thumb);
            if (_background != IntPtr.Zero) DwmUnregisterThumbnail(_background);
            base.OnClosed(e);
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
        [StructLayout(LayoutKind.Sequential)] struct PSIZE { public int cx, cy; }
        [DllImport("dwmapi.dll")] static extern int DwmRegisterThumbnail(IntPtr dest, IntPtr src, out IntPtr thumb);
        [DllImport("dwmapi.dll")] static extern int DwmUnregisterThumbnail(IntPtr thumb);
        [DllImport("dwmapi.dll")] static extern int DwmUpdateThumbnailProperties(IntPtr thumb, ref DWM_THUMBNAIL_PROPERTIES props);
        [DllImport("dwmapi.dll")] static extern int DwmQueryThumbnailSourceSize(IntPtr thumb, out PSIZE size);
    }
}
