using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace Haven;

/// <summary>
/// Mac-style screenshots: the whole screen (Ctrl+Shift+3) or a dragged area (Ctrl+Shift+4).
/// Copied to the clipboard and saved (unless set to clipboard only) as
/// "Screenshot 2026-10-22 at 14.05.33.png" in Pictures\Screenshots, or a folder you choose.
/// </summary>
static class Screenshots
{
    static bool _busy;

    /// <summary>"pictures" (Pictures\Screenshots), "clipboard" (no file), or a folder path.</summary>
    public static string Destination { get; set; } = "pictures";

    public static string DefaultFolder =>
        System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "Screenshots");

    public static void FullScreen(Action<string?, BitmapSource> saved)
    {
        var shot = MissionControl.CaptureScreen(Native.PrimaryMonitor());
        if (shot != null) saved(Save(shot), shot);
    }

    public static void Region(Action<string?, BitmapSource> saved)
    {
        if (_busy) return;
        var shot = MissionControl.CaptureScreen(Native.PrimaryMonitor());
        if (shot == null) return;
        _busy = true;
        var picker = new RegionPicker(shot, crop =>
        {
            _busy = false;
            if (crop != null) saved(Save(crop), crop);
        });
        picker.Show();
        picker.Activate();
    }

    /// <summary>Copies to the clipboard and saves the file; returns its path (null for clipboard only).</summary>
    static string? Save(BitmapSource image)
    {
        try { Clipboard.SetImage(image); } catch { /* clipboard busy */ }
        if (Destination == "clipboard") return null;
        var folder = Destination == "pictures" || !Directory.Exists(Destination) ? DefaultFolder : Destination;
        Directory.CreateDirectory(folder);
        var name = $"Screenshot {DateTime.Now:yyyy-MM-dd} at {DateTime.Now:HH.mm.ss}.png";
        var path = System.IO.Path.Combine(folder, name);
        WritePng(image, path);
        return path;
    }

    public static void WritePng(BitmapSource image, string path)
    {
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(image));
        using var fs = File.Create(path);
        encoder.Save(fs);
    }

    /// <summary>The frozen screen with a crosshair: drag to choose an area, Esc to cancel.</summary>
    sealed class RegionPicker : Window
    {
        readonly BitmapSource _shot;
        readonly Action<BitmapSource?> _done;
        readonly Canvas _canvas = new();
        readonly Rectangle _box = new() { Stroke = Brushes.White, StrokeThickness = 1, StrokeDashArray = new DoubleCollection { 4, 3 }, Visibility = Visibility.Hidden };
        readonly System.Windows.Shapes.Path _shade = new() { Fill = new SolidColorBrush(Color.FromArgb(90, 0, 0, 0)) };
        readonly Border _sizeTag = new()
        {
            Background = new SolidColorBrush(Color.FromArgb(200, 20, 20, 22)), CornerRadius = new CornerRadius(5),
            Padding = new Thickness(6, 2, 6, 2), Visibility = Visibility.Hidden,
            Child = new TextBlock { Foreground = Brushes.White, FontSize = 11, FontFamily = new FontFamily("Segoe UI") },
        };
        Point? _start;
        bool _finished;

        public RegionPicker(BitmapSource shot, Action<BitmapSource?> done)
        {
            _shot = shot;
            _done = done;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            ShowInTaskbar = false;
            Topmost = true;
            Left = 0;
            Top = 0;
            Width = SystemParameters.PrimaryScreenWidth;
            Height = SystemParameters.PrimaryScreenHeight;
            Cursor = Cursors.Cross;
            _canvas.Children.Add(new Image { Source = shot, Width = Width, Height = Height, Stretch = Stretch.Fill });
            _shade.Data = new RectangleGeometry(new Rect(0, 0, Width, Height));
            _canvas.Children.Add(_shade);
            _canvas.Children.Add(_box);
            _canvas.Children.Add(_sizeTag);
            Content = _canvas;

            MouseLeftButtonDown += (_, e) => { _start = e.GetPosition(this); CaptureMouse(); };
            MouseMove += (_, e) => { if (_start is Point s) Update(s, e.GetPosition(this)); };
            MouseLeftButtonUp += (_, e) =>
            {
                ReleaseMouseCapture();
                if (_start is not Point s) return;
                var r = new Rect(s, e.GetPosition(this));
                Finish(r.Width >= 4 && r.Height >= 4 ? Crop(r) : null);
            };
            KeyDown += (_, e) => { if (e.Key == Key.Escape) Finish(null); };
            Deactivated += (_, _) => Finish(null);
        }

        void Update(Point a, Point b)
        {
            var r = new Rect(a, b);
            Canvas.SetLeft(_box, r.X);
            Canvas.SetTop(_box, r.Y);
            _box.Width = r.Width;
            _box.Height = r.Height;
            _box.Visibility = Visibility.Visible;
            // Darken everything except the chosen area.
            _shade.Data = new CombinedGeometry(GeometryCombineMode.Exclude, new RectangleGeometry(new Rect(0, 0, Width, Height)), new RectangleGeometry(r));
            var scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
            ((TextBlock)_sizeTag.Child).Text = $"{Math.Round(r.Width * scale)} × {Math.Round(r.Height * scale)}";
            Canvas.SetLeft(_sizeTag, b.X + 12);
            Canvas.SetTop(_sizeTag, b.Y + 12);
            _sizeTag.Visibility = Visibility.Visible;
        }

        BitmapSource Crop(Rect dip)
        {
            double sx = _shot.PixelWidth / Width, sy = _shot.PixelHeight / Height;
            var px = new Int32Rect((int)(dip.X * sx), (int)(dip.Y * sy),
                Math.Max(1, (int)(dip.Width * sx)), Math.Max(1, (int)(dip.Height * sy)));
            px.Width = Math.Min(px.Width, _shot.PixelWidth - px.X);
            px.Height = Math.Min(px.Height, _shot.PixelHeight - px.Y);
            var crop = new CroppedBitmap(_shot, px);
            crop.Freeze();
            return crop;
        }

        void Finish(BitmapSource? result)
        {
            if (_finished) return;
            _finished = true;
            Close();
            _done(result);
        }
    }
}
