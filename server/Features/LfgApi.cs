using System.Net;
using static Core;

/// <summary>
/// "Looking for group" board: short-lived posts like "need 2 for ranked tonight". Posts expire on their own, are limited per person,
/// only use real catalog games, keep under-18s and adults apart (Core.Age) and never show blocked or suspended people.
/// </summary>
public static class LfgApi
{
    public record LfgIn(string? Game, string? Mode, string? Region, int? Slots, string? Note, int? Hours, bool? Mic, long? GroupId);

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS lfg_posts(id INTEGER PRIMARY KEY, userId INTEGER, game TEXT, mode TEXT, region TEXT, slots INTEGER, note TEXT, mic INTEGER DEFAULT 0,
            groupId INTEGER, createdAt TEXT, expiresAt TEXT, closed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS lfg_responses(postId INTEGER, userId INTEGER, at TEXT, PRIMARY KEY(postId, userId));
CREATE INDEX IF NOT EXISTS ix_lfg_open ON lfg_posts(closed, expiresAt);");
        Purge();
    }

    /// <summary>Posts are deleted a day after they expire.</summary>
    static void Purge()
    {
        var old = DateTime.UtcNow.AddDays(-1).ToString("o");
        Db.Exec("DELETE FROM lfg_responses WHERE postId IN (SELECT id FROM lfg_posts WHERE expiresAt<@o)", ("@o", old));
        Db.Exec("DELETE FROM lfg_posts WHERE expiresAt<@o", ("@o", old));
    }

    static bool Open(Dictionary<string, object?> p) => Convert.ToInt32(p["closed"]) == 0 && string.CompareOrdinal((string)p["expiresAt"]!, Now()) > 0;

    /// <summary>Can `me` see (and answer) a post by this poster? Age separation, blocks and suspensions apply.</summary>
    static bool CanSee(long me, int myAge, Dictionary<string, object?> poster) =>
        Convert.ToInt32(poster["banned"]) == 0 && !IsBlocked(me, (long)poster["id"]!) && (me == (long)poster["id"]! || Age.UserVisible(myAge, Convert.ToInt32(poster["age"])));

    static object Lite(Dictionary<string, object?> u) => new
    {
        id = (long)u["id"]!, username = (string)u["username"]!, displayName = u["display"] as string, avatar = AvatarUrl((long)u["id"]!, u["avatarVer"]), avatarColor = (string)u["color"]!
    };

    static object PostObj(Dictionary<string, object?> p, Dictionary<string, object?> poster, long me, List<Dictionary<string, object?>> responders)
    {
        var id = (long)p["id"]!; var mine = (long)p["userId"]! == me;
        var slots = Convert.ToInt32(p["slots"]);
        object? group = null;
        if (p["groupId"] is long gid && gid > 0)
        {
            var g = Db.Row(GroupSel + " WHERE g.id=@g AND " + GroupsApi.ListableSql, ("@g", gid), ("@me", me));
            if (g != null) group = GroupObj(g);
        }
        return new
        {
            id, poster = PersonObj(poster, AreFriends(me, (long)poster["id"]!)), game = (string)p["game"]!, mode = (string)p["mode"]!, region = (string)p["region"]!,
            slots, filled = responders.Count, note = (string)(p["note"] ?? ""), mic = Convert.ToInt32(p["mic"]) == 1, group,
            createdAt = (string)p["createdAt"]!, expiresAt = (string)p["expiresAt"]!, open = Open(p), mine,
            responded = responders.Any(r => (long)r["id"]! == me),
            responders = responders.Take(mine ? 9 : 3).Select(Lite).ToList()
        };
    }

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("lfg", (HttpContext c, string? game, string? mode, string? region, bool? mine) => WithUser(c, me =>
        {
            Purge();
            var myAge = Age.Of(me);
            var now = Now();
            // closed: 0 = open, 1 = closed by its owner (hidden), 2 = filled up (still shown, marked Full, so the owner can see who joined)
            var rows = Db.Rows("SELECT * FROM lfg_posts WHERE closed IN (0,2) AND expiresAt>@n ORDER BY id DESC LIMIT 200", ("@n", now));
            if (rows.Count == 0) return Results.Json(Array.Empty<object>());
            var users = Db.Rows($"SELECT * FROM users WHERE id IN ({string.Join(",", rows.Select(r => (long)r["userId"]!).Distinct())})").ToDictionary(r => (long)r["id"]!);
            var resp = Db.Rows($"SELECT r.postId, u.* FROM lfg_responses r JOIN users u ON u.id=r.userId WHERE r.postId IN ({string.Join(",", rows.Select(r => (long)r["id"]!))}) ORDER BY r.at ASC")
                .GroupBy(r => (long)r["postId"]!).ToDictionary(g => g.Key, g => g.Where(u => Convert.ToInt32(u["banned"]) == 0 && !IsBlocked(me, (long)u["id"]!)).ToList());
            var canon = string.IsNullOrWhiteSpace(game) ? null : GamesApi.Canonical(game);
            var list = new List<object>();
            foreach (var p in rows)
            {
                var poster = users[(long)p["userId"]!];
                if (mine == true ? (long)p["userId"]! != me : !CanSee(me, myAge, poster)) continue;
                if (canon != null && !string.Equals((string)p["game"]!, canon, StringComparison.OrdinalIgnoreCase)) continue;
                if (mode is "casual" or "competitive" && (string)p["mode"]! != mode) continue;
                if (!string.IsNullOrEmpty(region) && (string)p["region"]! != region) continue;
                list.Add(PostObj(p, poster, me, resp.GetValueOrDefault((long)p["id"]!) ?? new()));
                if (list.Count >= 60) break;
            }
            return Results.Json(list);
        }));

        api.MapPost("lfg", (HttpContext c, LfgIn b) => WithUser(c, me =>
        {
            if (Limited($"lfg:{me}", 6, TimeSpan.FromHours(1), true)) return Err("You're posting too fast. Try again in a bit.", 429);
            var game = GamesApi.Canonical(b.Game);
            if (game == null) return Err("Pick a real game from the list.");
            if (b.Mode is not ("casual" or "competitive")) return Err("Mode must be casual or competitive.");
            if (!Db.Regions.Contains(b.Region ?? "")) return Err("Pick a region.");
            var slots = b.Slots ?? 1;
            if (slots is < 1 or > 9) return Err("You can look for 1 to 9 players.");
            var hours = b.Hours ?? 2;
            if (hours is not (1 or 2 or 4 or 8)) return Err("A post can last 1, 2, 4 or 8 hours.");
            var note = Clean(b.Note, 140);
            if (!NameFilter.TextAllowed(note)) return Err(NameFilter.TextMessage);
            long? gid = null;
            if (b.GroupId is long g && g > 0)
            {
                if (!IsMember(g, me)) return Err("You can only attach a group you are in.", 403);
                gid = g;
            }
            if (Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM lfg_posts WHERE userId=@u AND closed IN (0,2) AND expiresAt>@n", ("@u", me), ("@n", Now()))) >= 3)
                return Err("You already have 3 open posts. Close one first.", 409);
            var id = Db.Insert("INSERT INTO lfg_posts(userId,game,mode,region,slots,note,mic,groupId,createdAt,expiresAt) VALUES(@u,@g,@m,@r,@s,@n,@mic,@gid,@c,@e)",
                ("@u", me), ("@g", game), ("@m", b.Mode), ("@r", b.Region), ("@s", slots), ("@n", Enc(note)), ("@mic", b.Mic == true ? 1 : 0), ("@gid", gid),
                ("@c", Now()), ("@e", DateTime.UtcNow.AddHours(hours).ToString("o")));
            var p = Db.Row("SELECT * FROM lfg_posts WHERE id=@i", ("@i", id))!;
            return Results.Json(PostObj(p, Db.Row("SELECT * FROM users WHERE id=@i", ("@i", me))!, me, new()));
        }));

        api.MapDelete("lfg/{id:long}", (HttpContext c, long id) => WithUser(c, me =>
        {
            var p = Db.Row("SELECT userId FROM lfg_posts WHERE id=@i", ("@i", id));
            if (p == null) return Err("Post not found.", 404);
            if ((long)p["userId"]! != me && !IsAdmin(me)) return Err("That isn't your post.", 403);
            Db.Exec("DELETE FROM lfg_responses WHERE postId=@i", ("@i", id));
            Db.Exec("DELETE FROM lfg_posts WHERE id=@i", ("@i", id));
            return Results.Json(new { ok = true });
        }));

        // "I'm in": the poster sees you on their post and can message you or send a friend request from your profile.
        api.MapPost("lfg/{id:long}/join", (HttpContext c, long id) => WithUser(c, me =>
        {
            if (Limited($"lfgj:{me}", 30, TimeSpan.FromHours(1), true)) return Err("Slow down a little.", 429);
            var p = Db.Row("SELECT * FROM lfg_posts WHERE id=@i", ("@i", id));
            if (p == null || !Open(p)) return Err("That post is closed or has expired.", 404);
            if ((long)p["userId"]! == me) return Err("That's your own post.");
            var poster = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", p["userId"]))!;
            if (!CanSee(me, Age.Of(me), poster)) return Err("That post isn't available to you.", 403);
            if (Db.Scalar("SELECT 1 FROM lfg_responses WHERE postId=@p AND userId=@u", ("@p", id), ("@u", me)) != null) return Err("You already said you're in.", 409);
            var filled = Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM lfg_responses WHERE postId=@p", ("@p", id)));
            if (filled >= Convert.ToInt32(p["slots"])) return Err("This group is already full.", 409);
            Db.Exec("INSERT INTO lfg_responses(postId,userId,at) VALUES(@p,@u,@t)", ("@p", id), ("@u", me), ("@t", Now()));
            if (filled + 1 >= Convert.ToInt32(p["slots"])) Db.Exec("UPDATE lfg_posts SET closed=2 WHERE id=@i", ("@i", id));   // 2 = filled up
            Db.Exec("INSERT INTO notifications(userId,type,fromId,snippet,createdAt) VALUES(@to,'lfg',@f,@s,@t)", ("@to", p["userId"]), ("@f", me), ("@s", Enc((string)p["game"]!)), ("@t", Now()));
            return Results.Json(new { ok = true });
        }));

        api.MapDelete("lfg/{id:long}/join", (HttpContext c, long id) => WithUser(c, me =>
        {
            Db.Exec("DELETE FROM lfg_responses WHERE postId=@p AND userId=@u", ("@p", id), ("@u", me));
            Db.Exec("UPDATE lfg_posts SET closed=0 WHERE id=@i AND closed=2", ("@i", id));   // a spot opened up again
            return Results.Json(new { ok = true });
        }));

        api.MapPost("lfg/{id:long}/close", (HttpContext c, long id) => WithUser(c, me =>
        {
            var p = Db.Row("SELECT userId FROM lfg_posts WHERE id=@i", ("@i", id));
            if (p == null) return Err("Post not found.", 404);
            if ((long)p["userId"]! != me && !IsAdmin(me)) return Err("That isn't your post.", 403);
            Db.Exec("UPDATE lfg_posts SET closed=1 WHERE id=@i", ("@i", id));
            return Results.Json(new { ok = true });
        }));
    }
}
