using System.Net;
using System.Text.Json;
using static Core;

/// <summary>
/// Game search via Steam Store API, local caching, cover thumbnail proxying,
/// non-Steam fallback catalog, and custom game entry.
/// </summary>
public static class GamesApi
{
    static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(6) };

    static GamesApi()
    {
        http.DefaultRequestHeaders.UserAgent.ParseAdd("ThirdWheel/1.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    }

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS games(
            id INTEGER PRIMARY KEY,
            steamAppId INTEGER UNIQUE,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            cover BLOB,
            coverMime TEXT,
            created TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_games_name ON games(name COLLATE NOCASE);");

        var knownSteam = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase)
        {
            ["Counter-Strike 2"] = 730,
            ["Apex Legends"] = 1172470,
            ["Dota 2"] = 570,
            ["Overwatch 2"] = 2357570,
            ["Rainbow Six Siege"] = 359550,
            ["Elden Ring"] = 1245620,
            ["Stardew Valley"] = 413150,
            ["Helldivers 2"] = 553850,
            ["Destiny 2"] = 1085660,
            ["Marvel Rivals"] = 2767030,
            ["Palworld"] = 1623730,
            ["Terraria"] = 105600,
            ["Among Us"] = 945360,
            ["Rocket League"] = 252950
        };

        var now = DateTime.UtcNow.ToString("o");
        foreach (var g in Db.Games)
        {
            var aid = knownSteam.TryGetValue(g, out var sid) ? (object)sid : DBNull.Value;
            Db.Exec(@"INSERT INTO games(name, steamAppId, created) VALUES(@n, @aid, @t)
                      ON CONFLICT(name) DO UPDATE SET steamAppId=COALESCE(games.steamAppId, @aid)",
                      ("@n", g), ("@aid", aid), ("@t", now));
        }
    }

    public static void EnsureGame(string? name)
    {
        name = Clean(name, 80);
        if (string.IsNullOrWhiteSpace(name)) return;
        Db.Exec("INSERT OR IGNORE INTO games(name, created) VALUES(@n, @t)",
            ("@n", name), ("@t", DateTime.UtcNow.ToString("o")));
    }

    public static void Map(RouteGroupBuilder api)
    {
        // Search games: returns popular/fallback on empty q, Steam + local results on query
        api.MapGet("games/search", async (HttpContext c, string? q) =>
        {
            q = (q ?? "").Trim();
            if (string.IsNullOrEmpty(q))
            {
                // Return popular games (built-in catalog + locally active)
                var pop = Db.Rows(@"SELECT id, steamAppId, name, (cover IS NOT NULL) hasCover 
                                    FROM games ORDER BY id ASC LIMIT 30");
                return Results.Json(pop.Select(FormatGame));
            }

            if (Limited($"gs:{CurrentUser(c) ?? 0}", 60, TimeSpan.FromMinutes(1), true))
                return Err("Slow down.", 429);

            // 1. Fetch matching local games first
            var like = "%" + q.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            var localRows = Db.Rows(@"SELECT id, steamAppId, name, (cover IS NOT NULL) hasCover 
                                      FROM games WHERE name LIKE @q ESCAPE '\' LIMIT 25", ("@q", like));
            var results = new Dictionary<string, GameResult>(StringComparer.OrdinalIgnoreCase);

            foreach (var r in localRows)
            {
                var g = FormatGame(r);
                results[g.Name] = g;
            }

            // 2. Query Steam Store Search API
            try
            {
                var steamUrl = $"https://store.steampowered.com/api/storesearch/?term={Uri.EscapeDataString(q)}&l=english&cc=US";
                using var resp = await http.GetAsync(steamUrl);
                if (resp.IsSuccessStatusCode)
                {
                    using var stream = await resp.Content.ReadAsStreamAsync();
                    using var doc = await JsonDocument.ParseAsync(stream);
                    if (doc.RootElement.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                    {
                        var now = DateTime.UtcNow.ToString("o");
                        foreach (var item in items.EnumerateArray())
                        {
                            if (!item.TryGetProperty("name", out var nameProp) || !item.TryGetProperty("id", out var idProp))
                                continue;

                            var sName = Clean(nameProp.GetString(), 80);
                            var sId = idProp.GetInt64();
                            if (string.IsNullOrWhiteSpace(sName)) continue;

                            // Insert or update in database
                            Db.Exec(@"INSERT INTO games(steamAppId, name, created) VALUES(@aid, @n, @t)
                                      ON CONFLICT(name) DO UPDATE SET steamAppId=COALESCE(games.steamAppId, @aid)",
                                    ("@aid", sId), ("@n", sName), ("@t", now));

                            var row = Db.Row("SELECT id, steamAppId, name, (cover IS NOT NULL) hasCover FROM games WHERE name=@n COLLATE NOCASE", ("@n", sName));
                            if (row != null)
                            {
                                var g = FormatGame(row);
                                results[g.Name] = g;
                            }
                        }
                    }
                }
            }
            catch
            {
                // Steam offline or timeout: fall back gracefully to local results
            }

            // 3. Fallback: match any Db.Games that aren't yet in results
            foreach (var fb in Db.Games)
            {
                if (fb.Contains(q, StringComparison.OrdinalIgnoreCase) && !results.ContainsKey(fb))
                {
                    var row = Db.Row("SELECT id, steamAppId, name, (cover IS NOT NULL) hasCover FROM games WHERE name=@n COLLATE NOCASE", ("@n", fb));
                    if (row != null) results[fb] = FormatGame(row);
                    else results[fb] = new GameResult(0, fb, null, null);
                }
            }

            // Sort: exact match first, then starts-with, then contains
            var sorted = results.Values
                .OrderByDescending(g => g.Name.Equals(q, StringComparison.OrdinalIgnoreCase) ? 3 :
                                        g.Name.StartsWith(q, StringComparison.OrdinalIgnoreCase) ? 2 : 1)
                .ThenBy(g => g.Name)
                .Take(25)
                .ToList();

            return Results.Json(sorted);
        });

        // Cover thumbnail endpoint: returns cached cover or fetches from Steam
        api.MapGet("games/cover/{id:long}", async (HttpContext c, long id) =>
        {
            var r = Db.Row("SELECT steamAppId, name, cover, coverMime FROM games WHERE id=@i", ("@i", id));
            if (r == null) return SvgPlaceholder(c, "Game");

            var name = (string)r["name"]!;
            if (r["cover"] is byte[] cachedCover && cachedCover.Length > 0)
            {
                c.Response.Headers["Cache-Control"] = "public, max-age=604800, immutable";
                c.Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
                return Results.File(cachedCover, (string?)r["coverMime"] ?? "image/jpeg");
            }

            // Cover not cached yet; try to download if steamAppId exists
            if (r["steamAppId"] is long steamId and > 0)
            {
                try
                {
                    var imgUrl = $"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{steamId}/capsule_231x87.jpg";
                    using var imgResp = await http.GetAsync(imgUrl);
                    if (imgResp.IsSuccessStatusCode)
                    {
                        var bytes = await imgResp.Content.ReadAsByteArrayAsync();
                        if (bytes.Length > 0)
                        {
                            Db.Exec("UPDATE games SET cover=@c, coverMime='image/jpeg' WHERE id=@i",
                                ("@c", bytes), ("@i", id));
                            c.Response.Headers["Cache-Control"] = "public, max-age=604800, immutable";
                            c.Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
                            return Results.File(bytes, "image/jpeg");
                        }
                    }
                }
                catch
                {
                    // Fall back to SVG placeholder
                }
            }

            return SvgPlaceholder(c, name);
        });

        // Add custom game entry
        api.MapPost("games/custom", (HttpContext c, CustomGameIn b) => WithUser(c, _ =>
        {
            var name = Clean(b.Name, 80);
            if (string.IsNullOrWhiteSpace(name) || name.Length < 2)
                return Err("Game name must be at least 2 characters.");

            var now = DateTime.UtcNow.ToString("o");
            Db.Exec("INSERT OR IGNORE INTO games(name, created) VALUES(@n, @t)", ("@n", name), ("@t", now));

            var row = Db.Row("SELECT id, steamAppId, name, (cover IS NOT NULL) hasCover FROM games WHERE name=@n COLLATE NOCASE", ("@n", name));
            return Results.Json(row != null ? FormatGame(row) : new GameResult(0, name, null, null));
        }));
    }

    static GameResult FormatGame(Dictionary<string, object?> r)
    {
        var id = (long)r["id"]!;
        var name = (string)r["name"]!;
        var steamId = r["steamAppId"] is long s ? (long?)s : null;
        var coverUrl = $"/api/games/cover/{id}";
        return new GameResult(id, name, steamId, coverUrl);
    }

    static IResult SvgPlaceholder(HttpContext c, string name)
    {
        var words = name.Split(new[] { ' ', '-', '_' }, StringSplitOptions.RemoveEmptyEntries);
        var initials = string.Join("", words.Take(3).Select(w => char.ToUpperInvariant(w[0])));
        if (string.IsNullOrEmpty(initials)) initials = "G";

        var svg = $@"<svg xmlns=""http://www.w3.org/2000/svg"" width=""231"" height=""87"" viewBox=""0 0 231 87"">
  <rect width=""100%"" height=""100%"" fill=""#1e2029""/>
  <circle cx=""36"" cy=""43"" r=""22"" fill=""#2d3270""/>
  <path d=""M28 43h16M36 35v16"" stroke=""#9ea8ff"" stroke-width=""3.5"" stroke-linecap=""round""/>
  <text x=""72"" y=""49"" fill=""#e0e2ec"" font-family=""system-ui, -apple-system, sans-serif"" font-size=""16"" font-weight=""600"">{WebUtility.HtmlEncode(name)}</text>
</svg>";

        c.Response.Headers["Cache-Control"] = "public, max-age=86400";
        c.Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
        return Results.Content(svg, "image/svg+xml");
    }
}

public record CustomGameIn(string? Name);
public record GameResult(long Id, string Name, long? SteamAppId, string? CoverUrl);
