using System.Windows.Threading;
using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;

namespace Haven;

/// <summary>
/// Live audio for Haven's visualizers: listens to whatever the PC is playing (WASAPI loopback,
/// nothing recorded or saved) and turn it into frequency bands, a short waveform, and a beat flag
/// ~30 times a second. I only run while a visualizer is on screen.
/// Nothing blocks the UI thread: capture activation and disposal run on background threads,
/// and I coalesce rapid subscribe/stop flapping with a short stop delay.
/// </summary>
sealed class AudioViz : IDisposable
{
    const int FftSize = 2048, FftLog = 11, Bands = 64, WavePoints = 96;
    readonly HashSet<string> _subscribers = new();
    readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(33) };
    readonly Dispatcher _dispatcher;
    readonly float[] _ring = new float[FftSize];
    readonly double[] _bands = new double[Bands], _peaks = new double[Bands];
    readonly Complex[] _fft = new Complex[FftSize];
    readonly object _lock = new();
    WasapiRecorder? _capture;
    WaveFormat? _format;
    string? _deviceId;
    int _ringPos, _sampleRate = 48000, _quietFrames;
    double _energyAvg, _ref = -40;
    float _wavePeak = 0.01f;
    DateTime _lastDeviceCheck;
    bool _loggedData;
    bool _captureBeingBuilt;
    int _generation;                                  // discards stale async activations
    readonly DispatcherTimer _stopDelay = new() { Interval = TimeSpan.FromMilliseconds(1200) };

    /// <summary>Raised on the UI thread: bands 0–100, waveform −100…100, beat.</summary>
    public event Action<int[], int[], bool>? Frame;

    public AudioViz()
    {
        _dispatcher = Dispatcher.CurrentDispatcher;
        _timer.Tick += (_, _) => Tick();
        _stopDelay.Tick += (_, _) => { _stopDelay.Stop(); StopNow(); };
    }

    public void Subscribe(string who, bool on)
    {
        if (on) _subscribers.Add(who); else _subscribers.Remove(who);
        if (_subscribers.Count > 0) StartAsync();
        else ScheduleStop();
    }

    /// <summary>I activate off the UI thread — WasapiRecorderBuilder can take seconds,
    /// and blocking here froze the whole shell (Windows: "Application Hang"). I use a generation
    /// counter to discard builds that got superseded while in flight.</summary>
    void StartAsync()
    {
        _stopDelay.Stop();
        if (_capture != null || _captureBeingBuilt) return;
        _captureBeingBuilt = true;
        int gen = ++_generation;
        Log.Info("Audio visualizer starting…");
        Task.Run(async () =>
        {
            try
            {
                using var en = new MMDeviceEnumerator();
                var device = en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                WasapiRecorder capture;
                try
                {
                    // Everything the PC plays except Haven itself ("process loopback"). On some
                    // audio drivers the older endpoint loopback only ever returns silence, so
                    // that's just the fallback.
                    capture = await new WasapiRecorderBuilder()
                        .WithProcessLoopback((uint)Environment.ProcessId, ProcessLoopbackMode.ExcludeTargetProcessTree)
                        .WithFormat(WaveFormat.CreateIeeeFloatWaveFormat(48000, 2))
                        .BuildAsync();
                }
                catch (Exception e)
                {
                    Log.Info("Process loopback unavailable, using endpoint loopback: " + e.Message);
                    capture = new WasapiRecorderBuilder().WithDevice(device).WithLoopbackCapture().Build();
                }

                _dispatcher.Invoke(() =>
                {
                    if (gen != _generation) { try { capture.Dispose(); } catch { } return; } // superseded
                    _capture = capture;
                    _deviceId = device.ID;
                    _format = capture.WaveFormat;
                    _sampleRate = _format.SampleRate;
                    _captureBeingBuilt = false;
                    capture.DataAvailable += OnData;
                    capture.StartRecording();
                    _timer.Start();
                    Log.Info($"Audio visualizer listening to {device.FriendlyName} ({capture.WaveFormat})");
                });
            }
            catch (Exception e)
            {
                Log.Info("Audio visualizer couldn't start: " + e.Message);
                _dispatcher.Invoke(() => { if (gen == _generation) _captureBeingBuilt = false; });
            }
        });
    }

    /// <summary>A short delay before actually stopping: theme switches and calm flapping
    /// used to trigger stop→start storms, and each start blocked the UI thread.</summary>
    void ScheduleStop()
    {
        if (_capture == null && !_captureBeingBuilt) return;
        _stopDelay.Stop();
        _stopDelay.Start();
    }

    void StopNow()
    {
        _generation++;                                   // invalidates any build in flight
        _timer.Stop();
        var old = _capture;
        _capture = null;
        _format = null;
        _captureBeingBuilt = false;
        if (old != null) Task.Run(() => { try { old.StopRecording(); } catch { } try { old.Dispose(); } catch { } });
        Array.Clear(_bands);
        Array.Clear(_peaks);
    }

    void OnData(ReadOnlySpan<byte> buffer, AudioClientBufferFlags flags, long devicePosition, long qpcPosition)
    {
        var fmt = _format;
        if (fmt == null || buffer.Length == 0) return;
        if (!_loggedData) { _loggedData = true; Log.Info($"Audio data arriving: {buffer.Length} bytes, {fmt.Encoding}, {fmt.BitsPerSample}-bit"); }
        bool silent = (flags & AudioClientBufferFlags.Silent) != 0;
        int channels = fmt.Channels, bytesPer = fmt.BitsPerSample / 8, frame = bytesPer * channels;
        bool isFloat = fmt.Encoding == WaveFormatEncoding.IeeeFloat || (fmt.Encoding == WaveFormatEncoding.Extensible && bytesPer == 4);
        lock (_lock)
        {
            for (int i = 0; i + frame <= buffer.Length; i += frame)
            {
                float sum = 0;
                if (!silent)
                    for (int c = 0; c < channels; c++)
                    {
                        int o = i + c * bytesPer;
                        sum += isFloat ? BitConverter.ToSingle(buffer.Slice(o, 4))
                            : bytesPer == 2 ? BitConverter.ToInt16(buffer.Slice(o, 2)) / 32768f : 0;
                    }
                _ring[_ringPos] = sum / channels;
                _ringPos = (_ringPos + 1) % FftSize;
            }
        }
    }

    void Tick()
    {
        if (_capture == null || _captureBeingBuilt) return;

        // Follow the default output device (headphones plugged in, etc.) — checked off the
        // hot path every 4 seconds; a device change just schedules a fresh async start.
        if ((DateTime.Now - _lastDeviceCheck).TotalSeconds > 4)
        {
            _lastDeviceCheck = DateTime.Now;
            try
            {
                using var en = new MMDeviceEnumerator();
                var id = en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia).ID;
                if (id != _deviceId) { StopNow(); StartAsync(); return; }
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

    public void Dispose()
    {
        _stopDelay.Stop();
        _timer.Stop();
        _generation++;
        var old = _capture;
        _capture = null;
        if (old != null) Task.Run(() => { try { old.StopRecording(); } catch { } try { old.Dispose(); } catch { } });
    }
}
