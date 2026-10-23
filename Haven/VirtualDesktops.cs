using Microsoft.Win32;

namespace Haven;

/// <summary>
/// Spaces, built on Windows' virtual desktops. The list and the current desktop come from where
/// Windows records them; switching, adding and closing use Windows' own shortcuts
/// (Ctrl+Win+←/→, Ctrl+Win+D, Ctrl+Win+F4), which stay stable across Windows versions.
/// </summary>
static class VirtualDesktops
{
    const string Key = @"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops";

    public sealed record Desktop(int Index, string Id, string Name);

    public static (List<Desktop> List, int Current) Read()
    {
        var list = new List<Desktop>();
        int current = 0;
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(Key);
            var ids = key?.GetValue("VirtualDesktopIDs") as byte[];
            var cur = key?.GetValue("CurrentVirtualDesktop") as byte[];
            if (ids == null || ids.Length < 16) return (new List<Desktop> { new(0, "", "Desktop 1") }, 0);
            for (int i = 0; i + 16 <= ids.Length; i += 16)
            {
                var id = new Guid(ids.AsSpan(i, 16));
                using var dk = key!.OpenSubKey($@"Desktops\{{{id}}}");
                var name = dk?.GetValue("Name") as string;
                int index = i / 16;
                list.Add(new Desktop(index, id.ToString(), string.IsNullOrWhiteSpace(name) ? $"Desktop {index + 1}" : name));
                if (cur != null && cur.Length == 16 && new Guid(cur) == id) current = index;
            }
        }
        catch { list = new List<Desktop> { new(0, "", "Desktop 1") }; }
        return (list, current);
    }

    public static async Task SwitchTo(int index)
    {
        var (list, current) = Read();
        if (index < 0 || index >= list.Count || index == current) return;
        ushort arrow = index > current ? (ushort)0x27 : (ushort)0x25; // Right : Left
        for (int i = 0; i < Math.Abs(index - current); i++)
        {
            Native.PressKeys(0x11, 0x5B, arrow); // Ctrl + Win + arrow
            await Task.Delay(180);
        }
    }

    public static void Step(int direction) => Native.PressKeys(0x11, 0x5B, direction > 0 ? (ushort)0x27 : (ushort)0x25);
    public static void Add() => Native.PressKeys(0x11, 0x5B, 0x44);     // Ctrl + Win + D
    public static void CloseCurrent() => Native.PressKeys(0x11, 0x5B, 0x73); // Ctrl + Win + F4
}
