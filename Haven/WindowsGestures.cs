using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Haven;

/// <summary>
/// Windows reacts to 3- and 4-finger swipes and taps itself (app switcher, Task View, Search,
/// notifications). While my gestures are on, I set every one of them to "Nothing" so only
/// Haven answers, and I put each one back exactly as it was when I exit. The original values
/// are saved to disk first, so a crash can always be undone (by the watchdog, or the next start).
///
/// Windows only reads these settings when you sign in. So when I start at sign-in and the
/// session ends (sign-out, restart), the settings are deliberately left off: the next sign-in
/// then starts with Windows' gestures already out of the way.
/// </summary>
static class WindowsGestures
{
    const string Key = @"Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad";
    static readonly string Marker = Path.Combine(Paths.Root, "gesture-state.txt");
    static readonly string KeepFlag = Path.Combine(Paths.Root, "gesture-keep.txt");
    static readonly string[] Names = { "ThreeFingerSlideEnabled", "FourFingerSlideEnabled", "ThreeFingerTapEnabled", "FourFingerTapEnabled" };

    public static void Suppress()
    {
        try { File.Delete(KeepFlag); } catch { }
        using var key = Registry.CurrentUser.OpenSubKey(Key, writable: true);
        if (key == null) return;
        var saved = ReadMarker();
        bool changed = false;
        foreach (var name in Names)
        {
            // Remember the user's own value once; never overwrite it with our 0.
            if (!saved.ContainsKey(name)) saved[name] = key.GetValue(name) is int v ? v.ToString() : "";
            if (key.GetValue(name) is not int cur || cur != 0) { key.SetValue(name, 0, RegistryValueKind.DWord); changed = true; }
        }
        File.WriteAllLines(Marker, saved.Select(p => $"{p.Key}={p.Value}"));
        if (changed) Notify();
    }

    public static void Restore()
    {
        if (!File.Exists(Marker) || File.Exists(KeepFlag)) return;
        using (var key = Registry.CurrentUser.OpenSubKey(Key, writable: true))
        {
            if (key != null)
                foreach (var (name, value) in ReadMarker())
                {
                    if (int.TryParse(value, out var v)) key.SetValue(name, v, RegistryValueKind.DWord);
                    else key.DeleteValue(name, throwOnMissingValue: false);
                }
        }
        File.Delete(Marker);
        Notify();
    }

    /// <summary>The session is ending and Haven will be back at the next sign-in: keep Windows' gestures off.</summary>
    public static void KeepThroughSignOut()
    {
        if (File.Exists(Marker)) File.WriteAllText(KeepFlag, DateTime.Now.ToString("o"));
    }

    /// <summary>Undo everything now, even across a sign-out (Haven no longer starts at sign-in).</summary>
    public static void RestoreNow()
    {
        try { File.Delete(KeepFlag); } catch { }
        Restore();
    }

    static Dictionary<string, string> ReadMarker()
    {
        var result = new Dictionary<string, string>();
        if (!File.Exists(Marker)) return result;
        foreach (var line in File.ReadAllLines(Marker))
        {
            var parts = line.Trim().Split('=', 2);
            if (parts.Length == 2 && Names.Contains(parts[0])) result[parts[0]] = parts[1];
        }
        return result;
    }

    static void Notify() =>
        SendMessageTimeout(new IntPtr(0xFFFF), 0x001A /* WM_SETTINGCHANGE */, IntPtr.Zero, "PrecisionTouchPad", 2 /* ABORTIFHUNG */, 500, out _);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr SendMessageTimeout(IntPtr hWnd, int msg, IntPtr wParam, string lParam, uint flags, uint timeout, out IntPtr result);
}
