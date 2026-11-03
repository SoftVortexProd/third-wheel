using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ThirdWheel");
Directory.CreateDirectory(dataDir);
Db.ConnString = new SqliteConnectionStringBuilder { DataSource = Path.Combine(dataDir, "tw.db"), Pooling = true }.ToString();
Db.Init();

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:5173");
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();

// ---- security headers + CSRF ----
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    h["X-Content-Type-Options"] = "nosniff";
    h["Referrer-Policy"] = "no-referrer";
    h["X-Frame-Options"] = "DENY";
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        h["Cache-Control"] = "no-store";
        var m = ctx.Request.Method;
        if (m != "GET" && m != "HEAD" && m != "OPTIONS" && ctx.Request.Headers["X-TW"] != "1")
        {
            ctx.Response.StatusCode = 403;
            await ctx.Response.WriteAsJsonAsync(new { error = "Missing CSRF header." });
            return;
        }
    }
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");

// ---------- helpers ----------
static IResult Err(string msg, int code = 400) => Results.Json(new { error = msg }, statusCode: code);
static string Enc(string? s) => WebUtility.HtmlEncode((s ?? "").Trim());
static string Clean(string? s, int max) { s = (s ?? "").Trim(); return s.Length > max ? s[..max] : s; }
var userRx = new Regex("^[A-Za-z0-9_]{3,20}$", RegexOptions.Compiled);
var rate = new ConcurrentDictionary<string, List<DateTime>>();
bool Limited(string key, int max, TimeSpan win, bool record)
{
    var list = rate.GetOrAdd(key, _ => new List<DateTime>());
    lock (list)
    {
        list.RemoveAll(t => DateTime.UtcNow - t > win);
        if (list.Count >= max) return true;
        if (record) list.Add(DateTime.UtcNow);
        return false;
    }
}

long? CurrentUser(HttpContext c)
{
    if (!c.Request.Cookies.TryGetValue("tw_session", out var tok) || string.IsNullOrEmpty(tok) || tok.Length > 100) return null;
    var r = Db.Scalar("SELECT userId FROM sessions WHERE tokenHash=@t", ("@t", Sha(tok)));
    return r is long l ? l : null;
}
static string Sha(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)));
void StartSession(HttpContext c, long uid)
{
    var tok = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    Db.Exec("INSERT INTO sessions(tokenHash,userId,created) VALUES(@t,@u,@c)", ("@t", Sha(tok)), ("@u", uid), ("@c", Now()));
    c.Response.Cookies.Append("tw_session", tok, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/", MaxAge = TimeSpan.FromDays(30), IsEssential = true });
}
static string Now() => DateTime.UtcNow.ToString("o");

// Wraps handlers needing a signed-in user.
IResult WithUser(HttpContext c, Func<long, IResult> f)
{
    var uid = CurrentUser(c);
    return uid is null ? Err("Not signed in.", 401) : f(uid.Value);
}

object? UserDto(long id)
{
    var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", id));
    return u is null ? null : UserObj(u);
}
static object UserObj(Dictionary<string, object?> u)
{
    var age = Convert.ToInt32(u["age"]);
    return new
    {
        id = (long)u["id"]!, username = (string)u["username"]!, displayName = u["display"] as string, avatar = AvatarUrl((long)u["id"]!, u["avatarVer"]),
        avatarColor = (string)u["color"]!,
        region = (string)u["region"]!, age, ageRange = AgeRange(age),
        favoriteGames = JsonSerializer.Deserialize<string[]>((string)u["games"]!) ?? Array.Empty<string>(),
        onboarded = Convert.ToInt32(u["onboarded"]) == 1, status = (string)u["status"]!,
        playing = u["playing"] as string
    };
}
static string? AvatarUrl(long id, object? ver) => ver != null && Convert.ToInt64(ver) > 0 ? $"/api/avatars/{id}?v={Convert.ToInt64(ver)}" : null;
static string AgeRange(int a) => a <= 0 ? "" : a < 18 ? "13-17" : a < 25 ? "18-24" : a < 35 ? "25-34" : a < 45 ? "35-44" : "45+";

object PersonObj(Dictionary<string, object?> r, bool isFriend) => new
{
    id = (long)r["id"]!, username = (string)r["username"]!, displayName = r["display"] as string, avatar = AvatarUrl((long)r["id"]!, r["avatarVer"]),
    avatarColor = (string)r["color"]!,
    status = (string)r["status"]!, playing = r["playing"] as string, region = (string)r["region"]!, isFriend
};

const string GroupSel = @"SELECT g.id,g.name,g.game,g.mode,g.region,g.ageMin,g.ageMax,g.description,g.color,
 (SELECT COUNT(*) FROM members m WHERE m.groupId=g.id) memberCount,
 (SELECT COUNT(*) FROM members m WHERE m.groupId=g.id AND m.userId=@me) isMember FROM grps g";
static object GroupObj(Dictionary<string, object?> r) => new
{
    id = (long)r["id"]!, name = (string)r["name"]!, game = (string)r["game"]!, mode = (string)r["mode"]!,
    region = (string)r["region"]!, ageMin = Convert.ToInt32(r["ageMin"]), ageMax = Convert.ToInt32(r["ageMax"]),
    description = (string)r["description"]!, memberCount = Convert.ToInt32(r["memberCount"]),
    isMember = Convert.ToInt32(r["isMember"]) > 0, color = (string)r["color"]!
};
const string MsgSel = "SELECT m.id,m.userId,u.username,u.display,u.avatarVer,u.color avatarColor,m.text,m.createdAt FROM messages m JOIN users u ON u.id=m.userId";
static object MsgObj(Dictionary<string, object?> r) => new
{
    id = (long)r["id"]!, userId = (long)r["userId"]!, username = (string)r["username"]!, displayName = r["display"] as string,
    avatar = AvatarUrl((long)r["userId"]!, r["avatarVer"]), avatarColor = (string)r["avatarColor"]!, text = (string)r["text"]!, createdAt = (string)r["createdAt"]!
};
bool AreFriends(long a, long b) => Db.Scalar("SELECT 1 FROM friends WHERE a=@a AND b=@b", ("@a", Math.Min(a, b)), ("@b", Math.Max(a, b))) != null;
bool IsMember(long g, long u) => Db.Scalar("SELECT 1 FROM members WHERE groupId=@g AND userId=@u", ("@g", g), ("@u", u)) != null;

// ---------- auth ----------
api.MapPost("auth/signup", (HttpContext c, Creds b) =>
{
    var ip = c.Connection.RemoteIpAddress?.ToString() ?? "?";
    if (Limited("su:" + ip, 10, TimeSpan.FromHours(1), true)) return Err("Too many sign-ups. Try later.", 429);
    var name = (b.Username ?? "").Trim(); var pw = b.Password ?? "";
    if (!userRx.IsMatch(name)) return Err("Username must be 3-20 letters, numbers or underscores.");
    if (pw.Length < 8 || pw.Length > 72) return Err("Password must be 8-72 characters.");
    if (Db.Scalar("SELECT 1 FROM users WHERE username=@u COLLATE NOCASE", ("@u", name)) != null) return Err("That username is taken.", 409);
    var id = Db.CreateUser(name, pw, "NA-East", 0, Array.Empty<string>(), "online", null, false);
    StartSession(c, id);
    return Results.Json(new { user = UserDto(id) });
});

var dummy = Db.Hash("dummy-password", RandomNumberGenerator.GetBytes(16));
api.MapPost("auth/login", (HttpContext c, Creds b) =>
{
    var ip = c.Connection.RemoteIpAddress?.ToString() ?? "?";
    var name = (b.Username ?? "").Trim();
    var key = "li:" + ip + ":" + name.ToLowerInvariant();
    if (Limited(key, 5, TimeSpan.FromMinutes(5), false)) return Err("Too many attempts. Wait a few minutes.", 429);
    var u = userRx.IsMatch(name) ? Db.Row("SELECT * FROM users WHERE username=@u COLLATE NOCASE", ("@u", name)) : null;
    bool ok;
    if (u == null) { Db.Verify(b.Password ?? "", (byte[])dummy.Clone(), dummy); ok = false; }
    else ok = Db.Verify(b.Password ?? "", Convert.FromBase64String((string)u["salt"]!), Convert.FromBase64String((string)u["hash"]!));
    if (!ok || u == null) { Limited(key, 5, TimeSpan.FromMinutes(5), true); return Err("Wrong username or password.", 401); }
    rate.TryRemove(key, out _);
    var id = (long)u["id"]!;
    Db.Exec("UPDATE users SET status='online' WHERE id=@i AND status='offline'", ("@i", id));
    StartSession(c, id);
    return Results.Json(new { user = UserDto(id) });
});

api.MapPost("auth/logout", (HttpContext c) =>
{
    if (c.Request.Cookies.TryGetValue("tw_session", out var tok) && tok.Length < 100)
    {
        var uid = CurrentUser(c);
        Db.Exec("DELETE FROM sessions WHERE tokenHash=@t", ("@t", Sha(tok)));
        if (uid != null) Db.Exec("UPDATE users SET status='offline', playing=NULL WHERE id=@i", ("@i", uid.Value));
    }
    c.Response.Cookies.Delete("tw_session", new CookieOptions { Path = "/" });
    return Results.Json(new { ok = true });
});

// ---------- me / meta ----------
api.MapGet("me", (HttpContext c) => WithUser(c, uid => Results.Json(UserDto(uid))));

api.MapPut("me/settings", (HttpContext c, SettingsIn b) => WithUser(c, uid =>
{
    if (b.Region != null && !Db.Regions.Contains(b.Region)) return Err("Unknown region.");
    if (b.Age is < 13 or > 99) return Err("Age must be 13-99.");
    var games = (b.FavoriteGames ?? Array.Empty<string>()).Where(g => Db.Games.Contains(g)).Distinct().Take(12).ToArray();
    var status = b.Status ?? "online";
    if (status is not ("online" or "idle" or "dnd" or "offline")) return Err("Bad status.");
    string? playing = string.IsNullOrWhiteSpace(b.Playing) ? null : Enc(Clean(b.Playing, 40));
    Db.Exec("UPDATE users SET region=COALESCE(@r,region), age=COALESCE(@a,age), games=@g, status=@s, playing=@p, onboarded=COALESCE(@o,onboarded) WHERE id=@i",
        ("@r", b.Region), ("@a", b.Age), ("@g", JsonSerializer.Serialize(games)), ("@s", status), ("@p", playing),
        ("@o", b.Onboarded == null ? null : b.Onboarded.Value ? 1 : 0), ("@i", uid));
    return Results.Json(UserDto(uid));
}));

// ---------- profile: display name, username (password required) ----------
var ctrlRx = new Regex(@"[\p{C}\p{Zl}\p{Zp}]", RegexOptions.Compiled);
api.MapPut("me/profile", (HttpContext c, ProfileIn b) => WithUser(c, uid =>
{
    var key = $"pf:{uid}";
    if (Limited(key, 5, TimeSpan.FromMinutes(5), false)) return Err("Too many attempts. Wait a few minutes.", 429);
    var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", uid))!;
    if (!Db.Verify(b.Password ?? "", Convert.FromBase64String((string)u["salt"]!), Convert.FromBase64String((string)u["hash"]!)))
    {
        Limited(key, 5, TimeSpan.FromMinutes(5), true);
        return Err("Your password is incorrect.", 403);
    }
    var name = (b.Username ?? (string)u["username"]!).Trim();
    if (!userRx.IsMatch(name)) return Err("Username must be 3-20 letters, numbers or underscores.");
    if (Db.Scalar("SELECT 1 FROM users WHERE username=@n COLLATE NOCASE AND id<>@i", ("@n", name), ("@i", uid)) != null) return Err("That username is taken.", 409);
    var disp = ctrlRx.Replace(b.DisplayName ?? "", "").Trim();
    if (disp.Length > 32) return Err("Display name can be at most 32 characters.");
    Db.Exec("UPDATE users SET username=@n, display=@d WHERE id=@i", ("@n", name), ("@d", disp.Length == 0 ? null : Enc(disp)), ("@i", uid));
    return Results.Json(UserDto(uid));
}));

// ---------- avatars (PNG / JPG / GIF / WebP; GIFs stay animated) ----------
const int MaxAvatar = 5 * 1024 * 1024;
api.MapPost("me/avatar", async Task<IResult> (HttpContext c) =>
{
    var uid = CurrentUser(c);
    if (uid is null) return Err("Not signed in.", 401);
    if (Limited($"av:{uid}", 12, TimeSpan.FromHours(1), true)) return Err("Too many uploads. Try again later.", 429);
    if (c.Request.ContentLength > MaxAvatar) return Err("Image must be 5 MB or smaller.", 413);
    using var ms = new MemoryStream();
    var buf = new byte[81920]; int n;
    while ((n = await c.Request.Body.ReadAsync(buf)) > 0)
    {
        ms.Write(buf, 0, n);
        if (ms.Length > MaxAvatar) return Err("Image must be 5 MB or smaller.", 413);
    }
    var data = ms.ToArray();
    var mime = SniffImage(data);
    if (mime == null) return Err("Use a PNG, JPG, GIF or WebP image (max 4096 px).");
    Db.Exec("INSERT OR REPLACE INTO avatars(userId,mime,data) VALUES(@u,@m,@d)", ("@u", uid.Value), ("@m", mime), ("@d", data));
    Db.Exec("UPDATE users SET avatarVer=@v WHERE id=@i", ("@v", DateTime.UtcNow.Ticks), ("@i", uid.Value));
    return Results.Json(UserDto(uid.Value));
});

api.MapDelete("me/avatar", (HttpContext c) => WithUser(c, uid =>
{
    Db.Exec("DELETE FROM avatars WHERE userId=@u", ("@u", uid));
    Db.Exec("UPDATE users SET avatarVer=0 WHERE id=@i", ("@i", uid));
    return Results.Json(UserDto(uid));
}));

api.MapGet("avatars/{id:long}", (HttpContext c, long id) => WithUser(c, _ =>
{
    var r = Db.Row("SELECT mime,data FROM avatars WHERE userId=@u", ("@u", id));
    if (r == null) return Err("No picture.", 404);
    // Served as an inert image: no sniffing, no scripts, no framing, even if the bytes were hostile.
    c.Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
    c.Response.Headers["Cache-Control"] = "private, max-age=31536000, immutable";
    return Results.Bytes((byte[])r["data"]!, (string)r["mime"]!);
}));

// Validate by magic bytes (never trust the client's content-type) and reject absurd dimensions.
static string? SniffImage(byte[] d)
{
    if (d.Length < 32) return null;
    static int Be32(byte[] b, int o) => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
    if (d[0] == 0x89 && d[1] == 0x50 && d[2] == 0x4E && d[3] == 0x47 && d[4] == 0x0D && d[5] == 0x0A && d[6] == 0x1A && d[7] == 0x0A)
        return Be32(d, 16) is > 0 and <= 4096 && Be32(d, 20) is > 0 and <= 4096 ? "image/png" : null;
    if (d[0] == 0xFF && d[1] == 0xD8 && d[2] == 0xFF) return "image/jpeg";
    if (d[0] == 'G' && d[1] == 'I' && d[2] == 'F' && d[3] == '8' && (d[4] == '7' || d[4] == '9') && d[5] == 'a')
    {
        int w = d[6] | (d[7] << 8), h = d[8] | (d[9] << 8);
        return w is > 0 and <= 4096 && h is > 0 and <= 4096 ? "image/gif" : null;
    }
    if (d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') return "image/webp";
    return null;
}

api.MapGet("meta", () => Results.Json(new { games = Db.Games, regions = Db.Regions }));

// ---------- search / feed ----------
api.MapGet("search", (HttpContext c, string? q, string? game, string? mode, string? region, int? ageMin, int? ageMax) => WithUser(c, uid =>
{
    q = Clean(q, 60);
    var like = "%" + q.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
    // groups
    var sb = new StringBuilder(GroupSel + " WHERE 1=1");
    var ps = new List<(string, object?)> { ("@me", uid) };
    if (q.Length > 0) { sb.Append(" AND (g.name LIKE @q ESCAPE '\\' OR g.description LIKE @q ESCAPE '\\' OR g.game LIKE @q ESCAPE '\\')"); ps.Add(("@q", like)); }
    if (!string.IsNullOrEmpty(game)) { sb.Append(" AND g.game=@game"); ps.Add(("@game", game)); }
    if (mode is "casual" or "competitive") { sb.Append(" AND g.mode=@mode"); ps.Add(("@mode", mode)); }
    if (!string.IsNullOrEmpty(region)) { sb.Append(" AND g.region=@region"); ps.Add(("@region", region)); }
    if (ageMin != null) { sb.Append(" AND g.ageMax>=@amin"); ps.Add(("@amin", ageMin)); }
    if (ageMax != null) { sb.Append(" AND g.ageMin<=@amax"); ps.Add(("@amax", ageMax)); }
    sb.Append(" ORDER BY memberCount DESC LIMIT 50");
    var groups = Db.Rows(sb.ToString(), ps.ToArray()).Select(GroupObj).ToList();

    // people
    var pb = new StringBuilder("SELECT u.*, (SELECT COUNT(*) FROM friends f WHERE (f.a=@me AND f.b=u.id) OR (f.b=@me AND f.a=u.id)) isFriend FROM users u WHERE u.id<>@me");
    var pp = new List<(string, object?)> { ("@me", uid) };
    if (q.Length > 0) { pb.Append(" AND u.username LIKE @q ESCAPE '\\'"); pp.Add(("@q", like)); }
    if (!string.IsNullOrEmpty(game)) { pb.Append(" AND u.games LIKE @gm"); pp.Add(("@gm", "%" + JsonSerializer.Serialize(game).Replace("%", "") + "%")); }
    if (!string.IsNullOrEmpty(region)) { pb.Append(" AND u.region=@region"); pp.Add(("@region", region)); }
    if (ageMin != null) { pb.Append(" AND u.age>=@amin"); pp.Add(("@amin", ageMin)); }
    if (ageMax != null) { pb.Append(" AND u.age>0 AND u.age<=@amax"); pp.Add(("@amax", ageMax)); }
    pb.Append(" ORDER BY isFriend DESC, u.username COLLATE NOCASE LIMIT 50");
    var people = Db.Rows(pb.ToString(), pp.ToArray()).Select(r => PersonObj(r, Convert.ToInt32(r["isFriend"]) > 0)).ToList();
    return Results.Json(new { groups, people });
}));

api.MapGet("feed", (HttpContext c) => WithUser(c, uid =>
{
    var me = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", uid))!;
    var favs = JsonSerializer.Deserialize<string[]>((string)me["games"]!) ?? Array.Empty<string>();
    var rows = Db.Rows(GroupSel + " WHERE g.id NOT IN (SELECT groupId FROM members WHERE userId=@me)", ("@me", uid));
    var list = rows.OrderByDescending(r => (favs.Contains((string)r["game"]!) ? 2 : 0) + ((string)r["region"]! == (string)me["region"]! ? 1 : 0))
                   .ThenByDescending(r => Convert.ToInt32(r["memberCount"])).Take(30).Select(GroupObj);
    return Results.Json(list);
}));

// ---------- groups ----------
api.MapPost("groups", (HttpContext c, GroupIn b) => WithUser(c, uid =>
{
    var name = Clean(b.Name, 40);
    if (name.Length < 3) return Err("Group name must be at least 3 characters.");
    if (!Db.Games.Contains(b.Game ?? "")) return Err("Pick a game from the list.");
    if (b.Mode is not ("casual" or "competitive")) return Err("Mode must be casual or competitive.");
    if (!Db.Regions.Contains(b.Region ?? "")) return Err("Unknown region.");
    int lo = b.AgeMin ?? 13, hi = b.AgeMax ?? 99;
    if (lo < 13 || hi > 99 || lo > hi) return Err("Invalid age range.");
    var color = Db.Palette[Random.Shared.Next(Db.Palette.Length)];
    var gid = Db.Insert("INSERT INTO grps(name,game,mode,region,ageMin,ageMax,description,color,ownerId,created) VALUES(@n,@g,@m,@r,@lo,@hi,@d,@c,@o,@t)",
        ("@n", Enc(name)), ("@g", b.Game), ("@m", b.Mode), ("@r", b.Region), ("@lo", lo), ("@hi", hi), ("@d", Enc(Clean(b.Description, 300))), ("@c", color), ("@o", uid), ("@t", Now()));
    Db.Exec("INSERT INTO members(groupId,userId) VALUES(@g,@u)", ("@g", gid), ("@u", uid));
    return Results.Json(GroupObj(Db.Row(GroupSel + " WHERE g.id=@g", ("@g", gid), ("@me", uid))!));
}));

api.MapGet("groups/mine", (HttpContext c) => WithUser(c, uid =>
    Results.Json(Db.Rows(GroupSel + " WHERE g.id IN (SELECT groupId FROM members WHERE userId=@me) ORDER BY g.name COLLATE NOCASE", ("@me", uid)).Select(GroupObj))));

api.MapGet("groups/{id:long}", (HttpContext c, long id) => WithUser(c, uid =>
{
    var g = Db.Row(GroupSel + " WHERE g.id=@g", ("@g", id), ("@me", uid));
    if (g == null) return Err("Group not found.", 404);
    var members = Db.Rows("SELECT u.* FROM members m JOIN users u ON u.id=m.userId WHERE m.groupId=@g ORDER BY u.username COLLATE NOCASE", ("@g", id))
        .Select(r => PersonObj(r, AreFriends(uid, (long)r["id"]!))).ToList();
    var o = JsonSerializer.SerializeToElement(GroupObj(g));
    var dict = JsonSerializer.Deserialize<Dictionary<string, object?>>(o.GetRawText())!;
    dict["members"] = members;
    return Results.Json(dict);
}));

api.MapPost("groups/{id:long}/join", (HttpContext c, long id) => WithUser(c, uid =>
{
    if (Db.Scalar("SELECT 1 FROM grps WHERE id=@g", ("@g", id)) == null) return Err("Group not found.", 404);
    Db.Exec("INSERT OR IGNORE INTO members(groupId,userId) VALUES(@g,@u)", ("@g", id), ("@u", uid));
    return Results.Json(GroupObj(Db.Row(GroupSel + " WHERE g.id=@g", ("@g", id), ("@me", uid))!));
}));

api.MapPost("groups/{id:long}/leave", (HttpContext c, long id) => WithUser(c, uid =>
{
    Db.Exec("DELETE FROM members WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", uid));
    return Results.Json(new { ok = true });
}));

api.MapGet("groups/{id:long}/messages", (HttpContext c, long id, long? after) => WithUser(c, uid =>
{
    if (!IsMember(id, uid)) return Err("Join the group to read its chat.", 403);
    var sql = MsgSel + " WHERE m.groupId=@g";
    List<Dictionary<string, object?>> rows;
    if (after != null) rows = Db.Rows(sql + " AND m.id>@a ORDER BY m.id ASC LIMIT 200", ("@g", id), ("@a", after));
    else { rows = Db.Rows(sql + " ORDER BY m.id DESC LIMIT 100", ("@g", id)); rows.Reverse(); }
    return Results.Json(rows.Select(MsgObj));
}));

api.MapPost("groups/{id:long}/messages", (HttpContext c, long id, MessageIn b) => WithUser(c, uid =>
{
    if (!IsMember(id, uid)) return Err("Join the group to chat.", 403);
    var text = Clean(b.Text, 1000);
    if (text.Length == 0) return Err("Message is empty.");
    if (Limited($"msg:{uid}", 30, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
    var mid = Db.Insert("INSERT INTO messages(groupId,userId,text,createdAt) VALUES(@g,@u,@t,@c)", ("@g", id), ("@u", uid), ("@t", Enc(text)), ("@c", Now()));
    var r = Db.Row(MsgSel + " WHERE m.id=@i", ("@i", mid))!;
    return Results.Json(MsgObj(r));
}));

// ---------- friends ----------
api.MapGet("friends", (HttpContext c) => WithUser(c, uid =>
    Results.Json(Db.Rows(@"SELECT u.* FROM friends f JOIN users u ON u.id=CASE WHEN f.a=@me THEN f.b ELSE f.a END WHERE f.a=@me OR f.b=@me
        ORDER BY CASE u.status WHEN 'offline' THEN 1 ELSE 0 END, u.username COLLATE NOCASE", ("@me", uid)).Select(r => PersonObj(r, true)))));

api.MapPost("friends/request", (HttpContext c, FriendIn b) => WithUser(c, uid =>
{
    var name = (b.Username ?? "").Trim();
    if (!userRx.IsMatch(name)) return Err("Enter a valid username.");
    var t = Db.Row("SELECT id FROM users WHERE username=@u COLLATE NOCASE", ("@u", name));
    if (t == null) return Err("No user with that name.", 404);
    var tid = (long)t["id"]!;
    if (tid == uid) return Err("You can't add yourself.");
    if (AreFriends(uid, tid)) return Err("Already friends.", 409);
    var reverse = Db.Row("SELECT id FROM frequests WHERE fromId=@t AND toId=@u", ("@t", tid), ("@u", uid));
    if (reverse != null) { AcceptRequest((long)reverse["id"]!, uid); return Results.Json(new { ok = true, accepted = true }); }
    if (Limited($"fr:{uid}", 20, TimeSpan.FromHours(1), true)) return Err("Too many requests.", 429);
    Db.Exec("INSERT OR IGNORE INTO frequests(fromId,toId) VALUES(@f,@t)", ("@f", uid), ("@t", tid));
    return Results.Json(new { ok = true });
}));

void AcceptRequest(long reqId, long uid)
{
    var r = Db.Row("SELECT * FROM frequests WHERE id=@i AND toId=@u", ("@i", reqId), ("@u", uid));
    if (r == null) return;
    long a = (long)r["fromId"]!, b = uid;
    Db.Exec("INSERT OR IGNORE INTO friends(a,b) VALUES(@a,@b)", ("@a", Math.Min(a, b)), ("@b", Math.Max(a, b)));
    Db.Exec("DELETE FROM frequests WHERE (fromId=@a AND toId=@b) OR (fromId=@b AND toId=@a)", ("@a", a), ("@b", b));
}

api.MapGet("friends/requests", (HttpContext c) => WithUser(c, uid =>
{
    var inc = Db.Rows("SELECT r.id rid, u.* FROM frequests r JOIN users u ON u.id=r.fromId WHERE r.toId=@me", ("@me", uid))
        .Select(r => new { id = (long)r["rid"]!, from = PersonObj(r, false) });
    var outg = Db.Rows("SELECT r.id rid, u.* FROM frequests r JOIN users u ON u.id=r.toId WHERE r.fromId=@me", ("@me", uid))
        .Select(r => new { id = (long)r["rid"]!, to = PersonObj(r, false) });
    return Results.Json(new { incoming = inc, outgoing = outg });
}));

api.MapPost("friends/requests/{id:long}/accept", (HttpContext c, long id) => WithUser(c, uid => { AcceptRequest(id, uid); return Results.Json(new { ok = true }); }));
api.MapPost("friends/requests/{id:long}/decline", (HttpContext c, long id) => WithUser(c, uid =>
{
    Db.Exec("DELETE FROM frequests WHERE id=@i AND (toId=@u OR fromId=@u)", ("@i", id), ("@u", uid));
    return Results.Json(new { ok = true });
}));

// ---------- invites ----------
api.MapPost("groups/{id:long}/invites", (HttpContext c, long id, InviteIn b) => WithUser(c, uid =>
{
    if (!IsMember(id, uid)) return Err("Only members can invite.", 403);
    if (!AreFriends(uid, b.UserId)) return Err("You can only invite friends.", 403);
    if (IsMember(id, b.UserId)) return Err("They are already in this group.", 409);
    Db.Exec("INSERT OR IGNORE INTO invites(groupId,fromId,toId) VALUES(@g,@f,@t)", ("@g", id), ("@f", uid), ("@t", b.UserId));
    return Results.Json(new { ok = true });
}));

api.MapGet("invites", (HttpContext c) => WithUser(c, uid =>
{
    var rows = Db.Rows("SELECT i.id iid, i.groupId, i.fromId FROM invites i WHERE i.toId=@me ORDER BY i.id DESC", ("@me", uid));
    var res = rows.Select(r =>
    {
        var g = Db.Row(GroupSel + " WHERE g.id=@g", ("@g", r["groupId"]), ("@me", uid));
        var f = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", r["fromId"]));
        return g == null || f == null ? null : new { id = (long)r["iid"]!, group = GroupObj(g), from = PersonObj(f, true) };
    }).Where(x => x != null);
    return Results.Json(res);
}));

api.MapPost("invites/{id:long}/accept", (HttpContext c, long id) => WithUser(c, uid =>
{
    var i = Db.Row("SELECT * FROM invites WHERE id=@i AND toId=@u", ("@i", id), ("@u", uid));
    if (i == null) return Err("Invite not found.", 404);
    Db.Exec("INSERT OR IGNORE INTO members(groupId,userId) VALUES(@g,@u)", ("@g", i["groupId"]), ("@u", uid));
    Db.Exec("DELETE FROM invites WHERE id=@i", ("@i", id));
    return Results.Json(GroupObj(Db.Row(GroupSel + " WHERE g.id=@g", ("@g", i["groupId"]), ("@me", uid))!));
}));
api.MapPost("invites/{id:long}/decline", (HttpContext c, long id) => WithUser(c, uid =>
{
    Db.Exec("DELETE FROM invites WHERE id=@i AND toId=@u", ("@i", id), ("@u", uid));
    return Results.Json(new { ok = true });
}));

api.MapFallback(() => Err("Not found.", 404));
app.MapFallbackToFile("index.html");
app.Run();

record Creds(string? Username, string? Password);
record ProfileIn(string? DisplayName, string? Username, string? Password);
record SettingsIn(string? Region, int? Age, string[]? FavoriteGames, string? Playing, string? Status, bool? Onboarded);
record GroupIn(string? Name, string? Game, string? Mode, string? Region, int? AgeMin, int? AgeMax, string? Description);
record MessageIn(string? Text);
record FriendIn(string? Username);
record InviteIn(long UserId);

// ---------- data layer ----------
static class Db
{
    public static string ConnString = "";
    public static readonly string[] Games = {
        "Valorant", "Minecraft", "Roblox", "Resident Evil Requiem", "Lunar Client", "Fortnite", "League of Legends", "Counter-Strike 2",
        "Apex Legends", "Overwatch 2", "Rocket League", "Among Us", "Genshin Impact", "Call of Duty", "Rainbow Six Siege", "Dota 2",
        "Elden Ring", "Stardew Valley", "Helldivers 2", "Destiny 2", "Marvel Rivals", "Palworld", "Terraria", "FIFA / FC", "Mario Kart" };
    public static readonly string[] Regions = { "NA-East", "NA-West", "EU", "Asia", "OCE", "SA", "ME", "Africa" };
    public static readonly string[] Palette = { "#e5484d", "#f76b15", "#ffb224", "#30a46c", "#12a594", "#3e63dd", "#8e4ec6", "#d6409f", "#6e56cf", "#0090ff" };

    static SqliteConnection Open() { var c = new SqliteConnection(ConnString); c.Open(); return c; }
    static void Bind(SqliteCommand cmd, (string, object?)[] ps)
    {
        foreach (var (n, v) in ps)
        {
            if (cmd.Parameters.Contains(n)) cmd.Parameters[n].Value = v ?? DBNull.Value;
            else cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        }
    }
    static SqliteCommand Cmd(SqliteConnection c, string sql, (string, object?)[] ps)
    {
        var cmd = c.CreateCommand(); cmd.CommandText = sql;
        foreach (var (n, v) in ps) if (sql.Contains(n)) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        return cmd;
    }
    public static void Exec(string sql, params (string, object?)[] ps) { using var c = Open(); using var cmd = Cmd(c, sql, ps); cmd.ExecuteNonQuery(); }
    public static long Insert(string sql, params (string, object?)[] ps)
    {
        using var c = Open(); using var cmd = Cmd(c, sql, ps); cmd.ExecuteNonQuery();
        using var id = c.CreateCommand(); id.CommandText = "SELECT last_insert_rowid()"; return (long)id.ExecuteScalar()!;
    }
    public static object? Scalar(string sql, params (string, object?)[] ps) { using var c = Open(); using var cmd = Cmd(c, sql, ps); return cmd.ExecuteScalar(); }
    public static List<Dictionary<string, object?>> Rows(string sql, params (string, object?)[] ps)
    {
        using var c = Open(); using var cmd = Cmd(c, sql, ps); using var r = cmd.ExecuteReader();
        var list = new List<Dictionary<string, object?>>();
        while (r.Read())
        {
            var d = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < r.FieldCount; i++) d[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
            list.Add(d);
        }
        return list;
    }
    public static Dictionary<string, object?>? Row(string sql, params (string, object?)[] ps) => Rows(sql, ps).FirstOrDefault();

    public static byte[] Hash(string pw, byte[] salt) => Rfc2898DeriveBytes.Pbkdf2(pw, salt, 210_000, HashAlgorithmName.SHA256, 32);
    public static bool Verify(string pw, byte[] salt, byte[] expected) => CryptographicOperations.FixedTimeEquals(Hash(pw, salt), expected);

    public static long CreateUser(string name, string pw, string region, int age, string[] games, string status, string? playing, bool onboarded)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        return Insert("INSERT INTO users(username,hash,salt,color,region,age,games,onboarded,status,playing,created) VALUES(@u,@h,@s,@c,@r,@a,@g,@o,@st,@p,@t)",
            ("@u", name), ("@h", Convert.ToBase64String(Hash(pw, salt))), ("@s", Convert.ToBase64String(salt)),
            ("@c", Palette[Random.Shared.Next(Palette.Length)]), ("@r", region), ("@a", age), ("@g", JsonSerializer.Serialize(games)),
            ("@o", onboarded ? 1 : 0), ("@st", status), ("@p", playing), ("@t", DateTime.UtcNow.ToString("o")));
    }

    public static void Init()
    {
        Exec(@"PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, hash TEXT, salt TEXT, color TEXT, region TEXT, age INTEGER DEFAULT 0, games TEXT DEFAULT '[]', onboarded INTEGER DEFAULT 0, status TEXT DEFAULT 'offline', playing TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS sessions(tokenHash TEXT PRIMARY KEY, userId INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS grps(id INTEGER PRIMARY KEY, name TEXT, game TEXT, mode TEXT, region TEXT, ageMin INTEGER, ageMax INTEGER, description TEXT, color TEXT, ownerId INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS members(groupId INTEGER, userId INTEGER, PRIMARY KEY(groupId,userId));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, groupId INTEGER, userId INTEGER, text TEXT, createdAt TEXT);
CREATE INDEX IF NOT EXISTS ix_msg ON messages(groupId,id);
CREATE TABLE IF NOT EXISTS friends(a INTEGER, b INTEGER, PRIMARY KEY(a,b));
CREATE TABLE IF NOT EXISTS frequests(id INTEGER PRIMARY KEY, fromId INTEGER, toId INTEGER, UNIQUE(fromId,toId));
CREATE TABLE IF NOT EXISTS invites(id INTEGER PRIMARY KEY, groupId INTEGER, fromId INTEGER, toId INTEGER, UNIQUE(groupId,toId));
CREATE TABLE IF NOT EXISTS avatars(userId INTEGER PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);");
        // Upgrade databases created before profiles existed.
        var cols = Rows("PRAGMA table_info(users)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!cols.Contains("display")) Exec("ALTER TABLE users ADD COLUMN display TEXT");
        if (!cols.Contains("avatarVer")) Exec("ALTER TABLE users ADD COLUMN avatarVer INTEGER DEFAULT 0");
    }
}
