using System.Text.RegularExpressions;
using static Core;

/// <summary>
/// Unread counters, @mentions and the notification summary the UI polls.
/// Unread = other people's messages newer than a per-conversation read cursor (table `reads`); nothing here depends on how messages are stored beyond
/// messages(id, groupId, userId, text) and dms(id, a, b, fromId, text), so other features can change message columns freely.
/// </summary>
public static class NotifyApi
{
    static readonly Regex Mention = new(@"(?<![A-Za-z0-9_])@([A-Za-z0-9_]{3,20})", RegexOptions.Compiled);
    public record ReadIn(string? Kind, long Key);

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS reads(userId INTEGER, kind TEXT, key INTEGER, lastId INTEGER, PRIMARY KEY(userId,kind,key));
CREATE TABLE IF NOT EXISTS notify_init(userId INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, userId INTEGER, type TEXT, fromId INTEGER, groupId INTEGER, peerId INTEGER, refId INTEGER, snippet TEXT, createdAt TEXT, readAt TEXT);
CREATE INDEX IF NOT EXISTS ix_notif_user ON notifications(userId, readAt, id);");
        Db.Exec("DELETE FROM notifications WHERE createdAt < @t", ("@t", DateTime.UtcNow.AddDays(-30).ToString("o")));
    }

    public static void Map(RouteGroupBuilder api)
    {
        // Messages are stored HTML-encoded by their endpoints; these hooks run right after a message is inserted.
        Hooks.OnGroupMessage += (gid, mid, from, text) =>
        {
            foreach (var name in Names(text))
            {
                var to = Db.Scalar("SELECT u.id FROM users u JOIN members m ON m.userId=u.id AND m.groupId=@g WHERE u.username=@n COLLATE NOCASE AND u.id<>@f",
                    ("@g", gid), ("@n", name), ("@f", from));
                if (to is long uid) AddMention(uid, from, gid, null, mid, text);
            }
        };
        Hooks.OnDirectMessage += (to, mid, from, text) =>
        {
            var me = Db.Scalar("SELECT username FROM users WHERE id=@i", ("@i", to)) as string;
            if (me != null && Names(text).Contains(me, StringComparer.OrdinalIgnoreCase)) AddMention(to, from, null, from, mid, text);
            UpsertDm(to, from, mid, text);
        };

        api.MapGet("notifications/summary", (HttpContext c) => WithUser(c, me =>
        {
            if (Limited($"nt:{me}", 240, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
            Baseline(me);
            var p = new (string, object?)[] { ("@me", me) };

            var dm = new Dictionary<string, object>();
            foreach (var r in Db.Rows(@"SELECT q.peer, COUNT(*) n, MAX(q.id) newest FROM (
                    SELECT d.id, CASE WHEN d.a=@me THEN d.b ELSE d.a END peer FROM dms d WHERE (d.a=@me OR d.b=@me) AND d.fromId<>@me) q
                WHERE q.id > COALESCE((SELECT lastId FROM reads r WHERE r.userId=@me AND r.kind='dm' AND r.key=q.peer),0) GROUP BY q.peer", p))
            {
                var newest = Db.Row("SELECT d.text, u.id uid, u.username, u.display, u.avatarVer, u.color FROM dms d JOIN users u ON u.id=d.fromId WHERE d.id=@i", ("@i", r["newest"]));
                dm[r["peer"]!.ToString()!] = Entry(r, newest);
            }

            var groups = new Dictionary<string, object>();
            foreach (var r in Db.Rows(@"SELECT m.groupId gid, COUNT(*) n, MAX(m.id) newest FROM messages m JOIN members mem ON mem.groupId=m.groupId AND mem.userId=@me
                WHERE m.userId<>@me AND m.id > COALESCE((SELECT lastId FROM reads r WHERE r.userId=@me AND r.kind='group' AND r.key=m.groupId),0) GROUP BY m.groupId", p))
            {
                var newest = Db.Row("SELECT m.text, u.id uid, u.username, u.display, u.avatarVer, u.color FROM messages m JOIN users u ON u.id=m.userId WHERE m.id=@i", ("@i", r["newest"]));
                groups[r["gid"]!.ToString()!] = Entry(r, newest);
            }

            var mentions = Db.Rows(@"SELECT n.id, n.fromId, n.groupId, n.peerId, n.refId, n.snippet, n.createdAt, n.readAt, u.username, u.display, u.avatarVer, u.color
                FROM notifications n JOIN users u ON u.id=n.fromId WHERE n.userId=@me AND n.type='mention' ORDER BY n.id DESC LIMIT 30", p)
                .Select(r => (object)new
                {
                    id = (long)r["id"]!, fromId = (long)r["fromId"]!, groupId = r["groupId"] as long?, peerId = r["peerId"] as long?, snippet = (string)(r["snippet"] ?? ""),
                    createdAt = (string)r["createdAt"]!, read = r["readAt"] != null,
                    from = new { id = (long)r["fromId"]!, username = (string)r["username"]!, displayName = r["display"] as string, avatar = AvatarUrl((long)r["fromId"]!, r["avatarVer"]), avatarColor = (string)r["color"]! }
                }).ToList();
            var mentionCount = Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM notifications WHERE userId=@me AND type='mention' AND readAt IS NULL", p));

            return Results.Json(new { dm, groups, mentions, mentionCount });
        }));

        // Marks one conversation read up to its newest message (the client calls this while a chat is open and visible).
        api.MapPost("notifications/read", (HttpContext c, ReadIn b) => WithUser(c, me =>
        {
            if (Limited($"ntr:{me}", 240, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
            var now = Now();
            if (b.Kind == "group")
            {
                if (!IsMember(b.Key, me)) return Err("You are not in this group.", 403);
                SetCursor(me, "group", b.Key, Convert.ToInt64(Db.Scalar("SELECT COALESCE(MAX(id),0) FROM messages WHERE groupId=@g", ("@g", b.Key))));
                Db.Exec("UPDATE notifications SET readAt=@n WHERE userId=@u AND groupId=@g AND readAt IS NULL", ("@n", now), ("@u", me), ("@g", b.Key));
            }
            else if (b.Kind == "dm")
            {
                if (b.Key == me || b.Key <= 0) return Err("Bad conversation.");
                SetCursor(me, "dm", b.Key, Convert.ToInt64(Db.Scalar("SELECT COALESCE(MAX(id),0) FROM dms WHERE a=@a AND b=@b", ("@a", Math.Min(me, b.Key)), ("@b", Math.Max(me, b.Key)))));
                Db.Exec("UPDATE notifications SET readAt=@n WHERE userId=@u AND peerId=@p AND readAt IS NULL", ("@n", now), ("@u", me), ("@p", b.Key));
            }
            else return Err("Kind must be 'dm' or 'group'.");
            return Results.Json(new { ok = true });
        }));

        api.MapPost("notifications/read-all", (HttpContext c) => WithUser(c, me =>
        {
            if (Limited($"ntr:{me}", 240, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
            Db.Exec(@"INSERT INTO reads(userId,kind,key,lastId) SELECT @me,'group',mem.groupId,COALESCE((SELECT MAX(id) FROM messages WHERE groupId=mem.groupId),0) FROM members mem WHERE mem.userId=@me
                ON CONFLICT(userId,kind,key) DO UPDATE SET lastId=MAX(lastId,excluded.lastId)", ("@me", me));
            Db.Exec(@"INSERT INTO reads(userId,kind,key,lastId) SELECT @me,'dm',CASE WHEN a=@me THEN b ELSE a END,MAX(id) FROM dms WHERE (a=@me OR b=@me)
                GROUP BY CASE WHEN a=@me THEN b ELSE a END ON CONFLICT(userId,kind,key) DO UPDATE SET lastId=MAX(lastId,excluded.lastId)", ("@me", me));
            Db.Exec("UPDATE notifications SET readAt=@n WHERE userId=@me AND readAt IS NULL", ("@n", Now()), ("@me", me));
            return Results.Json(new { ok = true });
        }));
    }

    static object Entry(Dictionary<string, object?> r, Dictionary<string, object?>? m) => new
    {
        n = Convert.ToInt32(r["n"]), newest = (long)r["newest"]!,
        snippet = Snip((string?)m?["text"] ?? ""),
        from = m == null ? null : new { id = (long)m["uid"]!, username = (string)m["username"]!, displayName = m["display"] as string, avatar = AvatarUrl((long)m["uid"]!, m["avatarVer"]), avatarColor = (string)m["color"]! }
    };

    /// <summary>First look at a user: everything that already exists counts as read, so only new messages show up as unread. New groups get the same treatment the first time they're seen.</summary>
    static void Baseline(long me)
    {
        Db.Exec(@"INSERT OR IGNORE INTO reads(userId,kind,key,lastId) SELECT @me,'group',mem.groupId,COALESCE((SELECT MAX(id) FROM messages WHERE groupId=mem.groupId),0) FROM members mem WHERE mem.userId=@me", ("@me", me));
        if (Db.Scalar("SELECT 1 FROM notify_init WHERE userId=@me", ("@me", me)) != null) return;
        Db.Exec(@"INSERT OR IGNORE INTO reads(userId,kind,key,lastId) SELECT @me,'dm',CASE WHEN a=@me THEN b ELSE a END,MAX(id) FROM dms WHERE (a=@me OR b=@me) GROUP BY CASE WHEN a=@me THEN b ELSE a END", ("@me", me));
        Db.Exec("INSERT OR IGNORE INTO notify_init(userId) VALUES(@me)", ("@me", me));
    }

    static void SetCursor(long me, string kind, long key, long lastId) =>
        Db.Exec("INSERT INTO reads(userId,kind,key,lastId) VALUES(@u,@k,@key,@l) ON CONFLICT(userId,kind,key) DO UPDATE SET lastId=MAX(lastId,excluded.lastId)",
            ("@u", me), ("@k", kind), ("@key", key), ("@l", lastId));

    static List<string> Names(string text) =>
        Mention.Matches(text ?? "").Select(m => m.Groups[1].Value).Distinct(StringComparer.OrdinalIgnoreCase).Take(5).ToList();

    /// <summary>The text arrives HTML-encoded; cut it without leaving half an entity (e.g. "&amp") at the end.</summary>
    static string Snip(string t)
    {
        if (t.Length <= 120) return t;
        t = t[..120];
        var amp = t.LastIndexOf('&');
        return amp >= 0 && t.IndexOf(';', amp) < 0 ? t[..amp] : t;
    }

    static void AddMention(long to, long from, long? gid, long? peer, long mid, string text)
    {
        if (to == from) return;
        if (Db.Scalar("SELECT 1 FROM notifications WHERE userId=@u AND type='mention' AND refId=@r AND fromId=@f AND COALESCE(groupId,0)=@g",
                ("@u", to), ("@r", mid), ("@f", from), ("@g", gid ?? 0)) != null) return;
        Db.Exec("INSERT INTO notifications(userId,type,fromId,groupId,peerId,refId,snippet,createdAt) VALUES(@u,'mention',@f,@g,@p,@r,@s,@c)",
            ("@u", to), ("@f", from), ("@g", gid), ("@p", peer), ("@r", mid), ("@s", Snip(text)), ("@c", Now()));
    }

    /// <summary>One rolling "dm" row per sender while unread, holding the latest snippet (used for offline/summary display).</summary>
    static void UpsertDm(long to, long from, long mid, string text)
    {
        var existing = Db.Scalar("SELECT id FROM notifications WHERE userId=@u AND type='dm' AND peerId=@p AND readAt IS NULL", ("@u", to), ("@p", from));
        if (existing is long id) Db.Exec("UPDATE notifications SET refId=@r, snippet=@s, createdAt=@c WHERE id=@i", ("@r", mid), ("@s", Snip(text)), ("@c", Now()), ("@i", id));
        else Db.Exec("INSERT INTO notifications(userId,type,fromId,peerId,refId,snippet,createdAt) VALUES(@u,'dm',@f,@p,@r,@s,@c)",
            ("@u", to), ("@f", from), ("@p", from), ("@r", mid), ("@s", Snip(text)), ("@c", Now()));
    }
}
