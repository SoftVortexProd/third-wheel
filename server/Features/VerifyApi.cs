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

    static IResult Page(string title, string message, bool ok)
    {
        var t = WebUtility.HtmlEncode(title); var m = WebUtility.HtmlEncode(message);
        var html = $"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{t}</title>" +
            "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fafafa;font:16px system-ui,sans-serif}.c{max-width:420px;margin:24px;padding:28px;border:1px solid #26262c;border-radius:16px;background:#111114;text-align:center}" +
            "h1{font-size:22px;margin:0 0 10px}p{color:#a3a3ad;line-height:1.5}a{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:10px;background:#4f5ee6;color:#fff;text-decoration:none;font-weight:600}</style></head>" +
            $"<body><div class=\"c\"><h1>{(ok ? "✓ " : "")}{t}</h1><p>{m}</p><a href=\"/#/settings/profile\">Back to Third Wheel</a></div></body></html>";
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

            var steamId = m.Groups[1].Value; var name = steamId;
            try   // the public profile page gives the display name; if it can't be read we show the id instead
            {
                var xml = await Http.GetStringAsync($"https://steamcommunity.com/profiles/{steamId}/?xml=1");
                var n = Regex.Match(xml, @"<steamID><!\[CDATA\[(.{1,64}?)\]\]></steamID>");
                if (n.Success) name = n.Groups[1].Value.Trim();
            }
            catch { /* keep the id */ }
            name = new string(name.Where(ch => !char.IsControl(ch)).ToArray());
            if (name.Length == 0) name = steamId;
            if (!Save(uid.Value, "Steam", name, steamId, out var err)) return Page("Already linked", err, false);
            return Page("Steam linked", $"Your Steam account “{name}” is now verified on your profile.", true);
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
