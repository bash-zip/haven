using Windows.Media.Control;
using Windows.Storage.Streams;

namespace Haven;

public sealed record NowPlaying(string Title, string Artist, string App, bool Playing, string? Art,
    double Position, double Duration);

/// <summary>Reads and controls whatever is playing, through the same API as the Windows volume flyout.</summary>
static class Media
{
    static GlobalSystemMediaTransportControlsSessionManager? _manager;
    static string? _artKey, _art;

    static async Task<GlobalSystemMediaTransportControlsSessionManager> Manager() =>
        _manager ??= await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();

    public static async Task<NowPlaying?> NowPlayingAsync(bool includeArt = true)
    {
        try { return await NowPlayingCoreAsync(includeArt); }
        catch
        {
            // The cached session can go stale when the media app restarts (SMTC keeps handing
            // out a dead one). Ask for a fresh manager once before giving up.
            _manager = null;
            _artKey = null; _art = null;
            try { return await NowPlayingCoreAsync(includeArt); }
            catch { return null; }
        }
    }

    static async Task<NowPlaying?> NowPlayingCoreAsync(bool includeArt)
    {
        var session = (await Manager()).GetCurrentSession();
        if (session == null) return null;
        var props = await session.TryGetMediaPropertiesAsync();
        if (props == null || string.IsNullOrWhiteSpace(props.Title)) return null;

        var playing = session.GetPlaybackInfo()?.PlaybackStatus ==
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;

        string? art = null;
        if (includeArt)
        {
            var key = props.Title + "\n" + props.Artist;
            if (key != _artKey || _art == null)
            {
                _artKey = key;
                _art = await ReadArtAsync(props.Thumbnail);
            }
            art = _art;
        }
        // Apps report the position as of their last update; move it forward to now while playing.
        double position = 0, duration = 0;
        try
        {
            var timeline = session.GetTimelineProperties();
            duration = Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalSeconds);
            position = timeline.Position.TotalSeconds;
            if (playing && timeline.LastUpdatedTime.Year > 2000)
                position += (DateTimeOffset.Now - timeline.LastUpdatedTime).TotalSeconds;
            position = Math.Clamp(position, 0, duration);
        }
        catch { /* app doesn't share a timeline */ }

        return new NowPlaying(props.Title, props.Artist ?? "", session.SourceAppUserModelId ?? "", playing, art,
            Math.Round(position, 1), Math.Round(duration, 1));
    }

    public static async Task ControlAsync(string action)
    {
        var session = (await Manager()).GetCurrentSession();
        if (session == null) return;
        _ = action switch
        {
            "toggle" => await session.TryTogglePlayPauseAsync(),
            "next" => await session.TrySkipNextAsync(),
            "previous" => await session.TrySkipPreviousAsync(),
            _ => false,
        };
    }

    static async Task<string?> ReadArtAsync(IRandomAccessStreamReference? reference)
    {
        if (reference == null) return null;
        try
        {
            using var stream = await reference.OpenReadAsync();
            using var input = stream.AsStreamForRead();
            using var ms = new MemoryStream();
            await input.CopyToAsync(ms);
            var type = string.IsNullOrEmpty(stream.ContentType) ? "image/png" : stream.ContentType;
            return $"data:{type};base64,{Convert.ToBase64String(ms.ToArray())}";
        }
        catch
        {
            return null;
        }
    }
}
