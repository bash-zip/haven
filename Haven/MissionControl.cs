using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace Haven;

/// <summary>
/// Mission Control: every open window as a live preview over a blurred copy of the screen.
/// Previews are real DWM thumbnails (the same technology as taskbar previews), so video and
/// animations keep playing. Click one to switch to it; click empty space or press Esc to leave.
/// With an app filter it becomes App Exposé (only that app's windows).
/// </summary>
sealed class MissionControl : Window
{
    public static MissionControl? Current { get; private set; }

    sealed class Item
    {
        public required WindowInfo Window;
        public IntPtr Thumb;
        public Rect From, To;      // physical pixels
        public required Border Frame;
        public required TextBlock Label;
    }

    readonly List<Item> _items = new();
    readonly Canvas _canvas = new();
    readonly Action<long?> _done;

    /// <summary>Spaces (virtual desktops) shown along the top; set before Toggle opens Mission Control.</summary>
    public static (List<VirtualDesktops.Desktop> List, int Current)? Spaces;
    public static Action<int>? SwitchSpace;
    public static Action? AddSpace;
    readonly Native.RECT _monitor;
    double _scale = 1;          // physical pixels per DIP
    IntPtr _hwnd;
    Item? _hover;
    DateTime _animStart;
    readonly DispatcherTimer _anim = new() { Interval = TimeSpan.FromMilliseconds(15) };
    bool _closing;

    public static void Toggle(IReadOnlyList<WindowInfo> windows, string? onlyExe, Action<long?> done)
    {
        if (Current != null) { Current.Finish(null); return; }
        Current = new MissionControl(windows, onlyExe, done);
        Current.Show();
        Current.Activate();
    }

    MissionControl(IReadOnlyList<WindowInfo> windows, string? onlyExe, Action<long?> done)
    {
        _done = done;
        _monitor = Native.PrimaryMonitor();
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        Topmost = true;
        Left = 0;
        Top = 0;
        Width = SystemParameters.PrimaryScreenWidth;
        Height = SystemParameters.PrimaryScreenHeight;
        Background = Brushes.Black;

        var root = new Grid();
        var shot = CaptureScreen(_monitor);
        if (shot != null)
            root.Children.Add(new Image { Source = shot, Stretch = Stretch.UniformToFill, Effect = new BlurEffect { Radius = 40, KernelType = KernelType.Gaussian } });
        root.Children.Add(new Rectangle { Fill = new SolidColorBrush(Color.FromArgb(110, 0, 0, 0)) });
        root.Children.Add(_canvas);
        if (onlyExe == null && Spaces is { } spaces) root.Children.Add(SpacesBar(spaces.List, spaces.Current));
        Content = root;

        var list = windows.Where(w => onlyExe == null || string.Equals(w.Exe, onlyExe, StringComparison.OrdinalIgnoreCase)).ToList();
        if (list.Count == 0)
            _canvas.Children.Add(Caption(onlyExe != null ? "No open windows for this app" : "No open windows", 20));

        SourceInitialized += (_, _) =>
        {
            _hwnd = new WindowInteropHelper(this).Handle;
            _scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
            foreach (var w in list) Add(w);
            Layout();
            _animStart = DateTime.Now;
            _anim.Tick += (_, _) => Animate();
            _anim.Start();
        };
        MouseMove += (_, e) => SetHover(HitTest(e.GetPosition(this)));
        MouseLeftButtonUp += (_, e) => { if (!e.Handled) Finish(HitTest(e.GetPosition(this))?.Window.Hwnd); };
        KeyDown += (_, e) => { if (e.Key == Key.Escape) Finish(null); };
        Deactivated += (_, _) => { if (!_closing) Finish(null); };
    }

    void Add(WindowInfo w)
    {
        if (DwmRegisterThumbnail(_hwnd, new IntPtr(w.Hwnd), out var thumb) != 0) return;
        Native.GetWindowRect(new IntPtr(w.Hwnd), out var r);
        var frame = new Border
        {
            BorderBrush = new SolidColorBrush(Color.FromRgb(0x3b, 0x82, 0xf6)),
            BorderThickness = new Thickness(3),
            CornerRadius = new CornerRadius(10),
            Visibility = Visibility.Hidden,
        };
        var label = Caption(w.Title.Length > 60 ? w.Title[..59] + "…" : w.Title, 13);
        label.Visibility = Visibility.Hidden;
        _canvas.Children.Add(frame);
        _canvas.Children.Add(label);
        _items.Add(new Item
        {
            Window = w, Thumb = thumb, Frame = frame, Label = label,
            From = new Rect(r.Left - _monitor.Left, r.Top - _monitor.Top, Math.Max(1, r.Width), Math.Max(1, r.Height)),
        });
    }

    /// <summary>Lays windows out in a grid that keeps each one's shape and fills the screen.</summary>
    void Layout()
    {
        if (_items.Count == 0) return;
        double W = _monitor.Width, H = _monitor.Height;
        double top = (Spaces != null ? 120 : 70) * _scale, bottom = 90 * _scale, side = 60 * _scale, gap = 40 * _scale;
        double areaW = W - side * 2, areaH = H - top - bottom;
        int n = _items.Count;

        int bestCols = 1;
        double bestSize = 0;
        for (int cols = 1; cols <= n; cols++)
        {
            int rows = (int)Math.Ceiling(n / (double)cols);
            double cw = (areaW - gap * (cols - 1)) / cols, ch = (areaH - gap * (rows - 1)) / rows;
            double size = Math.Min(cw / 16, ch / 10);
            if (size > bestSize) { bestSize = size; bestCols = cols; }
        }
        int rowsCount = (int)Math.Ceiling(n / (double)bestCols);
        double cellW = (areaW - gap * (bestCols - 1)) / bestCols, cellH = (areaH - gap * (rowsCount - 1)) / rowsCount;

        for (int i = 0; i < n; i++)
        {
            var item = _items[i];
            int row = i / bestCols, col = i % bestCols;
            int inRow = Math.Min(bestCols, n - row * bestCols);
            double rowOffset = (bestCols - inRow) * (cellW + gap) / 2;   // centre short last rows
            double cx = side + rowOffset + col * (cellW + gap), cy = top + row * (cellH + gap);
            var src = item.From.Size;
            if (DwmQueryThumbnailSourceSize(item.Thumb, out var s) == 0 && s.cx > 0) src = new Size(s.cx, s.cy);
            double k = Math.Min(Math.Min(cellW / src.Width, (cellH - 26 * _scale) / src.Height), 1.0);
            double w = src.Width * k, h = src.Height * k;
            item.To = new Rect(cx + (cellW - w) / 2, cy + (cellH - 26 * _scale - h) / 2, w, h);
            // Minimized windows sit far off-screen; let them fade in place instead of flying in.
            if (item.From.X < -10000 || item.From.Y < -10000) item.From = item.To;
        }
    }

    void Animate()
    {
        double t = Math.Min(1, (DateTime.Now - _animStart).TotalMilliseconds / 260);
        double e = 1 - Math.Pow(1 - t, 3); // ease-out
        foreach (var item in _items)
        {
            var r = _closing ? Lerp(item.To, item.From, e) : Lerp(item.From, item.To, e);
            var props = new DWM_THUMBNAIL_PROPERTIES
            {
                dwFlags = 0x1 | 0x4 | 0x8 | 0x10, // RECTDESTINATION | OPACITY | VISIBLE | SOURCECLIENTAREAONLY
                rcDestination = new Native.RECT((int)r.Left, (int)r.Top, (int)r.Right, (int)r.Bottom),
                opacity = 255,
                fVisible = true,
                fSourceClientAreaOnly = false,
            };
            DwmUpdateThumbnailProperties(item.Thumb, ref props);
        }
        if (t < 1) return;
        _anim.Stop();
        if (_closing) { Close(); return; }
        foreach (var item in _items) PlaceLabel(item);
    }

    void PlaceLabel(Item item)
    {
        var to = Dip(item.To);
        item.Label.Visibility = Visibility.Visible;
        item.Label.MaxWidth = Math.Max(80, to.Width);
        item.Label.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        Canvas.SetLeft(item.Label, to.Left + (to.Width - Math.Min(item.Label.DesiredSize.Width, to.Width)) / 2);
        Canvas.SetTop(item.Label, to.Bottom + 8);
        Canvas.SetLeft(item.Frame, to.Left - 5);
        Canvas.SetTop(item.Frame, to.Top - 5);
        item.Frame.Width = to.Width + 10;
        item.Frame.Height = to.Height + 10;
    }

    Item? HitTest(Point p)
    {
        var px = new Point(p.X * _scale, p.Y * _scale);
        return _items.FirstOrDefault(i => i.To.Contains(px));
    }

    void SetHover(Item? item)
    {
        if (item == _hover) return;
        if (_hover != null) _hover.Frame.Visibility = Visibility.Hidden;
        _hover = item;
        if (item != null && !_anim.IsEnabled) item.Frame.Visibility = Visibility.Visible;
    }

    void Finish(long? hwnd)
    {
        if (_closing) return;
        _closing = true;
        Current = null;
        foreach (var i in _items) { i.Label.Visibility = Visibility.Hidden; i.Frame.Visibility = Visibility.Hidden; }
        if (hwnd != null)
        {
            // The chosen window flies back from its preview to its real place in front.
            var chosen = _items.FirstOrDefault(i => i.Window.Hwnd == hwnd);
            foreach (var i in _items.Where(i => i != chosen)) { DwmUnregisterThumbnail(i.Thumb); i.Thumb = IntPtr.Zero; }
            _items.RemoveAll(i => i.Thumb == IntPtr.Zero);
        }
        _done(hwnd);
        _animStart = DateTime.Now;
        _anim.Start();
    }

    /// <summary>A row of pills along the top, one per space, plus "+" to add one.</summary>
    UIElement SpacesBar(List<VirtualDesktops.Desktop> list, int current)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 34, 0, 0) };
        Border Pill(string text, bool on, Action click)
        {
            var b = new Border
            {
                Background = new SolidColorBrush(on ? Color.FromArgb(235, 255, 255, 255) : Color.FromArgb(70, 255, 255, 255)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(90, 255, 255, 255)), BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(14), Padding = new Thickness(16, 6, 16, 6), Margin = new Thickness(6, 0, 6, 0),
                Child = new TextBlock { Text = text, FontSize = 13, FontWeight = on ? FontWeights.SemiBold : FontWeights.Normal, Foreground = on ? Brushes.Black : Brushes.White, FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI") },
                Cursor = Cursors.Hand,
            };
            b.MouseEnter += (_, _) => { if (!on) b.Background = new SolidColorBrush(Color.FromArgb(120, 255, 255, 255)); };
            b.MouseLeave += (_, _) => { if (!on) b.Background = new SolidColorBrush(Color.FromArgb(70, 255, 255, 255)); };
            b.MouseLeftButtonUp += (_, e) => { e.Handled = true; click(); };
            return b;
        }
        foreach (var d in list)
            row.Children.Add(Pill(d.Name, d.Index == current, () => { Finish(null); SwitchSpace?.Invoke(d.Index); }));
        row.Children.Add(Pill("+", false, () => { Finish(null); AddSpace?.Invoke(); }));
        return row;
    }

    protected override void OnClosed(EventArgs e)
    {
        foreach (var i in _items) if (i.Thumb != IntPtr.Zero) DwmUnregisterThumbnail(i.Thumb);
        base.OnClosed(e);
    }

    Rect Dip(Rect px) => new(px.X / _scale, px.Y / _scale, px.Width / _scale, px.Height / _scale);
    static Rect Lerp(Rect a, Rect b, double t) =>
        new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t, a.Width + (b.Width - a.Width) * t, a.Height + (b.Height - a.Height) * t);

    static TextBlock Caption(string text, double size) => new()
    {
        Text = text,
        Foreground = Brushes.White,
        FontSize = size,
        FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI"),
        TextTrimming = TextTrimming.CharacterEllipsis,
        Effect = new DropShadowEffect { BlurRadius = 6, ShadowDepth = 0, Opacity = 0.8 },
    };

    /// <summary>Whether DWM will give us a live preview of a window (used by the system check).</summary>
    internal static bool CanPreview(IntPtr dest, IntPtr window)
    {
        if (DwmRegisterThumbnail(dest, window, out var thumb) != 0) return false;
        DwmUnregisterThumbnail(thumb);
        return true;
    }

    internal static BitmapSource? CaptureScreen(Native.RECT m)
    {
        IntPtr screen = GetDC(IntPtr.Zero), mem = CreateCompatibleDC(screen), bmp = CreateCompatibleBitmap(screen, m.Width, m.Height);
        try
        {
            var old = SelectObject(mem, bmp);
            BitBlt(mem, 0, 0, m.Width, m.Height, screen, m.Left, m.Top, 0x00CC0020 /* SRCCOPY */);
            SelectObject(mem, old);
            var src = Imaging.CreateBitmapSourceFromHBitmap(bmp, IntPtr.Zero, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
            src.Freeze();
            return src;
        }
        catch { return null; }
        finally
        {
            Native.DeleteObject(bmp);
            DeleteDC(mem);
            ReleaseDC(IntPtr.Zero, screen);
        }
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
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr dc, int w, int h);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, uint rop);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
}
