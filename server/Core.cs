using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

/// <summary>Helpers shared by Program.cs and every feature file under Features/ (imported there with `using static Core;`).</summary>
public static class Core
{
    public static IResult Err(string msg, int code = 400) => Results.Json(new { error = msg }, statusCode: code);
    /// <summary>HTML-encode user text before it is stored. The UI decodes it to plain text and only ever uses textContent.</summary>
    public static string Enc(string? s) => WebUtility.HtmlEncode((s ?? "").Trim());
    public static string Clean(string? s, int max) { s = (s ?? "").Trim(); return s.Length > max ? s[..max] : s; }
    public static readonly Regex userRx = new("^[A-Za-z0-9_]{3,20}$", RegexOptions.Compiled);
    public static readonly ConcurrentDictionary<string, List<DateTime>> rate = new();

    /// <summary>Sliding-window rate limit. Returns true when `key` is over `max` hits in `win`; `record` counts this call.</summary>
    public static bool Limited(string key, int max, TimeSpan win, bool record)
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

    
    public static string ClientIp(HttpContext c)
    {
        var fwd = c.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(fwd))
        {
            var first = fwd.Split(',')[0].Trim();
            if (first.Length > 0) return first;
        }
        var real = c.Request.Headers["X-Real-IP"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(real)) return real.Trim();
        return c.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
    }

    public static string? ClientDeviceId(HttpContext c)
    {
        var d = c.Request.Headers["X-TW-Device-ID"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(d)) return Clean(d, 128);
        return null;
    }

    public static bool IsBanned(HttpContext c, out string? reason)
    {
        reason = null;
        var ip = ClientIp(c);
        var r = Db.Row("SELECT reason FROM banned_ips WHERE ip=@ip", ("@ip", ip));
        if (r != null)
        {
            var why = r["reason"] as string ?? "Network suspended"; reason = $"Your network has been suspended: {why}";
            return true;
        }
        var dev = ClientDeviceId(c);
        if (dev != null)
        {
            r = Db.Row("SELECT reason FROM banned_devices WHERE deviceId=@d", ("@d", dev));
            if (r != null)
            {
                var why = r["reason"] as string ?? "Device suspended"; reason = $"This device has been suspended: {why}";
                return true;
            }
        }
        return false;
    }

    public static long? CurrentUser(HttpContext c)
    {
        if (IsBanned(c, out _)) return null;
        if (!c.Request.Cookies.TryGetValue("tw_session", out var tok) || string.IsNullOrEmpty(tok) || tok.Length > 100) return null;
        var r = Db.Row("SELECT s.userId, u.banned, u.suspendedUntil FROM sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=@t", ("@t", Sha(tok)));
        if (r == null) return null;
        if (Convert.ToInt32(r["banned"]) == 1) return null;
        if (r["suspendedUntil"] is string su && !string.IsNullOrEmpty(su) && DateTime.TryParse(su, out var until) && DateTime.UtcNow < until)
            return null;
        return (long)r["userId"]!;
    }
    public static string EffectiveStatus(long uid, string dbStatus)
    {
        if (dbStatus == "offline") return "offline";
        return Realtime.IsOnline(uid) ? dbStatus : "offline";
    }
    public static int CalculateAge(string? birthDate, int fallback = 0)
    {
        if (!string.IsNullOrEmpty(birthDate) && DateTime.TryParse(birthDate, out var bd))
        {
            var now = DateTime.UtcNow;
            var a = now.Year - bd.Year;
            if (now < bd.AddYears(a)) a--;
            return a > 0 ? a : 0;
        }
        return fallback;
    }
    public static string Sha(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)));
    public static void StartSession(HttpContext c, long uid)
    {
        var tok = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        Db.Exec("INSERT INTO sessions(tokenHash,userId,created) VALUES(@t,@u,@c)", ("@t", Sha(tok)), ("@u", uid), ("@c", Now()));
        c.Response.Cookies.Append("tw_session", tok, new CookieOptions { HttpOnly = true, Secure = c.Request.IsHttps, SameSite = SameSiteMode.Strict, Path = "/", MaxAge = TimeSpan.FromDays(30), IsEssential = true });
    }
    public static string Now() => DateTime.UtcNow.ToString("o");

    /// <summary>Wraps handlers that need a signed-in user.</summary>
    public static IResult WithUser(HttpContext c, Func<long, IResult> f)
    {
        var uid = CurrentUser(c);
        return uid is null ? Err("Not signed in.", 401) : f(uid.Value);
    }
    /// <summary>A person's display name (or username) as plain text, for notifications.</summary>
    public static string Who(long uid)
    {
        var r = Db.Row("SELECT display, username FROM users WHERE id=@i", ("@i", uid));
        return r == null ? "Someone" : WebUtility.HtmlDecode((r["display"] as string) is { Length: > 0 } d ? d : (string)r["username"]!);
    }
    public static bool IsAdmin(long uid) => Convert.ToInt32(Db.Scalar("SELECT isAdmin FROM users WHERE id=@i", ("@i", uid))) == 1;
    public static IResult WithAdmin(HttpContext c, Func<long, IResult> f) => WithUser(c, uid => IsAdmin(uid) ? f(uid) : Err("Admins only.", 403));
    public static void Audit(long admin, string action, string target) =>
        Db.Exec("INSERT INTO audit(adminId,action,target,at) VALUES(@a,@x,@t,@n)", ("@a", admin), ("@x", action), ("@t", target), ("@n", Now()));
    public static long Count(string sql) => Convert.ToInt64(Db.Scalar(sql));

    /// <summary>RCKT is an admin-granted subscription: users.rcktUntil is 'forever' or an ISO UTC expiry. Perks: GIFs in chat, uploads up to 250 MB (20 MB otherwise).</summary>
    public static bool IsRckt(object? until)
    {
        var s = until as string;
        if (string.IsNullOrEmpty(s)) return false;
        return s == "forever" || (DateTime.TryParse(s, null, System.Globalization.DateTimeStyles.RoundtripKind, out var d) && d.ToUniversalTime() > DateTime.UtcNow);
    }
    public static bool IsRcktUser(long uid) => IsRckt(Db.Scalar("SELECT rcktUntil FROM users WHERE id=@i", ("@i", uid)));
    static object? Col(Dictionary<string, object?> r, string key) => r.TryGetValue(key, out var v) ? v : null;
    /// <summary>The avatar frame to show for a user row: only while they have RCKT (frames are an RCKT perk) and only a frame that exists.</summary>
    public static string? FrameOf(Dictionary<string, object?> r) => Col(r, "frame") is string f && IsRckt(Col(r, "rcktUntil")) && CosmeticsApi.Valid(f) ? f : null;

    public static object? UserDto(long id)
    {
        var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", id));
        return u is null ? null : UserObj(u);
    }
    public static object UserObj(Dictionary<string, object?> u)
    {
        var uid = (long)u["id"]!;
        var birthDate = Col(u, "birthDate") as string;
        var rawAge = Convert.ToInt32(u["age"]);
        var age = CalculateAge(birthDate, rawAge);
        return new
        {
            id = uid, username = (string)u["username"]!, displayName = u["display"] as string, avatar = AvatarUrl(uid, u["avatarVer"]),
            avatarColor = (string)u["color"]!, frame = FrameOf(u), isAdmin = Convert.ToInt32(u["isAdmin"]) == 1,
            rckt = IsRckt(Col(u, "rcktUntil")), rcktUntil = Col(u, "rcktUntil") as string,
            region = (string)u["region"]!, age, birthDate, ageRange = AgeRange(age),
            favoriteGames = JsonSerializer.Deserialize<string[]>((string)u["games"]!) ?? Array.Empty<string>(),
            onboarded = Convert.ToInt32(u["onboarded"]) == 1, status = EffectiveStatus(uid, (string)u["status"]!),
            playing = u["playing"] as string,
            playingWith = PlayingPartyCount(uid, u["playing"] as string),
            banner = BannerUrl(uid, Col(u, "bannerVer"))
        };
    }
    public static string? AvatarUrl(long id, object? ver) => ver != null && Convert.ToInt64(ver) > 0 ? $"/api/avatars/{id}?v={Convert.ToInt64(ver)}" : null;
    public static string? BannerUrl(long id, object? ver) => ver != null && Convert.ToInt64(ver) > 0 ? $"/api/banners/{id}?v={Convert.ToInt64(ver)}" : null;
    public static string? GroupIconUrl(long id, object? ver) => ver != null && Convert.ToInt64(ver) > 0 ? $"/api/group-icons/{id}?v={Convert.ToInt64(ver)}" : null;
    public static string AgeRange(int a) => a <= 0 ? "" : a < 18 ? "13-17" : a < 25 ? "18-24" : a < 35 ? "25-34" : a < 45 ? "35-44" : "45+";

    public static int PlayingPartyCount(long userId, string? playing)
    {
        if (string.IsNullOrWhiteSpace(playing)) return 0;
        try
        {
            var clean = Clean(playing, 40).Trim();
            if (string.IsNullOrEmpty(clean)) return 0;
            var count = Db.Scalar(@"
                SELECT (SELECT COUNT(*) - 1 FROM members m WHERE m.groupId=g.id) 
                FROM grps g 
                JOIN members me ON me.groupId=g.id 
                WHERE me.userId=@u AND (LOWER(g.game)=LOWER(@p) OR LOWER(@p) LIKE '%' || LOWER(g.game) || '%' OR LOWER(g.game) LIKE '%' || LOWER(@p) || '%')
                ORDER BY (SELECT COUNT(*) FROM members m2 WHERE m2.groupId=g.id) DESC 
                LIMIT 1",
                ("@u", userId), ("@p", clean));
            if (count == null || count == DBNull.Value) return 0;
            var n = Convert.ToInt32(count);
            return n > 0 ? n : 0;
        }
        catch { return 0; }
    }

    public static object PersonObj(Dictionary<string, object?> r, bool isFriend) => new
    {
        id = (long)r["id"]!, username = (string)r["username"]!, displayName = r["display"] as string, avatar = AvatarUrl((long)r["id"]!, r["avatarVer"]),
        avatarColor = (string)r["color"]!, frame = FrameOf(r), rckt = IsRckt(Col(r, "rcktUntil")),
        status = EffectiveStatus((long)r["id"]!, (string)r["status"]!), playing = r["playing"] as string,
        playingWith = PlayingPartyCount((long)r["id"]!, r["playing"] as string),
        banner = BannerUrl((long)r["id"]!, Col(r, "bannerVer")),
        region = (string)r["region"]!, isFriend
    };

    public const string GroupSel = @"SELECT g.id,g.name,g.game,g.mode,g.region,g.ageMin,g.ageMax,g.description,g.color,
 COALESCE(g.iconVer,0) iconVer,
 COALESCE(g.joinCode,'') joinCode, COALESCE(g.maxMembers,0) maxMembers, COALESCE(g.slowmode,0) slowmode,
 (SELECT COUNT(*) FROM members m WHERE m.groupId=g.id) memberCount,
 (SELECT COUNT(*) FROM members m WHERE m.groupId=g.id AND m.userId=@me) isMember FROM grps g";
    public static object GroupObj(Dictionary<string, object?> r) => new
    {
        id = (long)r["id"]!, name = (string)r["name"]!, game = (string)r["game"]!, mode = (string)r["mode"]!,
        region = (string)r["region"]!, ageMin = Convert.ToInt32(r["ageMin"]), ageMax = Convert.ToInt32(r["ageMax"]),
        description = (string)r["description"]!, memberCount = Convert.ToInt32(r["memberCount"]),
        isMember = Convert.ToInt32(r["isMember"]) > 0, color = (string)r["color"]!,
        icon = GroupIconUrl((long)r["id"]!, r.TryGetValue("iconVer", out var iv) ? iv : null),
        joinCode = r.TryGetValue("joinCode", out var jc) ? (jc as string ?? "") : "",
        maxMembers = r.TryGetValue("maxMembers", out var mm) ? Convert.ToInt32(mm ?? 0) : 0,
        slowmode = r.TryGetValue("slowmode", out var sm) ? Convert.ToInt32(sm ?? 0) : 0
    };
    public const string MsgSel = "SELECT m.id,m.userId,u.username,u.display,u.avatarVer,u.color avatarColor,m.text,m.createdAt FROM messages m JOIN users u ON u.id=m.userId";
    public static object MsgObj(Dictionary<string, object?> r) => new
    {
        id = (long)r["id"]!, userId = (long)r["userId"]!, username = (string)r["username"]!, displayName = r["display"] as string,
        avatar = AvatarUrl((long)r["userId"]!, r["avatarVer"]), avatarColor = (string)r["avatarColor"]!, frame = FrameOf(r), rckt = IsRckt(Col(r, "rcktUntil")),
        text = (string)r["text"]!, createdAt = (string)r["createdAt"]!
    };
    public static bool AreFriends(long a, long b) => Db.Scalar("SELECT 1 FROM friends WHERE a=@a AND b=@b", ("@a", Math.Min(a, b)), ("@b", Math.Max(a, b))) != null;
    public static bool IsMember(long g, long u) => Db.Scalar("SELECT 1 FROM members WHERE groupId=@g AND userId=@u", ("@g", g), ("@u", u)) != null;
    public static bool IsBlocked(long a, long b) => Db.Scalar("SELECT 1 FROM user_blocks WHERE (userId=@a AND blockedId=@b) OR (userId=@b AND blockedId=@a)", ("@a", a), ("@b", b)) != null;

    /// <summary>members.role is 'owner', 'mod' or 'member'. Site admins can moderate every group. GroupsApi manages the roles; other features only ask.</summary>
    public static bool CanModerateGroup(long gid, long uid) => IsAdmin(uid) ||
        Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM members WHERE groupId=@g AND userId=@u AND role IN ('owner','mod')", ("@g", gid), ("@u", uid))) > 0;
    /// <summary>Set by GroupsApi: returns a message when `uid` may not post in group `gid` (muted, banned, not a member...), otherwise null. Called before every group message.</summary>
    public static Func<long, long, string?> GroupPostBlock = (gid, uid) => null;

    /// <summary>Removes a group and everything attached to it.</summary>
        /// <summary>Removes a user account and cleans up memberships, sessions, messages, and empty groups.</summary>
    public static void DeleteAccount(long id)
    {
        var ps = new (string, object?)[] { ("@i", id) };
        foreach (var gm in Db.Rows("SELECT groupId FROM members WHERE userId=@i", ps))
        {
            try { GroupsApi.RemoveMember((long)gm["groupId"]!, id); } catch { }
        }
        Db.Exec("DELETE FROM group_bans WHERE userId=@i", ps);
        Db.Exec("DELETE FROM group_mutes WHERE userId=@i", ps);
        Db.Exec("DELETE FROM join_requests WHERE userId=@i", ps);
        foreach (var sql in new[] {
            "DELETE FROM reactions WHERE kind='g' AND msgId IN (SELECT id FROM messages WHERE userId=@i)",
            "DELETE FROM reactions WHERE kind='d' AND msgId IN (SELECT id FROM dms WHERE a=@i OR b=@i)",
            "DELETE FROM sessions WHERE userId=@i",
            "DELETE FROM messages WHERE userId=@i",
            "DELETE FROM dms WHERE a=@i OR b=@i",
            "DELETE FROM friends WHERE a=@i OR b=@i",
            "DELETE FROM frequests WHERE fromId=@i OR toId=@i",
            "DELETE FROM invites WHERE fromId=@i OR toId=@i",
            "DELETE FROM members WHERE userId=@i",
            "DELETE FROM avatars WHERE userId=@i",
            "DELETE FROM reactions WHERE userId=@i",
            "DELETE FROM users WHERE id=@i" })
        {
            Db.Exec(sql, ps);
        }
        foreach (var g in Db.Rows("SELECT g.id FROM grps g WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.groupId=g.id)"))
        {
            DeleteGroup((long)g["id"]!);
        }
    }

    public static void DeleteGroup(long id)
    {
        // message ids are reused after deletes (no AUTOINCREMENT), so reactions/files must go with the messages or a new message would inherit them
        Db.Exec("DELETE FROM reactions WHERE kind='g' AND msgId IN (SELECT id FROM messages WHERE groupId=@g)", ("@g", id));
        Db.Exec("UPDATE files SET deletedAt=COALESCE(deletedAt,@n) WHERE convKind='g' AND msgId IN (SELECT id FROM messages WHERE groupId=@g)", ("@g", id), ("@n", Now()));
        Db.Exec("DELETE FROM messages WHERE groupId=@g", ("@g", id));
        Db.Exec("DELETE FROM invites WHERE groupId=@g", ("@g", id));
        Db.Exec("DELETE FROM members WHERE groupId=@g", ("@g", id));
        Db.Exec("DELETE FROM grps WHERE id=@g", ("@g", id));
    }
}

/// <summary>Lets features react to messages without editing each other's endpoints. Call these from the message POST handlers.</summary>
public static class Hooks
{
    /// <summary>(groupId, messageId, fromUserId, encodedText)</summary>
    public static event Action<long, long, long, string>? OnGroupMessage;
    /// <summary>(toUserId, messageId, fromUserId, encodedText)</summary>
    public static event Action<long, long, long, string>? OnDirectMessage;
    public static void GroupMessage(long groupId, long messageId, long from, string text) { try { OnGroupMessage?.Invoke(groupId, messageId, from, text); } catch { /* never break chat */ } }
    public static void DirectMessage(long to, long messageId, long from, string text) { try { OnDirectMessage?.Invoke(to, messageId, from, text); } catch { /* never break chat */ } }
}

/// <summary>
/// Age separation (admin can switch it off in the admin panel). Ages are self-declared at sign-up.
/// A group is a "minor" group when ageMax &lt;= 17 and an "adult" group when ageMax &gt;= 18. Under-18s only see minor groups and minor people; 18+ only see adult ones.
/// Use these in every query that lists or opens groups or people.
/// </summary>
public static class Age
{
    public static bool On => Site.AgeSeparation;
    public static bool IsMinor(int age) => age is > 0 and < 18;
    public static bool GroupVisible(int viewerAge, int groupAgeMin, int groupAgeMax) => !On || (IsMinor(viewerAge) ? groupAgeMax <= 17 : groupAgeMax >= 18);
    public static bool UserVisible(int viewerAge, int otherAge) => !On || IsMinor(viewerAge) == IsMinor(otherAge);
    public static int Of(long userId)
    {
        var r = Db.Row("SELECT age, birthDate FROM users WHERE id=@i", ("@i", userId));
        if (r == null) return 0;
        return Core.CalculateAge(r["birthDate"] as string, Convert.ToInt32(r["age"]));
    }
}
