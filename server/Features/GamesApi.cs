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
            steamAppId INTEGER,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            cover BLOB,
            coverMime TEXT,
            created TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_games_name ON games(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS ix_games_steamAppId ON games(steamAppId);");

        var tableSql = (string?)Db.Row("SELECT sql FROM sqlite_master WHERE type='table' AND name='games'")?["sql"];
        if (tableSql != null && tableSql.Contains("steamAppId INTEGER UNIQUE", StringComparison.OrdinalIgnoreCase))
        {
            Db.Exec(@"
                CREATE TABLE games_new(
                    id INTEGER PRIMARY KEY,
                    steamAppId INTEGER,
                    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    cover BLOB,
                    coverMime TEXT,
                    created TEXT
                );
                INSERT INTO games_new SELECT id, steamAppId, name, cover, coverMime, created FROM games;
                DROP TABLE games;
                ALTER TABLE games_new RENAME TO games;
                CREATE INDEX IF NOT EXISTS ix_games_name ON games(name COLLATE NOCASE);
                CREATE INDEX IF NOT EXISTS ix_games_steamAppId ON games(steamAppId);
            ");
        }

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

        var gcols = Db.Rows("PRAGMA table_info(games)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!gcols.Contains("hidden")) Db.Exec("ALTER TABLE games ADD COLUMN hidden INTEGER DEFAULT 0");      // 1 = adult content or not a game: never offered or accepted
        if (!gcols.Contains("verified")) Db.Exec("ALTER TABLE games ADD COLUMN verified INTEGER DEFAULT 0");  // 1 = checked against Steam (or built in)
        Cleanup();
    }

    // ---------- the catalog rules: only real games, never adult ones ----------

    /// <summary>Titles containing these words are never offered or accepted (checked on top of Steam's own content ratings).</summary>
    static readonly System.Text.RegularExpressions.Regex NsfwWords = new(
        @"(?<!\w)(hentai|porn\w*|erotic\w*|eroge|ecchi|nsfw|xxx|lewd|nudes?|nudist|uncensored|sex|sexy|sexual|sexually|milf|futa|bdsm|fetish|orgasm|naughty|slut\w*|boobs?|tits|fap\w*|onlyfans|cum|rule ?34|r-?18|18\+|adults? only)(?!\w)",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled);
    public static bool IsNsfwName(string? name) => !string.IsNullOrEmpty(name) && NsfwWords.IsMatch(name);

    static bool IsBuiltIn(string name) => Db.Games.Contains(name, StringComparer.OrdinalIgnoreCase);

    /// <summary>The catalog's spelling of a real, allowed game, or null. Free-text names, adult titles and unknown games all give null.</summary>
    public static string? Canonical(string? raw)
    {
        var name = Clean(raw, 80);
        if (name.Length < 2 || IsNsfwName(name)) return null;
        var r = Db.Row("SELECT name, steamAppId, COALESCE(hidden,0) hidden FROM games WHERE name=@n COLLATE NOCASE", ("@n", name));
        if (r == null || Convert.ToInt32(r["hidden"]) == 1) return null;
        var canon = (string)r["name"]!;
        return IsBuiltIn(canon) || (r["steamAppId"] is long sid && sid > 0) ? canon : null;
    }

    /// <summary>Keeps only real, allowed games (catalog spelling, no duplicates).</summary>
    public static string[] FilterKnown(IEnumerable<string?>? names, int max) =>
        (names ?? Array.Empty<string?>()).Select(Canonical).Where(x => x != null).Select(x => x!).Distinct(StringComparer.OrdinalIgnoreCase).Take(max).ToArray();

    /// <summary>One-time and every-start tidy-up: free-text games from before are removed from the catalog and from profiles.</summary>
    static void Cleanup()
    {
        foreach (var r in Db.Rows("SELECT id, name, steamAppId FROM games"))
        {
            var name = (string)r["name"]!; var id = (long)r["id"]!;
            bool builtin = IsBuiltIn(name), steam = r["steamAppId"] is long s && s > 0;
            if (!builtin && !steam) { Db.Exec("DELETE FROM games WHERE id=@i", ("@i", id)); continue; }
            if (IsNsfwName(name)) Db.Exec("UPDATE games SET hidden=1 WHERE id=@i", ("@i", id));
            else if (builtin) Db.Exec("UPDATE games SET hidden=0, verified=1 WHERE id=@i", ("@i", id));
        }
        foreach (var u in Db.Rows("SELECT id, games, playing FROM users"))
        {
            var uid = (long)u["id"]!;
            string[] old; try { old = System.Text.Json.JsonSerializer.Deserialize<string[]>((string)u["games"]!) ?? Array.Empty<string>(); } catch { old = Array.Empty<string>(); }
            var kept = FilterKnown(old, 12);
            if (!kept.SequenceEqual(old)) Db.Exec("UPDATE users SET games=@g WHERE id=@i", ("@g", System.Text.Json.JsonSerializer.Serialize(kept)), ("@i", uid));
            if (u["playing"] is string pl && pl.Length > 0 && Canonical(WebUtility.HtmlDecode(pl)) == null)
                Db.Exec("UPDATE users SET playing=NULL WHERE id=@i", ("@i", uid));
        }
        try
        {
            foreach (var g in Db.Rows("SELECT DISTINCT game FROM user_games"))
                if (Canonical(g["game"] as string) == null) Db.Exec("DELETE FROM user_games WHERE game=@g", ("@g", g["game"]));
        }
        catch { /* the per-game details table may not exist yet on a brand-new database */ }
    }

    /// <summary>Asks Steam about each app: true = a real game with no adult-only / frequent-nudity rating; false = adult or not a game. Apps we couldn't check are left out.</summary>
    static async Task<Dictionary<long, bool>> VerifyAsync(IEnumerable<long> ids)
    {
        var res = new System.Collections.Concurrent.ConcurrentDictionary<long, bool>();
        using var gate = new SemaphoreSlim(6);
        await Task.WhenAll(ids.Distinct().Select(async id =>
        {
            await gate.WaitAsync();
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(4));
                using var resp = await http.GetAsync($"https://store.steampowered.com/api/appdetails?appids={id}&l=english&cc=US", cts.Token);
                if (!resp.IsSuccessStatusCode) return;
                using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync(cts.Token), cancellationToken: cts.Token);
                if (!doc.RootElement.TryGetProperty(id.ToString(), out var e) || !e.TryGetProperty("success", out var ok) || ok.ValueKind != JsonValueKind.True) return;
                if (!e.TryGetProperty("data", out var d)) return;
                var type = d.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : "";
                bool adult = false;   // Steam content descriptors: 3 = adult only sexual content, 4 = frequent nudity or sexual content
                if (d.TryGetProperty("content_descriptors", out var cd) && cd.TryGetProperty("ids", out var idList) && idList.ValueKind == JsonValueKind.Array)
                    foreach (var x in idList.EnumerateArray()) if (x.TryGetInt32(out var n) && (n == 3 || n == 4)) adult = true;
                res[id] = type == "game" && !adult;
            }
            catch { /* timed out or Steam is busy: unknown, so it isn't shown */ }
            finally { gate.Release(); }
        }));
        return new Dictionary<long, bool>(res);
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
                                    FROM games WHERE COALESCE(hidden,0)=0 AND (verified=1 OR steamAppId IS NOT NULL) ORDER BY id ASC LIMIT 60");
                return Results.Json(pop.Where(r => !IsNsfwName((string)r["name"]!)).Take(30).Select(FormatGame));
            }

            if (Limited($"gs:{CurrentUser(c) ?? 0}", 60, TimeSpan.FromMinutes(1), true))
                return Err("Slow down.", 429);

            // 1. Fetch matching local games first
            var like = "%" + q.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            var localRows = Db.Rows(@"SELECT id, steamAppId, name, (cover IS NOT NULL) hasCover
                                      FROM games WHERE name LIKE @q ESCAPE '\' AND COALESCE(hidden,0)=0 AND (verified=1 OR steamAppId IS NOT NULL) LIMIT 25", ("@q", like));
            var results = new Dictionary<string, GameResult>(StringComparer.OrdinalIgnoreCase);

            foreach (var r in localRows)
            {
                if (IsNsfwName((string)r["name"]!)) continue;
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
                        var cands = new List<(string Name, long Id)>();
                        foreach (var item in items.EnumerateArray())
                        {
                            if (!item.TryGetProperty("name", out var nameProp) || !item.TryGetProperty("id", out var idProp)) continue;
                            var sName = Clean(nameProp.GetString(), 80);
                            if (string.IsNullOrWhiteSpace(sName) || IsNsfwName(sName)) continue;
                            cands.Add((sName, idProp.GetInt64()));
                        }
                        // Anything we haven't vetted yet is checked against Steam's own ratings before it can be shown or chosen.
                        var vetted = cands.ToDictionary(x => x.Name, x => Db.Row("SELECT COALESCE(hidden,0) hidden, COALESCE(verified,0) verified FROM games WHERE name=@n COLLATE NOCASE", ("@n", x.Name)), StringComparer.OrdinalIgnoreCase);
                        var verdict = await VerifyAsync(cands.Where(x => { var v = vetted[x.Name]; return v == null || (Convert.ToInt32(v["verified"]) == 0 && Convert.ToInt32(v["hidden"]) == 0); }).Take(12).Select(x => x.Id));
                        foreach (var cnd in cands)
                        {
                            var ex = vetted[cnd.Name];
                            if (ex != null && Convert.ToInt32(ex["hidden"]) == 1) continue;
                            if (ex == null || Convert.ToInt32(ex["verified"]) == 0)
                            {
                                if (!verdict.TryGetValue(cnd.Id, out var fine)) continue;      // couldn't be checked right now: not shown, not saved
                                Db.Exec(@"INSERT INTO games(steamAppId, name, created, hidden, verified) VALUES(@aid, @n, @t, @h, 1)
                                          ON CONFLICT(name) DO UPDATE SET steamAppId=COALESCE(games.steamAppId, @aid), hidden=@h, verified=1",
                                        ("@aid", cnd.Id), ("@n", cnd.Name), ("@t", now), ("@h", fine ? 0 : 1));
                                if (!fine) continue;
                            }
                            var row = Db.Row("SELECT id, steamAppId, name, (cover IS NOT NULL) hasCover FROM games WHERE name=@n COLLATE NOCASE AND COALESCE(hidden,0)=0", ("@n", cnd.Name));
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

        // There is deliberately no "add a custom game" endpoint: the catalog only grows from vetted Steam results.
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
        var lower = name.Trim().ToLowerInvariant();
        string svg;
        if (lower.Contains("minecraft") || lower.Contains("lunar client"))
        {
            svg = @"<svg xmlns=""http://www.w3.org/2000/svg"" width=""231"" height=""87"" viewBox=""0 0 231 87"">
  <rect width=""100%"" height=""100%"" fill=""#151912""/>
  <g transform=""translate(18, 19)"">
    <rect width=""48"" height=""48"" rx=""6"" fill=""#573d26""/>
    <rect width=""48"" height=""18"" rx=""3"" fill=""#5c9e31""/>
    <rect x=""6"" y=""18"" width=""8"" height=""8"" fill=""#5c9e31""/>
    <rect x=""22"" y=""18"" width=""10"" height=""10"" fill=""#5c9e31""/>
    <rect x=""36"" y=""18"" width=""8"" height=""6"" fill=""#5c9e31""/>
  </g>
  <text x=""78"" y=""51"" fill=""#8dd95b"" font-family=""system-ui, -apple-system, sans-serif"" font-size=""19"" font-weight=""700"">Minecraft</text>
</svg>";
        }
        else if (lower.Contains("roblox"))
        {
            svg = @"<svg xmlns=""http://www.w3.org/2000/svg"" width=""231"" height=""87"" viewBox=""0 0 231 87"">
  <rect width=""100%"" height=""100%"" fill=""#121316""/>
  <g transform=""translate(20, 19) rotate(-14, 24, 24)"">
    <rect x=""2"" y=""2"" width=""44"" height=""44"" rx=""8"" fill=""#e2231a""/>
    <rect x=""17"" y=""17"" width=""14"" height=""14"" rx=""3"" fill=""#121316""/>
  </g>
  <text x=""78"" y=""51"" fill=""#ffffff"" font-family=""system-ui, -apple-system, sans-serif"" font-size=""20"" font-weight=""700"">Roblox</text>
</svg>";
        }
        else if (lower.Contains("valorant"))
        {
            svg = @"<svg xmlns=""http://www.w3.org/2000/svg"" width=""231"" height=""87"" viewBox=""0 0 231 87"">
  <rect width=""100%"" height=""100%"" fill=""#0f1923""/>
  <g transform=""translate(20, 20)"">
    <path d=""M5 6 L23 42 L32 42 L46 6 L33 6 L23 28 L17 6 Z"" fill=""#ff4655""/>
  </g>
  <text x=""78"" y=""51"" fill=""#ece8e1"" font-family=""system-ui, -apple-system, sans-serif"" font-size=""19"" font-weight=""700"">Valorant</text>
</svg>";
        }
        else if (lower.Contains("fortnite"))
        {
            svg = @"<svg xmlns=""http://www.w3.org/2000/svg"" width=""231"" height=""87"" viewBox=""0 0 231 87"">
  <rect width=""100%"" height=""100%"" fill=""#11162b""/>
  <g transform=""translate(20, 18)"">
    <rect width=""44"" height=""50"" rx=""9"" fill=""#2756ff""/>
    <text x=""12"" y=""39"" fill=""#ffffff"" font-family=""sans-serif"" font-size=""38"" font-style=""italic"" font-weight=""900"">F</text>
  </g>
  <text x=""78"" y=""51"" fill=""#4ec5ff"" font-family=""system-ui, -apple-system, sans-serif"" font-size=""19"" font-style=""italic"" font-weight=""800"">FORTNITE</text>
</svg>";
        }
        else if (lower.Contains("league of legends") || lower.Contains("lol"))
        {
            svg = @"<svg xmlns=""http://www.w3.org/2000/svg"" width=""231"" height=""87"" viewBox=""0 0 231 87"">
  <rect width=""100%"" height=""100%"" fill=""#091428""/>
  <g transform=""translate(22, 19)"">
    <path d=""M6 6 L18 6 L18 36 L38 36 L38 46 L6 46 Z"" fill=""#c89b3c""/>
  </g>
  <text x=""78"" y=""51"" fill=""#f0e6d2"" font-family=""system-ui, -apple-system, sans-serif"" font-size=""18"" font-weight=""700"">League</text>
</svg>";
        }
        else
        {
            var words = name.Split(new[] { ' ', '-', '_' }, StringSplitOptions.RemoveEmptyEntries);
            var initials = string.Join("", words.Take(3).Select(w => char.ToUpperInvariant(w[0])));
            if (string.IsNullOrEmpty(initials)) initials = "G";

            svg = $@"<svg xmlns=""http://www.w3.org/2000/svg"" width=""231"" height=""87"" viewBox=""0 0 231 87"">
  <rect width=""100%"" height=""100%"" fill=""#1e2029""/>
  <circle cx=""36"" cy=""43"" r=""22"" fill=""#2d3270""/>
  <path d=""M28 43h16M36 35v16"" stroke=""#9ea8ff"" stroke-width=""3.5"" stroke-linecap=""round""/>
  <text x=""72"" y=""49"" fill=""#e0e2ec"" font-family=""system-ui, -apple-system, sans-serif"" font-size=""16"" font-weight=""600"">{WebUtility.HtmlEncode(name)}</text>
</svg>";
        }

        c.Response.Headers["Cache-Control"] = "public, max-age=86400";
        return Results.Content(svg, "image/svg+xml");
    }
}

public record GameResult(long Id, string Name, long? SteamAppId, string? CoverUrl);
