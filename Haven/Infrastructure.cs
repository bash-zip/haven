using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Haven;

static class Paths
{
    public static readonly string Root =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Haven");

    /// <summary>Served to the page at https://data.haven.example/ (icons, wallpapers, game art).</summary>
    public static readonly string Public = Path.Combine(Root, "public");
    public static readonly string Icons = Path.Combine(Public, "icons");
    public static readonly string Wallpapers = Path.Combine(Public, "wallpapers");
    public static readonly string Games = Path.Combine(Public, "games");
    public static readonly string WebViewData = Path.Combine(Root, "WebView2");
    public static readonly string State = Path.Combine(Root, "state.json");

    static Paths()
    {
        foreach (var dir in new[] { Icons, Wallpapers, Games, WebViewData }) Directory.CreateDirectory(dir);
    }

    public static string Url(string publicFile) =>
        "https://data.haven.example/" + Path.GetRelativePath(Public, publicFile).Replace('\\', '/');

    public static string Hash(string s) =>
        Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s.ToLowerInvariant())))[..16].ToLowerInvariant();
}

static class Json
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };
}

/// <summary>
/// A single background thread in a COM single-threaded apartment. The Windows shell objects used
/// for app discovery and icon extraction must be called from an STA thread.
/// </summary>
sealed class StaWorker
{
    readonly BlockingCollection<Action> _queue = new();

    public StaWorker(string name)
    {
        var thread = new Thread(() =>
        {
            foreach (var work in _queue.GetConsumingEnumerable()) work();
        })
        { IsBackground = true, Name = name };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
    }

    public Task<T> Run<T>(Func<T> func)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _queue.Add(() =>
        {
            try { tcs.SetResult(func()); }
            catch (Exception ex) { tcs.SetException(ex); }
        });
        return tcs.Task;
    }
}
