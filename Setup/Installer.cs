using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;

namespace HavenSetup;

/// <summary>
/// The installer itself, free of any UI framework: extracts the embedded payload,
/// creates shortcuts, registers the uninstall entry and the sign-in task, and
/// launches Haven. Progress is reported as (percent, status, current file, phase).
/// </summary>
public sealed class Installer
{
    public static readonly string DefaultDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Haven");

    readonly byte[] _payload;
    readonly string _version;

    public string TargetDir { get; set; } = DefaultDir;
    public bool Autostart { get; set; } = true;
    public bool DesktopShortcut { get; set; }
    public bool LaunchAfter { get; set; } = true;

    public Installer(byte[] payload, string version) { _payload = payload; _version = version; }

    public static byte[]? ReadPayload()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip");
        if (stream == null) return null;
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        return ms.ToArray();
    }

    /// <summary>Plain unpack of the embedded payload (used by --extract and --quiet).</summary>
    public static void ExtractPayload(byte[] payload, string dir)
    {
        using var zip = new ZipArchive(new MemoryStream(payload), ZipArchiveMode.Read);
        var entries = zip.Entries.Where(e => !string.IsNullOrEmpty(e.Name)).ToList();
        var root = Path.GetFullPath(dir) + Path.DirectorySeparatorChar;
        foreach (var entry in entries)
        {
            var full = entry.FullName.Replace('\\', '/');
            var target = Path.GetFullPath(Path.Combine(dir, full));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue;
            if (entry.FullName.EndsWith('/') || entry.FullName.EndsWith(Path.DirectorySeparatorChar))
            {
                Directory.CreateDirectory(target);
                continue;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, overwrite: true);
        }
    }

    public void Install(Action<int, string, string, int> report)
    {
        report(2, "Closing any running copies of Haven…", "", 0);
        foreach (var p in Process.GetProcessesByName("Haven").Where(p => p.Id != Environment.ProcessId))
            try { p.Kill(); p.WaitForExit(5000); } catch { }
        Thread.Sleep(600);

        report(6, "Preparing the folder…", "", 0);
        Directory.CreateDirectory(TargetDir);

        var logPath = Path.Combine(Path.GetTempPath(), $"HavenSetup-{Environment.ProcessId}.log");
        var log = new List<string> { $"target={TargetDir}", $"time={DateTime.Now:O}", $"payloadBytes={_payload.Length}" };
        void Log(string line) { lock (log) { log.Add(line); try { File.WriteAllLines(logPath, log); } catch { } } }
        var failed = new List<ZipArchiveEntry>();
        int done = 0, entriesTotal = 0;

        using (var zip = new ZipArchive(new MemoryStream(_payload), ZipArchiveMode.Read))
        {
            var entries = zip.Entries.Where(e => !string.IsNullOrEmpty(e.Name)).ToList();
            entriesTotal = entries.Count;
            // Haven.exe last: if an antivirus races the scan, everything else stays put.
            entries = entries.OrderBy(e => string.Equals(e.Name, "Haven.exe", StringComparison.OrdinalIgnoreCase) ? 1 : 0).ToList();
            Log($"entries={entries.Count}");
            const string root = "Haven/";

            void ExtractEntry(ZipArchiveEntry entry)
            {
                // Compress-Archive (PowerShell 5.1) writes entry names with backslashes;
                // normalize before matching the "Haven/" prefix or everything lands one
                // folder deeper and the launch can't find Haven.exe.
                var full = entry.FullName.Replace('\\', '/');
                var rel = full.StartsWith(root, StringComparison.OrdinalIgnoreCase)
                    ? full[root.Length..] : full;
                var target = Path.GetFullPath(Path.Combine(TargetDir, rel));
                if (!target.StartsWith(Path.GetFullPath(TargetDir), StringComparison.OrdinalIgnoreCase))
                {
                    Log($"skip {entry.FullName}");
                    return;
                }
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                entry.ExtractToFile(target, overwrite: true);
            }

            foreach (var entry in entries)
            {
                try { ExtractEntry(entry); done++; }
                catch (Exception e) { failed.Add(entry); Log($"fail {entry.FullName}: {e.Message}"); }
                if (done % 10 == 0 || done + failed.Count == entries.Count)
                    report(6 + done * 72 / Math.Max(1, entries.Count), "Copying files…", Path.GetFileName(entry.Name), 1);
            }
            // Transient locks (an antivirus scanning the file it was just written to) usually
            // clear in a moment — one retry pass over whatever failed.
            foreach (var entry in failed.ToList())
            {
                try { ExtractEntry(entry); done++; failed.Remove(entry); Log($"retry ok {entry.FullName}"); }
                catch (Exception e) { Log($"retry fail {entry.FullName}: {e.Message}"); }
            }
        }

        report(79, "Checking the copied files…", "", 1);
        int present = 0;
        try { present = Directory.EnumerateFiles(TargetDir, "*", SearchOption.AllDirectories).Count(); } catch (Exception e) { Log($"count fail: {e.Message}"); }
        Log($"copied={done}/{entriesTotal} presentOnDisk={present}");

        var missing = new[] { "Haven.exe", "Haven.dll", Path.Combine("wwwroot", "index.html") }
            .Where(f => !File.Exists(Path.Combine(TargetDir, f))).ToList();
        if (missing.Any())
        {
            string why = done == 0 || present == 0
                ? $"Nothing from the payload actually landed in the folder (copied {done}, {present} on disk) — this is a copy failure, not an antivirus. "
                : $"Copied {done} of {entriesTotal} files, but only {present} remain — an antivirus most likely removed them mid-scan. ";
            throw new FileNotFoundException(why +
                $"Missing: {string.Join(", ", missing)}. Full log: {logPath}. " +
                $"Fix: add an antivirus exclusion for \"{TargetDir}\", restore anything it quarantined, then run setup again.");
        }

        report(80, "Creating shortcuts…", "", 2);
        var exe = Path.Combine(TargetDir, "Haven.exe");
        CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Haven.lnk"), exe, TargetDir);
        if (DesktopShortcut)
            CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Haven.lnk"), exe, TargetDir);

        report(87, "Registering Haven…", "", 3);
        Register(TargetDir);

        if (Autostart)
        {
            report(92, "Setting up start at sign-in…", "", 4);
            SetAutostart(true);
        }

        if (LaunchAfter)
        {
            report(98, "Starting Haven…", "", 5);
            Launch();
        }
    }

    public void Launch()
    {
        var exe = Path.Combine(TargetDir, "Haven.exe");
        if (!File.Exists(exe))
            throw new FileNotFoundException(
                "Haven.exe disappeared between the copy and the launch — your antivirus most likely removed it. " +
                "Restore it from quarantine or exclude the install folder, then run setup again.");
        Process.Start(new ProcessStartInfo(exe)
        {
            UseShellExecute = true,
            WorkingDirectory = TargetDir,
        });
    }

    void Register(string dir)
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Haven");
        long size = Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).Sum(f => new FileInfo(f).Length) / 1024;
        var exe = Path.Combine(dir, "Haven.exe");
        key.SetValue("DisplayName", "Haven");
        key.SetValue("DisplayVersion", _version);
        key.SetValue("Publisher", "Haven");
        key.SetValue("InstallLocation", dir);
        key.SetValue("DisplayIcon", exe);
        key.SetValue("UninstallString", $"\"{exe}\" --uninstall");
        key.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, size), Microsoft.Win32.RegistryValueKind.DWord);
        key.SetValue("NoModify", 1, Microsoft.Win32.RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, Microsoft.Win32.RegistryValueKind.DWord);
    }

    static void CreateShortcut(string path, string target, string workDir)
    {
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) return;
            var shell = Activator.CreateInstance(type)!;
            var link = type.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object?[] { path })!;
            Set(link, "TargetPath", target);
            Set(link, "WorkingDirectory", workDir);
            Set(link, "Description", "Haven: a calm, customizable desktop for Windows");
            type.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
            Marshal.ReleaseComObject(link);
            Marshal.ReleaseComObject(shell);
            static void Set(object obj, string prop, string value) =>
                obj.GetType().InvokeMember(prop, BindingFlags.SetProperty, null, obj, new object?[] { value });
        }
        catch { /* shortcuts are nice-to-have; don't fail the install over one */ }
    }

    void SetAutostart(bool on)
    {
        using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true))
            key?.DeleteValue("Haven", throwOnMissingValue: false);
        var schtasks = RunSchtasks(on ? "/Create /TN \"Haven\" /F" : "/Delete /TN \"Haven\" /F");
        if (!on || schtasks != 0) return;
        var user = $"{Environment.UserDomainName}\\{Environment.UserName}";
        string esc(string x) => System.Security.SecurityElement.Escape(x);
        var exe = Path.Combine(TargetDir, "Haven.exe");
        var xml = $"""
            <?xml version="1.0" encoding="UTF-16"?>
            <Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
              <RegistrationInfo><Description>Starts Haven, your desktop, when you sign in.</Description></RegistrationInfo>
              <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>{esc(user)}</UserId></LogonTrigger></Triggers>
              <Principals><Principal id="Author"><UserId>{esc(user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
              <Settings>
                <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
                <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
                <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
                <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
                <Priority>4</Priority>
                <StartWhenAvailable>true</StartWhenAvailable>
              </Settings>
              <Actions Context="Author"><Exec><Command>{esc(exe)}</Command><Arguments>--startup</Arguments></Exec></Actions>
            </Task>
            """;
        var file = Path.Combine(Path.GetTempPath(), "haven-task.xml");
        File.WriteAllText(file, xml, System.Text.Encoding.Unicode);
        try { RunSchtasks($"/Create /TN \"Haven\" /XML \"{file}\" /F"); }
        finally { File.Delete(file); }
    }

    static int RunSchtasks(string args)
    {
        var psi = new ProcessStartInfo("schtasks.exe", args)
        {
            CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true,
        };
        using var p = Process.Start(psi)!;
        p.WaitForExit(15000);
        return p.ExitCode;
    }

    // ---------------------------------------------------------------- helpers used by the UI

    public static string NormalizeDir(string dir)
    {
        dir = (dir ?? "").Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(dir)) return DefaultDir;
        try { return Path.GetFullPath(dir); } catch { return DefaultDir; }
    }

    /// <summary>Writable? valid drive? returns (ok, error, free-space text).</summary>
    public static (bool ok, string? err, string free) CheckDir(string dir)
    {
        if (string.IsNullOrWhiteSpace(dir)) return (false, "Choose a folder first.", "");
        try
        {
            if (Path.GetPathRoot(Path.GetFullPath(dir)) == null) return (false, "Not a valid folder path.", "");
            Directory.CreateDirectory(dir);
            var probe = Path.Combine(dir, ".haven-setup-test");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return (true, null, FreeSpaceText(dir));
        }
        catch (Exception e) { return (false, e.Message, ""); }
    }

    public static string FreeSpaceText(string dir)
    {
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(string.IsNullOrWhiteSpace(dir) ? DefaultDir : dir)) ?? "C:\\";
            var drive = DriveInfo.GetDrives().First(d => d.Name.Equals(root, StringComparison.OrdinalIgnoreCase));
            return $"{drive.AvailableFreeSpace / (1024L * 1024L * 1024L)} GB free on {drive.Name}";
        }
        catch { return ""; }
    }
}
