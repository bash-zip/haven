using System.Collections.Specialized;
using System.ComponentModel;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using ManagedShell;
using ManagedShell.WindowsTray;

namespace Haven;

public sealed record TrayIconInfo(string Id, string Title, string? Icon);

/// <summary>
/// The system tray (Discord, Steam, OneDrive…) for Haven's menu bar. ManagedShell, from the
/// Cairo Desktop project, receives the icons apps register and passes clicks back to them.
/// </summary>
sealed class TrayHost : IDisposable
{
    ShellManager? _shell;
    NotificationArea? _area;
    readonly DispatcherTimer _debounce = new() { Interval = TimeSpan.FromMilliseconds(250) };
    readonly Dictionary<NotifyIcon, string> _iconCache = new();

    /// <summary>Raised (debounced) whenever icons appear, disappear or change.</summary>
    public event Action<List<TrayIconInfo>>? Changed;
    public bool Running => _area != null && !_area.IsFailed;

    public void Start()
    {
        try
        {
            var config = ShellManager.DefaultShellConfig;
            config.EnableTasksService = false;
            config.AutoStartTasksService = false;
            config.EnableTrayService = true;
            config.AutoStartTrayService = true;
            _shell = new ShellManager(config);
            _area = _shell.NotificationArea;
            _area.TrayIcons.CollectionChanged += OnCollectionChanged;
            foreach (var icon in _area.TrayIcons) icon.PropertyChanged += OnIconChanged;
            _debounce.Tick += (_, _) => { _debounce.Stop(); Changed?.Invoke(Snapshot()); };
            Kick();
        }
        catch
        {
            _area = null; // the tray is a nice-to-have; Haven works without it
        }
    }

    void OnCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (e.NewItems != null) foreach (NotifyIcon icon in e.NewItems) icon.PropertyChanged += OnIconChanged;
        if (e.OldItems != null) foreach (NotifyIcon icon in e.OldItems) { icon.PropertyChanged -= OnIconChanged; _iconCache.Remove(icon); }
        Kick();
    }

    void OnIconChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (sender is NotifyIcon icon && e.PropertyName == nameof(NotifyIcon.Icon)) _iconCache.Remove(icon);
        Kick();
    }

    void Kick() { _debounce.Stop(); _debounce.Start(); }

    static readonly string[] SystemIcons =
    {
        NotificationArea.VOLUME_GUID.Trim('{', '}'), NotificationArea.POWER_GUID.Trim('{', '}'), NotificationArea.NETWORK_GUID.Trim('{', '}'),
    };

    static string Id(NotifyIcon i) => $"{i.HWnd.ToInt64()}:{i.UID}:{i.GUID}";

    public List<TrayIconInfo> Snapshot()
    {
        if (_area == null) return new List<TrayIconInfo>();
        return _area.TrayIcons
            .Where(i => !i.IsHidden && i.Icon != null)
            // Haven's menu bar already shows Wi-Fi, volume and battery.
            .Where(i => !SystemIcons.Contains(i.GUID.ToString(), StringComparer.OrdinalIgnoreCase))
            .Select(i => new TrayIconInfo(Id(i), i.Title ?? "", IconUrl(i)))
            .ToList();
    }

    string? IconUrl(NotifyIcon icon)
    {
        if (_iconCache.TryGetValue(icon, out var cached)) return cached;
        try
        {
            if (icon.Icon is not BitmapSource source) return null;
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(source));
            using var ms = new MemoryStream();
            encoder.Save(ms);
            var url = "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
            _iconCache[icon] = url;
            return url;
        }
        catch { return null; }
    }

    /// <summary>Passes a click from Haven's menu bar to the app that owns the icon.</summary>
    public void Click(string id, string button, int screenX, int screenY)
    {
        var icon = _area?.TrayIcons.FirstOrDefault(i => Id(i) == id);
        if (icon == null) return;
        uint mouse = (uint)((screenY << 16) | (screenX & 0xFFFF));
        int dbl = (int)GetDoubleClickTime();
        var b = button == "right" ? MouseButton.Right : MouseButton.Left;
        icon.IconMouseDown(b, mouse, dbl);
        icon.IconMouseUp(b, mouse, dbl);
        if (button == "double")
        {
            icon.IconMouseDown(b, mouse, dbl);
            icon.IconMouseUp(b, mouse, dbl);
        }
    }

    public void Dispose()
    {
        try { _shell?.Dispose(); } catch { }
        _shell = null;
        _area = null;
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern uint GetDoubleClickTime();
}
