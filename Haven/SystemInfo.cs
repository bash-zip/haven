using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32;
using Windows.Devices.Enumeration;
using Windows.Devices.Geolocation;

namespace Haven;

public sealed record DeviceBattery(string Name, int Level, string Kind);

/// <summary>Small read-only lookups about this PC and its user.</summary>
static class SystemInfo
{
    /// <summary>Copies the current Windows desktop wallpaper where the page can show it.</summary>
    public static string? WindowsWallpaper()
    {
        var path = Registry.GetValue(@"HKEY_CURRENT_USER\Control Panel\Desktop", "WallPaper", null) as string;
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
            path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                @"Microsoft\Windows\Themes\TranscodedWallpaper");
        if (!File.Exists(path)) return null;

        var ext = Path.GetExtension(path);
        if (string.IsNullOrEmpty(ext)) ext = ".jpg";
        var stamp = File.GetLastWriteTimeUtc(path).Ticks;
        var target = Path.Combine(Paths.Wallpapers, "windows-" + Paths.Hash(path + stamp) + ext);
        if (!File.Exists(target)) File.Copy(path, target, overwrite: true);
        return Paths.Url(target);
    }

public sealed record WallpaperItem(string Name, string Url, string Thumb);

    /// <summary>The wallpapers that ship with Windows (C:\Windows\Web\Wallpaper), with small thumbnails.</summary>
    public static List<WallpaperItem> WindowsWallpaperLibrary()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Web", "Wallpaper");
        var list = new List<WallpaperItem>();
        if (!Directory.Exists(root)) return list;

        foreach (var dir in Directory.EnumerateDirectories(root).OrderBy(d => d))
        {
            var files = Directory.EnumerateFiles(dir)
                .Where(f => f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f).ToList();
            var folder = Path.GetFileName(dir);
            for (int i = 0; i < files.Count; i++)
            {
                var source = files[i];
                var id = Paths.Hash(source + File.GetLastWriteTimeUtc(source).Ticks);
                var full = Path.Combine(Paths.Wallpapers, $"winlib-{id}{Path.GetExtension(source)}");
                var thumb = Path.Combine(Paths.Wallpapers, $"winlib-{id}-thumb.jpg");
                try
                {
                    if (!File.Exists(full)) File.Copy(source, full);
                    if (!File.Exists(thumb)) SaveThumbnail(source, thumb);
                }
                catch { continue; }
                var name = files.Count > 1 ? $"{Pretty(folder)} {i + 1}" : Pretty(folder);
                list.Add(new WallpaperItem(name, Paths.Url(full), Paths.Url(thumb)));
            }
        }
        return list;
    }

    static string Pretty(string folder) =>
        System.Text.RegularExpressions.Regex.Replace(folder, "(?<=[a-z])(?=[A-Z])", " ");

    static void SaveThumbnail(string source, string target)
    {
        var bmp = new System.Windows.Media.Imaging.BitmapImage();
        bmp.BeginInit();
        bmp.UriSource = new Uri(source);
        bmp.DecodePixelWidth = 360;
        bmp.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
        bmp.EndInit();
        bmp.Freeze();
        var encoder = new System.Windows.Media.Imaging.JpegBitmapEncoder { QualityLevel = 82 };
        encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(bmp));
        using var fs = File.Create(target);
        encoder.Save(fs);
    }

    /// <summary>The keyboard language of the app in front, e.g. "ENG".</summary>
    public static string InputLanguage()
    {
        try
        {
            var fg = Native.GetForegroundWindow();
            uint thread = GetWindowThreadProcessId(fg, IntPtr.Zero);
            int lcid = GetKeyboardLayout(thread).ToInt32() & 0xFFFF;
            return new System.Globalization.CultureInfo(lcid).ThreeLetterISOLanguageName.ToUpperInvariant();
        }
        catch { return ""; }
    }

    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
    [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);

    /// <summary>The signed-in user's display name and Windows account picture, when available.</summary>
    public static object Account()
    {
        string display = Environment.UserName;
        var sb = new StringBuilder(256);
        uint size = (uint)sb.Capacity;
        if (GetUserNameEx(NameDisplay, sb, ref size) && sb.Length > 0) display = sb.ToString();

        string? picture = null;
        try
        {
            var sid = WindowsIdentity.GetCurrent().User?.Value;
            var key = $@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AccountPicture\Users\{sid}";
            foreach (var name in new[] { "Image192", "Image240", "Image96", "Image448" })
            {
                if (Registry.GetValue(key, name, null) is not string source || !File.Exists(source)) continue;
                var target = Path.Combine(Paths.Public, "account-" + Paths.Hash(source + File.GetLastWriteTimeUtc(source).Ticks) + Path.GetExtension(source));
                if (!File.Exists(target)) File.Copy(source, target, overwrite: true);
                picture = Paths.Url(target);
                break;
            }
        }
        catch { /* no account picture */ }

        return new { user = Environment.UserName, displayName = display, picture };
    }

    // Windows stores the battery level it shows in Settings → Bluetooth & devices in this property.
    const string BatteryLevelKey = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";

    public static async Task<List<DeviceBattery>> DeviceBatteriesAsync()
    {
        var devices = await DeviceInformation.FindAllAsync("", new[] { BatteryLevelKey }, DeviceInformationKind.Device);
        var result = new Dictionary<string, DeviceBattery>(StringComparer.OrdinalIgnoreCase);
        foreach (var d in devices)
        {
            if (!d.Properties.TryGetValue(BatteryLevelKey, out var value) || value is not byte level) continue;
            var name = CleanDeviceName(d.Name);
            if (name.Length == 0) continue;
            result[name] = new DeviceBattery(name, level, GuessKind(name));
        }
        return result.Values.OrderBy(b => b.Name).ToList();
    }

    // Bluetooth exposes one node per profile ("… Hands-Free AG", "… Avrcp Transport"); show the device once.
    static readonly string[] ProfileSuffixes = { "Hands-Free AG", "Hands-Free", "Avrcp Transport", "Stereo", "A2DP SNK" };

    static string CleanDeviceName(string? name)
    {
        var n = (name ?? "").Trim();
        foreach (var suffix in ProfileSuffixes)
            if (n.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)) n = n[..^suffix.Length].Trim();
        return n;
    }

    static string GuessKind(string name)
    {
        var n = name.ToLowerInvariant();
        if (n.Contains("mouse") || n.Contains("mx master") || n.Contains("trackball")) return "mouse";
        if (n.Contains("keyboard") || n.Contains("keys")) return "keyboard";
        if (n.Contains("controller") || n.Contains("gamepad") || n.Contains("xbox") || n.Contains("dualsense")) return "controller";
        if (n.Contains("bud") || n.Contains("pods") || n.Contains("head") || n.Contains("ear") || n.Contains("wh-") || n.Contains("wf-")) return "headphones";
        if (n.Contains("pen") || n.Contains("stylus")) return "pen";
        return "device";
    }

    /// <summary>Approximate location from Windows location services, rounded to roughly 1 km.</summary>
    public static async Task<object?> LocationAsync()
    {
        var access = await Geolocator.RequestAccessAsync();
        if (access != GeolocationAccessStatus.Allowed) return null;
        var locator = new Geolocator { DesiredAccuracy = PositionAccuracy.Default };
        var pos = await locator.GetGeopositionAsync(TimeSpan.FromMinutes(30), TimeSpan.FromSeconds(10));
        var p = pos.Coordinate.Point.Position;
        return new { lat = Math.Round(p.Latitude, 2), lon = Math.Round(p.Longitude, 2) };
    }

    const int NameDisplay = 3;

    [DllImport("secur32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetUserNameExW")]
    static extern bool GetUserNameEx(int format, StringBuilder name, ref uint size);
}
