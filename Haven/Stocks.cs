using System.Net.Http;
using System.Text.Json;

namespace Haven;

public sealed record StockQuote(string Symbol, string Name, double Price, double ChangePercent, string Currency, double[] Spark);

/// <summary>Quotes for the Stocks widget, from Yahoo Finance's public chart feed (no account needed).</summary>
static class Stocks
{
    static readonly HttpClient Http = CreateClient();
    static readonly Dictionary<string, (DateTime At, StockQuote Quote)> Cache = new();

    static HttpClient CreateClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
        c.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Haven");
        return c;
    }

    public static async Task<List<StockQuote>> GetAsync(IEnumerable<string> symbols)
    {
        var tasks = symbols.Select(s => s.Trim().ToUpperInvariant()).Where(s => s.Length is > 0 and < 16).Distinct().Take(8).Select(OneAsync);
        var results = await Task.WhenAll(tasks);
        return results.Where(r => r != null).Select(r => r!).ToList();
    }

    static async Task<StockQuote?> OneAsync(string symbol)
    {
        lock (Cache) if (Cache.TryGetValue(symbol, out var c) && DateTime.Now - c.At < TimeSpan.FromMinutes(2)) return c.Quote;
        try
        {
            var json = await Http.GetStringAsync($"https://query1.finance.yahoo.com/v8/finance/chart/{Uri.EscapeDataString(symbol)}?range=1d&interval=15m");
            using var doc = JsonDocument.Parse(json);
            var result = doc.RootElement.GetProperty("chart").GetProperty("result")[0];
            var meta = result.GetProperty("meta");
            double price = meta.GetProperty("regularMarketPrice").GetDouble();
            double prev = meta.TryGetProperty("chartPreviousClose", out var pc) ? pc.GetDouble() : meta.TryGetProperty("previousClose", out var p2) ? p2.GetDouble() : price;
            double change = meta.TryGetProperty("regularMarketChangePercent", out var cp) ? cp.GetDouble() : prev == 0 ? 0 : (price - prev) / prev * 100;
            string name = meta.TryGetProperty("shortName", out var sn) ? sn.GetString() ?? symbol : meta.TryGetProperty("longName", out var ln) ? ln.GetString() ?? symbol : symbol;
            var spark = new List<double>();
            if (result.TryGetProperty("indicators", out var ind) && ind.GetProperty("quote")[0].TryGetProperty("close", out var closes))
                foreach (var v in closes.EnumerateArray()) if (v.ValueKind == JsonValueKind.Number) spark.Add(Math.Round(v.GetDouble(), 2));
            var q = new StockQuote(symbol, name, price, Math.Round(change, 2), meta.TryGetProperty("currency", out var cur) ? cur.GetString() ?? "" : "", spark.ToArray());
            lock (Cache) Cache[symbol] = (DateTime.Now, q);
            return q;
        }
        catch { return null; }
    }
}
