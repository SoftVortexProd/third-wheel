using System.Collections.Concurrent;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Http.Features;
using static Core;

/// <summary>
/// Everything about messages: listing/sending for groups and DMs, replies, reactions, edit/delete (soft), typing indicators,
/// attachments (files on disk), and the admin-granted RCKT subscription. Group chats are kind "g" (messages table),
/// DMs are kind "d" (dms table); both share one code path through <see cref="Conv"/>.
/// </summary>
public static class ChatApi
{
    static readonly string[] Emoji = { "👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀" };
    const long NormalLimit = 20L * 1024 * 1024, RcktLimit = 250L * 1024 * 1024;
    const long NormalQuota = 1L << 30, RcktQuota = 10L << 30;
    static string UploadDir => Path.Combine(Environment.GetEnvironmentVariable("TW_DATA")
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ThirdWheel"), "uploads");

    // ---------------- schema ----------------
    public static void Migrate()
    {
        foreach (var t in new[] { "messages", "dms" })
        {
            var cols = Db.Rows($"PRAGMA table_info({t})").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (!cols.Contains("replyTo")) Db.Exec($"ALTER TABLE {t} ADD COLUMN replyTo INTEGER");
            if (!cols.Contains("editedAt")) Db.Exec($"ALTER TABLE {t} ADD COLUMN editedAt TEXT");
            if (!cols.Contains("deletedAt")) Db.Exec($"ALTER TABLE {t} ADD COLUMN deletedAt TEXT");
            if (!cols.Contains("fileId")) Db.Exec($"ALTER TABLE {t} ADD COLUMN fileId INTEGER");
            if (!cols.Contains("pinnedAt")) Db.Exec($"ALTER TABLE {t} ADD COLUMN pinnedAt TEXT");
            if (!cols.Contains("updatedAt")) { Db.Exec($"ALTER TABLE {t} ADD COLUMN updatedAt TEXT"); }
            Db.Exec($"UPDATE {t} SET updatedAt=createdAt WHERE updatedAt IS NULL");
        }
        var ucols = Db.Rows("PRAGMA table_info(users)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!ucols.Contains("rcktUntil")) Db.Exec("ALTER TABLE users ADD COLUMN rcktUntil TEXT");
        if (!ucols.Contains("hideReceipts")) Db.Exec("ALTER TABLE users ADD COLUMN hideReceipts INTEGER DEFAULT 0");
        Db.Exec(@"CREATE TABLE IF NOT EXISTS reactions(kind TEXT NOT NULL, msgId INTEGER NOT NULL, userId INTEGER NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY(kind,msgId,userId,emoji));
CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, ownerId INTEGER, name TEXT, mime TEXT, size INTEGER, kind TEXT, path TEXT, convKind TEXT, convKey TEXT, msgId INTEGER, createdAt TEXT, deletedAt TEXT);");
        Directory.CreateDirectory(UploadDir);
        if (!Db.Rows("PRAGMA table_info(files)").Any(r => (string)r["name"]! == "conv")) Db.Exec("ALTER TABLE files ADD COLUMN conv TEXT");   // video conversion: null / pending / done / failed
        if (!Db.Rows("PRAGMA table_info(files)").Any(r => (string)r["name"]! == "trimStart")) { Db.Exec("ALTER TABLE files ADD COLUMN trimStart REAL"); Db.Exec("ALTER TABLE files ADD COLUMN trimEnd REAL"); }   // clip trimming, applied while converting
        // Clean up reactions that no longer belong to a message (ids get reused after deletes, so a new message could inherit them),
        // and ones from people who aren't in that conversation.
        Db.Exec(@"DELETE FROM reactions WHERE kind='g' AND (msgId NOT IN (SELECT id FROM messages)
                    OR NOT EXISTS (SELECT 1 FROM messages m JOIN members x ON x.groupId=m.groupId WHERE m.id=reactions.msgId AND x.userId=reactions.userId));
DELETE FROM reactions WHERE kind='d' AND (msgId NOT IN (SELECT id FROM dms)
                    OR NOT EXISTS (SELECT 1 FROM dms d WHERE d.id=reactions.msgId AND (d.a=reactions.userId OR d.b=reactions.userId)));");
    }

    // ---------------- conversations ----------------
    /// <summary>One chat: a group ("g", Id = group id) or a DM with a friend ("d", Id = the other user's id), seen by user Me.</summary>
    readonly record struct Conv(string K, long Id, long Me)
    {
        public bool G => K == "g";
        public string Table => G ? "messages" : "dms";
        public string Author => G ? "userId" : "fromId";
        public bool Allowed => G ? IsMember(Id, Me) : (Id != Me && AreFriends(Me, Id));
        public string Where => G ? "m.groupId=@k" : "m.a=@a AND m.b=@b";
        public string Key => G ? Id.ToString() : $"{Math.Min(Me, Id)}:{Math.Max(Me, Id)}";
        public (string, object?)[] P => G ? new (string, object?)[] { ("@k", Id) } : new (string, object?)[] { ("@a", Math.Min(Me, Id)), ("@b", Math.Max(Me, Id)) };
        public string Sel => $"SELECT m.id, m.{Author} uid, m.text, m.createdAt, m.replyTo, m.editedAt, m.deletedAt, m.fileId, m.updatedAt, m.pinnedAt FROM {Table} m WHERE {Where}";
    }
    static (string, object?)[] With(Conv c, params (string, object?)[] extra) => c.P.Concat(extra).ToArray();

    static IResult WithConv(HttpContext ctx, string k, long id, Func<Conv, IResult> f) => WithUser(ctx, uid =>
    {
        var cv = new Conv(k, id, uid);
        return cv.Allowed ? f(cv) : Err(k == "g" ? "Join the group to chat." : "You can only message friends.", 403);
    });

    /// <summary>Like WithConv, but site admins may act in groups they haven't joined (moderation).</summary>
    static IResult WithConvMod(HttpContext ctx, string k, long id, Func<Conv, IResult> f) => WithUser(ctx, uid =>
    {
        var cv = new Conv(k, id, uid);
        return cv.Allowed || (cv.G && IsAdmin(uid)) ? f(cv) : Err(k == "g" ? "Join the group to chat." : "You can only message friends.", 403);
    });

    static bool Receipts(long uid) => Convert.ToInt32(Db.Scalar("SELECT COALESCE(hideReceipts,0) FROM users WHERE id=@i", ("@i", uid)) ?? 0) == 0;
    public record ReceiptsIn(bool On);

    static string Ids(IEnumerable<long> ids) => string.Join(",", ids.Distinct());   // ids come from our own DB (longs), never from the request text

    // ---------------- building message objects ----------------
    static List<object> Build(Conv c, List<Dictionary<string, object?>> rows)
    {
        var result = new List<object>();
        if (rows.Count == 0) return result;
        var msgIds = rows.Select(r => (long)r["id"]!).ToList();
        var replyIds = rows.Where(r => r["replyTo"] != null).Select(r => Convert.ToInt64(r["replyTo"])).ToList();
        var fileIds = rows.Where(r => r["fileId"] != null && r["deletedAt"] == null).Select(r => Convert.ToInt64(r["fileId"])).ToList();

        var replies = replyIds.Count == 0 ? new() : Db.Rows($"SELECT m.id, m.{c.Author} uid, m.text, m.deletedAt FROM {c.Table} m WHERE {c.Where} AND m.id IN ({Ids(replyIds)})", c.P)
            .ToDictionary(r => (long)r["id"]!);
        var files = fileIds.Count == 0 ? new() : Db.Rows($"SELECT id,name,size,kind,conv FROM files WHERE id IN ({Ids(fileIds)}) AND deletedAt IS NULL").ToDictionary(r => (long)r["id"]!);
        var reacts = Db.Rows($"SELECT msgId, emoji, userId FROM reactions WHERE kind=@k AND msgId IN ({Ids(msgIds)})", ("@k", c.K));

        var uids = rows.Select(r => (long)r["uid"]!).Concat(replies.Values.Select(r => (long)r["uid"]!)).Concat(reacts.Select(r => (long)r["userId"]!)).ToList();
        var users = Db.Rows($"SELECT id,username,display,avatarVer,color,rcktUntil,frame FROM users WHERE id IN ({Ids(uids)})").ToDictionary(r => (long)r["id"]!);
        string NameOf(long id) => users.TryGetValue(id, out var u) ? ((u["display"] as string) ?? (string)u["username"]!) : "someone";

        foreach (var r in rows)
        {
            long id = (long)r["id"]!, uid = (long)r["uid"]!;
            var u = users.GetValueOrDefault(uid);
            bool deleted = r["deletedAt"] != null;
            object? reply = null;
            if (r["replyTo"] != null && replies.TryGetValue(Convert.ToInt64(r["replyTo"]), out var rp))
            {
                bool rd = rp["deletedAt"] != null;
                var plain = WebUtility.HtmlDecode((string)rp["text"]!);
                reply = new { id = (long)rp["id"]!, userId = (long)rp["uid"]!, name = NameOf((long)rp["uid"]!), deleted = rd, text = rd ? "" : Enc(plain.Length > 120 ? plain[..120] + "…" : plain) };
            }
            object? file = null;
            if (!deleted && r["fileId"] != null && files.TryGetValue(Convert.ToInt64(r["fileId"]), out var f))
                file = new { id = (long)f["id"]!, name = (string)f["name"]!, size = Convert.ToInt64(f["size"]), kind = (string)f["kind"]!, url = $"/api/files/{(long)f["id"]!}", processing = (f["conv"] as string) == "pending" };
            var rx = deleted ? new List<object>() : Emoji.Select(e =>
            {
                var who = reacts.Where(x => (long)x["msgId"]! == id && (string)x["emoji"]! == e).Select(x => (long)x["userId"]!).ToList();
                return who.Count == 0 ? null : (object)new { emoji = e, count = who.Count, mine = who.Contains(c.Me), users = who.Take(12).Select(NameOf).ToList() };
            }).Where(x => x != null).ToList()!;
            result.Add(new
            {
                id, userId = uid, username = (string?)u?["username"] ?? "deleted", displayName = u?["display"] as string,
                avatar = u == null ? null : AvatarUrl(uid, u["avatarVer"]), avatarColor = (string?)u?["color"] ?? "#6b6b75", frame = u == null ? null : FrameOf(u), rckt = u != null && IsRckt(u["rcktUntil"]),
                text = deleted ? "" : (string)r["text"]!, createdAt = (string)r["createdAt"]!, editedAt = r["editedAt"] as string, updatedAt = (string)r["updatedAt"]!,
                deleted, replyTo = reply, file, reactions = rx, pinned = !deleted && r["pinnedAt"] != null
            });
        }
        return result;
    }

    static List<Dictionary<string, object?>> Fetch(Conv c, string extraSql, params (string, object?)[] extra) => Db.Rows(c.Sel + extraSql, With(c, extra));
    static object? One(Conv c, long mid) { var rows = Fetch(c, " AND m.id=@mid", ("@mid", mid)); return rows.Count == 0 ? null : Build(c, rows)[0]; }

    // ---------------- typing indicators (memory only) ----------------
    static readonly ConcurrentDictionary<string, ConcurrentDictionary<long, (DateTime At, string Name)>> Typing = new();
    static List<string> TypingNames(Conv c)
    {
        if (!Typing.TryGetValue(c.K + ":" + c.Key, out var d)) return new();
        var now = DateTime.UtcNow;
        foreach (var kv in d.Where(x => now - x.Value.At > TimeSpan.FromSeconds(5)).ToList()) d.TryRemove(kv.Key, out _);
        return d.Where(x => x.Key != c.Me).Select(x => x.Value.Name).Take(4).ToList();
    }

    // ---------------- routes ----------------
    record ChatIn(string? Text, long? ReplyTo, long? FileId);
    record EditIn(string? Text);
    record ReactIn(string? Emoji);
    record RcktIn(int? Days, bool? Forever, bool? Revoke);

    public static void Map(RouteGroupBuilder api)
    {
        foreach (var kind in new[] { "g", "d" })
        {
            var k = kind;
            var list = k == "g" ? "groups/{id:long}/messages" : "dms/{id:long}";   // GET list + POST send (unchanged URLs)
            var root = k == "g" ? "groups/{id:long}" : "dms/{id:long}";

            // history (array). Old clients and first load.
            api.MapGet(list, (HttpContext c, long id, long? after, long? before) => WithConv(c, k, id, cv =>
            {
                List<Dictionary<string, object?>> rows;
                if (before != null) { rows = Fetch(cv, " AND m.id<@before ORDER BY m.id DESC LIMIT 50", ("@before", before)); rows.Reverse(); }   // older history, 50 at a time
                else if (after != null) rows = Fetch(cv, " AND m.id>@after ORDER BY m.id ASC LIMIT 200", ("@after", after));
                else { rows = Fetch(cv, " ORDER BY m.id DESC LIMIT 100"); rows.Reverse(); }
                return Results.Json(Build(cv, rows));
            }));

            // poll: new messages, edited/deleted/reacted ones, and who is typing
            api.MapGet(root + "/sync", (HttpContext c, long id, long? after, string? since) => WithConv(c, k, id, cv =>
            {
                var t0 = Now();
                var fresh = Fetch(cv, " AND m.id>@after ORDER BY m.id ASC LIMIT 200", ("@after", after ?? 0));
                var changed = string.IsNullOrEmpty(since) || since.Length > 40 ? new() :
                    Fetch(cv, " AND m.id<=@after AND m.updatedAt>@since ORDER BY m.updatedAt ASC LIMIT 100", ("@after", after ?? 0), ("@since", since));
                // "Seen": the id of the newest message of mine the other person has read (DMs only; hidden when either of you turned read receipts off)
                long seen = 0;
                if (!cv.G && Receipts(cv.Me) && Receipts(cv.Id))
                    seen = Convert.ToInt64(Db.Scalar("SELECT COALESCE(lastId,0) FROM reads WHERE userId=@p AND kind='dm' AND key=@me", ("@p", cv.Id), ("@me", cv.Me)) ?? 0L);
                return Results.Json(new { messages = Build(cv, fresh), changed = Build(cv, changed), typing = TypingNames(cv), serverTime = t0, seen });
            }));

            api.MapPost(list, (HttpContext c, long id, ChatIn b) => WithConv(c, k, id, cv =>
            {
                if (cv.G) { var blocked = GroupPostBlock(cv.Id, cv.Me); if (blocked != null) return Err(blocked, 403); }
                else if (IsBlocked(cv.Me, cv.Id)) return Err("Cannot send messages to this user.", 403);
                var text = Clean(b.Text, 1000);
                if (text.Length == 0 && b.FileId == null) return Err("Message is empty.");
                var gifErr = GifRules.Check(text, IsRcktUser(cv.Me), b.FileId != null);   // "[gif:<tenor url>]" messages: well-formed, RCKT only
                if (gifErr.HasValue) return Err(gifErr.Value.msg, gifErr.Value.code);
                if (Limited(cv.G ? $"msg:{cv.Me}" : $"dm:{cv.Me}", cv.G ? 30 : 40, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
                if (b.ReplyTo != null && Fetch(cv, " AND m.id=@mid", ("@mid", b.ReplyTo)).Count == 0) return Err("The message you're replying to is gone.", 404);
                if (b.FileId != null)
                {
                    var f = Db.Row("SELECT * FROM files WHERE id=@i AND deletedAt IS NULL", ("@i", b.FileId));
                    if (f == null || (long)f["ownerId"]! != cv.Me || f["msgId"] != null || (string)f["convKind"]! != cv.K || (string)f["convKey"]! != cv.Key) return Err("That upload can't be attached here.", 400);
                }
                var now = Now();
                long mid = cv.G
                    ? Db.Insert("INSERT INTO messages(groupId,userId,text,createdAt,updatedAt,replyTo,fileId) VALUES(@g,@u,@t,@c,@c,@r,@f)", ("@g", cv.Id), ("@u", cv.Me), ("@t", Enc(text)), ("@c", now), ("@r", b.ReplyTo), ("@f", b.FileId))
                    : Db.Insert("INSERT INTO dms(a,b,fromId,text,createdAt,updatedAt,replyTo,fileId) VALUES(@a,@b,@u,@t,@c,@c,@r,@f)", ("@a", Math.Min(cv.Me, cv.Id)), ("@b", Math.Max(cv.Me, cv.Id)), ("@u", cv.Me), ("@t", Enc(text)), ("@c", now), ("@r", b.ReplyTo), ("@f", b.FileId));
                if (b.FileId != null) Db.Exec("UPDATE files SET msgId=@m WHERE id=@f", ("@m", mid), ("@f", b.FileId));
                if (Typing.TryGetValue(cv.K + ":" + cv.Key, out var ty)) ty.TryRemove(cv.Me, out _);
                if (cv.G) Hooks.GroupMessage(cv.Id, mid, cv.Me, Enc(text)); else Hooks.DirectMessage(cv.Id, mid, cv.Me, Enc(text));
                Realtime.Chat(cv.K, cv.Id, cv.Me);
                return Results.Json(One(cv, mid));
            }));

            // search inside this conversation (text of messages that aren't deleted); matches are returned newest first
            api.MapGet(root + "/search", (HttpContext c, long id, string? q) => WithConv(c, k, id, cv =>
            {
                var term = (q ?? "").Trim();
                if (term.Length < 2) return Results.Json(Array.Empty<object>());
                if (term.Length > 60) term = term[..60];
                if (Limited($"find:{cv.Me}", 60, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
                // stored text is HTML-encoded, so search for the encoded form; escape LIKE wildcards
                var like = "%" + Enc(term).Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
                var rows = Fetch(cv, " AND m.deletedAt IS NULL AND m.text LIKE @like ESCAPE '\\' ORDER BY m.id DESC LIMIT 40", ("@like", like));
                return Results.Json(Build(cv, rows));
            }));

            // pinned messages: group owners/mods (and site admins) pin in groups; either person pins in a DM. 20 per chat.
            api.MapGet(root + "/pins", (HttpContext c, long id) => WithConv(c, k, id, cv =>
                Results.Json(Build(cv, Fetch(cv, " AND m.deletedAt IS NULL AND m.pinnedAt IS NOT NULL ORDER BY m.pinnedAt DESC LIMIT 20")))));
            api.MapPost(root + "/messages/{mid:long}/pin", (HttpContext c, long id, long mid) => WithConv(c, k, id, cv =>
            {
                if (cv.G && !CanModerateGroup(cv.Id, cv.Me)) return Err("Only group owners and moderators can pin messages.", 403);
                var row = Fetch(cv, " AND m.id=@mid", ("@mid", mid)).FirstOrDefault();
                if (row == null) return Err("Message not found.", 404);
                if (row["deletedAt"] != null) return Err("That message was deleted.", 409);
                if (row["pinnedAt"] == null)
                {
                    if (Convert.ToInt32(Db.Scalar($"SELECT COUNT(*) FROM {cv.Table} m WHERE {cv.Where} AND m.pinnedAt IS NOT NULL AND m.deletedAt IS NULL", cv.P)) >= 20)
                        return Err("You can pin up to 20 messages. Unpin one first.", 409);
                    Db.Exec($"UPDATE {cv.Table} SET pinnedAt=@n, updatedAt=@n WHERE id=@i", ("@n", Now()), ("@i", mid));
                }
                Realtime.Chat(cv.K, cv.Id, cv.Me);
                return Results.Json(One(cv, mid));
            }));
            api.MapDelete(root + "/messages/{mid:long}/pin", (HttpContext c, long id, long mid) => WithConv(c, k, id, cv =>
            {
                if (cv.G && !CanModerateGroup(cv.Id, cv.Me)) return Err("Only group owners and moderators can unpin messages.", 403);
                if (Fetch(cv, " AND m.id=@mid", ("@mid", mid)).Count == 0) return Err("Message not found.", 404);
                Db.Exec($"UPDATE {cv.Table} SET pinnedAt=NULL, updatedAt=@n WHERE id=@i", ("@n", Now()), ("@i", mid));
                Realtime.Chat(cv.K, cv.Id, cv.Me);
                return Results.Json(One(cv, mid));
            }));

            // edit own message
            api.MapPatch(root + "/messages/{mid:long}", (HttpContext c, long id, long mid, EditIn b) => WithConv(c, k, id, cv =>
            {
                var row = Fetch(cv, " AND m.id=@mid", ("@mid", mid)).FirstOrDefault();
                if (row == null) return Err("Message not found.", 404);
                if ((long)row["uid"]! != cv.Me) return Err("You can only edit your own messages.", 403);
                if (row["deletedAt"] != null) return Err("That message was deleted.", 409);
                var text = Clean(b.Text, 1000);
                if (text.Length == 0) return Err("Message is empty.");
                if (text.Contains("[gif:", StringComparison.OrdinalIgnoreCase) || ((string)row["text"]!).StartsWith("[gif:")) return Err("GIF messages can't be edited. Delete it and send another.");
                if (Limited($"edit:{cv.Me}", 30, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
                var now = Now();
                Db.Exec($"UPDATE {cv.Table} SET text=@t, editedAt=@n, updatedAt=@n WHERE id=@i", ("@t", Enc(text)), ("@n", now), ("@i", mid));
                Realtime.Chat(cv.K, cv.Id, cv.Me);
                return Results.Json(One(cv, mid));
            }));

            // delete (soft). Own messages; in groups also moderators/owners/site admins.
            api.MapDelete(root + "/messages/{mid:long}", (HttpContext c, long id, long mid) => WithConvMod(c, k, id, cv =>
            {
                var row = Fetch(cv, " AND m.id=@mid", ("@mid", mid)).FirstOrDefault();
                if (row == null) return Err("Message not found.", 404);
                bool own = (long)row["uid"]! == cv.Me;
                if (!own && !(cv.G && CanModerateGroup(cv.Id, cv.Me))) return Err("You can't delete that message.", 403);
                if (row["deletedAt"] != null) return Results.Json(One(cv, mid)); /*no-op*/
                var now = Now();
                Db.Exec($"UPDATE {cv.Table} SET text='', deletedAt=@n, updatedAt=@n, fileId=NULL WHERE id=@i", ("@n", now), ("@i", mid));
                if (row["fileId"] != null)
                {
                    var f = Db.Row("SELECT path FROM files WHERE id=@i", ("@i", row["fileId"]));
                    Db.Exec("UPDATE files SET deletedAt=@n WHERE id=@i", ("@n", now), ("@i", row["fileId"]));
                    try { if (f != null) File.Delete((string)f["path"]!); } catch { /* disk cleanup is best effort */ }
                }
                Db.Exec("DELETE FROM reactions WHERE kind=@k AND msgId=@m", ("@k", cv.K), ("@m", mid));
                Realtime.Chat(cv.K, cv.Id, cv.Me);
                return Results.Json(One(cv, mid));
            }));

            // toggle a reaction
            api.MapPost(root + "/messages/{mid:long}/react", (HttpContext c, long id, long mid, ReactIn b) => WithConv(c, k, id, cv =>
            {
                if (b.Emoji == null || !Emoji.Contains(b.Emoji)) return Err("Pick one of the reaction emoji.");
                var row = Fetch(cv, " AND m.id=@mid", ("@mid", mid)).FirstOrDefault();
                if (row == null) return Err("Message not found.", 404);
                if (row["deletedAt"] != null) return Err("That message was deleted.", 409);
                if (Limited($"react:{cv.Me}", 90, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
                var had = Db.Scalar("SELECT 1 FROM reactions WHERE kind=@k AND msgId=@m AND userId=@u AND emoji=@e", ("@k", cv.K), ("@m", mid), ("@u", cv.Me), ("@e", b.Emoji)) != null;
                if (had) Db.Exec("DELETE FROM reactions WHERE kind=@k AND msgId=@m AND userId=@u AND emoji=@e", ("@k", cv.K), ("@m", mid), ("@u", cv.Me), ("@e", b.Emoji));
                else Db.Exec("INSERT OR IGNORE INTO reactions(kind,msgId,userId,emoji) VALUES(@k,@m,@u,@e)", ("@k", cv.K), ("@m", mid), ("@u", cv.Me), ("@e", b.Emoji));
                Db.Exec($"UPDATE {cv.Table} SET updatedAt=@n WHERE id=@i", ("@n", Now()), ("@i", mid));
                Realtime.Chat(cv.K, cv.Id, cv.Me);
                return Results.Json(One(cv, mid));
            }));

            // "X is typing…" (memory only; entries expire after 5 s)
            api.MapPost(root + "/typing", (HttpContext c, long id) => WithConv(c, k, id, cv =>
            {
                if (Limited($"typing:{cv.Me}", 90, TimeSpan.FromMinutes(1), true)) return Results.Json(new { ok = true });
                var u = Db.Row("SELECT username,display FROM users WHERE id=@i", ("@i", cv.Me))!;
                Typing.GetOrAdd(cv.K + ":" + cv.Key, _ => new())[cv.Me] = (DateTime.UtcNow, (u["display"] as string) ?? (string)u["username"]!);
                Realtime.Chat(cv.K, cv.Id, cv.Me);
                return Results.Json(new { ok = true });
            }));
        }

        MapFiles(api);

        // read receipts ("Seen"): on by default; turning it off hides yours and lets you see nobody else's
        api.MapGet("me/receipts", (HttpContext c) => WithUser(c, me => Results.Json(new { on = Receipts(me) })));
        api.MapPut("me/receipts", (HttpContext c, ReceiptsIn b) => WithUser(c, me =>
        {
            Db.Exec("UPDATE users SET hideReceipts=@h WHERE id=@i", ("@h", b.On ? 0 : 1), ("@i", me));
            return Results.Json(new { on = b.On });
        }));
        MapRckt(api);
    }

    // ---------------- attachments ----------------
    static string SafeName(string? raw)
    {
        var s = new string((raw ?? "").Where(ch => !char.IsControl(ch) && ch is not ('/' or '\\' or ':' or '*' or '?' or '"' or '<' or '>' or '|')).ToArray()).Trim().Trim('.');
        if (s.Length > 100) s = s[..100];
        return s.Length == 0 ? "file" : s;
    }

    /// <summary>Decides the file kind from the first bytes and filename extension.</summary>
    static (string kind, string mime) Sniff(byte[] d, int n, string name = "")
    {
        if (n >= 8 && d[0] == 0x89 && d[1] == 0x50 && d[2] == 0x4E && d[3] == 0x47) return ("image", "image/png");
        if (n >= 3 && d[0] == 0xFF && d[1] == 0xD8 && d[2] == 0xFF) return ("image", "image/jpeg");
        if (n >= 6 && d[0] == 'G' && d[1] == 'I' && d[2] == 'F' && d[3] == '8' && (d[4] == '7' || d[4] == '9') && d[5] == 'a') return ("gif", "image/gif");
        if (n >= 12 && d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') return ("image", "image/webp");
        // voice messages are recorded in the browser (webm/opus, ogg or mp4/aac) and named "voice-<time>.<ext>"
        if (name.StartsWith("voice-", StringComparison.OrdinalIgnoreCase))
        {
            if (n >= 4 && d[0] == 0x1A && d[1] == 0x45 && d[2] == 0xDF && d[3] == 0xA3) return ("audio", "audio/webm");
            if (n >= 4 && d[0] == 'O' && d[1] == 'g' && d[2] == 'g' && d[3] == 'S') return ("audio", "audio/ogg");
            if (n >= 8 && d[4] == 'f' && d[5] == 't' && d[6] == 'y' && d[7] == 'p') return ("audio", "audio/mp4");
        }
        if (n >= 8 && d[4] == 'f' && d[5] == 't' && d[6] == 'y' && d[7] == 'p') return ("video", "video/mp4");
        if (n >= 4 && d[0] == 0x1A && d[1] == 0x45 && d[2] == 0xDF && d[3] == 0xA3) return ("video", "video/webm");
        if (n >= 4 && d[0] == 'O' && d[1] == 'g' && d[2] == 'g' && d[3] == 'S') return ("video", "video/ogg");
        if (name.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase)) return ("video", "video/mp4");
        if (name.EndsWith(".webm", StringComparison.OrdinalIgnoreCase)) return ("video", "video/webm");
        if (name.EndsWith(".mov", StringComparison.OrdinalIgnoreCase)) return ("video", "video/quicktime");
        if (name.EndsWith(".ogg", StringComparison.OrdinalIgnoreCase)) return ("video", "video/ogg");
        return ("file", "application/octet-stream");
    }

    static readonly byte[] LinkKey = System.Security.Cryptography.RandomNumberGenerator.GetBytes(32);   // new on every start: old links simply stop working
    static string Sign(long id, long exp) =>
        Convert.ToHexString(System.Security.Cryptography.HMACSHA256.HashData(LinkKey, System.Text.Encoding.ASCII.GetBytes($"{id}:{exp}")));

    static void MapFiles(RouteGroupBuilder api)
    {
        api.MapPost("uploads", async Task<IResult> (HttpContext c, string kind, long id) =>
        {
            var uid = CurrentUser(c);
            if (uid is null) return Err("Not signed in.", 401);
            if (kind is not ("g" or "d" or "p")) return Err("Bad upload target.");
            var cv = kind == "p" ? new Conv("g", 0, uid.Value) : new Conv(kind, id, uid.Value);   // "p": a clip for the sender's own profile, not tied to a chat
            if (kind != "p" && !cv.Allowed) return Err(kind == "g" ? "Join the group to share files." : "You can only share files with friends.", 403);
            if (Limited($"up:{uid}", 40, TimeSpan.FromHours(1), true)) return Err("Too many uploads. Try again later.", 429);
            bool rckt = IsRcktUser(uid.Value);
            long limit = rckt ? RcktLimit : NormalLimit;
            string tooBig = rckt ? "Files can be up to 250 MB." : "Files can be up to 20 MB. RCKT raises it to 250 MB.";
            if (c.Request.ContentLength > limit) return Err(tooBig, 413);
            if (c.Request.ContentLength == 0) return Err("That file is empty.");
            var feat = c.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (feat != null && !feat.IsReadOnly) feat.MaxRequestBodySize = limit;   // only this endpoint may exceed Kestrel's default
            long used = Convert.ToInt64(Db.Scalar("SELECT COALESCE(SUM(size),0) FROM files WHERE ownerId=@u AND deletedAt IS NULL", ("@u", uid.Value)));
            if (used >= (rckt ? RcktQuota : NormalQuota)) return Err("Your file storage is full. Delete some old files.", 403);
            CleanOrphans();

            string name;
            try { name = SafeName(Uri.UnescapeDataString(c.Request.Headers["X-Filename"].ToString())); } catch { name = "file"; }
            Directory.CreateDirectory(UploadDir);
        if (!Db.Rows("PRAGMA table_info(files)").Any(r => (string)r["name"]! == "conv")) Db.Exec("ALTER TABLE files ADD COLUMN conv TEXT");   // video conversion: null / pending / done / failed
            var path = Path.Combine(UploadDir, Guid.NewGuid().ToString("N"));
            long size = 0; var head = new byte[16]; int headLen = 0;
            try
            {
                await using (var fs = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
                {
                    var buf = new byte[81920]; int n;
                    while ((n = await c.Request.Body.ReadAsync(buf)) > 0)
                    {
                        if (headLen < head.Length) { var take = Math.Min(n, head.Length - headLen); Array.Copy(buf, 0, head, headLen, take); headLen += take; }
                        size += n;
                        if (size > limit) { fs.Close(); File.Delete(path); return Err(tooBig, 413); }
                        await fs.WriteAsync(buf.AsMemory(0, n));
                    }
                }
            }
            catch (BadHttpRequestException) { try { File.Delete(path); } catch { } return Err(tooBig, 413); }
            catch { try { File.Delete(path); } catch { } return Err("The upload was interrupted.", 400); }
            if (size == 0) { File.Delete(path); return Err("That file is empty."); }

            var (fkind, mime) = Sniff(head, headLen, name);
            if (fkind == "gif" && !rckt) { File.Delete(path); return Err("GIFs need RCKT. Ask an admin for RCKT.", 403); }
            var fid = Db.Insert("INSERT INTO files(ownerId,name,mime,size,kind,path,convKind,convKey,createdAt) VALUES(@o,@n,@m,@s,@k,@p,@ck,@cy,@c)",
                ("@o", uid.Value), ("@n", name), ("@m", mime), ("@s", size), ("@k", fkind), ("@p", path), ("@ck", cv.K), ("@cy", cv.Key), ("@c", Now()));
            if (fkind == "video")
            {
                // optional trim from the clip window: "start,end" in seconds, applied while converting (needs ffmpeg on the server)
                var tr = c.Request.Headers["X-Trim"].ToString().Split(',');
                if (tr.Length == 2 && double.TryParse(tr[0], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var ts) && double.TryParse(tr[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var te)
                    && ts >= 0 && te - ts >= 1 && te <= 3600)
                    Db.Exec("UPDATE files SET trimStart=@a, trimEnd=@b WHERE id=@i", ("@a", ts), ("@b", te), ("@i", fid));
                VideoConvert.Enqueue(fid);   // converted to WebM in the background (needs ffmpeg on the server)
            }
            return Results.Json(new { id = fid, name, size, kind = fkind, url = $"/api/files/{fid}" });
        });

        // Only people in the conversation (or the uploader, before it is sent) can fetch a file.
        static IResult Serve(HttpContext c, Dictionary<string, object?> f, bool isPrivate)
        {
            c.Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
            c.Response.Headers["Cache-Control"] = isPrivate ? "private, max-age=31536000, immutable" : "private, no-store";
            var kind = (string)f["kind"]!;
            if (kind is "image" or "gif" or "video" or "audio") return Results.File((string)f["path"]!, (string)f["mime"]!, enableRangeProcessing: true);
            return Results.File((string)f["path"]!, "application/octet-stream", fileDownloadName: (string)f["name"]!, enableRangeProcessing: true);   // attachment: never rendered by the browser
        }
        static Dictionary<string, object?>? Visible(long id, long uid)
        {
            var f = Db.Row("SELECT * FROM files WHERE id=@i AND deletedAt IS NULL", ("@i", id));
            if (f == null || !File.Exists((string)f["path"]!)) return null;
            bool ok;
            if (f["msgId"] == null) ok = (long)f["ownerId"]! == uid || ClipsApi.PublicClip(id, uid);
            else if ((string)f["convKind"]! == "g") ok = long.TryParse((string)f["convKey"]!, out var gid) && IsMember(gid, uid);
            else { var p = ((string)f["convKey"]!).Split(':'); ok = p.Length == 2 && (p[0] == uid.ToString() || p[1] == uid.ToString()); }
            return ok ? f : null;
        }

        api.MapGet("files/{id:long}", (HttpContext c, long id) => WithUser(c, uid =>
        {
            var f = Visible(id, uid);
            return f == null ? Err("File not found.", 404) : Serve(c, f, true);
        }));

        // A short-lived link for opening a file outside the app (e.g. a video the built-in player can't decode opens in the system browser).
        // Only people who can already see the file can get one; the link expires after 6 hours.
        api.MapGet("files/{id:long}/link", (HttpContext c, long id) => WithUser(c, uid =>
        {
            if (Visible(id, uid) == null) return Err("File not found.", 404);
            var exp = DateTimeOffset.UtcNow.AddHours(6).ToUnixTimeSeconds();
            return Results.Json(new { url = $"/api/files/{id}/open?e={exp}&s={Sign(id, exp)}" });
        }));
        api.MapGet("files/{id:long}/open", (HttpContext c, long id, long e, string s) =>
        {
            if (e < DateTimeOffset.UtcNow.ToUnixTimeSeconds() || !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
                    System.Text.Encoding.ASCII.GetBytes(Sign(id, e)), System.Text.Encoding.ASCII.GetBytes(s ?? ""))) return Err("This link has expired.", 403);
            var f = Db.Row("SELECT * FROM files WHERE id=@i AND deletedAt IS NULL", ("@i", id));
            if (f == null || !File.Exists((string)f["path"]!)) return Err("File not found.", 404);
            return Serve(c, f, false);
        });
    }

    static DateTime lastOrphanSweep = DateTime.MinValue;
    /// <summary>Uploads that were never sent in a message are removed after two hours.</summary>
    static void CleanOrphans()
    {
        if (DateTime.UtcNow - lastOrphanSweep < TimeSpan.FromMinutes(10)) return;
        lastOrphanSweep = DateTime.UtcNow;
        var cutoff = DateTime.UtcNow.AddHours(-2).ToString("o");
        foreach (var f in Db.Rows("SELECT id,path FROM files WHERE msgId IS NULL AND deletedAt IS NULL AND createdAt<@c AND id NOT IN (SELECT fileId FROM profile_clips)", ("@c", cutoff)))
        {
            try { File.Delete((string)f["path"]!); } catch { /* ignore */ }
            Db.Exec("UPDATE files SET deletedAt=@n WHERE id=@i", ("@n", Now()), ("@i", f["id"]));
        }
    }

    // ---------------- RCKT ----------------
    static void MapRckt(RouteGroupBuilder api)
    {
        api.MapGet("admin/users/{id:long}/rckt", (HttpContext c, long id) => WithAdmin(c, _ =>
        {
            var u = Db.Row("SELECT username,rcktUntil FROM users WHERE id=@i", ("@i", id));
            return u == null ? Err("User not found.", 404) : Results.Json(new { username = (string)u["username"]!, until = u["rcktUntil"] as string, active = IsRckt(u["rcktUntil"]) });
        }));

        api.MapPost("admin/users/{id:long}/rckt", (HttpContext c, long id, RcktIn b) => WithAdmin(c, me =>
        {
            var u = Db.Row("SELECT username,rcktUntil FROM users WHERE id=@i", ("@i", id));
            if (u == null) return Err("User not found.", 404);
            string? until; string what;
            if (b.Revoke == true) { until = null; what = "revoked RCKT"; }
            else if (b.Forever == true) { until = "forever"; what = "granted RCKT (forever)"; }
            else if (b.Days is >= 1 and <= 3650)
            {
                var start = DateTime.UtcNow;
                var cur = u["rcktUntil"] as string;
                if (IsRckt(cur) && cur != "forever" && DateTime.TryParse(cur, null, System.Globalization.DateTimeStyles.RoundtripKind, out var d)) start = d.ToUniversalTime();   // extend an active plan
                until = start.AddDays(b.Days.Value).ToString("o"); what = $"granted RCKT ({b.Days} days)";
            }
            else return Err("Choose a number of days, forever, or revoke.");
            Db.Exec("UPDATE users SET rcktUntil=@u WHERE id=@i", ("@u", until), ("@i", id));
            Audit(me, what, (string)u["username"]!);
            return Results.Json(new { username = (string)u["username"]!, until, active = IsRckt(until) });
        }));

        // Used by the UI to put an RCKT badge on a profile.
        api.MapGet("rckt/lookup", (HttpContext c, string? username) => WithUser(c, uid =>
        {
            if (Limited($"rl:{uid}", 120, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
            if (username == null || !userRx.IsMatch(username)) return Results.Json(new { rckt = false });
            return Results.Json(new { rckt = IsRckt(Db.Scalar("SELECT rcktUntil FROM users WHERE username=@u COLLATE NOCASE", ("@u", username))) });
        }));
    }
}

/// <summary>
/// GIF messages and saved favourites. A GIF message's text is exactly "[gif:https://media.tenor.com/...]" (the UI renders it through
/// /api/media/proxy); only Tenor media hosts are accepted and sending one needs RCKT, the same rule as uploading a GIF.
/// </summary>
public static class GifRules
{
    public static readonly System.Text.RegularExpressions.Regex TenorUrl = new(@"^https://(media|media1|c)\.tenor\.com/[A-Za-z0-9_\-./~%]{1,240}$", System.Text.RegularExpressions.RegexOptions.Compiled);
    static readonly System.Text.RegularExpressions.Regex Token = new(@"^\[gif:(https://[^\]\s]{1,500})\]$", System.Text.RegularExpressions.RegexOptions.Compiled);
    public static bool IsGifUrl(string? u)
    {
        if (string.IsNullOrWhiteSpace(u) || u.Length > 500) return false;
        if (!Uri.TryCreate(u, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != "https" || !string.IsNullOrEmpty(uri.UserInfo) || !uri.IsDefaultPort) return false;
        var host = uri.Host.ToLowerInvariant();
        return host == "klipy.com" || host.EndsWith(".klipy.com")
            || host == "tenor.com" || host.EndsWith(".tenor.com")
            || host == "giphy.com" || host.EndsWith(".giphy.com");
    }
    public static bool IsTenor(string? u) => IsGifUrl(u);

    /// <summary>Null when the text may be sent; otherwise the HTTP code and a friendly message.</summary>
    public static (int code, string msg)? Check(string text, bool rckt, bool hasFile)
    {
        if (!text.Contains("[gif:", StringComparison.OrdinalIgnoreCase)) return null;
        var m = Token.Match(text);
        if (!m.Success || !IsGifUrl(m.Groups[1].Value)) return (400, "That GIF link isn't valid.");
        if (hasFile) return (400, "Send a GIF on its own, without a file.");
        return rckt ? null : (403, "GIFs need RCKT. Ask an admin for RCKT.");
    }

    /// <summary>
    /// Favourites are stored as small JSON strings {i,t,p,u,w,h}: id, title, preview url, full url, size. Anything that isn't a
    /// Tenor media URL is dropped, so the preferences endpoint can't be used to store arbitrary data or link elsewhere.
    /// </summary>
    public static string[] SanitizeFavorites(string[]? raw)
    {
        var seen = new HashSet<string>(); var list = new List<string>();
        foreach (var s in (raw ?? Array.Empty<string>()).Take(200))
        {
            if (s == null || s.Length > 800) continue;
            string? u = null, p = null, id = "", title = ""; int w = 200, h = 150;
            try
            {
                if (s.TrimStart().StartsWith("{"))
                {
                    using var d = System.Text.Json.JsonDocument.Parse(s); var r = d.RootElement;
                    if (r.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
                    u = r.TryGetProperty("u", out var uu) ? uu.GetString() : null;
                    p = r.TryGetProperty("p", out var pp) ? pp.GetString() : null;
                    id = r.TryGetProperty("i", out var ii) && ii.ValueKind == System.Text.Json.JsonValueKind.String ? ii.GetString() ?? "" : "";
                    title = r.TryGetProperty("t", out var tt) && tt.ValueKind == System.Text.Json.JsonValueKind.String ? tt.GetString() ?? "" : "";
                    if (r.TryGetProperty("w", out var ww) && ww.TryGetInt32(out var wi)) w = Math.Clamp(wi, 1, 4000);
                    if (r.TryGetProperty("h", out var hh) && hh.TryGetInt32(out var hi)) h = Math.Clamp(hi, 1, 4000);
                }
                else u = s;   // a bare URL from an older client
            }
            catch { continue; }
            if (!IsTenor(u)) continue;
            if (!IsTenor(p)) p = u;
            if (!seen.Add(u!)) continue;
            id = new string(id.Where(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-').Take(80).ToArray());
            title = new string(title.Where(ch => !char.IsControl(ch)).ToArray()); if (title.Length > 80) title = title[..80];
            list.Add(System.Text.Json.JsonSerializer.Serialize(new { i = id, t = title, p, u, w, h }));
            if (list.Count >= 100) break;
        }
        return list.ToArray();
    }
}
