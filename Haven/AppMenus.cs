using System.Windows.Automation;

namespace Haven;

/// <summary>
/// The menus of the app in front (File, Edit, View…), read through Windows' accessibility
/// interface (UI Automation), so Haven's menu bar can show the real ones and open them.
/// Apps that draw their own menus or have none simply keep Haven's menus.
/// </summary>
static class AppMenus
{
    static IntPtr _cachedFor;
    static List<string> _cached = new();

    public static async Task<List<string>> NamesAsync(IntPtr hwnd)
    {
        if (hwnd == _cachedFor) return _cached;
        var work = Task.Run(() => Items(hwnd).Select(i => Clean(i.Current.Name)).Where(n => n.Length > 0).ToList());
        // Never let a slow app hold up the menu bar.
        var done = await Task.WhenAny(work, Task.Delay(900));
        var names = done == work && work.IsCompletedSuccessfully ? work.Result : new List<string>();
        _cachedFor = hwnd;
        _cached = names;
        return names;
    }

    /// <summary>Opens one of the app's menus (its own dropdown appears, exactly as if clicked).</summary>
    public static Task OpenAsync(IntPtr hwnd, int index) => Task.Run(() =>
    {
        var items = Items(hwnd);
        if (index < 0 || index >= items.Count) return;
        Native.SetForegroundWindow(hwnd);
        var item = items[index];
        if (item.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out var expand))
            ((ExpandCollapsePattern)expand).Expand();
        else if (item.TryGetCurrentPattern(InvokePattern.Pattern, out var invoke))
            ((InvokePattern)invoke).Invoke();
    });

    static List<AutomationElement> Items(IntPtr hwnd)
    {
        try
        {
            var window = AutomationElement.FromHandle(hwnd);
            var isMenuBar = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuBar);
            // Classic menus are direct children; some apps nest them one level deeper.
            var bars = window.FindAll(TreeScope.Children, isMenuBar).Cast<AutomationElement>().ToList();
            if (bars.Count == 0)
                foreach (AutomationElement child in window.FindAll(TreeScope.Children, Condition.TrueCondition))
                    bars.AddRange(child.FindAll(TreeScope.Children, isMenuBar).Cast<AutomationElement>());
            foreach (var bar in bars)
            {
                var items = bar.FindAll(TreeScope.Children, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuItem))
                    .Cast<AutomationElement>()
                    .Where(i => !IsSystemMenu(i.Current.Name))
                    .ToList();
                if (items.Count > 0) return items;
            }
        }
        catch { /* the window went away or doesn't support automation */ }
        return new List<AutomationElement>();
    }

    static bool IsSystemMenu(string name) => name is "System" or "System Menu" or "" || name.StartsWith("System", StringComparison.Ordinal);

    // "&File" → "File"
    static string Clean(string name) => name.Replace("&", "").Trim();

    public static void Forget() { _cachedFor = IntPtr.Zero; }
}
