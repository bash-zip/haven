using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Haven;

/// <summary>One line of the system check: ok (true), problem (false) or just information (null).</summary>
public sealed record CheckResult(string Area, string Name, bool? Ok, string Detail, string? Fix = null);

/// <summary>
/// Settings → About → System check: tests, on this PC, the things that only real hardware can
/// show (tray, gestures, screenshots, Spaces, the hidden taskbar…) and says what's wrong.
/// </summary>
sealed partial class ShellHost
{
    public async Task<List<CheckResult>> RunChecksAsync()
    {
        var list = new List<CheckResult>();
        void Add(string area, string name, bool? ok, string detail, string? fix = null) => list.Add(new(area, name, ok, detail, fix));
        void Try(string area, string name, Action check)
        {
            try { check(); }
            catch (Exception e) { Add(area, name, false, "The check itself failed: " + e.Message); }
        }

        // ----- Desktop -----
        Try("Desktop", "Windows taskbar", () =>
        {
            if (!_wantTaskbarHidden) { Add("Desktop", "Windows taskbar", null, "Shown (Settings → General → Hide the Windows taskbar is off)."); return; }
            var tray = Native.FindWindow("Shell_TrayWnd", null);
            bool visible = tray != IntPtr.Zero && Native.IsWindowVisible(tray);
            bool autoHide = (Taskbar.State() & 1) != 0;
            Add("Desktop", "Windows taskbar", !visible && autoHide,
                visible ? "The taskbar is showing." : autoHide ? "Hidden, and its screen space is free." : "Hidden, but it still keeps space at the bottom of the screen.",
                autoHide ? null : "Haven repairs this within a second; run the check again.");
        });
        Try("Desktop", "Screen space", () =>
        {
            var m = Native.PrimaryMonitor();
            var work = Native.WorkArea();
            int top = work.Top - m.Top, bottom = m.Bottom - work.Bottom;
            bool ok = top > 0 && top < 80 && bottom < 120;
            Add("Desktop", "Screen space", ok, $"Windows keep {top}px clear for the menu bar and {bottom}px at the bottom.",
                ok ? null : "Restart Haven. If it persists, another app may be reserving screen space.");
        });
        Try("Desktop", "Displays", () =>
        {
            int n = Native.MonitorCount();
            Add("Desktop", "Displays", true, n == 1 ? "One display." : $"{n} displays. The others get their own menu bar and wallpaper.");
        });

        // ----- Keyboard -----
        Add("Keyboard", "Keyboard hook", _switcher?.Installed == true,
            _switcher?.Installed == true ? "Haven receives Alt + Tab and Windows-key shortcuts." : "Windows refused the keyboard hook, so Alt + Tab and Win shortcuts go to Windows.",
            _switcher?.Installed == true ? null : "Restart Haven. Security software sometimes blocks keyboard hooks.");
        Add("Keyboard", "Shortcuts", _hotkeyFailures.Count == 0,
            _hotkeyFailures.Count == 0 ? "Every Haven shortcut is registered." : "Taken by another app: " + string.Join(", ", _hotkeyFailures),
            _hotkeyFailures.Count == 0 ? null : "Close the app that uses them (PowerToys often does), then restart Haven.");

        // ----- Touchpad -----
        Add("Touchpad", "Precision touchpad", Touchpad.Detected ? true : null,
            Touchpad.Detected ? "Found, and Haven reads it directly." : "Not seen yet. Put two or more fingers on the touchpad, then run the check again.");
        Try("Touchpad", "Windows gestures", () =>
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad");
            var names = new[] { "ThreeFingerSlideEnabled", "FourFingerSlideEnabled", "ThreeFingerTapEnabled", "FourFingerTapEnabled" };
            var on = names.Where(n => key?.GetValue(n) is not int v || v != 0).ToList();
            if (!Touchpad.Enabled) { Add("Touchpad", "Windows gestures", null, "Haven's gestures are off, so Windows keeps its own."); return; }
            Add("Touchpad", "Windows gestures", on.Count == 0,
                on.Count == 0 ? "Windows' 3- and 4-finger gestures are off, so only Haven answers. (Windows applies this at sign-in.)" : "Still on in Windows: " + string.Join(", ", on),
                on.Count == 0 ? "If Windows still reacts to swipes, sign out and back in once." : "Turn Haven's gestures off and on again in Settings → Trackpad.");
        });

        // ----- Windows & screen capture -----
        Try("Windows", "Screen capture", () =>
        {
            var shot = MissionControl.CaptureScreen(Native.PrimaryMonitor());
            bool ok = shot != null && shot.PixelWidth > 0;
            bool blank = ok && IsBlank(shot!);
            Add("Windows", "Screen capture", ok && !blank,
                !ok ? "Couldn't capture the screen." : blank ? "The capture came back blank." : $"Works ({shot!.PixelWidth}×{shot.PixelHeight}). Screenshots go to {(Screenshots.Destination == "clipboard" ? "the clipboard only" : Screenshots.Destination == "pictures" ? Screenshots.DefaultFolder : Screenshots.Destination)}.");
        });
        Try("Windows", "Live window previews", () =>
        {
            var target = WindowTracker.VisibleWindowsBottomUp().LastOrDefault();
            if (target == IntPtr.Zero) { Add("Windows", "Live window previews", null, "No open app to test with. Open one and run the check again."); return; }
            bool ok = MissionControl.CanPreview(_desktop.Handle, target);
            Add("Windows", "Live window previews", ok, ok ? "Overview, Stage View and slides can show live windows." : "Windows refused a live preview (DWM).");
        });
        Try("Windows", "Spaces", () =>
        {
            var (spaces, current) = VirtualDesktops.Read();
            Add("Windows", "Spaces", spaces.Count > 0, $"{spaces.Count} desktop{(spaces.Count == 1 ? "" : "s")}, on {spaces[current].Name}.");
        });
        Add("Windows", "Stage View", null, _stage?.Enabled == true ? "On." : "Off (turn it on in Quick Controls).");
        Try("Windows", "Clipboard history", () =>
            Add("Windows", "Clipboard history", ClipboardHistory.Listening, ClipboardHistory.Listening ? $"Listening; {ClipboardHistory.Count} items saved." : "Windows didn't let Haven watch the clipboard."));

        // ----- Menu bar -----
        Add("Menu bar", "System tray", Tray.Running ? true : null,
            Tray.Running ? $"{Tray.Snapshot().Count} app icons in the menu bar." : "Off (Settings → Menu Bar → Show app icons).");

        // ----- Haven -----
        Try("Haven", "Start at sign-in", () =>
        {
            bool on = Autostart;
            Add("Haven", "Start at sign-in", null, on ? "On: Haven starts when you sign in." : "Off.");
        });
        Try("Haven", "Pictures and icons", () =>
        {
            Directory.CreateDirectory(Paths.Public);
            var probe = Path.Combine(Paths.Public, ".probe");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            Add("Haven", "Pictures and icons", true, "Your wallpapers, icons and widget pictures can be saved and shown.");
        });
        Try("Haven", "Web engine", () =>
        {
            var v = Microsoft.Web.WebView2.Core.CoreWebView2Environment.GetAvailableBrowserVersionString();
            Add("Haven", "Web engine", true, "Microsoft Edge WebView2 " + v);
        });
        bool hello = false;
        try { hello = await LockAuth.HelloAvailableAsync(); } catch { }
        Add("Haven", "Windows Hello", null, hello ? "Available: the lock screen can unlock with your face, fingerprint or PIN." : "Not set up on this PC (the lock screen uses your Haven password).");
        Add("Haven", "Installation", null, Updater.IsInstalled ? "Installed for your account." : "Running from a development build.");
        Add("Haven", "Memory", null, $"{Environment.WorkingSet / 1048576} MB for Haven itself (the web views run in separate Edge WebView2 processes).");

        return list;
    }

    static bool IsBlank(System.Windows.Media.Imaging.BitmapSource shot)
    {
        // Sample a grid of pixels: a blank capture is one colour everywhere.
        int w = shot.PixelWidth, h = shot.PixelHeight, stride = w * 4;
        var row = new byte[stride];
        var seen = new HashSet<int>();
        for (int y = h / 8; y < h; y += Math.Max(1, h / 8))
        {
            shot.CopyPixels(new System.Windows.Int32Rect(0, y, w, 1), row, stride, 0);
            for (int x = 0; x < w; x += Math.Max(1, w / 8)) seen.Add(BitConverter.ToInt32(row, x * 4) & 0xFFFFFF);
        }
        return seen.Count <= 1;
    }
}
