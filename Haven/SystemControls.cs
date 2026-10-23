using System.Management;
using System.Runtime.InteropServices;
using Windows.ApplicationModel.Appointments;
using Windows.Devices.Radios;
using Windows.Networking.Connectivity;

namespace Haven;

/// <summary>Volume, brightness, radios, network and system load, for Control Center and the menu bar.</summary>
static class SystemControls
{
    // ----- Volume (Core Audio) -----

    public static object? Volume()
    {
        var ep = Endpoint();
        if (ep == null) return null;
        ep.GetMasterVolumeLevelScalar(out float level);
        ep.GetMute(out bool muted);
        return new { level = Math.Round(level * 100), muted };
    }

    public static void SetVolume(double percent)
    {
        var ep = Endpoint() ?? throw new InvalidOperationException("No audio output found.");
        var ctx = Guid.Empty;
        ep.SetMasterVolumeLevelScalar((float)Math.Clamp(percent / 100, 0, 1), ref ctx);
        if (percent > 0) ep.SetMute(false, ref ctx);
    }

    public static void SetMute(bool mute)
    {
        var ep = Endpoint() ?? throw new InvalidOperationException("No audio output found.");
        var ctx = Guid.Empty;
        ep.SetMute(mute, ref ctx);
    }

    static IAudioEndpointVolume? Endpoint()
    {
        try
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
            if (enumerator.GetDefaultAudioEndpoint(0 /* render */, 1 /* multimedia */, out var device) != 0) return null;
            var iid = typeof(IAudioEndpointVolume).GUID;
            device.Activate(ref iid, 1 /* CLSCTX_INPROC_SERVER */, IntPtr.Zero, out var obj);
            return obj as IAudioEndpointVolume;
        }
        catch { return null; }
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out uint count);
        int SetMasterVolumeLevel(float levelDb, ref Guid ctx);
        int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
        int GetMasterVolumeLevel(out float levelDb);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint channel, float levelDb, ref Guid ctx);
        int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid ctx);
        int GetChannelVolumeLevel(uint channel, out float levelDb);
        int GetChannelVolumeLevelScalar(uint channel, out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    // ----- Brightness (built-in displays only) -----

    public static int? Brightness()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(@"root\WMI", "SELECT CurrentBrightness FROM WmiMonitorBrightness");
            foreach (ManagementObject o in searcher.Get()) return Convert.ToInt32(o["CurrentBrightness"]);
        }
        catch { }
        return null;
    }

    public static void SetBrightness(int percent)
    {
        using var cls = new ManagementClass(@"root\WMI", "WmiMonitorBrightnessMethods", null);
        foreach (ManagementObject o in cls.GetInstances())
            o.InvokeMethod("WmiSetBrightness", new object[] { (uint)1, (byte)Math.Clamp(percent, 0, 100) });
    }

    // ----- Wi-Fi & Bluetooth radios -----

    public static async Task<object> RadiosAsync()
    {
        try
        {
            await Radio.RequestAccessAsync();
            var radios = await Radio.GetRadiosAsync();
            bool? Find(RadioKind kind) => radios.FirstOrDefault(r => r.Kind == kind) is { } r ? r.State == RadioState.On : null;
            return new { wifi = Find(RadioKind.WiFi), bluetooth = Find(RadioKind.Bluetooth) };
        }
        catch { return new { wifi = (bool?)null, bluetooth = (bool?)null }; }
    }

    public static async Task SetRadioAsync(string kind, bool on)
    {
        var want = kind == "wifi" ? RadioKind.WiFi : kind == "bluetooth" ? RadioKind.Bluetooth : throw new ArgumentException("Unknown radio.");
        if (await Radio.RequestAccessAsync() != RadioAccessStatus.Allowed) throw new InvalidOperationException("Windows didn't allow changing radios.");
        var radio = (await Radio.GetRadiosAsync()).FirstOrDefault(r => r.Kind == want)
            ?? throw new InvalidOperationException("No such radio on this PC.");
        await radio.SetStateAsync(on ? RadioState.On : RadioState.Off);
    }

    // ----- Network -----

    public static object Network()
    {
        try
        {
            var p = NetworkInformation.GetInternetConnectionProfile();
            if (p == null) return new { connected = false };
            var level = p.GetNetworkConnectivityLevel();
            bool wifi = p.IsWlanConnectionProfile;
            return new
            {
                connected = level != NetworkConnectivityLevel.None,
                internet = level == NetworkConnectivityLevel.InternetAccess,
                type = wifi ? "wifi" : p.IsWwanConnectionProfile ? "cellular" : "ethernet",
                name = wifi ? p.WlanConnectionProfileDetails.GetConnectedSsid() : p.ProfileName,
                bars = (int?)p.GetSignalBars(),
            };
        }
        catch { return new { connected = false }; }
    }

    // ----- CPU, memory, disk -----

    static long _lastIdle, _lastTotal;

    public static object Stats()
    {
        double cpu = 0;
        if (GetSystemTimes(out var idleFt, out var kernelFt, out var userFt))
        {
            long idle = idleFt, total = kernelFt + userFt; // kernel time includes idle time
            long dIdle = idle - _lastIdle, dTotal = total - _lastTotal;
            if (_lastTotal != 0 && dTotal > 0) cpu = Math.Clamp(100.0 * (dTotal - dIdle) / dTotal, 0, 100);
            _lastIdle = idle;
            _lastTotal = total;
        }
        var mem = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        GlobalMemoryStatusEx(ref mem);
        var sys = new DriveInfo(Path.GetPathRoot(Environment.SystemDirectory) ?? "C:\\");
        return new
        {
            cpu = Math.Round(cpu),
            memory = (int)mem.dwMemoryLoad,
            memoryTotalGb = Math.Round(mem.ullTotalPhys / 1073741824.0, 1),
            diskFreeGb = Math.Round(sys.AvailableFreeSpace / 1073741824.0),
            diskUsed = (int)Math.Round(100.0 * (sys.TotalSize - sys.AvailableFreeSpace) / sys.TotalSize),
            uptimeHours = Math.Round(Environment.TickCount64 / 3_600_000.0, 1),
        };
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MEMORYSTATUSEX
    {
        public uint dwLength, dwMemoryLoad;
        public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile, ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll")] static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
    [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX mem);

    // ----- Calendar -----

    /// <summary>Upcoming events from calendars Windows knows about. Not every PC allows desktop apps to read them.</summary>
    public static async Task<object> EventsAsync()
    {
        try
        {
            var store = await AppointmentManager.RequestStoreAsync(AppointmentStoreAccessType.AllCalendarsReadOnly);
            var list = await store.FindAppointmentsAsync(DateTimeOffset.Now.Date, TimeSpan.FromDays(4));
            return new
            {
                available = true,
                events = list.Where(a => a.StartTime + a.Duration > DateTimeOffset.Now).OrderBy(a => a.StartTime).Take(6)
                    .Select(a => new { title = a.Subject, start = a.StartTime.ToUnixTimeMilliseconds(), end = (a.StartTime + a.Duration).ToUnixTimeMilliseconds(), allDay = a.AllDay, location = a.Location }),
            };
        }
        catch
        {
            return new { available = false };
        }
    }
}
