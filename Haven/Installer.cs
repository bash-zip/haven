using System.Diagnostics;
using System.Windows;
using Microsoft.Win32;

namespace Haven;

/// <summary>
/// Installing and uninstalling, with no separate setup program: run Haven.exe from the download
/// and it offers to install itself for your account (%LOCALAPPDATA%\Programs\Haven, a Start menu
/// entry, and an entry in Settings → Apps to uninstall it). Uninstalling puts the taskbar and every
/// Windows setting Haven changed back, and can keep your settings for a later reinstall.
/// </summary>
static class Installer
{
    const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Haven";
    static string InstalledExe => Path.Combine(Updater.InstallDir, "Haven.exe");
    static string Shortcut => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Haven.lnk");

    /// <summary>First run of a downloaded copy: offer to install. True if Haven should stop here.</summary>
    public static bool OfferOnFirstRun(string[] args)
    {
        if (Updater.IsInstalled || Updater.IsDevBuild || args.Contains("--portable")) return false;
        if (File.Exists(Path.Combine(AppContext.BaseDirectory, "portable.txt"))) return false;
        var answer = MessageBox.Show(
            "Install Haven for your account?\n\nIt gets a Start menu entry, updates itself, and can be uninstalled from Windows Settings → Apps.\n\nChoose No to just run it from this folder.",
            "Haven", MessageBoxButton.YesNoCancel, MessageBoxImage.Question);
        if (answer == MessageBoxResult.Cancel) return true;
        if (answer == MessageBoxResult.No)
        {
            try { File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "portable.txt"), "Run without installing."); } catch { }
            return false;
        }
        return Install(start: true);
    }

    /// <summary>Copies this copy of Haven into place and registers it. True when it worked.</summary>
    public static bool Install(bool start)
    {
        try
        {
            var src = AppContext.BaseDirectory.TrimEnd('\\');
            var dst = Updater.InstallDir;
            // An older installed copy may be running: close it (its watchdog restores the taskbar).
            foreach (var p in Process.GetProcessesByName("Haven").Where(p => p.Id != Environment.ProcessId))
                try { if (p.MainModule?.FileName?.StartsWith(dst, StringComparison.OrdinalIgnoreCase) == true) { p.Kill(); p.WaitForExit(5000); } } catch { }
            Directory.CreateDirectory(dst);
            foreach (var file in Directory.EnumerateFiles(src, "*", SearchOption.AllDirectories))
            {
                var rel = Path.GetRelativePath(src, file);
                if (rel.Equals("portable.txt", StringComparison.OrdinalIgnoreCase)) continue;
                var target = Path.Combine(dst, rel);
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.Copy(file, target, overwrite: true);
            }
            CreateShortcut(Shortcut, InstalledExe, dst);
            Register(dst);
            Log.Info($"Installed to {dst}");
            if (start) Process.Start(new ProcessStartInfo(InstalledExe) { UseShellExecute = true, WorkingDirectory = dst });
            return true;
        }
        catch (Exception e)
        {
            Log.Error("install", e.ToString());
            MessageBox.Show("Haven couldn't be installed: " + e.Message, "Haven", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    static void Register(string dir)
    {
        using var key = Registry.CurrentUser.CreateSubKey(UninstallKey);
        long size = Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).Sum(f => new FileInfo(f).Length) / 1024;
        key.SetValue("DisplayName", "Haven");
        key.SetValue("DisplayVersion", Updater.Current.ToString(3));
        key.SetValue("Publisher", "Haven");
        key.SetValue("InstallLocation", dir);
        key.SetValue("DisplayIcon", InstalledExe);
        key.SetValue("UninstallString", $"\"{InstalledExe}\" --uninstall");
        key.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, size), RegistryValueKind.DWord);
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
    }

    static void CreateShortcut(string path, string target, string workDir)
    {
        var type = Type.GetTypeFromProgID("WScript.Shell");
        if (type == null) return;
        dynamic shell = Activator.CreateInstance(type)!;
        dynamic link = shell.CreateShortcut(path);
        link.TargetPath = target;
        link.WorkingDirectory = workDir;
        link.Description = "Haven: a calm, customizable desktop for Windows";
        link.Save();
    }

    /// <summary>`Haven.exe --uninstall`: undo everything and remove Haven.</summary>
    public static void Uninstall()
    {
        if (MessageBox.Show("Uninstall Haven?\n\nYour taskbar and Windows settings go back to how they were. Your apps and files aren't touched.",
                "Uninstall Haven", MessageBoxButton.OKCancel, MessageBoxImage.Question) != MessageBoxResult.OK) return;
        bool removeData = MessageBox.Show("Also delete your Haven settings, themes and pictures?\n\nChoose No to keep them in case you install Haven again.",
            "Uninstall Haven", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes;

        // Close every running Haven, then put Windows back exactly as it was.
        foreach (var p in Process.GetProcessesByName("Haven").Where(p => p.Id != Environment.ProcessId))
            try { p.Kill(); p.WaitForExit(5000); } catch { }
        Thread.Sleep(800);
        Taskbar.Restore();
        WindowsGestures.RestoreNow();
        WindowAnimator.RestoreOsAnimation();
        WindowStyler.ResetEverything();
        StageManager.RecoverFromDisk();
        try { ShellHost.Autostart = false; } catch { }
        try { File.Delete(Shortcut); } catch { }
        try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, throwOnMissingSubKey: false); } catch { }
        Log.Info("Uninstalled");

        // The program folder can only go once this process has exited.
        var targets = new List<string> { Updater.InstallDir };
        if (removeData) targets.Add(Paths.Root);
        var cmd = "ping -n 3 127.0.0.1 >nul & " + string.Join(" & ", targets.Select(t => $"rmdir /s /q \"{t}\""));
        Process.Start(new ProcessStartInfo("cmd.exe", "/c " + cmd) { CreateNoWindow = true, UseShellExecute = false, WorkingDirectory = Path.GetTempPath() });
        MessageBox.Show(removeData ? "Haven has been uninstalled." : "Haven has been uninstalled. Your settings are kept for next time.", "Haven");
    }
}
