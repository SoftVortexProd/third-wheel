using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.IdentityModel.Tokens;
using static Core;

/// <summary>
/// Sign up / sign in with Google, Discord or Apple. The person signs in on the provider's own site; we only get a stable id (and name/email) back.
/// A provider shows up on the login screen only when the server owner has configured it (see deploy/README.md):
///   Google : TW_GOOGLE_CLIENT_ID, TW_GOOGLE_CLIENT_SECRET          redirect: https://YOUR-ADDRESS/auth/google/callback
///   Discord: TW_DISCORD_CLIENT_ID, TW_DISCORD_CLIENT_SECRET        redirect: https://YOUR-ADDRESS/auth/discord/callback  (add it next to the verify one)
///   Apple  : TW_APPLE_CLIENT_ID (Services ID), TW_APPLE_TEAM_ID, TW_APPLE_KEY_ID, TW_APPLE_PRIVATE_KEY (the .p8 text)   redirect: https://YOUR-ADDRESS/auth/apple/callback
/// The state that travels through the provider is signed and short-lived, so the callback needs no cookie (it works from any browser).
/// The desktop app opens the system browser for this; it then collects the finished sign-in with a one-time hand-off code.
/// </summary>
public static class SocialAuth
{
    public record HandoffIn(string? Code);
    static readonly byte[] StateKey = RandomNumberGenerator.GetBytes(32);
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(12) };
    static readonly ConcurrentDictionary<string, (long Uid, DateTime Exp)> Handoffs = new();
    static string Env(string n) => Environment.GetEnvironmentVariable(n) ?? "";

    sealed record Prov(string Name, string Label, string AuthUrl, string TokenUrl, string Scope);
    static readonly Dictionary<string, Prov> Provs = new()
    {
        ["google"] = new("google", "Google", "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", "openid email profile"),
        ["discord"] = new("discord", "Discord", "https://discord.com/oauth2/authorize", "https://discord.com/api/oauth2/token", "identify email"),
        ["apple"] = new("apple", "Apple", "https://appleid.apple.com/auth/authorize", "https://appleid.apple.com/auth/token", "name email"),
    };
    static string ClientId(string p) => p switch { "google" => Env("TW_GOOGLE_CLIENT_ID"), "discord" => Env("TW_DISCORD_CLIENT_ID"), "apple" => Env("TW_APPLE_CLIENT_ID"), _ => "" };
    static bool Configured(string p) => p switch
    {
        "google" => Env("TW_GOOGLE_CLIENT_ID").Length > 0 && Env("TW_GOOGLE_CLIENT_SECRET").Length > 0,
        "discord" => Env("TW_DISCORD_CLIENT_ID").Length > 0 && Env("TW_DISCORD_CLIENT_SECRET").Length > 0,
        "apple" => Env("TW_APPLE_CLIENT_ID").Length > 0 && Env("TW_APPLE_TEAM_ID").Length > 0 && Env("TW_APPLE_KEY_ID").Length > 0 && (Env("TW_APPLE_PRIVATE_KEY").Length > 0 || File.Exists(Env("TW_APPLE_KEY_FILE"))),
        _ => false
    };

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS oauth_accounts(provider TEXT NOT NULL, extId TEXT NOT NULL, userId INTEGER NOT NULL, email TEXT, createdAt TEXT, PRIMARY KEY(provider, extId));
CREATE INDEX IF NOT EXISTS ix_oauth_user ON oauth_accounts(userId);");
        var cols = Db.Rows("PRAGMA table_info(users)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!cols.Contains("oauthOnly")) Db.Exec("ALTER TABLE users ADD COLUMN oauthOnly INTEGER DEFAULT 0");   // 1 = created with a provider and has no password of their own
    }

    // ---------- signed state ----------
    static string B64(byte[] b) => Convert.ToBase64String(b).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    static byte[] UnB64(string s) { s = s.Replace('-', '+').Replace('_', '/'); return Convert.FromBase64String(s + new string('=', (4 - s.Length % 4) % 4)); }
    static string Sign(string data) => B64(HMACSHA256.HashData(StateKey, Encoding.UTF8.GetBytes(data)));
    sealed record State(string P, string M, bool Tos, string? H, long L, string N, long E);
    static string MakeState(State s) { var body = B64(JsonSerializer.SerializeToUtf8Bytes(s)); return body + "." + Sign(body); }
    static State? ReadState(string? raw)
    {
        var parts = (raw ?? "").Split('.');
        if (parts.Length != 2 || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Sign(parts[0])), Encoding.ASCII.GetBytes(parts[1]))) return null;
        try { var s = JsonSerializer.Deserialize<State>(UnB64(parts[0])); return s != null && s.E > DateTimeOffset.UtcNow.ToUnixTimeSeconds() ? s : null; } catch { return null; }
    }

    static string Origin(HttpContext c)
    {
        var ip = c.Connection.RemoteIpAddress;
        if (ip != null && IPAddress.IsLoopback(ip))
        {
            var host = c.Request.Headers["X-Forwarded-Host"].ToString().Split(',')[0].Trim(); var proto = c.Request.Headers["X-Forwarded-Proto"].ToString().Split(',')[0].Trim();
            if (host.Length > 0 && Regex.IsMatch(host, @"^[A-Za-z0-9.\-]+(:\d{1,5})?$")) return $"{(proto == "http" ? "http" : "https")}://{host}";
        }
        return $"{c.Request.Scheme}://{c.Request.Host}";
    }

    static IResult Back(string code) => Results.Redirect("/?auth_error=" + Uri.EscapeDataString(code), false);
    static IResult Page(string title, string message)
    {
        var t = WebUtility.HtmlEncode(title); var m = WebUtility.HtmlEncode(message);
        return Results.Content($"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{t}</title><style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fafafa;font:16px system-ui,sans-serif}}.c{{max-width:420px;margin:24px;padding:28px;border:1px solid #26262c;border-radius:16px;background:#111114;text-align:center}}h1{{font-size:22px;margin:0 0 10px}}p{{color:#a3a3ad;line-height:1.5}}</style></head><body><div class=\"c\"><h1>{t}</h1><p>{m}</p></div></body></html>", "text/html; charset=utf-8");
    }

    // ---------- Apple needs a client secret that is a short-lived signed token ----------
    static string AppleSecret()
    {
        var pem = Env("TW_APPLE_PRIVATE_KEY"); if (pem.Length == 0 && File.Exists(Env("TW_APPLE_KEY_FILE"))) pem = File.ReadAllText(Env("TW_APPLE_KEY_FILE"));
        pem = pem.Replace("\\n", "\n");
        using var ec = ECDsa.Create(); ec.ImportFromPem(pem);
        var key = new ECDsaSecurityKey(ec) { KeyId = Env("TW_APPLE_KEY_ID") };
        var now = DateTime.UtcNow;
        var jwt = new JwtSecurityToken(issuer: Env("TW_APPLE_TEAM_ID"), audience: "https://appleid.apple.com", claims: new[] { new Claim("sub", Env("TW_APPLE_CLIENT_ID")) },
            notBefore: now, expires: now.AddMinutes(5), signingCredentials: new SigningCredentials(key, SecurityAlgorithms.EcdsaSha256));
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    /// <summary>Trade the one-time code for who this is: (stable id, name, email).</summary>
    static async Task<(string Id, string Name, string Email)?> Identify(string p, string code, string redirect, string nonce, string? appleIdToken)
    {
        var prov = Provs[p];
        var form = new Dictionary<string, string> { ["client_id"] = ClientId(p), ["code"] = code, ["grant_type"] = "authorization_code", ["redirect_uri"] = redirect };
        form["client_secret"] = p == "apple" ? AppleSecret() : Env(p == "google" ? "TW_GOOGLE_CLIENT_SECRET" : "TW_DISCORD_CLIENT_SECRET");
        using var r = await Http.PostAsync(prov.TokenUrl, new FormUrlEncodedContent(form));
        if (!r.IsSuccessStatusCode) return null;
        var tok = JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;
        if (p == "discord")
        {
            var access = tok.GetProperty("access_token").GetString();
            using var req = new HttpRequestMessage(HttpMethod.Get, "https://discord.com/api/users/@me");
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", access);
            using var me = await Http.SendAsync(req); if (!me.IsSuccessStatusCode) return null;
            var u = JsonDocument.Parse(await me.Content.ReadAsStringAsync()).RootElement;
            var id = u.GetProperty("id").GetString() ?? "";
            var name = (u.TryGetProperty("global_name", out var gn) && gn.ValueKind == JsonValueKind.String ? gn.GetString() : null) ?? (u.TryGetProperty("username", out var un) ? un.GetString() : null) ?? "";
            var email = u.TryGetProperty("email", out var em) && em.ValueKind == JsonValueKind.String && u.TryGetProperty("verified", out var vf) && vf.ValueKind == JsonValueKind.True ? em.GetString() ?? "" : "";
            return Regex.IsMatch(id, @"^\d{5,25}$") ? (id, name, email) : null;
        }
        // Google / Apple return an OpenID token straight from their token endpoint over TLS, which is allowed to be trusted without re-checking its signature
        var idToken = tok.GetProperty("id_token").GetString() ?? "";
        var seg = idToken.Split('.'); if (seg.Length < 2) return null;
        var c = JsonDocument.Parse(UnB64(seg[1])).RootElement;
        var aud = c.TryGetProperty("aud", out var a) ? a.GetString() : null; var iss = c.TryGetProperty("iss", out var i) ? i.GetString() : null;
        if (aud != ClientId(p)) return null;
        if (p == "google" && iss is not ("https://accounts.google.com" or "accounts.google.com")) return null;
        if (p == "apple" && iss != "https://appleid.apple.com") return null;
        if (p == "apple" && (!c.TryGetProperty("nonce", out var nn) || nn.GetString() != nonce)) return null;
        if (!c.TryGetProperty("exp", out var ex) || ex.GetInt64() < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;
        var sub = c.TryGetProperty("sub", out var sb) ? sb.GetString() ?? "" : ""; if (sub.Length == 0 || sub.Length > 100) return null;
        var mail = c.TryGetProperty("email", out var e1) && e1.ValueKind == JsonValueKind.String && (!c.TryGetProperty("email_verified", out var ev) || ev.ValueKind == JsonValueKind.True || ev.ValueKind == JsonValueKind.String && ev.GetString() == "true") ? e1.GetString() ?? "" : "";
        var display = c.TryGetProperty("name", out var nm) && nm.ValueKind == JsonValueKind.String ? nm.GetString() ?? "" : "";
        return (sub, display, mail);
    }

    static string NewUsername(string hint)
    {
        var baseName = Regex.Replace(hint ?? "", "[^A-Za-z0-9_]", ""); if (baseName.Length > 14) baseName = baseName[..14];
        if (baseName.Length < 3 || !NameFilter.NameAllowed(baseName)) baseName = "player";
        for (int i = 0; i < 30; i++)
        {
            var name = i == 0 ? baseName : baseName + Random.Shared.Next(100, 9999);
            if (name.Length > 20) name = name[..20];
            if (userRx.IsMatch(name) && NameFilter.NameAllowed(name) && Db.Scalar("SELECT 1 FROM users WHERE username=@u COLLATE NOCASE", ("@u", name)) == null) return name;
        }
        return "player" + Random.Shared.Next(100000, 999999);
    }

    public static void Map(WebApplication app, RouteGroupBuilder api)
    {
        api.MapGet("auth/providers", () => Results.Json(new { google = Configured("google"), discord = Configured("discord"), apple = Configured("apple") }));

        // the desktop app collects a sign-in that was finished in the system browser
        api.MapPost("auth/handoff", (HttpContext c, HandoffIn b) =>
        {
            if (Limited("ho:" + ClientIp(c), 60, TimeSpan.FromMinutes(5), true)) return Err("Too many attempts.", 429);
            var code = b.Code ?? ""; if (code.Length < 20 || code.Length > 80) return Err("Not ready yet.", 404);
            foreach (var k in Handoffs.Where(x => x.Value.Exp < DateTime.UtcNow).Select(x => x.Key).ToList()) Handoffs.TryRemove(k, out _);
            if (!Handoffs.TryRemove(code, out var h) || h.Exp < DateTime.UtcNow) return Err("Not ready yet.", 404);
            StartSession(c, h.Uid);
            return Results.Json(new { user = UserDto(h.Uid) });
        });

        // which sign-in methods are linked to this account (Settings -> Connections)
        api.MapGet("me/signin-methods", (HttpContext c) => WithUser(c, me =>
        {
            var linked = Db.Rows("SELECT provider FROM oauth_accounts WHERE userId=@u", ("@u", me)).Select(r => (string)r["provider"]!).ToHashSet();
            return Results.Json(new { methods = Provs.Keys.Select(k => new { id = k, label = Provs[k].Label, available = Configured(k), linked = linked.Contains(k) }).ToList(), oauthOnly = Convert.ToInt32(Db.Scalar("SELECT COALESCE(oauthOnly,0) FROM users WHERE id=@i", ("@i", me))) == 1 });
        }));
        api.MapDelete("me/signin-methods/{provider}", (HttpContext c, string provider) => WithUser(c, me =>
        {
            var only = Convert.ToInt32(Db.Scalar("SELECT COALESCE(oauthOnly,0) FROM users WHERE id=@i", ("@i", me))) == 1;
            var n = Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM oauth_accounts WHERE userId=@u", ("@u", me)));
            if (only && n <= 1) return Err("This is the only way you can sign in. Link another method first.", 409);
            Db.Exec("DELETE FROM oauth_accounts WHERE userId=@u AND provider=@p", ("@u", me), ("@p", provider));
            return Results.Json(new { ok = true });
        }));

        // Apple shows its sites only for domains it knows: the owner puts the verification file text in <data>/apple-domain-association.txt
        app.MapGet("/.well-known/apple-developer-domain-association.txt", () =>
        {
            var f = Path.Combine(Environment.GetEnvironmentVariable("TW_DATA") ?? AppContext.BaseDirectory, "apple-domain-association.txt");
            return File.Exists(f) ? Results.Text(File.ReadAllText(f), "text/plain") : Results.NotFound();
        });

        app.MapGet("/auth/{provider}/start", (HttpContext c, string provider, string? mode, string? tos, string? h) =>
        {
            if (!Provs.ContainsKey(provider) || !Configured(provider)) return Back("unavailable");
            if (IsBanned(c, out _)) return Back("banned");
            if (Limited("oa:" + ClientIp(c), 40, TimeSpan.FromMinutes(10), true)) return Back("failed");
            mode = mode is "signup" or "link" ? mode : "login";
            long link = 0;
            if (mode == "link") { var me = CurrentUser(c); if (me == null) return Back("failed"); link = me.Value; }
            var handoff = !string.IsNullOrEmpty(h) && h.Length is >= 20 and <= 80 && Regex.IsMatch(h, "^[A-Za-z0-9_\\-]+$") ? h : null;
            var st = new State(provider, mode, tos == "1", handoff, link, B64(RandomNumberGenerator.GetBytes(12)), DateTimeOffset.UtcNow.AddMinutes(15).ToUnixTimeSeconds());
            var prov = Provs[provider]; var redirect = $"{Origin(c)}/auth/{provider}/callback";
            var q = new List<string> { $"client_id={Uri.EscapeDataString(ClientId(provider))}", "response_type=code", $"scope={Uri.EscapeDataString(prov.Scope)}", $"redirect_uri={Uri.EscapeDataString(redirect)}", $"state={Uri.EscapeDataString(MakeState(st))}" };
            if (provider == "google") q.Add("prompt=select_account");
            if (provider == "discord") q.Add("prompt=consent");
            if (provider == "apple") { q.Add("response_mode=form_post"); q.Add($"nonce={Uri.EscapeDataString(st.N)}"); }
            return Results.Redirect(prov.AuthUrl + "?" + string.Join("&", q), false);
        });

        async Task<IResult> Callback(HttpContext c, string provider)
        {
            if (!Provs.ContainsKey(provider) || !Configured(provider)) return Back("unavailable");
            string code, stateRaw;
            if (c.Request.HasFormContentType) { var f = await c.Request.ReadFormAsync(); code = f["code"].ToString(); stateRaw = f["state"].ToString(); }
            else { code = c.Request.Query["code"].ToString(); stateRaw = c.Request.Query["state"].ToString(); }
            var st = ReadState(stateRaw);
            if (st == null || st.P != provider) return Back("failed");
            if (code.Length == 0 || code.Length > 2000) return Back("denied");
            if (Limited("oac:" + ClientIp(c), 40, TimeSpan.FromMinutes(10), true)) return Back("failed");
            (string Id, string Name, string Email)? who;
            try { who = await Identify(provider, code, $"{Origin(c)}/auth/{provider}/callback", st.N, null); } catch { who = null; }
            if (who == null) return st.H != null ? Page("Couldn't sign you in", "Something went wrong talking to " + Provs[provider].Label + ". Close this tab and try again in the app.") : Back("failed");
            var (extId, name, email) = who.Value;

            long uid;
            var existing = Db.Scalar("SELECT userId FROM oauth_accounts WHERE provider=@p AND extId=@e", ("@p", provider), ("@e", extId));
            if (st.M == "link")
            {
                if (existing != null && Convert.ToInt64(existing) != st.L) return Results.Redirect("/?auth_error=taken#/settings/connections", false);
                Db.Exec("INSERT OR IGNORE INTO oauth_accounts(provider,extId,userId,email,createdAt) VALUES(@p,@e,@u,@m,@t)", ("@p", provider), ("@e", extId), ("@u", st.L), ("@m", email), ("@t", Now()));
                return Results.Redirect("/#/settings/connections", false);
            }
            if (existing != null) uid = Convert.ToInt64(existing);
            else
            {
                if (st.M != "signup") return st.H != null ? Page("No account yet", "Open the app, choose Sign up, tick the box and continue with " + Provs[provider].Label + ".") : Back("noaccount");
                if (!st.Tos) return Back("tos");
                if (IsBanned(c, out _)) return Back("banned");
                uid = Db.CreateUser(NewUsername(name.Length > 0 ? name : (email.Split('@')[0])), B64(RandomNumberGenerator.GetBytes(24)), "NA-East", 0, Array.Empty<string>(), "online", null, false);
                Db.Exec("UPDATE users SET tosAccepted=1, oauthOnly=1, lastIp=@ip, deviceId=@d WHERE id=@i", ("@ip", ClientIp(c)), ("@d", ClientDeviceId(c)), ("@i", uid));
                Db.Exec("INSERT INTO oauth_accounts(provider,extId,userId,email,createdAt) VALUES(@p,@e,@u,@m,@t)", ("@p", provider), ("@e", extId), ("@u", uid), ("@m", email), ("@t", Now()));
            }
            var u = Db.Row("SELECT banned FROM users WHERE id=@i", ("@i", uid));
            if (u == null || Convert.ToInt32(u["banned"]) == 1) return st.H != null ? Page("Account suspended", "This account has been suspended.") : Back("banned");
            Db.Exec("UPDATE users SET status='online', lastIp=@ip, deviceId=COALESCE(@d, deviceId) WHERE id=@i", ("@ip", ClientIp(c)), ("@d", ClientDeviceId(c)), ("@i", uid));
            if (st.H != null)
            {   // started from the desktop app: leave the session for the app to collect
                Handoffs[st.H] = (uid, DateTime.UtcNow.AddMinutes(5));
                return Page("You're signed in", "You can close this tab and go back to the Third Wheel app.");
            }
            StartSession(c, uid);
            return Results.Redirect("/#/feed", false);
        }
        app.MapGet("/auth/{provider}/callback", (HttpContext c, string provider) => Callback(c, provider));
        app.MapPost("/auth/{provider}/callback", (HttpContext c, string provider) => Callback(c, provider));   // Apple answers with a form post
    }
}
