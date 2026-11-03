using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using static Core;

/// <summary>Password changes for users, and admin tools to edit a user's profile/settings/password and to rename groups.</summary>
public static class AccountApi
{
    static readonly Regex Ctrl = new(@"[\p{C}\p{Zl}\p{Zp}]", RegexOptions.Compiled);
    static readonly string[] Statuses = { "online", "idle", "dnd", "offline" };
    /// <summary>For the media proxy: never follows redirects, so a Tenor URL can't bounce the server to another host.</summary>
    static readonly HttpClient ProxyHttp = new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(10) };
    static readonly HttpClient Http = new(new HttpClientHandler { AutomaticDecompression = DecompressionMethods.All }) { Timeout = TimeSpan.FromSeconds(10) };
    /// <summary>Tenor API key, set on the server as the TW_TENOR_KEY environment variable (never committed to the repo). Without it GIF search returns notConfigured.</summary>
    static string KlipyKey => Environment.GetEnvironmentVariable("TW_KLIPY_KEY") ?? Environment.GetEnvironmentVariable("TW_TENOR_KEY") ?? "";
    static string TenorKey => KlipyKey;

    static void SetPassword(long uid, string pw)
    {
        var salt = System.Security.Cryptography.RandomNumberGenerator.GetBytes(16);
        Db.Exec("UPDATE users SET hash=@h, salt=@s WHERE id=@i", ("@h", Convert.ToBase64String(Db.Hash(pw, salt))), ("@s", Convert.ToBase64String(salt)), ("@i", uid));
    }

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS user_blocks(userId INTEGER, blockedId INTEGER, at TEXT, PRIMARY KEY(userId, blockedId));
CREATE TABLE IF NOT EXISTS user_reports(id INTEGER PRIMARY KEY, reporterId INTEGER, reportedUserId INTEGER, messageId INTEGER, groupId INTEGER, reason TEXT, details TEXT, status TEXT DEFAULT 'pending', at TEXT);
CREATE TABLE IF NOT EXISTS user_prefs(userId INTEGER PRIMARY KEY, accentColor TEXT DEFAULT '#7c8cff', fontScale REAL DEFAULT 1.0, language TEXT DEFAULT 'en', nsfwFilter INTEGER DEFAULT 1, profanityFilter INTEGER DEFAULT 1, disablePfpAnimation INTEGER DEFAULT 0, favGifs TEXT DEFAULT '[]', gamerTags TEXT DEFAULT '{}');");
        // A report about a chat message records which chat it came from ('g' group / 'd' DM) and a snapshot of the text, so admins still see it after a delete.
        var rcols = Db.Rows("PRAGMA table_info(user_reports)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!rcols.Contains("messageKind")) Db.Exec("ALTER TABLE user_reports ADD COLUMN messageKind TEXT");
        if (!rcols.Contains("snippet")) Db.Exec("ALTER TABLE user_reports ADD COLUMN snippet TEXT");
        var pcols = Db.Rows("PRAGMA table_info(user_prefs)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!pcols.Contains("disablePfpAnimation")) Db.Exec("ALTER TABLE user_prefs ADD COLUMN disablePfpAnimation INTEGER DEFAULT 0");
    }

    public static void Map(RouteGroupBuilder api)
    {
        // ---- user blocks ----
        api.MapGet("me/blocks", (HttpContext c) => WithUser(c, uid =>
        {
            var rows = Db.Rows(@"SELECT u.*, b.at blockedAt FROM user_blocks b JOIN users u ON u.id=b.blockedId WHERE b.userId=@u ORDER BY b.at DESC", ("@u", uid));
            return Results.Json(rows.Select(r => new {
                id = (long)r["id"]!,
                username = (string)r["username"]!,
                displayName = r["display"] as string,
                avatar = AvatarUrl((long)r["id"]!, r["avatarVer"]),
                color = (string)r["color"]!,
                blockedAt = r["blockedAt"] as string
            }));
        }));

        api.MapPost("me/blocks/{target:long}", (HttpContext c, long target) => WithUser(c, uid =>
        {
            if (target == uid) return Err("Cannot block yourself.");
            if (Db.Scalar("SELECT 1 FROM users WHERE id=@t", ("@t", target)) == null) return Err("User not found.", 404);
            Db.Exec("INSERT OR IGNORE INTO user_blocks(userId, blockedId, at) VALUES(@u, @t, @at)", ("@u", uid), ("@t", target), ("@at", Now()));
            Db.Exec("DELETE FROM friends WHERE (a=@a AND b=@b) OR (a=@b AND b=@a)", ("@a", Math.Min(uid, target)), ("@b", Math.Max(uid, target)));
            return Results.Json(new { ok = true });
        }));

        api.MapDelete("me/blocks/{target:long}", (HttpContext c, long target) => WithUser(c, uid =>
        {
            Db.Exec("DELETE FROM user_blocks WHERE userId=@u AND blockedId=@t", ("@u", uid), ("@t", target));
            return Results.Json(new { ok = true });
        }));

        // ---- user preferences / appearance / safety ----
        api.MapGet("me/preferences", (HttpContext c) => WithUser(c, uid =>
        {
            var row = Db.Row("SELECT * FROM user_prefs WHERE userId=@u", ("@u", uid));
            if (row == null) return Results.Json(new { accentColor = "#7c8cff", fontScale = 1.0, language = "en", nsfwFilter = true, profanityFilter = true, disablePfpAnimation = false, favGifs = Array.Empty<string>(), gamerTags = new Dictionary<string, string>() });
            return Results.Json(new {
                accentColor = row["accentColor"] as string ?? "#7c8cff",
                fontScale = Convert.ToDouble(row["fontScale"] ?? 1.0),
                language = row["language"] as string ?? "en",
                nsfwFilter = Convert.ToInt32(row["nsfwFilter"] ?? 1) == 1,
                profanityFilter = Convert.ToInt32(row["profanityFilter"] ?? 1) == 1,
                disablePfpAnimation = Convert.ToInt32(row["disablePfpAnimation"] ?? 0) == 1,
                favGifs = JsonSerializer.Deserialize<string[]>(row["favGifs"] as string ?? "[]") ?? Array.Empty<string>(),
                gamerTags = JsonSerializer.Deserialize<Dictionary<string, string>>(row["gamerTags"] as string ?? "{}") ?? new Dictionary<string, string>()
            });
        }));

        api.MapPut("me/preferences", (HttpContext c, PrefsIn b) => WithUser(c, uid =>
        {
            var existing = Db.Row("SELECT * FROM user_prefs WHERE userId=@u", ("@u", uid));
            var accent = Clean(b.AccentColor ?? (existing?["accentColor"] as string ?? "#7c8cff"), 16);
            var fontScale = Math.Clamp(b.FontScale ?? (existing != null ? Convert.ToDouble(existing["fontScale"]) : 1.0), 0.75, 1.5);
            var lang = Clean(b.Language ?? (existing?["language"] as string ?? "en"), 10);
            var nsfw = b.NsfwFilter ?? (existing == null || Convert.ToInt32(existing["nsfwFilter"]) == 1);
            var prof = b.ProfanityFilter ?? (existing == null || Convert.ToInt32(existing["profanityFilter"]) == 1);
            var noPfpAnim = b.DisablePfpAnimation ?? (existing != null && Convert.ToInt32(existing["disablePfpAnimation"] ?? 0) == 1);
            if (b.FavGifs != null && Limited($"prefs:{uid}", 60, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
            var favGifs = b.FavGifs != null ? JsonSerializer.Serialize(GifRules.SanitizeFavorites(b.FavGifs)) : (existing?["favGifs"] as string ?? "[]");
            var gamerTags = b.GamerTags != null ? JsonSerializer.Serialize(b.GamerTags) : (existing?["gamerTags"] as string ?? "{}");
            Db.Exec(@"INSERT INTO user_prefs(userId, accentColor, fontScale, language, nsfwFilter, profanityFilter, disablePfpAnimation, favGifs, gamerTags)
                      VALUES(@u, @ac, @fs, @l, @nf, @pf, @pa, @fg, @gt)
                      ON CONFLICT(userId) DO UPDATE SET
                      accentColor=@ac, fontScale=@fs, language=@l, nsfwFilter=@nf, profanityFilter=@pf, disablePfpAnimation=@pa, favGifs=@fg, gamerTags=@gt",
                      ("@u", uid), ("@ac", accent), ("@fs", fontScale), ("@l", lang), ("@nf", nsfw ? 1 : 0), ("@pf", prof ? 1 : 0), ("@pa", noPfpAnim ? 1 : 0), ("@fg", favGifs), ("@gt", gamerTags));
            return Results.Json(new { ok = true });
        }));

        // ---- report system ----
        api.MapPost("reports", (HttpContext c, ReportIn b) => WithUser(c, uid =>
        {
            if (Limited($"rep:{uid}", 10, TimeSpan.FromHours(1), true)) return Err("Too many reports submitted. Please wait.", 429);
            var reason = Clean(b.Reason, 60);
            if (string.IsNullOrWhiteSpace(reason)) return Err("Report reason required.");
            var details = Clean(b.Details, 500);
            long? reportedUser = b.ReportedUserId, groupId = b.GroupId; string? kind = null, snippet = null;
            if (b.MessageId != null)
            {
                // A report about a message: work out the author and chat from the message itself (never trust the client), and make sure the reporter can actually see it.
                if (b.MessageKind is not ("g" or "d")) return Err("Say which chat the message is from.");
                if (reason is not ("spam" or "harassment" or "hate" or "sexual" or "other")) return Err("Pick a reason from the list.");
                Dictionary<string, object?>? msg;
                if (b.MessageKind == "g")
                {
                    if (b.GroupId == null || !IsMember(b.GroupId.Value, uid)) return Err("You can only report messages from groups you're in.", 403);
                    msg = Db.Row("SELECT userId author, text, deletedAt FROM messages WHERE id=@m AND groupId=@g", ("@m", b.MessageId), ("@g", b.GroupId));
                }
                else
                {
                    if (b.ReportedUserId == null || b.ReportedUserId == uid) return Err("Message not found.", 404);
                    msg = Db.Row("SELECT fromId author, text, deletedAt FROM dms WHERE id=@m AND a=@a AND b=@b", ("@m", b.MessageId), ("@a", Math.Min(uid, b.ReportedUserId.Value)), ("@b", Math.Max(uid, b.ReportedUserId.Value)));
                    groupId = null;
                }
                if (msg == null) return Err("Message not found.", 404);
                if (msg["deletedAt"] != null) return Err("That message has already been deleted.", 409);
                var author = Convert.ToInt64(msg["author"]);
                if (author == uid) return Err("You can't report your own message.");
                reportedUser = author; kind = b.MessageKind;
                var plain = WebUtility.HtmlDecode((string)msg["text"]!);
                snippet = Enc(plain.Length > 300 ? plain[..300] : plain);
                if (Db.Scalar("SELECT 1 FROM user_reports WHERE reporterId=@r AND messageKind=@k AND messageId=@m AND status='pending'", ("@r", uid), ("@k", kind), ("@m", b.MessageId)) != null)
                    return Results.Json(new { ok = true, already = true });
            }
            Db.Exec("INSERT INTO user_reports(reporterId, reportedUserId, messageId, groupId, reason, details, status, at, messageKind, snippet) VALUES(@r, @ru, @m, @g, @rs, @d, 'pending', @at, @mk, @sn)",
                ("@r", uid), ("@ru", reportedUser), ("@m", b.MessageId), ("@g", groupId), ("@rs", Enc(reason)), ("@d", Enc(details)), ("@at", Now()), ("@mk", kind), ("@sn", snippet));
            return Results.Json(new { ok = true });
        }));

        api.MapGet("admin/reports", (HttpContext c) => WithAdmin(c, _ =>
        {
            var list = Db.Rows(@"SELECT r.*, u1.username reporterName, u2.username reportedName, g.name groupName
                                 FROM user_reports r
                                 LEFT JOIN users u1 ON u1.id=r.reporterId
                                 LEFT JOIN users u2 ON u2.id=r.reportedUserId
                                 LEFT JOIN grps g ON g.id=r.groupId
                                 ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC LIMIT 100");
            return Results.Json(list);
        }));

        api.MapPost("admin/reports/{id:long}/resolve", (HttpContext c, long id) => WithAdmin(c, me =>
        {
            Db.Exec("UPDATE user_reports SET status='resolved' WHERE id=@i", ("@i", id));
            Audit(me, "resolved report", id.ToString());
            return Results.Json(new { ok = true });
        }));

        // ---- GIF search & media proxy (Klipy API + CSP 'self') ----
        api.MapGet("media/gifs/trending", async (HttpContext c) =>
        {
            try
            {
                if (KlipyKey.Length == 0) return Results.Json(new { results = Array.Empty<object>(), notConfigured = true });
                var uri = $"https://api.klipy.com/api/v1/{KlipyKey}/gifs/trending?page=1&per_page=24";
                var resp = await Http.GetAsync(uri);
                if (!resp.IsSuccessStatusCode)
                {
                    // Fallback to Tenor if key was a Tenor key
                    uri = $"https://tenor.googleapis.com/v2/featured?key={KlipyKey}&client_key=tenor_web&limit=24&media_filter=tinygif,gif";
                    resp = await Http.GetAsync(uri);
                    if (!resp.IsSuccessStatusCode) return Results.Json(new { results = Array.Empty<object>() });
                }
                using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync());
                return Results.Json(new { results = ParseGifItems(doc.RootElement) });
            }
            catch { return Results.Json(new { results = Array.Empty<object>() }); }
        });

        api.MapGet("media/gifs/search", async (HttpContext c, string? q) =>
        {
            var term = (q ?? "").Trim();
            if (string.IsNullOrEmpty(term)) return Results.Json(new { results = Array.Empty<object>() });
            try
            {
                if (KlipyKey.Length == 0) return Results.Json(new { results = Array.Empty<object>(), notConfigured = true });
                var uri = $"https://api.klipy.com/api/v1/{KlipyKey}/gifs/search?q={Uri.EscapeDataString(term)}&page=1&per_page=24";
                var resp = await Http.GetAsync(uri);
                if (!resp.IsSuccessStatusCode)
                {
                    // Fallback to Tenor if key was a Tenor key
                    uri = $"https://tenor.googleapis.com/v2/search?key={KlipyKey}&client_key=tenor_web&q={Uri.EscapeDataString(term)}&limit=24&media_filter=tinygif,gif";
                    resp = await Http.GetAsync(uri);
                    if (!resp.IsSuccessStatusCode) return Results.Json(new { results = Array.Empty<object>() });
                }
                using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync());
                return Results.Json(new { results = ParseGifItems(doc.RootElement) });
            }
            catch { return Results.Json(new { results = Array.Empty<object>() }); }
        });

        // Signed-in users only, allowed GIF media hosts only, no redirects, and only image responses are passed on.
        api.MapGet("media/proxy", async (HttpContext c, string? url) =>
        {
            if (CurrentUser(c) is null) return Err("Not signed in.", 401);
            if (string.IsNullOrEmpty(url) || url.Length > 800 || !Uri.TryCreate(url, UriKind.Absolute, out var u)
                || u.Scheme != "https" || !string.IsNullOrEmpty(u.UserInfo) || !u.IsDefaultPort
                || (!u.Host.EndsWith("tenor.com") && u.Host != "klipy.com" && !u.Host.EndsWith(".klipy.com") && !u.Host.EndsWith("giphy.com")))
                return Results.NotFound();
            try
            {
                var req = new HttpRequestMessage(HttpMethod.Get, u);
                var resp = await ProxyHttp.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);
                if (!resp.IsSuccessStatusCode) return Results.StatusCode((int)resp.StatusCode);
                var ctype = resp.Content.Headers.ContentType?.MediaType ?? "";
                if (!ctype.StartsWith("image/")) return Results.StatusCode(502);
                c.Response.Headers["Cache-Control"] = "private, max-age=604800, immutable";
                c.Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
                var stream = await resp.Content.ReadAsStreamAsync();
                return Results.Stream(stream, ctype);
            }
            catch { return Results.StatusCode(502); }
        });

        // ---- free translation endpoint ----
        api.MapPost("translate", async (HttpContext c, TranslateIn b) =>
        {
            var uid = CurrentUser(c);
            if (uid is null) return Err("Not signed in.", 401);
            if (Limited($"tr:{uid}", 40, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
            var text = (b.Text ?? "").Trim();
            var toLang = Clean(b.ToLang ?? "en", 8).ToLowerInvariant();
            if (!Regex.IsMatch(toLang, "^[a-z]{2,3}(-[a-z]{2,4})?$")) return Err("Unknown language.");
            if (string.IsNullOrEmpty(text)) return Results.Json(new { text = "", unchanged = true });
            if (text.Length > 480) return Err("That message is too long to translate (480 characters max).");
            try
            {
                var uri = $"https://api.mymemory.translated.net/get?q={Uri.EscapeDataString(text)}&langpair=autodetect|{toLang}";
                var resp = await Http.GetAsync(uri);
                if (resp.IsSuccessStatusCode)
                {
                    using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync());
                    var root = doc.RootElement;
                    int status = 200;
                    if (root.TryGetProperty("responseStatus", out var st)) status = st.ValueKind == JsonValueKind.Number ? st.GetInt32() : (int.TryParse(st.GetString(), out var sv) ? sv : 200);
                    if (root.TryGetProperty("responseData", out var rd) && rd.TryGetProperty("translatedText", out var tt))
                    {
                        var translated = tt.GetString() ?? text;
                        // MyMemory answers with an English sentence instead of a translation when the text is already in the target language.
                        if (translated.Contains("PLEASE SELECT TWO DISTINCT LANGUAGES", StringComparison.OrdinalIgnoreCase))
                            return Results.Json(new { text, from = toLang, to = toLang, unchanged = true });
                        if (status == 200 && !translated.Contains("MYMEMORY WARNING", StringComparison.OrdinalIgnoreCase))
                        {
                            string? from = rd.TryGetProperty("detectedLanguage", out var dl) && dl.ValueKind == JsonValueKind.String ? dl.GetString() : null;
                            if (from == null && root.TryGetProperty("matches", out var ms) && ms.ValueKind == JsonValueKind.Array && ms.GetArrayLength() > 0
                                && ms[0].TryGetProperty("source", out var so) && so.ValueKind == JsonValueKind.String) from = so.GetString();
                            if (from != null) from = from.Split('-')[0].ToLowerInvariant();
                            var same = string.Equals(translated.Trim(), text, StringComparison.OrdinalIgnoreCase) || from == toLang;
                            return Results.Json(new { text = translated, from, to = toLang, unchanged = same });
                        }
                    }
                }
            }
            catch { /* fall through to the error below */ }
            return Err("Translation isn't available right now. Try again later.", 502);
        });        // ---- a user changes their own password ----
        api.MapPost("me/password", (HttpContext c, PasswordIn b) => WithUser(c, uid =>
        {
            var key = $"pw:{uid}";
            if (Limited(key, 5, TimeSpan.FromMinutes(5), false)) return Err("Too many attempts. Wait a few minutes.", 429);
            var u = Db.Row("SELECT salt, hash FROM users WHERE id=@i", ("@i", uid))!;
            if (!Db.Verify(b.Current ?? "", Convert.FromBase64String((string)u["salt"]!), Convert.FromBase64String((string)u["hash"]!)))
            {
                Limited(key, 5, TimeSpan.FromMinutes(5), true);
                return Err("Your current password is incorrect.", 403);
            }
            var pw = b.Password ?? "";
            if (pw.Length < 8 || pw.Length > 72) return Err("New password must be 8-72 characters.");
            if (pw == b.Current) return Err("Choose a password different from your current one.");
            SetPassword(uid, pw);
            // Sign out every other device; this one stays signed in.
            var mine = c.Request.Cookies.TryGetValue("tw_session", out var tok) ? Sha(tok) : "";
            Db.Exec("DELETE FROM sessions WHERE userId=@i AND tokenHash<>@t", ("@i", uid), ("@t", mine));
            return Results.Json(new { ok = true });
        }));

        // ---- admin: look at / change another user ----
        api.MapGet("admin/users/{id:long}", (HttpContext c, long id) => WithAdmin(c, _ =>
        {
            var u = UserDto(id);
            return u == null ? Err("User not found.", 404) : Results.Json(u);
        }));

        // Partial update: only the fields present in the body are changed.
        api.MapPut("admin/users/{id:long}", (HttpContext c, long id, JsonElement b) => WithAdmin(c, me =>
        {
            var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", id));
            if (u == null) return Err("User not found.", 404);
            if (id == me) return Err("Use Settings to edit your own account.");
            if (Convert.ToInt32(u["isAdmin"]) == 1) return Err("Remove their admin role first.", 403);
            if (b.ValueKind != JsonValueKind.Object) return Err("Bad request.");
            var set = new List<string>(); var ps = new List<(string, object?)> { ("@i", id) }; var changed = new List<string>();

            if (b.TryGetProperty("username", out var un))
            {
                var name = (un.GetString() ?? "").Trim();
                if (!userRx.IsMatch(name)) return Err("Username must be 3-20 letters, numbers or underscores.");
                if (Db.Scalar("SELECT 1 FROM users WHERE username=@n COLLATE NOCASE AND id<>@i", ("@n", name), ("@i", id)) != null) return Err("That username is taken.", 409);
                set.Add("username=@un"); ps.Add(("@un", name)); changed.Add("username");
            }
            if (b.TryGetProperty("displayName", out var dn))
            {
                var disp = Ctrl.Replace(dn.GetString() ?? "", "").Trim();
                if (disp.Length > 32) return Err("Display name can be at most 32 characters.");
                set.Add("display=@dn"); ps.Add(("@dn", disp.Length == 0 ? null : Enc(disp))); changed.Add("display name");
            }
            if (b.TryGetProperty("region", out var rg))
            {
                var region = rg.GetString() ?? "";
                if (!Db.Regions.Contains(region)) return Err("Unknown region.");
                set.Add("region=@rg"); ps.Add(("@rg", region)); changed.Add("region");
            }
            if (b.TryGetProperty("age", out var ag))
            {
                if (ag.ValueKind != JsonValueKind.Number || !ag.TryGetInt32(out var age) || age is < 13 or > 99) return Err("Age must be 13-99.");
                set.Add("age=@ag"); ps.Add(("@ag", age)); changed.Add("age");
            }
            if (b.TryGetProperty("status", out var st))
            {
                var status = st.GetString() ?? "";
                if (!Statuses.Contains(status)) return Err("Bad status.");
                set.Add("status=@st"); ps.Add(("@st", status)); changed.Add("status");
            }
            if (b.TryGetProperty("playing", out var pl))
            {
                var p = (pl.GetString() ?? "").Trim();
                set.Add("playing=@pl"); ps.Add(("@pl", p.Length == 0 ? null : Enc(Clean(p, 40)))); changed.Add("playing");
            }
            if (b.TryGetProperty("favoriteGames", out var fg))
            {
                if (fg.ValueKind != JsonValueKind.Array) return Err("favoriteGames must be a list.");
                var games = fg.EnumerateArray().Select(x => x.GetString()?.Trim() ?? "").Where(x => !string.IsNullOrEmpty(x) && x.Length <= 80).Select(x => Clean(x, 80)).Distinct().Take(12).ToArray();
                foreach (var g in games) GamesApi.EnsureGame(g);
                set.Add("games=@fg"); ps.Add(("@fg", JsonSerializer.Serialize(games))); changed.Add("favorite games");
            }
            if (set.Count == 0) return Err("Nothing to change.");
            Db.Exec("UPDATE users SET " + string.Join(", ", set) + " WHERE id=@i", ps.ToArray());
            Audit(me, "edited " + string.Join(", ", changed) + " of", (string)u["username"]!);
            return Results.Json(UserDto(id));
        }));

        // "Remove a profile": clears the picture, display name and status line (the account itself stays; use Delete to remove it).
        api.MapPost("admin/users/{id:long}/reset-profile", (HttpContext c, long id) => WithAdmin(c, me =>
        {
            var u = Db.Row("SELECT username, isAdmin FROM users WHERE id=@i", ("@i", id));
            if (u == null) return Err("User not found.", 404);
            if (id == me) return Err("Use Settings to edit your own account.");
            if (Convert.ToInt32(u["isAdmin"]) == 1) return Err("Remove their admin role first.", 403);
            Db.Exec("DELETE FROM avatars WHERE userId=@i", ("@i", id));
            Db.Exec("UPDATE users SET avatarVer=0, display=NULL, playing=NULL WHERE id=@i", ("@i", id));
            Audit(me, "reset profile of", (string)u["username"]!);
            return Results.Json(UserDto(id));
        }));

        api.MapPost("admin/users/{id:long}/password", (HttpContext c, long id, AdminPasswordIn b) => WithAdmin(c, me =>
        {
            var u = Db.Row("SELECT username, isAdmin FROM users WHERE id=@i", ("@i", id));
            if (u == null) return Err("User not found.", 404);
            if (id == me) return Err("Use Settings to change your own password.");
            if (Convert.ToInt32(u["isAdmin"]) == 1) return Err("Remove their admin role first.", 403);
            var pw = b.Password ?? "";
            if (pw.Length < 8 || pw.Length > 72) return Err("Password must be 8-72 characters.");
            SetPassword(id, pw);
            Db.Exec("DELETE FROM sessions WHERE userId=@i", ("@i", id));   // they must log in again with the new password
            Audit(me, "set a new password for", (string)u["username"]!);
            return Results.Json(new { ok = true });
        }));

        // ---- admin: rename a group ----
        api.MapPut("admin/groups/{id:long}", (HttpContext c, long id, GroupRenameIn b) => WithAdmin(c, me =>
        {
            var g = Db.Row("SELECT name FROM grps WHERE id=@i", ("@i", id));
            if (g == null) return Err("Group not found.", 404);
            var name = Ctrl.Replace(b.Name ?? "", "").Trim();
            if (name.Length < 3 || name.Length > 40) return Err("Group name must be 3-40 characters.");
            Db.Exec("UPDATE grps SET name=@n WHERE id=@i", ("@n", Enc(name)), ("@i", id));
            Audit(me, "renamed group", $"{WebUtility.HtmlDecode((string)g["name"]!)} -> {name}");
            return Results.Json(new { ok = true, name = Enc(name) });
        }));
    }

    static List<object> ParseGifItems(JsonElement root)
    {
        var list = new List<object>();
        JsonElement items;
        if (root.TryGetProperty("data", out var dObj) && dObj.ValueKind == JsonValueKind.Object && dObj.TryGetProperty("data", out var dArr) && dArr.ValueKind == JsonValueKind.Array)
            items = dArr;
        else if (root.TryGetProperty("data", out var arr) && arr.ValueKind == JsonValueKind.Array)
            items = arr;
        else if (root.TryGetProperty("results", out var res) && res.ValueKind == JsonValueKind.Array)
            items = res;
        else
            return list;

        foreach (var item in items.EnumerateArray())
        {
            var id = item.TryGetProperty("id", out var idEl) ? idEl.ToString() : "";
            var title = item.TryGetProperty("title", out var tEl) ? tEl.GetString() ?? "" : (item.TryGetProperty("content_description", out var cd) ? cd.GetString() ?? "" : "");
            string? tinyUrl = null, fullUrl = null;
            int w = 200, h = 150;
            if (item.TryGetProperty("files", out var files))
            {
                if (files.TryGetProperty("gif", out var gf) && gf.TryGetProperty("url", out var gu))
                {
                    fullUrl = gu.GetString();
                    if (gf.TryGetProperty("width", out var gw)) w = gw.GetInt32();
                    if (gf.TryGetProperty("height", out var gh)) h = gh.GetInt32();
                }
                if (files.TryGetProperty("tinygif", out var tg) && tg.TryGetProperty("url", out var tgu)) tinyUrl = tgu.GetString();
                else if (files.TryGetProperty("mediumgif", out var mg) && mg.TryGetProperty("url", out var mgu)) tinyUrl = mgu.GetString();
                else if (files.TryGetProperty("preview", out var pv) && pv.TryGetProperty("url", out var pgu)) tinyUrl = pgu.GetString();
            }
            else if (item.TryGetProperty("media_formats", out var mf))
            {
                if (mf.TryGetProperty("gif", out var gf) && gf.TryGetProperty("url", out var gu)) fullUrl = gu.GetString();
                if (mf.TryGetProperty("tinygif", out var tg) && tg.TryGetProperty("url", out var tgu)) tinyUrl = tgu.GetString();
            }
            if (!string.IsNullOrEmpty(fullUrl))
            {
                list.Add(new {
                    id, title,
                    preview = "/api/media/proxy?url=" + WebUtility.UrlEncode(tinyUrl ?? fullUrl),
                    url = "/api/media/proxy?url=" + WebUtility.UrlEncode(fullUrl),
                    width = w, height = h
                });
            }
        }
        return list;
    }
}

public record PasswordIn(string? Current, string? Password);
public record AdminPasswordIn(string? Password);
public record GroupRenameIn(string? Name);
public record PrefsIn(string? AccentColor, double? FontScale, string? Language, bool? NsfwFilter, bool? ProfanityFilter, string[]? FavGifs, Dictionary<string, string>? GamerTags, bool? DisablePfpAnimation = null);
public record ReportIn(long? ReportedUserId, long? MessageId, long? GroupId, string? Reason, string? Details, string? MessageKind = null);
public record TranslateIn(string? Text, string? ToLang);
