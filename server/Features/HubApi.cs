using System.Net;
using System.Text.Json;
using static Core;

/// <summary>Data for the Messages, Discover and My games pages in the sidebar.</summary>
public static class HubApi
{
    public static void Migrate() { }

    static string[] Favorites(object? json)
    {
        try { return JsonSerializer.Deserialize<string[]>((json as string) ?? "[]") ?? Array.Empty<string>(); }
        catch { return Array.Empty<string>(); }
    }
    static string Ids(IEnumerable<long> ids) => string.Join(",", ids.Select(i => i.ToString()));

    public static void Map(RouteGroupBuilder api)
    {
        // ---- Messages: one row per friend you've exchanged DMs with, newest first (unread counts come from notifications/summary) ----
        api.MapGet("messages/conversations", (HttpContext c) => WithUser(c, me =>
        {
            var latest = Db.Rows(@"SELECT d.id, d.a, d.b, d.fromId, d.text, d.createdAt, d.deletedAt, d.fileId FROM dms d
                WHERE d.id IN (SELECT MAX(id) FROM dms WHERE a=@me OR b=@me GROUP BY a, b) ORDER BY d.id DESC LIMIT 100", ("@me", me));
            var peerOf = latest.ToDictionary(r => (long)r["id"]!, r => (long)r["a"]! == me ? (long)r["b"]! : (long)r["a"]!);
            if (peerOf.Count == 0) return Results.Json(Array.Empty<object>());
            var users = Db.Rows($"SELECT * FROM users WHERE id IN ({Ids(peerOf.Values.Distinct())})").ToDictionary(r => (long)r["id"]!);
            var list = new List<object>();
            foreach (var r in latest)
            {
                var peer = peerOf[(long)r["id"]!];
                if (!users.TryGetValue(peer, out var u) || !AreFriends(me, peer) || IsBlocked(me, peer)) continue;   // DMs only exist between friends
                var text = (string)(r["text"] ?? "");
                list.Add(new
                {
                    peer = PersonObj(u, true), messageId = (long)r["id"]!, text = text.Length > 160 ? text[..160] : text,
                    fromMe = (long)r["fromId"]! == me, createdAt = (string)r["createdAt"]!, deleted = r["deletedAt"] != null, hasFile = r["fileId"] != null
                });
            }
            return Results.Json(list);
        }));

        // ---- Discover: groups that are busy right now (messages in the last 7 days + size), already filtered by age, privacy, bans and capacity ----
        api.MapGet("discover/trending", (HttpContext c) => WithUser(c, me =>
        {
            var age = Age.Of(me);
            var rows = Db.Rows(GroupSel + " WHERE " + GroupsApi.ListableSql + GroupsApi.AgeSql(age) +
                " AND g.id NOT IN (SELECT groupId FROM members WHERE userId=@me)", ("@me", me));
            var since = DateTime.UtcNow.AddDays(-7).ToString("o");
            var activity = Db.Rows("SELECT groupId, COUNT(*) n FROM messages WHERE createdAt>@s GROUP BY groupId", ("@s", since)).ToDictionary(r => (long)r["groupId"]!, r => Convert.ToInt32(r["n"]));
            var top = rows
                .Select(r => new { r, act = activity.GetValueOrDefault((long)r["id"]!), mem = Convert.ToInt32(r["memberCount"]) })
                .Where(x => { var cap = Convert.ToInt32(Db.Scalar("SELECT COALESCE(maxMembers,0) FROM grps WHERE id=@i", ("@i", x.r["id"]))); return cap == 0 || x.mem < cap; })
                .Where(x => x.act > 0 || x.mem >= 2)
                .OrderByDescending(x => x.act * 3 + x.mem).ThenByDescending(x => x.mem).Take(12)
                .Select(x => (object)new { group = GroupObj(x.r), activity = x.act }).ToList();
            return Results.Json(top);
        }));

        // ---- My games: every game on your list with your rank/role, your groups for it and the friends who play it ----
        api.MapGet("games/mine", (HttpContext c) => WithUser(c, me =>
        {
            var favs = Favorites(Db.Scalar("SELECT games FROM users WHERE id=@i", ("@i", me)));
            var ranks = new Dictionary<string, (string Rank, string Role)>(StringComparer.OrdinalIgnoreCase);
            try { foreach (var r in Db.Rows("SELECT game, rank, role FROM user_games WHERE userId=@u", ("@u", me))) ranks[(string)r["game"]!] = (r["rank"] as string ?? "", r["role"] as string ?? ""); }
            catch { /* per-game details table not created yet */ }
            var myGroups = Db.Rows(GroupSel + " WHERE g.id IN (SELECT groupId FROM members WHERE userId=@me)", ("@me", me));
            var friends = Db.Rows(@"SELECT u.* FROM friends f JOIN users u ON u.id = CASE WHEN f.a=@me THEN f.b ELSE f.a END WHERE f.a=@me OR f.b=@me", ("@me", me))
                .Where(u => !IsBlocked(me, (long)u["id"]!)).ToList();
            var friendGames = friends.ToDictionary(u => (long)u["id"]!, u => Favorites(u["games"]));
            var games = favs.Select(g =>
            {
                var pals = friends.Where(u => friendGames[(long)u["id"]!].Contains(g, StringComparer.OrdinalIgnoreCase)).ToList();
                bool PlayingNow(Dictionary<string, object?> u) => string.Equals(WebUtility.HtmlDecode(u["playing"] as string ?? ""), g, StringComparison.OrdinalIgnoreCase) && (string)u["status"]! != "offline";
                ranks.TryGetValue(g, out var rk);
                return (object)new
                {
                    name = g, rank = rk.Rank, role = rk.Role,
                    groups = myGroups.Where(r => string.Equals((string)r["game"]!, g, StringComparison.OrdinalIgnoreCase)).Select(GroupObj).ToList(),
                    friends = pals.OrderByDescending(PlayingNow).ThenBy(u => (string)u["username"]!).Take(12).Select(u => PersonObj(u, true)).ToList(),
                    friendCount = pals.Count, playingNow = pals.Count(PlayingNow)
                };
            }).ToList();
            return Results.Json(new { games });
        }));
    }
}
