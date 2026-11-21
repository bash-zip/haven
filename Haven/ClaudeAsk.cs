using System.Security.Cryptography;
using System.Text;
using Anthropic;
using Anthropic.Models.Beta;
using Anthropic.Models.Beta.Messages;

namespace Haven;

/// <summary>
/// "Ask Claude" in Haven's search: I stream a short answer right under the search field.
/// Stores the API key encrypted for this Windows account (DPAPI), never in Haven's settings file
/// where the web UI could read it.
/// </summary>
static class ClaudeAsk
{
    const string ModelId = "claude-opus-5-5";
    static readonly string KeyFile = Path.Combine(Paths.Root, "claude.key");
    static CancellationTokenSource? _current;

    public static bool HasKey => LoadKey() != null;

    public static void SaveKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) { try { File.Delete(KeyFile); } catch { } return; }
        var data = ProtectedData.Protect(Encoding.UTF8.GetBytes(key.Trim()), null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(KeyFile, data);
    }

    static string? LoadKey()
    {
        try
        {
            if (File.Exists(KeyFile))
                return Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(KeyFile), null, DataProtectionScope.CurrentUser));
        }
        catch { /* written by another account, or corrupted */ }
        var env = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
        return string.IsNullOrWhiteSpace(env) ? null : env;
    }

    public static void Cancel() => _current?.Cancel();

    /// <summary>I stream an answer: onText for each piece, then onDone(null) or onDone(error).</summary>
    public static async Task AskAsync(string question, Action<string> onText, Action<string?> onDone)
    {
        _current?.Cancel();
        var cts = _current = new CancellationTokenSource();
        var key = LoadKey();
        if (key == null) { onDone("Add your Anthropic API key in Settings → Claude to ask questions here."); return; }

        try
        {
            var client = new AnthropicClient { ApiKey = key };
            var system = new List<BetaTextBlockParam>
            {
                new()
                {
                    Text = "You answer quick questions typed into the search box of Haven, a calm, customizable desktop for Windows. " +
                           "Reply in a few short sentences or a brief list. Plain text only: no headings, no tables, no markdown " +
                           "beyond simple '-' bullets. If the question needs current information you may not have, say so briefly. " +
                           $"Today is {DateTime.Now:dddd d MMMM yyyy}. The user is on Windows {Environment.OSVersion.Version}.",
                },
            };
            var parameters = new MessageCreateParams
            {
                Model = ModelId,
                MaxTokens = 4096,
                System = system,
                // A search box wants quick answers.
                OutputConfig = new BetaOutputConfig { Effort = Effort.Low },
                // If a safety check declines, the API picks a suitable model to answer instead of failing.
                Betas = ["server-side-fallback-2026-07-01"],
                Fallbacks = new Default(),
                Messages = [new BetaUserMessageParam { Content = question }],
            };

            bool any = false;
            string? stop = null;
            await foreach (var ev in client.Beta.Messages.CreateStreaming(parameters, cts.Token))
            {
                if (ev.TryPickContentBlockDelta(out var delta) && delta.Delta.TryPickText(out var text))
                {
                    any = true;
                    onText(text.Text);
                }
                else if (ev.TryPickDelta(out var md) && md.Delta.StopReason is { } sr)
                {
                    stop = sr.ToString();
                }
            }
            if (stop != null && stop.Contains("refusal", StringComparison.OrdinalIgnoreCase) && !any)
                onDone("Claude can't help with that one.");
            else onDone(null);
        }
        catch (OperationCanceledException) { onDone(null); }
        catch (Anthropic.Exceptions.AnthropicApiException e) when (e.Message.Contains("401") || e.Message.Contains("authentication", StringComparison.OrdinalIgnoreCase))
        {
            onDone("Your Anthropic API key was rejected. Check it in Settings → Claude.");
        }
        catch (Exception e) { onDone("Couldn't reach Claude: " + e.Message); }
    }
}
