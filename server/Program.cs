using static Core;
using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

// Deployment knobs (all optional): TW_DATA = data folder, TW_URLS = listen address.
var dataDir = Environment.GetEnvironmentVariable("TW_DATA")
    ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ThirdWheel");
Directory.CreateDirectory(dataDir);
Db.ConnString = new SqliteConnectionStringBuilder { DataSource = Path.Combine(dataDir, "tw.db"), Pooling = true }.ToString();
Db.Init();
Site.Load();

// Owner tool, run on the server:  Server.exe --create-admin <username>
// Promotes an existing account to admin, or creates one (password read from the console, never stored in a file or env var).
if (args.Length >= 2 && args[0] == "--create-admin")
{
    var an = args[1].Trim();
    if (!Regex.IsMatch(an, "^[A-Za-z0-9_]{3,20}$")) { Console.Error.WriteLine("Username must be 3-20 letters, numbers or underscores."); return 1; }
    var existing = Db.Row("SELECT id FROM users WHERE username=@u COLLATE NOCASE", ("@u", an));
    if (existing != null)
    {
        Db.Exec("UPDATE users SET isAdmin=1, banned=0 WHERE id=@i", ("@i", existing["id"]));
        Console.WriteLine($"'{an}' is now an admin.");
        return 0;
    }
    string pw;
    if (Console.IsInputRedirected) pw = Console.ReadLine() ?? "";
    else
    {
        Console.Write($"New admin '{an}' does not exist yet. Choose a password (8-72 chars, hidden): ");
        var sb = new StringBuilder(); ConsoleKeyInfo k;
        while ((k = Console.ReadKey(true)).Key != ConsoleKey.Enter)
        {
            if (k.Key == ConsoleKey.Backspace) { if (sb.Length > 0) sb.Length--; }
            else if (!char.IsControl(k.KeyChar)) sb.Append(k.KeyChar);
        }
        Console.WriteLine(); pw = sb.ToString();
    }
    pw = pw.TrimStart('﻿').TrimEnd('\r', '\n');   // piped input from PowerShell can start with a byte-order mark
    if (pw.Length < 8 || pw.Length > 72) { Console.Error.WriteLine("Password must be 8-72 characters."); return 1; }
    var nid = Db.CreateUser(an, pw, "NA-East", 0, Array.Empty<string>(), "offline", null, true);
    Db.Exec("UPDATE users SET isAdmin=1 WHERE id=@i", ("@i", nid));
    Console.WriteLine($"Admin account '{an}' created.");
    return 0;
}

// A published server ships its wwwroot beside the exe; as a Windows service the working dir is System32, so pin the content root.
var exeDir = AppContext.BaseDirectory;
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = Directory.Exists(Path.Combine(exeDir, "wwwroot")) ? exeDir : null
});
builder.Host.UseWindowsService(o => o.ServiceName = "ThirdWheel");
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("TW_URLS") ?? "http://127.0.0.1:5173");
// The Windows service host adds an Event Log logger whose missing event source can itself crash startup and hide the real error; log to console instead.
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();

// Behind a local reverse proxy (Caddy) this restores the real client IP and https scheme. Only loopback proxies are trusted.
app.UseForwardedHeaders(new ForwardedHeadersOptions { ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto });

// ---- security headers + CSRF ----
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    if (ctx.Request.IsHttps) h["Strict-Transport-Security"] = "max-age=31536000";
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

        // Maintenance mode / closed pages: everyone except admins gets a 503 with the admin's message.
        var path = ctx.Request.Path.Value ?? "";
        var page = Site.PageOf(path);
        bool exempt = path is "/api/site" or "/api/me" or "/api/meta" or "/api/auth/login" or "/api/auth/logout"
            || path.StartsWith("/api/admin") || path.StartsWith("/api/avatars") || path.StartsWith("/api/games");
        if (!exempt && (Site.Maintenance || (page != null && Site.Closed.ContainsKey(page))))
        {
            var who = CurrentUser(ctx);
            var admin = who != null && Convert.ToInt32(Db.Scalar("SELECT isAdmin FROM users WHERE id=@i", ("@i", who.Value))) == 1;
            if (!admin)
            {
                ctx.Response.StatusCode = 503;
                await ctx.Response.WriteAsJsonAsync(new { error = Site.Maintenance ? Site.MaintenanceMessage : Site.Closed[page!], maintenance = Site.Maintenance, page });
                return;
            }
        }
    }
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");

// Feature modules (each lives in Features/*.cs and registers its own routes). Migrations run from Db.Init.
ChatApi.Map(api);
GroupsApi.Map(api);
ProfileApi.Map(api);
NotifyApi.Map(api);
AccountApi.Map(api);
GamesApi.Map(api);


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
    if (Convert.ToInt32(u["banned"]) == 1)
    {
        var why = u["banReason"] as string;
        return Err("This account has been suspended." + (string.IsNullOrEmpty(why) ? "" : " Reason: " + why), 403);
    }
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
    // Age is chosen once (at the starter menu). After that only an admin can change it, from the admin panel.
    var currentAge = Convert.ToInt32(Db.Scalar("SELECT age FROM users WHERE id=@i", ("@i", uid)));
    if (b.Age != null && currentAge > 0 && b.Age != currentAge) return Err("Your age can only be changed by an admin.", 403);
    var games = (b.FavoriteGames ?? Array.Empty<string>()).Where(g => !string.IsNullOrWhiteSpace(g) && g.Length <= 80).Select(g => Clean(g, 80)).Distinct().Take(12).ToArray();
    foreach (var g in games) GamesApi.EnsureGame(g);
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

// ---------- site status (public) + admin ----------
api.MapGet("site", () => Results.Json(Site.Snapshot()));


api.MapGet("admin/stats", (HttpContext c) => WithAdmin(c, _ => Results.Json(new
{
    users = Count("SELECT COUNT(*) FROM users"), online = Count("SELECT COUNT(*) FROM users WHERE status<>'offline'"),
    banned = Count("SELECT COUNT(*) FROM users WHERE banned=1"), groups = Count("SELECT COUNT(*) FROM grps"),
    groupMessages = Count("SELECT COUNT(*) FROM messages"), directMessages = Count("SELECT COUNT(*) FROM dms"),
    recent = Db.Rows("SELECT a.action, a.target, a.at, u.username admin FROM audit a LEFT JOIN users u ON u.id=a.adminId ORDER BY a.id DESC LIMIT 12")
        .Select(r => new { action = (string)r["action"]!, target = (string)r["target"]!, at = (string)r["at"]!, admin = r["admin"] as string })
})));

api.MapGet("admin/users", (HttpContext c, string? q) => WithAdmin(c, _ =>
{
    var like = "%" + (q ?? "").Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
    var rows = Db.Rows(@"SELECT u.id,u.username,u.display,u.avatarVer,u.color,u.isAdmin,u.banned,u.banReason,u.created,u.status,
        (SELECT COUNT(*) FROM members m WHERE m.userId=u.id) groups FROM users u WHERE u.username LIKE @q ESCAPE '\' ORDER BY u.id DESC LIMIT 100", ("@q", like));
    return Results.Json(rows.Select(r => new
    {
        id = (long)r["id"]!, username = (string)r["username"]!, displayName = r["display"] as string, avatar = AvatarUrl((long)r["id"]!, r["avatarVer"]),
        avatarColor = (string)r["color"]!, isAdmin = Convert.ToInt32(r["isAdmin"]) == 1, banned = Convert.ToInt32(r["banned"]) == 1,
        banReason = r["banReason"] as string, created = (string)r["created"]!, status = (string)r["status"]!, groups = Convert.ToInt32(r["groups"])
    }));
}));

api.MapPost("admin/users/{id:long}/ban", (HttpContext c, long id, BanIn b) => WithAdmin(c, me =>
{
    var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", id));
    if (u == null) return Err("User not found.", 404);
    if (id == me) return Err("You can't suspend yourself.");
    if (Convert.ToInt32(u["isAdmin"]) == 1) return Err("Remove their admin role first.");
    var ban = b.Banned;
    Db.Exec("UPDATE users SET banned=@b, banReason=@r WHERE id=@i", ("@b", ban ? 1 : 0), ("@r", ban ? Enc(Clean(b.Reason, 120)) : null), ("@i", id));
    if (ban) { Db.Exec("DELETE FROM sessions WHERE userId=@i", ("@i", id)); Db.Exec("UPDATE users SET status='offline', playing=NULL WHERE id=@i", ("@i", id)); }
    Audit(me, ban ? "suspended" : "unsuspended", (string)u["username"]!);
    return Results.Json(new { ok = true });
}));

api.MapPost("admin/users/{id:long}/role", (HttpContext c, long id, RoleIn b) => WithAdmin(c, me =>
{
    var u = Db.Row("SELECT username FROM users WHERE id=@i", ("@i", id));
    if (u == null) return Err("User not found.", 404);
    if (id == me) return Err("You can't change your own role.");
    Db.Exec("UPDATE users SET isAdmin=@a WHERE id=@i", ("@a", b.IsAdmin ? 1 : 0), ("@i", id));
    Audit(me, b.IsAdmin ? "made admin" : "removed admin", (string)u["username"]!);
    return Results.Json(new { ok = true });
}));

api.MapDelete("admin/users/{id:long}", (HttpContext c, long id) => WithAdmin(c, me =>
{
    var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", id));
    if (u == null) return Err("User not found.", 404);
    if (id == me) return Err("You can't delete yourself.");
    if (Convert.ToInt32(u["isAdmin"]) == 1) return Err("Remove their admin role first.");
    var ps = new (string, object?)[] { ("@i", id) };
    // leave their groups properly first (hands ownership on, deletes groups that empty out), then clear moderation rows
    foreach (var gm in Db.Rows("SELECT groupId FROM members WHERE userId=@i", ps)) GroupsApi.RemoveMember((long)gm["groupId"]!, id);
    Db.Exec("DELETE FROM group_bans WHERE userId=@i", ps); Db.Exec("DELETE FROM group_mutes WHERE userId=@i", ps); Db.Exec("DELETE FROM join_requests WHERE userId=@i", ps);
    foreach (var sql in new[] {
        "DELETE FROM sessions WHERE userId=@i", "DELETE FROM messages WHERE userId=@i", "DELETE FROM dms WHERE a=@i OR b=@i",
        "DELETE FROM friends WHERE a=@i OR b=@i", "DELETE FROM frequests WHERE fromId=@i OR toId=@i", "DELETE FROM invites WHERE fromId=@i OR toId=@i",
        "DELETE FROM members WHERE userId=@i", "DELETE FROM avatars WHERE userId=@i", "DELETE FROM reactions WHERE userId=@i", "DELETE FROM users WHERE id=@i" })
        Db.Exec(sql, ps);
    foreach (var g in Db.Rows("SELECT g.id FROM grps g WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.groupId=g.id)")) DeleteGroup((long)g["id"]!);
    Audit(me, "deleted user", (string)u["username"]!);
    return Results.Json(new { ok = true });
}));

api.MapGet("admin/groups", (HttpContext c, string? q) => WithAdmin(c, _ =>
{
    var like = "%" + (q ?? "").Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
    return Results.Json(Db.Rows(@"SELECT g.id,g.name,g.game,g.mode,g.region,g.created,(SELECT COUNT(*) FROM members m WHERE m.groupId=g.id) memberCount
        FROM grps g WHERE g.name LIKE @q ESCAPE '\' OR g.game LIKE @q ESCAPE '\' ORDER BY g.id DESC LIMIT 100", ("@q", like))
        .Select(r => new { id = (long)r["id"]!, name = (string)r["name"]!, game = (string)r["game"]!, mode = (string)r["mode"]!, region = (string)r["region"]!,
            created = (string)r["created"]!, memberCount = Convert.ToInt32(r["memberCount"]) }));
}));

api.MapDelete("admin/groups/{id:long}", (HttpContext c, long id) => WithAdmin(c, me =>
{
    var g = Db.Row("SELECT name FROM grps WHERE id=@i", ("@i", id));
    if (g == null) return Err("Group not found.", 404);
    DeleteGroup(id);
    Audit(me, "deleted group", (string)g["name"]!);
    return Results.Json(new { ok = true });
}));

api.MapPut("admin/site", (HttpContext c, SiteIn b) => WithAdmin(c, me =>
{
    var closed = new Dictionary<string, string>();
    foreach (var (page, msg) in b.Closed ?? new())
    {
        if (!Site.Pages.Contains(page)) return Err("Unknown page: " + page);
        closed[page] = string.IsNullOrWhiteSpace(msg) ? "This part of Third Wheel is temporarily closed." : Enc(Clean(msg, 200));
    }
    var m = b.Maintenance;
    Site.Set(m?.On ?? false, string.IsNullOrWhiteSpace(m?.Message) ? "Third Wheel is down for maintenance. Please check back soon." : Enc(Clean(m!.Message, 200)), closed, b.AgeSeparation);
    Audit(me, "updated site controls", (m?.On ?? false ? "maintenance ON" : "maintenance off") + $", {closed.Count} page(s) closed");
    return Results.Json(Site.Snapshot());
}));

api.MapGet("meta", () => Results.Json(new { games = Db.Games, regions = Db.Regions }));

// ---------- search / feed ----------
api.MapGet("search", (HttpContext c, string? q, string? game, string? mode, string? region, int? ageMin, int? ageMax) => WithUser(c, uid =>
{
    q = Clean(q, 60);
    var like = "%" + q.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
    // groups (private groups, banned groups and the other side of the age split are never listed)
    var myAge = Age.Of(uid);
    var sb = new StringBuilder(GroupSel + " WHERE " + GroupsApi.ListableSql + GroupsApi.AgeSql(myAge));
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
    // age separation: people on the other side of 18 are hidden (existing friends stay visible)
    if (Age.On) pb.Append(Age.IsMinor(myAge) ? " AND ((u.age>0 AND u.age<18) OR isFriend>0)" : " AND ((u.age<=0 OR u.age>=18) OR isFriend>0)");
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
    var rows = Db.Rows(GroupSel + " WHERE g.id NOT IN (SELECT groupId FROM members WHERE userId=@me) AND " + GroupsApi.ListableSql + GroupsApi.AgeSql(Convert.ToInt32(me["age"])), ("@me", uid));
    var list = rows.OrderByDescending(r => (favs.Contains((string)r["game"]!) ? 2 : 0) + ((string)r["region"]! == (string)me["region"]! ? 1 : 0))
                   .ThenByDescending(r => Convert.ToInt32(r["memberCount"])).Take(30).Select(GroupObj);
    return Results.Json(list);
}));

// ---------- groups ----------
// Group create / detail / join / leave / roles / moderation / requests live in Features/GroupsApi.cs.

// ---------- profiles + direct messages (friends only) ----------
api.MapGet("users/{id:long}", (HttpContext c, long id) => WithUser(c, uid =>
{
    var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", id));
    if (u == null) return Err("User not found.", 404);
    var friend = id == uid || AreFriends(uid, id);
    // age separation: profiles on the other side of 18 don't exist for you (friends from before the rule stay visible)
    if (!friend && !IsAdmin(uid) && !Age.UserVisible(Age.Of(uid), Convert.ToInt32(u["age"]))) return Err("User not found.", 404);
    var games = JsonSerializer.Deserialize<string[]>((string)u["games"]!) ?? Array.Empty<string>();
    return Results.Json(new
    {
        id, username = (string)u["username"]!, displayName = u["display"] as string, avatar = AvatarUrl(id, u["avatarVer"]),
        avatarColor = (string)u["color"]!, status = (string)u["status"]!, playing = u["playing"] as string,
        region = (string)u["region"]!, ageRange = AgeRange(Convert.ToInt32(u["age"])), favoriteGames = games,
        isFriend = friend, isMe = id == uid, joined = (string)u["created"]!, rckt = IsRckt(u["rcktUntil"])
    });
}));

// The desktop app reports the game it detects; this only touches the "playing" line.
api.MapPut("me/playing", (HttpContext c, PlayingIn b) => WithUser(c, uid =>
{
    if (Limited($"pl:{uid}", 30, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
    string? playing = string.IsNullOrWhiteSpace(b.Playing) ? null : Enc(Clean(b.Playing, 40));
    Db.Exec("UPDATE users SET playing=@p WHERE id=@i", ("@p", playing), ("@i", uid));
    return Results.Json(UserDto(uid));
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
    // age separation: no new friendships across the 18 line (answer exactly like an unknown name)
    if (!IsAdmin(uid) && !Age.UserVisible(Age.Of(uid), Age.Of(tid))) return Err("No user with that name.", 404);
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
    var gg = Db.Row("SELECT ageMin, ageMax FROM grps WHERE id=@g", ("@g", id));
    if (gg == null) return Err("Group not found.", 404);
    if (Db.Scalar("SELECT 1 FROM group_bans WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", b.UserId)) != null) return Err("They are banned from this group.", 409);
    // age separation: you can only invite people who are allowed to see the group
    if (!Age.GroupVisible(Age.Of(b.UserId), Convert.ToInt32(gg["ageMin"]), Convert.ToInt32(gg["ageMax"]))) return Err("They can't join this group (age restriction).", 403);
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
    if (Db.Scalar("SELECT 1 FROM group_bans WHERE groupId=@g AND userId=@u", ("@g", i["groupId"]), ("@u", uid)) != null) { Db.Exec("DELETE FROM invites WHERE id=@i", ("@i", id)); return Err("You are banned from this group.", 403); }
    Db.Exec("INSERT OR IGNORE INTO members(groupId,userId,role) VALUES(@g,@u,'member')", ("@g", i["groupId"]), ("@u", uid));
    Db.Exec("DELETE FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", i["groupId"]), ("@u", uid));
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
try { app.Run(); }
catch (Exception ex)
{
    // A service has no console: keep the real startup error (e.g. "port already in use") where you can read it.
    try { File.AppendAllText(Path.Combine(dataDir, "server.log"), $"{DateTime.UtcNow:o} startup failed: {ex}\n"); } catch { /* best effort */ }
    throw;
}
return 0;

record Creds(string? Username, string? Password);
record PlayingIn(string? Playing);
record BanIn(bool Banned, string? Reason);
record RoleIn(bool IsAdmin);
record MaintIn(bool On, string? Message);
record SiteIn(MaintIn? Maintenance, Dictionary<string, string>? Closed, bool? AgeSeparation = null);

// Site-wide switches: maintenance mode and per-page closures (persisted, cached in memory).
static class Site
{
    public static readonly string[] Pages = { "feed", "search", "friends", "dms", "groups", "signup" };
    static readonly object L = new();
    public static bool Maintenance;
    /// <summary>Under-18s and adults can't see each other's groups or profiles. Admins can switch it off.</summary>
    public static bool AgeSeparation = true;
    public static string MaintenanceMessage = "Third Wheel is down for maintenance. Please check back soon.";
    public static Dictionary<string, string> Closed = new();

    public static string? PageOf(string path) =>
        path.StartsWith("/api/feed") ? "feed" : path.StartsWith("/api/search") ? "search" :
        path.StartsWith("/api/friends") || path.StartsWith("/api/invites") ? "friends" : path.StartsWith("/api/dms") ? "dms" :
        path.StartsWith("/api/groups") ? "groups" : path == "/api/auth/signup" ? "signup" : null;

    public static void Load()
    {
        var json = Db.Scalar("SELECT value FROM site WHERE key='state'") as string;
        if (string.IsNullOrEmpty(json)) return;
        try
        {
            using var d = JsonDocument.Parse(json); var r = d.RootElement;
            lock (L)
            {
                Maintenance = r.GetProperty("on").GetBoolean(); MaintenanceMessage = r.GetProperty("message").GetString() ?? MaintenanceMessage;
                AgeSeparation = !r.TryGetProperty("ageSeparation", out var ag) || ag.GetBoolean();
                Closed = r.GetProperty("closed").EnumerateObject().Where(p => Pages.Contains(p.Name)).ToDictionary(p => p.Name, p => p.Value.GetString() ?? "");
            }
        }
        catch { /* ignore a corrupt row, keep defaults */ }
    }
    public static void Set(bool on, string message, Dictionary<string, string> closed, bool? ageSeparation = null)
    {
        lock (L) { Maintenance = on; MaintenanceMessage = message; Closed = closed; if (ageSeparation != null) AgeSeparation = ageSeparation.Value; }
        Db.Exec("INSERT OR REPLACE INTO site(key,value) VALUES('state',@v)", ("@v", JsonSerializer.Serialize(new { on, message, closed, ageSeparation = AgeSeparation })));
    }
    public static object Snapshot() { lock (L) return new { maintenance = new { on = Maintenance, message = MaintenanceMessage }, closed = new Dictionary<string, string>(Closed), pages = Pages, ageSeparation = AgeSeparation }; }
}
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
CREATE TABLE IF NOT EXISTS site(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, adminId INTEGER, action TEXT, target TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS dms(id INTEGER PRIMARY KEY, a INTEGER, b INTEGER, fromId INTEGER, text TEXT, createdAt TEXT);
CREATE INDEX IF NOT EXISTS ix_dms ON dms(a,b,id);
CREATE TABLE IF NOT EXISTS avatars(userId INTEGER PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);");
        // Upgrade databases created before profiles existed.
        var cols = Rows("PRAGMA table_info(users)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!cols.Contains("display")) Exec("ALTER TABLE users ADD COLUMN display TEXT");
        if (!cols.Contains("avatarVer")) Exec("ALTER TABLE users ADD COLUMN avatarVer INTEGER DEFAULT 0");
        if (!cols.Contains("isAdmin")) Exec("ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0");
        if (!cols.Contains("banned")) Exec("ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0");
        if (!cols.Contains("banReason")) Exec("ALTER TABLE users ADD COLUMN banReason TEXT");
        // Shared by several features: a group is 'public' (listed, anyone can join) or 'private' (hidden from feed/search/recommendations; invite or approval only).
        var gcols = Rows("PRAGMA table_info(grps)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!gcols.Contains("privacy")) Exec("ALTER TABLE grps ADD COLUMN privacy TEXT DEFAULT 'public'");   // 'public' | 'request' (listed, needs approval) | 'private' (unlisted, invite only)
        var mcols = Rows("PRAGMA table_info(members)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!mcols.Contains("role"))
        {
            Exec("ALTER TABLE members ADD COLUMN role TEXT DEFAULT 'member'");
            Exec("UPDATE members SET role='owner' WHERE EXISTS (SELECT 1 FROM grps g WHERE g.id=members.groupId AND g.ownerId=members.userId)");
        }
        // Feature modules add their own tables/columns here (each must be safe to run on every start).
        ChatApi.Migrate(); GroupsApi.Migrate(); ProfileApi.Migrate(); NotifyApi.Migrate(); GamesApi.Migrate();
    }
}
