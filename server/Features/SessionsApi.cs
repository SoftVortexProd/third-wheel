using static Core;

/// <summary>
/// Session history: "who I played with". A session is recorded when a voice chat with 2+ people lasts at least 2 minutes, or when an LFG post fills up.
/// From the history you can add people as friends, message them, play again, and say who was a good teammate (that feeds the reputation badge on profiles).
/// </summary>
public static class SessionsApi
{
    public record RateIn(long UserId, bool Good);

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS play_sessions(id INTEGER PRIMARY KEY, kind TEXT, game TEXT, groupId INTEGER, startedAt TEXT, endedAt TEXT);
CREATE TABLE IF NOT EXISTS session_players(sessionId INTEGER, userId INTEGER, PRIMARY KEY(sessionId, userId));
CREATE INDEX IF NOT EXISTS ix_sp_user ON session_players(userId, sessionId);
CREATE TABLE IF NOT EXISTS session_ratings(sessionId INTEGER, fromId INTEGER, toId INTEGER, good INTEGER, at TEXT, PRIMARY KEY(sessionId, fromId, toId));
CREATE INDEX IF NOT EXISTS ix_sr_to ON session_ratings(toId, good);");
    }

    /// <summary>Store a finished session (called by the voice rooms and the LFG board).</summary>
    public static void Record(string kind, long groupId, DateTime start, DateTime end, List<long> uids, string? game = null)
    {
        try
        {
            uids = uids.Distinct().ToList(); if (uids.Count < 2) return;
            game ??= groupId > 0 ? Db.Scalar("SELECT game FROM grps WHERE id=@g", ("@g", groupId)) as string : null;
            var id = Db.Insert("INSERT INTO play_sessions(kind,game,groupId,startedAt,endedAt) VALUES(@k,@g,@gid,@s,@e)",
                ("@k", kind), ("@g", game ?? ""), ("@gid", groupId > 0 ? groupId : null), ("@s", start.ToString("o")), ("@e", end.ToString("o")));
            foreach (var u in uids) Db.Exec("INSERT OR IGNORE INTO session_players(sessionId,userId) VALUES(@s,@u)", ("@s", id), ("@u", u));
        }
        catch { /* history is a nicety: never break the feature that called it */ }
    }

    public static int GoodCount(long uid) => Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM session_ratings WHERE toId=@u AND good=1", ("@u", uid)));

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("sessions", (HttpContext c) => WithUser(c, me =>
        {
            var rows = Db.Rows(@"SELECT s.* FROM play_sessions s JOIN session_players p ON p.sessionId=s.id WHERE p.userId=@me ORDER BY s.id DESC LIMIT 40", ("@me", me));
            if (rows.Count == 0) return Results.Json(Array.Empty<object>());
            var ids = string.Join(",", rows.Select(r => (long)r["id"]!));
            var players = Db.Rows($"SELECT p.sessionId, u.* FROM session_players p JOIN users u ON u.id=p.userId WHERE p.sessionId IN ({ids}) AND p.userId<>@me", ("@me", me))
                .Where(u => Convert.ToInt32(u["banned"]) == 0 && !IsBlocked(me, (long)u["id"]!)).GroupBy(u => (long)u["sessionId"]!).ToDictionary(g => g.Key, g => g.ToList());
            var rated = Db.Rows($"SELECT sessionId, toId, good FROM session_ratings WHERE fromId=@me AND sessionId IN ({ids})", ("@me", me)).ToDictionary(r => ((long)r["sessionId"]!, (long)r["toId"]!), r => Convert.ToInt32(r["good"]) == 1);
            var list = rows.Select(r =>
            {
                var sid = (long)r["id"]!; long? gid = r["groupId"] as long?;
                var gname = gid != null ? Db.Scalar("SELECT name FROM grps WHERE id=@g", ("@g", gid)) as string : null;
                return (object)new
                {
                    id = sid, kind = (string)r["kind"]!, game = (string)(r["game"] ?? ""), groupId = gid, groupName = gname, startedAt = (string)r["startedAt"]!, endedAt = (string)r["endedAt"]!,
                    players = (players.GetValueOrDefault(sid) ?? new()).Select(u => new { person = PersonObj(u, AreFriends(me, (long)u["id"]!)), good = rated.GetValueOrDefault((sid, (long)u["id"]!)) }).ToList()
                };
            }).ToList();
            return Results.Json(list);
        }));

        // "good teammate" thumbs-up (toggle). Only people who were in the same session, never yourself.
        api.MapPost("sessions/{id:long}/rate", (HttpContext c, long id, RateIn b) => WithUser(c, me =>
        {
            if (b.UserId == me) return Err("You can't rate yourself.");
            if (Db.Scalar("SELECT 1 FROM session_players WHERE sessionId=@s AND userId=@u", ("@s", id), ("@u", me)) == null ||
                Db.Scalar("SELECT 1 FROM session_players WHERE sessionId=@s AND userId=@u", ("@s", id), ("@u", b.UserId)) == null) return Err("You weren't in a session with them.", 403);
            if (IsBlocked(me, b.UserId)) return Err("You can't rate this person.", 403);
            if (Limited($"rate:{me}", 60, TimeSpan.FromHours(1), true)) return Err("Slow down a little.", 429);
            if (b.Good) Db.Exec("INSERT INTO session_ratings(sessionId,fromId,toId,good,at) VALUES(@s,@f,@t,1,@n) ON CONFLICT(sessionId,fromId,toId) DO UPDATE SET good=1", ("@s", id), ("@f", me), ("@t", b.UserId), ("@n", Now()));
            else Db.Exec("DELETE FROM session_ratings WHERE sessionId=@s AND fromId=@f AND toId=@t", ("@s", id), ("@f", me), ("@t", b.UserId));
            return Results.Json(new { ok = true, good = b.Good });
        }));
    }
}
