using System.Text.Json;
using System.Text.Json.Nodes;

namespace Haven;

/// <summary>
/// Haven's settings file (state.json): the one place I keep every page's settings.
///
/// Pages send me only what changed ("patches"); I merge them so two pages saving at the
/// same moment can't overwrite each other. Every write goes to a temporary file first and is
/// then swapped in, so a crash mid-write can't leave a broken file. A backup is kept (refreshed
/// at most every ten minutes, plus a daily one), and if the file is ever unreadable Haven starts
/// from the newest good backup instead of from scratch.
/// </summary>
static class StateStore
{
    static readonly SemaphoreSlim Gate = new(1, 1);
    static JsonObject? _cache;
    static string Backup => Paths.State + ".bak";
    static string Daily => Path.Combine(Paths.Root, "backups", $"state-{DateTime.Now:yyyy-MM-dd}.json");

    public static async Task<JsonObject?> LoadAsync()
    {
        await Gate.WaitAsync();
        try { return (_cache ??= ReadBest())?.DeepClone() as JsonObject; }
        finally { Gate.Release(); }
    }

    /// <summary>Merges changed settings (and removals) into the file.</summary>
    public static async Task PatchAsync(JsonElement set, IEnumerable<string> remove)
    {
        await Gate.WaitAsync();
        try
        {
            var state = _cache ??= ReadBest() ?? new JsonObject();
            if (set.ValueKind == JsonValueKind.Object)
                foreach (var p in set.EnumerateObject()) state[p.Name] = JsonNode.Parse(p.Value.GetRawText());
            foreach (var k in remove) state.Remove(k);
            await WriteAsync(state);
        }
        finally { Gate.Release(); }
    }

    /// <summary>Replaces everything (importing a setup).</summary>
    public static async Task ReplaceAsync(JsonElement all)
    {
        await Gate.WaitAsync();
        try
        {
            _cache = JsonNode.Parse(all.GetRawText()) as JsonObject ?? new JsonObject();
            await WriteAsync(_cache);
        }
        finally { Gate.Release(); }
    }

    static async Task WriteAsync(JsonObject state)
    {
        Directory.CreateDirectory(Paths.Root);
        var json = state.ToJsonString();
        var tmp = Paths.State + ".tmp";
        await File.WriteAllTextAsync(tmp, json);
        // Keep the previous good file as a backup before swapping (not on every keystroke).
        try
        {
            if (File.Exists(Paths.State) && (!File.Exists(Backup) || File.GetLastWriteTime(Backup) < DateTime.Now.AddMinutes(-10)))
                File.Copy(Paths.State, Backup, overwrite: true);
            if (File.Exists(Paths.State) && !File.Exists(Daily))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Daily)!);
                File.Copy(Paths.State, Daily);
                foreach (var old in Directory.GetFiles(Path.GetDirectoryName(Daily)!, "state-*.json").OrderByDescending(f => f).Skip(14))
                    File.Delete(old);
            }
        }
        catch { /* a backup failing must never stop the save */ }
        for (int attempt = 0; ; attempt++)
        {
            try { File.Move(tmp, Paths.State, overwrite: true); break; }
            catch (IOException) when (attempt < 20) { await Task.Delay(100); } // briefly locked by another program
            catch (UnauthorizedAccessException) when (attempt < 20) { await Task.Delay(100); }
        }
    }

    static JsonObject? ReadBest()
    {
        foreach (var file in Candidates())
        {
            if (!File.Exists(file)) continue;
            // A file that's briefly locked (antivirus, a backup tool, the previous Haven still
            // closing) is not a broken file: wait and retry rather than falling back to an older
            // backup, which would quietly undo recent changes.
            for (int attempt = 0; attempt < 20; attempt++)
            {
                try
                {
                    if (JsonNode.Parse(File.ReadAllText(file)) is JsonObject o && o.Count > 0)
                    {
                        if (file != Paths.State) Log.Info($"Settings file unreadable; started from backup {Path.GetFileName(file)}");
                        return o;
                    }
                    break; // empty: try the next candidate
                }
                catch (IOException) { Thread.Sleep(150); }
                catch (UnauthorizedAccessException) { Thread.Sleep(150); }
                catch (Exception e) { Log.Info($"Settings file {Path.GetFileName(file)} is damaged ({e.Message})"); break; }
            }
        }
        return null;
    }

    static IEnumerable<string> Candidates()
    {
        yield return Paths.State;
        yield return Backup;
        var dir = Path.Combine(Paths.Root, "backups");
        if (Directory.Exists(dir))
            foreach (var f in Directory.GetFiles(dir, "state-*.json").OrderByDescending(f => f)) yield return f;
    }
}
