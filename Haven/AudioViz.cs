using System.Windows.Threading;
using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;

namespace Haven;

/// <summary>
/// Live audio for Haven's visualizers: listens to whatever the PC is playing (WASAPI loopback,
/// nothing is recorded or saved) and turns it into frequency bands, a short waveform and a beat
/// flag about 30 times a second. Runs only while a visualizer is on screen.
/// </summary>
sealed class AudioViz : IDisposable
{
    const int FftSize = 2048, FftLog = 11, Bands = 64, WavePoints = 96;
    readonly HashSet<string> _subscribers = new();
    readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(33) };
    readonly float[] _ring = new float[FftSize];
    readonly double[] _bands = new double[Bands], _peaks = new double[Bands];
    readonly Complex[] _fft = new Complex[FftSize];
    readonly object _lock = new();
    WasapiLoopbackCapture? _capture;
    string? _deviceId;
    int _ringPos, _sampleRate = 48000, _quietFrames;
    double _energyAvg, _ref = -40;
    float _wavePeak = 0.01f;
    DateTime _lastDeviceCheck;

    /// <summary>Raised on the UI thread: bands 0–100, waveform −100…100, beat.</summary>
    public event Action<int[], int[], bool>? Frame;

    public AudioViz() => _timer.Tick += (_, _) => Tick();

    public void Subscribe(string who, bool on)
    {
        if (on) _subscribers.Add(who); else _subscribers.Remove(who);
        if (_subscribers.Count > 0 && _capture == null) Start();
        else if (_subscribers.Count == 0) Stop();
    }

    void Start()
    {
        try
        {
            using var en = new MMDeviceEnumerator();
            var device = en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            _deviceId = device.ID;
            _capture = new WasapiLoopbackCapture(device);
            _sampleRate = _capture.WaveFormat.SampleRate;
            _capture.DataAvailable += OnData;
            _capture.RecordingStopped += (_, _) => { };
            _capture.StartRecording();
            _timer.Start();
        }
        catch { _capture = null; }
    }

    void Stop()
    {
        _timer.Stop();
        try { _capture?.StopRecording(); } catch { }
        _capture?.Dispose();
        _capture = null;
        Array.Clear(_bands);
        Array.Clear(_peaks);
    }

    void OnData(object? sender, WaveInEventArgs e)
    {
        var fmt = _capture?.WaveFormat;
        if (fmt == null || e.BytesRecorded == 0) return;
        int channels = fmt.Channels, bytesPer = fmt.BitsPerSample / 8, frame = bytesPer * channels;
        lock (_lock)
        {
            for (int i = 0; i + frame <= e.BytesRecorded; i += frame)
            {
                float sum = 0;
                for (int c = 0; c < channels; c++)
                {
                    int o = i + c * bytesPer;
                    sum += fmt.Encoding == WaveFormatEncoding.IeeeFloat || (fmt.Encoding == WaveFormatEncoding.Extensible && bytesPer == 4)
                        ? BitConverter.ToSingle(e.Buffer, o)
                        : bytesPer == 2 ? BitConverter.ToInt16(e.Buffer, o) / 32768f : 0;
                }
                _ring[_ringPos] = sum / channels;
                _ringPos = (_ringPos + 1) % FftSize;
            }
        }
    }

    void Tick()
    {
        // Follow the default output device (headphones plugged in, etc.).
        if ((DateTime.Now - _lastDeviceCheck).TotalSeconds > 4)
        {
            _lastDeviceCheck = DateTime.Now;
            try
            {
                using var en = new MMDeviceEnumerator();
                var id = en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia).ID;
                if (id != _deviceId) { Stop(); Start(); return; }
            }
            catch { }
        }

        var samples = new float[FftSize];
        lock (_lock)
            for (int i = 0; i < FftSize; i++) samples[i] = _ring[(_ringPos + i) % FftSize];

        for (int i = 0; i < FftSize; i++)
        {
            _fft[i].X = (float)(samples[i] * FastFourierTransform.HannWindow(i, FftSize));
            _fft[i].Y = 0;
        }
        FastFourierTransform.FFT(true, FftLog, _fft);

        // Log-spaced bands from 40 Hz to 16 kHz, in decibels. NAudio's FFT divides by its size, so add
        // that back (+66 dB) to get levels relative to full scale.
        double binHz = (double)_sampleRate / FftSize, lo = 40, hi = Math.Min(16000, _sampleRate / 2.0);
        double energy = 0, total = 0, frameMax = -200;
        var db = new double[Bands];
        for (int b = 0; b < Bands; b++)
        {
            double f0 = lo * Math.Pow(hi / lo, (double)b / Bands), f1 = lo * Math.Pow(hi / lo, (double)(b + 1) / Bands);
            int i0 = Math.Max(1, (int)(f0 / binHz)), i1 = Math.Max(i0 + 1, (int)(f1 / binHz));
            double mag = 0;
            for (int i = i0; i < i1 && i < FftSize / 2; i++) mag = Math.Max(mag, Math.Sqrt(_fft[i].X * _fft[i].X + _fft[i].Y * _fft[i].Y));
            db[b] = 20 * Math.Log10(mag * FftSize + 1e-9);
            frameMax = Math.Max(frameMax, db[b]);
        }
        // Automatic gain: the loudest band sets the top of the scale and falls back slowly, so the
        // bars fill nicely whether the volume is at 5% or 100%. Below -95 dB it's silence.
        _ref = frameMax > _ref ? frameMax : Math.Max(-38, _ref - 0.08);
        const double Range = 48;
        for (int b = 0; b < Bands; b++)
        {
            double v = frameMax < -95 ? 0 : Math.Clamp((db[b] - (_ref - Range)) / Range, 0, 1);
            v = Math.Pow(v, 1.4); // keep quiet bands low so peaks stand out
            // Fast rise, gentle fall: the "cava" feel.
            _bands[b] = v > _bands[b] ? v * 0.7 + _bands[b] * 0.3 : _bands[b] * 0.82 + v * 0.18;
            _peaks[b] = Math.Max(_peaks[b] * 0.985, _bands[b]);
            if (b < 8) energy += v;
            total += _bands[b];
        }

        // A beat: the bass jumps well above its recent average.
        bool beat = energy > _energyAvg * 1.35 && energy > 2.4;
        _energyAvg = _energyAvg * 0.92 + energy * 0.08;

        if (total < 0.5) { if (++_quietFrames > 30 && _quietFrames % 15 != 0) return; } // silence: send rarely
        else _quietFrames = 0;

        var bands = new int[Bands];
        for (int b = 0; b < Bands; b++) bands[b] = (int)Math.Round(_bands[b] * 100);
        var wave = new int[WavePoints];
        int step = FftSize / WavePoints;
        // The waveform is scaled to its own peak too, so it's visible at any volume.
        float wavePeak = 1e-4f;
        for (int i = 0; i < FftSize; i++) wavePeak = Math.Max(wavePeak, Math.Abs(samples[i]));
        _wavePeak = Math.Max(wavePeak, _wavePeak * 0.97f);
        for (int i = 0; i < WavePoints; i++) wave[i] = (int)Math.Round(Math.Clamp(samples[i * step] / (_wavePeak * 1.15f), -1, 1) * 100);
        Frame?.Invoke(bands, wave, beat);
    }

    public void Dispose() => Stop();
}
