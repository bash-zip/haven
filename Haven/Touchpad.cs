using System.Runtime.InteropServices;

namespace Haven;

/// <summary>
/// Reads finger positions straight from a Windows precision touchpad (raw HID input) and turns
/// multi-finger swipes into gestures: left/right to switch apps, up for Mission Control, down
/// for App Exposé. Works while other apps are in front.
/// </summary>
sealed class Touchpad
{
    public const int WM_INPUT = 0x00FF;

    /// <summary>Vertical swipes: direction ("up", "down"), finger count.</summary>
    public event Action<string, int>? Swipe;
    /// <summary>Horizontal swipes, continuously: phase ("begin", "move", "end"), finger travel as a fraction of the pad width (negative = left), velocity (pad widths per second).</summary>
    public event Action<string, double, double>? Pan;
    /// <summary>A quick tap with several fingers: finger count.</summary>
    public event Action<int>? Tap;
    public bool Enabled { get; set; } = true;
    public int Fingers { get; set; } = 3;
    public bool Detected => _devices.Values.Any(d => d != null);

    sealed class Contact { public ushort Link; public int XMin, XMax, YMin, YMax; }
    sealed class Device { public IntPtr Preparsed; public List<Contact> Contacts = new(); public ushort? CountLink; }

    readonly Dictionary<IntPtr, Device?> _devices = new();

    // Per-frame state (a frame of N touches can arrive split across several reports).
    int _expected;
    readonly Dictionary<int, (double X, double Y)> _frame = new();

    // Gesture state
    enum Mode { None, Horizontal, Vertical }
    bool _tracking;
    Mode _mode;
    int _trackFingers;
    double _startX, _startY, _lastDx, _velocity, _maxMove;
    long _lastTick, _lastReport, _startTick;
    bool _waitLift; // a gesture just ended: ignore fingers until they're lifted

    public void Register(IntPtr hwnd)
    {
        var rid = new RAWINPUTDEVICE { usUsagePage = 0x0D, usUsage = 0x05, dwFlags = 0x100 /* INPUTSINK */, hwndTarget = hwnd };
        RegisterRawInputDevices(new[] { rid }, 1, (uint)Marshal.SizeOf<RAWINPUTDEVICE>());
    }

    public void OnInput(IntPtr lParam)
    {
        uint headerSize = (uint)Marshal.SizeOf<RAWINPUTHEADER>();
        uint size = 0;
        GetRawInputData(lParam, RID_INPUT, IntPtr.Zero, ref size, headerSize);
        if (size == 0) return;
        var buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            if (GetRawInputData(lParam, RID_INPUT, buffer, ref size, headerSize) != size) return;
            var header = Marshal.PtrToStructure<RAWINPUTHEADER>(buffer);
            if (header.dwType != 2 /* RIM_TYPEHID */) return;
            var device = GetDevice(header.hDevice);
            if (device == null) return;

            int offset = (int)headerSize;
            int reportSize = Marshal.ReadInt32(buffer, offset);
            int count = Marshal.ReadInt32(buffer, offset + 4);
            for (int i = 0; i < count; i++)
                ParseReport(device, buffer + offset + 8 + i * reportSize, (uint)reportSize);
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    void ParseReport(Device d, IntPtr report, uint length)
    {
        if (d.CountLink is ushort countLink &&
            HidP_GetUsageValue(0, 0x0D, countLink, 0x54, out uint contactCount, d.Preparsed, report, length) == HIDP_STATUS_SUCCESS &&
            contactCount > 0)
        {
            _expected = (int)contactCount;
            _frame.Clear();
        }
        if (_expected == 0) return;

        var usages = new ushort[16];
        foreach (var c in d.Contacts)
        {
            if (_frame.Count >= _expected) break;
            if (HidP_GetUsageValue(0, 0x01, c.Link, 0x30, out uint x, d.Preparsed, report, length) != HIDP_STATUS_SUCCESS) continue;
            if (HidP_GetUsageValue(0, 0x01, c.Link, 0x31, out uint y, d.Preparsed, report, length) != HIDP_STATUS_SUCCESS) continue;
            HidP_GetUsageValue(0, 0x0D, c.Link, 0x51, out uint id, d.Preparsed, report, length);
            uint n = (uint)usages.Length;
            bool tip = HidP_GetUsages(0, 0x0D, c.Link, usages, ref n, d.Preparsed, report, length) == HIDP_STATUS_SUCCESS
                && usages.Take((int)n).Contains((ushort)0x42);
            if (!tip) { _expected = Math.Max(0, _expected - 1); continue; }
            _frame[(int)id] = ((x - c.XMin) / (double)Math.Max(1, c.XMax - c.XMin), (y - c.YMin) / (double)Math.Max(1, c.YMax - c.YMin));
        }
        if (_frame.Count >= _expected) Process();
    }

    void Process()
    {
        _lastReport = Environment.TickCount64;
        int n = _frame.Count;
        if (n < 3) _waitLift = false;
        // Both 3 and 4 fingers belong to Haven: the chosen count switches apps, the other one
        // switches spaces (desktops), so Windows never gets a multi-finger swipe of its own.
        if (n is 3 or 4 && Enabled && !_waitLift)
        {
            double cx = _frame.Values.Average(p => p.X), cy = _frame.Values.Average(p => p.Y);
            long now = Environment.TickCount64;
            if (!_tracking || n != _trackFingers)
            {
                if (_tracking && _mode == Mode.Horizontal) Pan?.Invoke("end", 0, 0); // fingers added mid-slide: spring back
                _tracking = true;
                _trackFingers = n;
                _startX = cx;
                _startY = cy;
                _mode = Mode.None;
                _lastDx = 0;
                _velocity = 0;
                _maxMove = 0;
                _lastTick = _startTick = now;
                return;
            }
            double dx = cx - _startX, dy = cy - _startY;
            _maxMove = Math.Max(_maxMove, Math.Max(Math.Abs(dx), Math.Abs(dy)));
            bool primary = n == Fingers;
            if (_mode == Mode.None)
            {
                // Decide early which way the swipe goes, so the slide starts right away.
                if (primary && Math.Abs(dx) > 0.025 && Math.Abs(dx) > Math.Abs(dy) * 1.2)
                {
                    _mode = Mode.Horizontal;
                    Pan?.Invoke("begin", dx, 0);
                }
                else if (!primary && Math.Abs(dx) > 0.12 && Math.Abs(dx) > Math.Abs(dy) * 1.4)
                {
                    _mode = Mode.Vertical; // a one-shot swipe, like the vertical ones
                    Swipe?.Invoke(dx < 0 ? "left" : "right", n);
                }
                else if (Math.Abs(dy) > 0.12 && Math.Abs(dy) > Math.Abs(dx) * 1.4)
                {
                    _mode = Mode.Vertical;
                    Swipe?.Invoke(dy < 0 ? "up" : "down", n);
                }
            }
            else if (_mode == Mode.Horizontal)
            {
                double dt = Math.Max(1, now - _lastTick) / 1000.0;
                _velocity = _velocity * 0.6 + ((dx - _lastDx) / dt) * 0.4; // smoothed
                _lastDx = dx;
                _lastTick = now;
                Pan?.Invoke("move", dx, _velocity);
            }
        }
        else if (_tracking && n < _trackFingers)
        {
            EndGesture();
        }
    }

    void EndGesture()
    {
        if (_mode == Mode.Horizontal) Pan?.Invoke("end", _lastDx, _velocity);
        else if (_mode == Mode.None && _maxMove < 0.03 && _lastReport - _startTick < 350) Tap?.Invoke(_trackFingers);
        _tracking = false;
        _mode = Mode.None;
        _waitLift = true;
    }

    /// <summary>Called regularly: if the fingers' lift report never arrived, finish the swipe anyway.</summary>
    public void CheckTimeout()
    {
        if (Environment.TickCount64 - _lastReport <= 250) return;
        if (_tracking) EndGesture();
        _waitLift = false; // no reports for a while: every finger is off the pad
    }

    Device? GetDevice(IntPtr handle)
    {
        if (_devices.TryGetValue(handle, out var known)) return known;
        Device? device = null;
        try
        {
            uint size = 0;
            GetRawInputDeviceInfo(handle, RIDI_PREPARSEDDATA, IntPtr.Zero, ref size);
            if (size > 0)
            {
                var pre = Marshal.AllocHGlobal((int)size);
                GetRawInputDeviceInfo(handle, RIDI_PREPARSEDDATA, pre, ref size);
                var caps = new byte[64];
                if (HidP_GetCaps(pre, caps) == HIDP_STATUS_SUCCESS)
                {
                    ushort valueCapCount = BitConverter.ToUInt16(caps, 48);
                    var buf = new byte[72 * Math.Max(1, (int)valueCapCount)];
                    ushort n = valueCapCount;
                    if (HidP_GetValueCaps(0, buf, ref n, pre) == HIDP_STATUS_SUCCESS)
                    {
                        var d = new Device { Preparsed = pre };
                        var byLink = new Dictionary<ushort, Contact>();
                        for (int i = 0; i < n; i++)
                        {
                            int o = i * 72;
                            ushort page = BitConverter.ToUInt16(buf, o);
                            ushort link = BitConverter.ToUInt16(buf, o + 6);
                            bool isRange = buf[o + 12] != 0;
                            int min = BitConverter.ToInt32(buf, o + 40), max = BitConverter.ToInt32(buf, o + 44);
                            ushort usage = BitConverter.ToUInt16(buf, o + 56);
                            if (isRange) continue;
                            if (page == 0x0D && usage == 0x54) d.CountLink = link;
                            if (page == 0x01 && usage is 0x30 or 0x31)
                            {
                                if (!byLink.TryGetValue(link, out var c)) byLink[link] = c = new Contact { Link = link };
                                if (usage == 0x30) { c.XMin = min; c.XMax = max; } else { c.YMin = min; c.YMax = max; }
                            }
                        }
                        d.Contacts = byLink.Values.Where(c => c.XMax > c.XMin && c.YMax > c.YMin).ToList();
                        if (d.Contacts.Count > 0) device = d;
                    }
                }
                if (device == null) Marshal.FreeHGlobal(pre);
            }
        }
        catch { device = null; }
        _devices[handle] = device;
        return device;
    }

    const uint RID_INPUT = 0x10000003, RIDI_PREPARSEDDATA = 0x20000005;
    const int HIDP_STATUS_SUCCESS = 0x00110000;

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICE { public ushort usUsagePage, usUsage; public uint dwFlags; public IntPtr hwndTarget; }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTHEADER { public uint dwType, dwSize; public IntPtr hDevice, wParam; }

    [DllImport("user32.dll")] static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] devices, uint count, uint size);
    [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr hRawInput, uint command, IntPtr data, ref uint size, uint headerSize);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint GetRawInputDeviceInfo(IntPtr device, uint command, IntPtr data, ref uint size);
    [DllImport("hid.dll")] static extern int HidP_GetCaps(IntPtr preparsed, byte[] caps);
    [DllImport("hid.dll")] static extern int HidP_GetValueCaps(int reportType, byte[] caps, ref ushort length, IntPtr preparsed);
    [DllImport("hid.dll")] static extern int HidP_GetUsageValue(int reportType, ushort usagePage, ushort link, ushort usage, out uint value, IntPtr preparsed, IntPtr report, uint length);
    [DllImport("hid.dll")] static extern int HidP_GetUsages(int reportType, ushort usagePage, ushort link, ushort[] usages, ref uint length, IntPtr preparsed, IntPtr report, uint length2);
}
