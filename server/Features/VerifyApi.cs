using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using static Core;

/// <summary>
/// Verified gamer tags: prove you own a Steam or Discord account instead of just typing a name.
/// Steam uses "Sign in through Steam" (OpenID: Steam confirms who you are, we never see a password). Discord uses OAuth with the `identify` scope only
/// (needs an app registered by the server owner: TW_DISCORD_CLIENT_ID / TW_DISCORD_CLIENT_SECRET). One real account can only be linked to one Third Wheel user.
/// The callback links carry a signed, short-lived state so they work from any browser, and the only servers ever contacted are Steam's and Discord's own.
/// </summary>
public static class VerifyApi
{
    static readonly byte[] StateKey = RandomNumberGenerator.GetBytes(32);   // new on each start: half-finished sign-ins simply expire
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };
    static string DiscordId => Environment.GetEnvironmentVariable("TW_DISCORD_CLIENT_ID") ?? "";
    static string DiscordSecret => Environment.GetEnvironmentVariable("TW_DISCORD_CLIENT_SECRET") ?? "";
    static readonly Regex SteamClaim = new(@"^https://steamcommunity\.com/openid/id/(\d{17})$", RegexOptions.Compiled);

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS verified_tags(userId INTEGER NOT NULL, platform TEXT NOT NULL, handle TEXT NOT NULL, extId TEXT NOT NULL, at TEXT, PRIMARY KEY(userId, platform));
CREATE UNIQUE INDEX IF NOT EXISTS ux_verified_ext ON verified_tags(platform, extId);");
    }

    /// <summary>The verified tags shown on a profile (platform + the name on that platform).</summary>
    public static List<object> For(long uid) =>
        Db.Rows("SELECT platform, handle FROM verified_tags WHERE userId=@u ORDER BY platform", ("@u", uid)).Select(r => (object)new { platform = (string)r["platform"]!, handle = (string)r["handle"]! }).ToList();

    /// <summary>The address the browser used. Behind the Caddy proxy (same machine) the forwarded headers say what it was; otherwise they are ignored.</summary>
    static string Origin(HttpContext c)
    {
        var ip = c.Connection.RemoteIpAddress;
        if (ip != null && IPAddress.IsLoopback(ip))
        {
            var host = c.Request.Headers["X-Forwarded-Host"].ToString().Split(',')[0].Trim();
            var proto = c.Request.Headers["X-Forwarded-Proto"].ToString().Split(',')[0].Trim();
            if (host.Length > 0 && Regex.IsMatch(host, @"^[A-Za-z0-9.\-]+(:\d{1,5})?$")) return $"{(proto == "http" ? "http" : "https")}://{host}";
        }
        return $"{c.Request.Scheme}://{c.Request.Host}";
    }
    static string Sign(string data) => Convert.ToHexString(HMACSHA256.HashData(StateKey, Encoding.UTF8.GetBytes(data)));
    static string MakeState(long uid, string provider) { var e = DateTimeOffset.UtcNow.AddMinutes(15).ToUnixTimeSeconds(); var d = $"{provider}:{uid}:{e}"; return $"{uid}.{e}.{Sign(d)}"; }
    static long? CheckState(string? state, string provider)
    {
        var p = (state ?? "").Split('.');
        if (p.Length != 3 || !long.TryParse(p[0], out var uid) || !long.TryParse(p[1], out var e) || e < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;
        var want = Sign($"{provider}:{uid}:{e}");
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(want), Encoding.ASCII.GetBytes(p[2])) ? uid : null;
    }

    public record ImportIn(string[]? Games);
    static string SteamKey
    {
        get
        {
            var env = Environment.GetEnvironmentVariable("TW_STEAM_API_KEY");
            if (!string.IsNullOrWhiteSpace(env)) return env.Trim();
            return "1385F19AAB121B471ED7B4F19BFAE047";
        }
    }
    static readonly Dictionary<string, (DateTime At, List<(long, string, int)> Games)> LibCache = new();

    /// <summary>The games a Steam account owns, with hours played. Uses the Steam Web API when a key is set (TW_STEAM_API_KEY).
    /// If no API key is set, attempts to read recent games from the profile XML.
    /// Throws KeyNotFoundException when an API key is required, or InvalidOperationException when the profile's game list is private. Cached for 10 minutes.</summary>
    
    static async Task<string> ResolveSteamName(string steamId)
    {
        var name = steamId;
        if (SteamKey.Length > 0 && Regex.IsMatch(SteamKey, @"^[A-Za-z0-9]{16,64}$"))
        {
            try
            {
                var json = await Http.GetStringAsync($"https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={SteamKey}&steamids={steamId}");
                var root = JsonDocument.Parse(json).RootElement.GetProperty("response").GetProperty("players");
                if (root.GetArrayLength() > 0)
                {
                    var player = root[0];
                    var persona = player.TryGetProperty("personaname", out var pn) ? pn.GetString()?.Trim() : null;
                    var profileUrl = player.TryGetProperty("profileurl", out var pu) ? pu.GetString()?.Trim() : null;
                    string? vanity = null;
                    if (!string.IsNullOrEmpty(profileUrl))
                    {
                        var vm = Regex.Match(profileUrl, @"/id/([^/]+)/?");
                        if (vm.Success) vanity = vm.Groups[1].Value.Trim();
                    }

                    if (!string.IsNullOrEmpty(vanity) && !string.IsNullOrEmpty(persona) && !vanity.Equals(persona, StringComparison.OrdinalIgnoreCase))
                    {
                        name = $"{persona} ({vanity})";
                    }
                    else if (!string.IsNullOrEmpty(vanity))
                    {
                        name = vanity;
                    }
                    else if (!string.IsNullOrEmpty(persona))
                    {
                        name = persona;
                    }
                }
            }
            catch { }
        }

        if (name == steamId)
        {
            try
            {
                var xml = await Http.GetStringAsync($"https://steamcommunity.com/profiles/{steamId}/?xml=1");
                var n = Regex.Match(xml, @"<steamID><!\[CDATA\[(.{1,64}?)\]\]></steamID>");
                if (n.Success) name = n.Groups[1].Value.Trim();
                var c = Regex.Match(xml, @"<customURL><!\[CDATA\[(.{1,64}?)\]\]></customURL>");
                if (c.Success)
                {
                    var custom = c.Groups[1].Value.Trim();
                    if (!string.IsNullOrEmpty(custom) && !custom.Equals(name, StringComparison.OrdinalIgnoreCase))
                        name = $"{name} ({custom})";
                }
            }
            catch { }
        }

        name = new string(name.Where(ch => !char.IsControl(ch)).ToArray());
        return name.Length > 0 ? name : steamId;
    }

    static async Task<List<(long App, string Name, int Hours)>> FetchOwned(string steamId)
    {
        lock (LibCache) if (LibCache.TryGetValue(steamId, out var hit) && DateTime.UtcNow - hit.At < TimeSpan.FromMinutes(10)) return hit.Games.Select(x => (x.Item1, x.Item2, x.Item3)).ToList();
        var list = new List<(long, string, int)>();
        if (SteamKey.Length > 0 && Regex.IsMatch(SteamKey, @"^[A-Za-z0-9]{16,64}$"))
        {
            var json = await Http.GetStringAsync($"https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key={SteamKey}&steamid={steamId}&include_appinfo=1&include_played_free_games=1&format=json");
            var root = JsonDocument.Parse(json).RootElement.GetProperty("response");
            if (!root.TryGetProperty("games", out var gs)) throw new InvalidOperationException("private");
            foreach (var g in gs.EnumerateArray())
                list.Add((g.GetProperty("appid").GetInt64(), g.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "", g.TryGetProperty("playtime_forever", out var pt) ? pt.GetInt32() / 60 : 0));
        }
        else
        {
            // Fallback: Valve deprecated /games?tab=all&xml=1. Try reading mostPlayedGames from the public profile XML if present.
            try
            {
                var xml = await Http.GetStringAsync($"https://steamcommunity.com/profiles/{steamId}/?xml=1");
                if (xml.Contains("<privacyState>private</privacyState>", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("private");
                if (xml.Contains("<mostPlayedGames>", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (Match m in Regex.Matches(xml, @"<mostPlayedGame>(.*?)</mostPlayedGame>", RegexOptions.Singleline))
                    {
                        var b = m.Groups[1].Value;
                        var app = Regex.Match(b, @"<gameLink>.*?/app/(\d+)</gameLink>");
                        var nm = Regex.Match(b, @"<gameName><!\[CDATA\[(.*?)\]\]></gameName>", RegexOptions.Singleline);
                        var hrs = Regex.Match(b, @"<hoursOnRecord>([\d,\.]+)</hoursOnRecord>");
                        if (!app.Success) continue;
                        var h = hrs.Success && double.TryParse(hrs.Groups[1].Value.Replace(",", ""), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var hv) ? (int)hv : 0;
                        list.Add((long.Parse(app.Groups[1].Value), nm.Success ? WebUtility.HtmlDecode(nm.Groups[1].Value) : "", h));
                    }
                }
            }
            catch (InvalidOperationException) { throw; }
            catch { /* network error or Steam busy */ }

            if (list.Count == 0)
            {
                // No API key and XML didn't have mostPlayedGames: an API key is required on the server to query full libraries from Steam.
                throw new KeyNotFoundException("needs_api_key");
            }
        }
        lock (LibCache) LibCache[steamId] = (DateTime.UtcNow, list);
        return list.Select(x => (x.Item1, x.Item2, x.Item3)).ToList();
    }

    static IResult Page(string title, string message, bool ok)
    {
        var t = WebUtility.HtmlEncode(title); var m = WebUtility.HtmlEncode(message);
        var check = ok ? "\u2713 " : "";
        var okJs = ok ? "true" : "false";
        var script = $"<script>if(window.opener){{try{{window.opener.postMessage({{type:'tw:verified',ok:{okJs},title:'{t}'}},'*');}}catch(e){{}}if({okJs})setTimeout(function(){{try{{window.close();}}catch(e){{}}}},1200);}}</script>";
        var html = $"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{t}</title>" +
            "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fafafa;font:16px system-ui,sans-serif}.c{max-width:420px;margin:24px;padding:28px;border:1px solid #26262c;border-radius:16px;background:#111114;text-align:center}" +
            "h1{font-size:22px;margin:0 0 10px}p{color:#a3a3ad;line-height:1.5}a{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:10px;background:#4f5ee6;color:#fff;text-decoration:none;font-weight:600}</style></head>" +
            $"<body><div class=\"c\"><h1>{check}{t}</h1><p>{m}</p><a href=\"/#/settings/connections\">Back to Third Wheel</a></div>{script}</body></html>";
        return Results.Content(html, "text/html; charset=utf-8");
    }

    static bool Save(long uid, string platform, string handle, string extId, out string error)
    {
        error = "";
        var other = Db.Scalar("SELECT userId FROM verified_tags WHERE platform=@p AND extId=@e", ("@p", platform), ("@e", extId));
        if (other != null && Convert.ToInt64(other) != uid) { error = $"That {platform} account is already linked to another Third Wheel user."; return false; }
        Db.Exec("INSERT INTO verified_tags(userId,platform,handle,extId,at) VALUES(@u,@p,@h,@e,@t) ON CONFLICT(userId,platform) DO UPDATE SET handle=@h, extId=@e, at=@t",
            ("@u", uid), ("@p", platform), ("@h", Enc(handle)), ("@e", extId), ("@t", Now()));
        return true;
    }

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("verify/providers", (HttpContext c) => WithUser(c, _ => Results.Json(new { steam = true, discord = DiscordId.Length > 0 && DiscordSecret.Length > 0 })));
        api.MapGet("verify/mine", (HttpContext c) => WithUser(c, me => Results.Json(For(me))));
        api.MapDelete("verify/{platform}", (HttpContext c, string platform) => WithUser(c, me =>
        {
            Db.Exec("DELETE FROM verified_tags WHERE userId=@u AND platform=@p COLLATE NOCASE", ("@u", me), ("@p", platform));
            return Results.Json(new { ok = true });
        }));

        // ---------- Steam library import: the games you own (only ones that exist in our catalog) with hours played ----------
        api.MapGet("verify/steam/library", async (HttpContext c) =>
        {
            var me = CurrentUser(c); if (me == null) return Err("Not signed in.", 401);
            var steamId = Db.Scalar("SELECT extId FROM verified_tags WHERE userId=@u AND platform='Steam'", ("@u", me)) as string;
            if (steamId == null) return Err("Verify your Steam account first.", 409);
            if (Limited($"lib:{me}", 8, TimeSpan.FromHours(1), true)) return Err("Try again in a little while.", 429);
            List<(long App, string Name, int Hours)> owned;
            try { owned = await FetchOwned(steamId); }
            catch (KeyNotFoundException) { return Results.Json(new { needsKey = true, isPrivate = false, games = Array.Empty<object>(), unmatched = 0 }); }
            catch (InvalidOperationException) { return Results.Json(new { needsKey = false, isPrivate = true, games = Array.Empty<object>(), unmatched = 0 }); }
            catch { return Err("Couldn't reach Steam. Try again in a moment.", 502); }
            var catalog = Db.Rows("SELECT name, steamAppId FROM games WHERE COALESCE(hidden,0)=0");
            var byApp = catalog.Where(r => r["steamAppId"] != null).GroupBy(r => Convert.ToInt64(r["steamAppId"])).ToDictionary(g => g.Key, g => (string)g.First()["name"]!);
            var byName = catalog.GroupBy(r => ((string)r["name"]!).ToLowerInvariant()).ToDictionary(g => g.Key, g => (string)g.First()["name"]!);
            var favs = JsonSerializer.Deserialize<string[]>(Db.Scalar("SELECT games FROM users WHERE id=@i", ("@i", me)) as string ?? "[]") ?? Array.Empty<string>();
            var list = new List<object>(); int matched = 0;
            foreach (var g in owned.OrderByDescending(x => x.Hours))
            {
                var name = byApp.GetValueOrDefault(g.App) ?? byName.GetValueOrDefault(g.Name.ToLowerInvariant());
                if (name == null && g.App > 0 && !string.IsNullOrWhiteSpace(g.Name))
                {
                    var cleanName = Core.Clean(g.Name, 80);
                    if (cleanName.Length >= 2 && !GamesApi.IsNsfwName(cleanName))
                    {
                        Db.Exec("INSERT OR IGNORE INTO games(name, steamAppId, hidden) VALUES(@n, @s, 0)", ("@n", cleanName), ("@s", g.App));
                        name = cleanName;
                        byApp[g.App] = cleanName;
                        byName[cleanName.ToLowerInvariant()] = cleanName;
                    }
                }
                if (name == null) continue;
                matched++;
                list.Add(new { name, hours = g.Hours, inFavorites = favs.Contains(name, StringComparer.OrdinalIgnoreCase) });
            }
            return Results.Json(new { isPrivate = false, games = list.ToList(), unmatched = owned.Count - matched, max = 200 });
        });

        api.MapPost("verify/steam/import", async (HttpContext c, ImportIn b) =>
        {
            var me = CurrentUser(c); if (me == null) return Err("Not signed in.", 401);
            var steamId = Db.Scalar("SELECT extId FROM verified_tags WHERE userId=@u AND platform='Steam'", ("@u", me)) as string;
            if (steamId == null) return Err("Verify your Steam account first.", 409);
            if (Limited($"imp:{me}", 10, TimeSpan.FromHours(1), true)) return Err("Try again in a little while.", 429);
            var want = (b.Games ?? Array.Empty<string>()).Select(GamesApi.Canonical).Where(x => x != null).Cast<string>().Distinct(StringComparer.OrdinalIgnoreCase).Take(200).ToList();
            if (want.Count == 0) return Err("Pick at least one game.");
            List<(long App, string Name, int Hours)> owned;
            try { owned = await FetchOwned(steamId); } catch { return Err("Couldn't reach Steam. Try again in a moment.", 502); }   // hours come from Steam, never from the browser
            var catalog = Db.Rows("SELECT name, steamAppId FROM games WHERE COALESCE(hidden,0)=0");
            var byApp = catalog.Where(r => r["steamAppId"] != null).GroupBy(r => Convert.ToInt64(r["steamAppId"])).ToDictionary(g => g.Key, g => (string)g.First()["name"]!);
            var byName = catalog.GroupBy(r => ((string)r["name"]!).ToLowerInvariant()).ToDictionary(g => g.Key, g => (string)g.First()["name"]!);
            var hours = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var g in owned)
            {
                var n = byApp.GetValueOrDefault(g.App) ?? byName.GetValueOrDefault(g.Name.ToLowerInvariant());
                if (n == null && g.App > 0 && !string.IsNullOrWhiteSpace(g.Name))
                {
                    var cleanName = Core.Clean(g.Name, 80);
                    if (cleanName.Length >= 2 && !GamesApi.IsNsfwName(cleanName))
                    {
                        Db.Exec("INSERT OR IGNORE INTO games(name, steamAppId, hidden) VALUES(@n, @s, 0)", ("@n", cleanName), ("@s", g.App));
                        n = cleanName;
                    }
                }
                if (n != null) hours[n] = g.Hours;
            }
            var cur = (JsonSerializer.Deserialize<string[]>(Db.Scalar("SELECT games FROM users WHERE id=@i", ("@i", me)) as string ?? "[]") ?? Array.Empty<string>()).ToList();
            foreach (var g in want) { if (!cur.Contains(g, StringComparer.OrdinalIgnoreCase)) { if (cur.Count >= 200) break; cur.Add(g); } }
            Db.Exec("UPDATE users SET games=@g WHERE id=@i", ("@g", JsonSerializer.Serialize(cur)), ("@i", me));
            foreach (var g in want.Where(g => cur.Contains(g, StringComparer.OrdinalIgnoreCase)))
                Db.Exec("INSERT INTO user_games(userId,game,rank,role,hours) VALUES(@u,@g,'','',@h) ON CONFLICT(userId,game) DO UPDATE SET hours=@h", ("@u", me), ("@g", g), ("@h", hours.GetValueOrDefault(g)));
            return Results.Json(new { favoriteGames = cur });
        });

        // ---------- Steam ----------
        api.MapPost("verify/steam/start", (HttpContext c) => WithUser(c, me =>
        {
            if (Limited($"vs:{me}", 20, TimeSpan.FromHours(1), true)) return Err("Too many attempts. Try again later.", 429);
            var origin = Origin(c);
            var back = $"{origin}/api/verify/steam/callback?state={Uri.EscapeDataString(MakeState(me, "steam"))}";
            var q = new Dictionary<string, string>
            {
                ["openid.ns"] = "http://specs.openid.net/auth/2.0", ["openid.mode"] = "checkid_setup", ["openid.return_to"] = back, ["openid.realm"] = origin,
                ["openid.identity"] = "http://specs.openid.net/auth/2.0/identifier_select", ["openid.claimed_id"] = "http://specs.openid.net/auth/2.0/identifier_select"
            };
            return Results.Json(new { url = "https://steamcommunity.com/openid/login?" + string.Join("&", q.Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}")) });
        }));

        api.MapGet("verify/steam/callback", async (HttpContext c) =>
        {
            var qs = c.Request.Query;
            var uid = CheckState(qs["state"], "steam");
            if (uid == null) return Page("Link expired", "That sign-in took too long or isn't valid. Start again from Settings.", false);
            if (Limited($"vsc:{uid}", 20, TimeSpan.FromHours(1), true)) return Page("Too many attempts", "Try again later.", false);
            if (qs["openid.mode"] != "id_res") return Page("Not verified", "Steam sign-in was cancelled.", false);
            var expectedBack = $"{Origin(c)}/api/verify/steam/callback?state={Uri.EscapeDataString(qs["state"].ToString())}";
            if (qs["openid.return_to"] != expectedBack) return Page("Not verified", "That response didn't match the request.", false);
            var m = SteamClaim.Match(qs["openid.claimed_id"].ToString());
            if (!m.Success) return Page("Not verified", "Steam didn't return a valid account.", false);
            // ask Steam itself whether this response is genuine (it also makes the response single-use)
            var form = qs.Where(kv => kv.Key.StartsWith("openid.", StringComparison.Ordinal)).ToDictionary(kv => kv.Key, kv => kv.Value.ToString());
            form["openid.mode"] = "check_authentication";
            string reply;
            try { using var r = await Http.PostAsync("https://steamcommunity.com/openid/login", new FormUrlEncodedContent(form)); reply = await r.Content.ReadAsStringAsync(); }
            catch { return Page("Couldn't reach Steam", "Try again in a moment.", false); }
            if (!Regex.IsMatch(reply, @"(^|\n)is_valid:true\s*($|\n)")) return Page("Not verified", "Steam didn't confirm that sign-in.", false);

            var steamId = m.Groups[1].Value;
            var name = await ResolveSteamName(steamId);
            if (!Save(uid.Value, "Steam", name, steamId, out var err)) return Page("Already linked", err, false);
            return Page("Steam linked", $"Your Steam account “{name}” is now verified on your profile.", true);
        });

        api.MapPost("verify/steam/sync", async (HttpContext c) =>
        {
            var me = CurrentUser(c); if (me == null) return Err("Not signed in.", 401);
            var steamId = Db.Scalar("SELECT extId FROM verified_tags WHERE userId=@u AND platform='Steam'", ("@u", me)) as string;
            if (steamId == null) return Err("Verify your Steam account first.", 409);
            var name = steamId;
            try
            {
                var xml = await Http.GetStringAsync($"https://steamcommunity.com/profiles/{steamId}/?xml=1");
                var n = Regex.Match(xml, @"<steamID><!\[CDATA\[(.{1,64}?)\]\]></steamID>");
                if (n.Success) name = n.Groups[1].Value.Trim();
            }
            catch { return Err("Couldn't reach Steam.", 502); }
            name = new string(name.Where(ch => !char.IsControl(ch)).ToArray());
            if (name.Length == 0) name = steamId;
            Db.Exec("UPDATE verified_tags SET handle=@h, at=@t WHERE userId=@u AND platform='Steam'", ("@h", Enc(name)), ("@t", Now()), ("@u", me));
            return Results.Json(new { ok = true, handle = name });
        });

        // ---------- Discord ----------
        api.MapPost("verify/discord/start", (HttpContext c) => WithUser(c, me =>
        {
            if (DiscordId.Length == 0 || DiscordSecret.Length == 0) return Err("Discord linking isn't set up on this server.", 501);
            if (Limited($"vd:{me}", 20, TimeSpan.FromHours(1), true)) return Err("Too many attempts. Try again later.", 429);
            var redirect = $"{Origin(c)}/api/verify/discord/callback";
            return Results.Json(new { url = $"https://discord.com/oauth2/authorize?client_id={Uri.EscapeDataString(DiscordId)}&response_type=code&scope=identify&redirect_uri={Uri.EscapeDataString(redirect)}&state={Uri.EscapeDataString(MakeState(me, "discord"))}&prompt=consent" });
        }));

        api.MapGet("verify/discord/callback", async (HttpContext c) =>
        {
            var qs = c.Request.Query;
            var uid = CheckState(qs["state"], "discord");
            if (uid == null) return Page("Link expired", "That sign-in took too long or isn't valid. Start again from Settings.", false);
            if (Limited($"vdc:{uid}", 20, TimeSpan.FromHours(1), true)) return Page("Too many attempts", "Try again later.", false);
            var code = qs["code"].ToString();
            if (code.Length == 0 || code.Length > 200) return Page("Not verified", "Discord sign-in was cancelled.", false);
            try
            {
                using var tok = await Http.PostAsync("https://discord.com/api/oauth2/token", new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = DiscordId, ["client_secret"] = DiscordSecret, ["grant_type"] = "authorization_code", ["code"] = code, ["redirect_uri"] = $"{Origin(c)}/api/verify/discord/callback"
                }));
                if (!tok.IsSuccessStatusCode) return Page("Not verified", "Discord didn't accept that sign-in.", false);
                var access = JsonDocument.Parse(await tok.Content.ReadAsStringAsync()).RootElement.GetProperty("access_token").GetString();
                using var req = new HttpRequestMessage(HttpMethod.Get, "https://discord.com/api/users/@me");
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", access);
                using var me = await Http.SendAsync(req);
                if (!me.IsSuccessStatusCode) return Page("Not verified", "Couldn't read your Discord account.", false);
                var u = JsonDocument.Parse(await me.Content.ReadAsStringAsync()).RootElement;
                var id = u.GetProperty("id").GetString() ?? "";
                var uname = u.TryGetProperty("username", out var un) ? un.GetString() ?? "" : "";
                var disc = u.TryGetProperty("discriminator", out var d) ? d.GetString() ?? "0" : "0";
                var handle = disc is "0" or "" ? uname : $"{uname}#{disc}";
                handle = new string(handle.Where(ch => !char.IsControl(ch)).ToArray());
                if (!Regex.IsMatch(id, @"^\d{5,25}$") || handle.Length == 0) return Page("Not verified", "Discord returned something unexpected.", false);
                if (!Save(uid.Value, "Discord", handle, id, out var err)) return Page("Already linked", err, false);
                return Page("Discord linked", $"Your Discord account “{handle}” is now verified on your profile.", true);
            }
            catch { return Page("Couldn't reach Discord", "Try again in a moment.", false); }
        });
    }
}
