using System.Collections.Concurrent;
using System.Text.Json;
using static Core;

/// <summary>
/// Per-game rank/role, play style, availability ("when are they online") and recommendations (groups + people).
/// Everything here lives in side tables (user_games, profile_extras, activity) so the users table and Core.UserObj stay untouched.
/// </summary>
public static class ProfileApi
{
    // ---- fixed vocabularies (validated server-side, offered to the UI via GET gamedetails/meta) ----
    static readonly string[] Tags = { "chill", "tryhard", "mic", "no-mic", "talkative", "quiet", "beginner-friendly", "team-player" };
    static readonly string[] Languages = { "English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Polish", "Turkish", "Russian",
        "Arabic", "Hindi", "Japanese", "Korean", "Chinese", "Filipino", "Indonesian", "Swedish" };
    static readonly string[] Modes = { "casual", "competitive", "both" };
    // Day parts in the user's own local time: 0 morning 6-12, 1 afternoon 12-18, 2 evening 18-24, 3 late night 0-6.
    static readonly int[] PartStart = { 6, 12, 18, 0 };

    static readonly string[] Metal = { "Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Grandmaster", "Challenger" };
    static readonly Dictionary<string, (string[] ranks, string[] roles)> GameMeta = new()
    {
        ["Valorant"] = (new[] { "Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal", "Radiant" }, new[] { "Duelist", "Initiator", "Controller", "Sentinel", "Flex" }),
        ["League of Legends"] = (new[] { "Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master", "Grandmaster", "Challenger" }, new[] { "Top", "Jungle", "Mid", "ADC", "Support" }),
        ["Counter-Strike 2"] = (new[] { "Silver", "Gold Nova", "Master Guardian", "Legendary Eagle", "Supreme", "Global Elite" }, new[] { "Entry", "Support", "Lurker", "AWPer", "IGL", "Anchor" }),
        ["Apex Legends"] = (new[] { "Rookie", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Predator" }, new[] { "Assault", "Skirmisher", "Recon", "Support", "Controller" }),
        ["Overwatch 2"] = (new[] { "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Grandmaster", "Champion" }, new[] { "Tank", "DPS", "Support" }),
        ["Rocket League"] = (new[] { "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion", "Grand Champion", "Supersonic Legend" }, new[] { "Striker", "Midfield", "Defender" }),
        ["Fortnite"] = (new[] { "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Elite", "Champion", "Unreal" }, new[] { "Fragger", "Support", "IGL" }),
        ["Dota 2"] = (new[] { "Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal" }, new[] { "Carry", "Mid", "Offlane", "Soft Support", "Hard Support" }),
        ["Rainbow Six Siege"] = (new[] { "Copper", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Champion" }, new[] { "Entry", "Support", "Anchor", "Flex" }),
        ["Marvel Rivals"] = (new[] { "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Grandmaster", "Celestial", "Eternity" }, new[] { "Vanguard", "Duelist", "Strategist" }),
        ["Call of Duty"] = (Array.Empty<string>(), new[] { "Slayer", "Objective", "Support" }),
        ["Destiny 2"] = (Array.Empty<string>(), new[] { "Titan", "Hunter", "Warlock" }),
        ["Helldivers 2"] = (Array.Empty<string>(), new[] { "Support", "Anti-armor", "Scout" }),
        ["Minecraft"] = (Array.Empty<string>(), new[] { "Builder", "Redstone", "Explorer", "PvP" }),
    };

    static readonly ConcurrentDictionary<long, DateTime> lastPing = new();

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS user_games(userId INTEGER, game TEXT, rank TEXT, role TEXT, PRIMARY KEY(userId, game));
CREATE TABLE IF NOT EXISTS profile_extras(userId INTEGER PRIMARY KEY, bio TEXT, playMode TEXT, tags TEXT DEFAULT '[]', langs TEXT DEFAULT '[]', tz INTEGER DEFAULT 0, avail TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS activity(userId INTEGER, hour INTEGER, n INTEGER DEFAULT 0, PRIMARY KEY(userId, hour));");
    }

    // ---- loaded profile data ----
    sealed class Extras
    {
        public string Bio = "", Mode = "both"; public string[] Tags = Array.Empty<string>(), Langs = Array.Empty<string>();
        public int Tz; public bool[] Wd = new bool[4], We = new bool[4];
        public bool HasAvail => Wd.Any(x => x) || We.Any(x => x);
    }
    static string[] Arr(object? json) { try { return JsonSerializer.Deserialize<string[]>((json as string) ?? "[]") ?? Array.Empty<string>(); } catch { return Array.Empty<string>(); } }
    static Extras ReadExtras(Dictionary<string, object?>? r)
    {
        var x = new Extras();
        if (r == null) return x;
        x.Bio = (r["bio"] as string) ?? ""; x.Mode = Modes.Contains(r["playMode"] as string ?? "") ? (string)r["playMode"]! : "both";
        x.Tags = Arr(r["tags"]); x.Langs = Arr(r["langs"]); x.Tz = Convert.ToInt32(r["tz"] ?? 0);
        try
        {
            if (r["avail"] is string a && a.Length > 0)
            {
                using var d = JsonDocument.Parse(a);
                bool[] Read(string k) { var o = new bool[4]; if (d.RootElement.TryGetProperty(k, out var e)) { int i = 0; foreach (var v in e.EnumerateArray()) { if (i < 4) o[i++] = v.ValueKind == JsonValueKind.True; } } return o; }
                x.Wd = Read("wd"); x.We = Read("we");
            }
        }
        catch { /* ignore a corrupt row */ }
        return x;
    }

    /// <summary>Relative likelihood (0..1) that a user is online in each UTC hour: declared day-parts count fully, observed activity up to 0.7.</summary>
    static double[] HourWeights(Extras x, int[]? act)
    {
        var w = new double[24];
        for (int p = 0; p < 4; p++)
        {
            if (!(x.Wd[p] || x.We[p])) continue;
            for (int k = 0; k < 6; k++) { int local = (PartStart[p] + k) % 24; w[(((int)Math.Round(local - x.Tz / 60.0)) % 24 + 24) % 24] = 1.0; }
        }
        var max = act?.Max() ?? 0;
        if (act != null && max > 0) for (int h = 0; h < 24; h++) w[h] = Math.Max(w[h], 0.7 * act[h] / max);
        return w;
    }
    /// <summary>Weighted overlap of two hour-weight profiles, or -1 when either has no data.</summary>
    static double Overlap(double[] a, double[] b)
    {
        double mn = 0, mx = 0;
        for (int i = 0; i < 24; i++) { mn += Math.Min(a[i], b[i]); mx += Math.Max(a[i], b[i]); }
        return a.Sum() == 0 || b.Sum() == 0 || mx == 0 ? -1 : mn / mx;
    }

    static Dictionary<long, int[]> LoadActivity()
    {
        var map = new Dictionary<long, int[]>();
        foreach (var r in Db.Rows("SELECT userId,hour,n FROM activity"))
        {
            var id = Convert.ToInt64(r["userId"]); if (!map.TryGetValue(id, out var a)) map[id] = a = new int[24];
            var h = Convert.ToInt32(r["hour"]); if (h is >= 0 and < 24) a[h] = Convert.ToInt32(r["n"]);
        }
        return map;
    }

    /// <summary>Coarse "usually online" profile: eight 3-hour UTC blocks with a level 0-3 (never exact times). Null until there is enough data.</summary>
    static int[]? OnlineBlocks(int[]? act)
    {
        if (act == null || act.Sum() < 6) return null;
        var sums = new int[8];
        for (int h = 0; h < 24; h++) sums[h / 3] += act[h];
        var max = sums.Max();
        return sums.Select(s => max == 0 ? 0 : (int)Math.Ceiling(3.0 * s / max)).ToArray();
    }

    static object Details(long id)
    {
        var u = Db.Row("SELECT games FROM users WHERE id=@i", ("@i", id));
        var favs = Arr(u?["games"]);
        var x = ReadExtras(Db.Row("SELECT * FROM profile_extras WHERE userId=@i", ("@i", id)));
        var games = Db.Rows("SELECT game,rank,role FROM user_games WHERE userId=@i", ("@i", id))
            .Where(r => favs.Contains((string)r["game"]!))
            .Select(r => new { game = (string)r["game"]!, rank = (r["rank"] as string) ?? "", role = (r["role"] as string) ?? "" }).ToList();
        int[]? act = null; var all = Db.Rows("SELECT hour,n FROM activity WHERE userId=@i", ("@i", id));
        if (all.Count > 0) { act = new int[24]; foreach (var r in all) { var h = Convert.ToInt32(r["hour"]); if (h is >= 0 and < 24) act[h] = Convert.ToInt32(r["n"]); } }
        return new
        {
            bio = x.Bio, playMode = x.Mode, tags = x.Tags, languages = x.Langs, games,
            availability = new { tz = x.Tz, weekdays = x.Wd, weekends = x.We, set = x.HasAvail },
            online = new { blocks = OnlineBlocks(act) }
        };
    }

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("gamedetails/meta", (HttpContext c) => WithUser(c, _ => Results.Json(new
        {
            games = GameMeta.ToDictionary(k => k.Key, k => new { ranks = k.Value.ranks, roles = k.Value.roles }),
            tags = Tags, languages = Languages, modes = Modes,
            dayParts = new[] { new { key = "morning", label = "Morning", hours = "6–12" }, new { key = "afternoon", label = "Afternoon", hours = "12–18" },
                               new { key = "evening", label = "Evening", hours = "18–24" }, new { key = "night", label = "Late night", hours = "0–6" } }
        })));

        api.MapGet("me/profile-extras", (HttpContext c) => WithUser(c, uid => Results.Json(Details(uid))));

        api.MapGet("users/{id:long}/details", (HttpContext c, long id) => WithUser(c, uid =>
        {
            var u = Db.Row("SELECT age FROM users WHERE id=@i", ("@i", id));
            if (u == null) return Err("User not found.", 404);
            if (id != uid && !Age.UserVisible(Age.Of(uid), Convert.ToInt32(u["age"]))) return Err("User not found.", 404);
            return Results.Json(Details(id));
        }));

        api.MapPut("me/profile-extras", (HttpContext c, ExtrasIn b) => WithUser(c, uid =>
        {
            if (Limited($"pe:{uid}", 30, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
            var cur = ReadExtras(Db.Row("SELECT * FROM profile_extras WHERE userId=@i", ("@i", uid)));
            var bio = b.Bio == null ? cur.Bio : Enc(Clean(b.Bio, 160));
            var mode = b.PlayMode == null ? cur.Mode : b.PlayMode;
            if (!Modes.Contains(mode)) return Err("Play mode must be casual, competitive or both.");
            var tags = b.Tags == null ? cur.Tags : b.Tags.Where(t => Tags.Contains(t)).Distinct().Take(8).ToArray();
            var langs = b.Languages == null ? cur.Langs : b.Languages.Where(l => Languages.Contains(l)).Distinct().Take(6).ToArray();
            var tz = b.Tz ?? cur.Tz;
            if (tz is < -840 or > 840) return Err("Invalid time zone.");
            bool[] Fix(bool[]? v, bool[] old) => v == null ? old : Enumerable.Range(0, 4).Select(i => i < v.Length && v[i]).ToArray();
            var wd = Fix(b.Weekdays, cur.Wd); var we = Fix(b.Weekends, cur.We);
            Db.Exec("INSERT OR REPLACE INTO profile_extras(userId,bio,playMode,tags,langs,tz,avail,updated) VALUES(@u,@b,@m,@t,@l,@z,@a,@n)",
                ("@u", uid), ("@b", bio), ("@m", mode), ("@t", JsonSerializer.Serialize(tags)), ("@l", JsonSerializer.Serialize(langs)), ("@z", tz),
                ("@a", JsonSerializer.Serialize(new { wd, we })), ("@n", Now()));
            return Results.Json(Details(uid));
        }));

        api.MapPut("me/game-details", (HttpContext c, GameDetailsIn b) => WithUser(c, uid =>
        {
            if (Limited($"gd:{uid}", 30, TimeSpan.FromMinutes(1), true)) return Err("Slow down a little.", 429);
            var rows = (b.Games ?? Array.Empty<GameDetail>()).Where(g => g.Game != null && Db.Games.Contains(g.Game)).GroupBy(g => g.Game!).Select(g => g.First()).Take(40).ToList();
            Db.Exec("DELETE FROM user_games WHERE userId=@u", ("@u", uid));
            foreach (var g in rows)
            {
                var rank = Enc(Clean(g.Rank, 24)); var role = Enc(Clean(g.Role, 24));
                if (rank.Length == 0 && role.Length == 0) continue;
                Db.Exec("INSERT INTO user_games(userId,game,rank,role) VALUES(@u,@g,@r,@o)", ("@u", uid), ("@g", g.Game), ("@r", rank), ("@o", role));
            }
            return Results.Json(Details(uid));
        }));

        // The page pings while it is open and visible (about every 10 minutes). The histogram is bumped at most once per ~10 minutes per user,
        // and not at all while the user appears offline.
        api.MapPost("me/ping", (HttpContext c) => WithUser(c, uid =>
        {
            if (Limited($"png:{uid}", 20, TimeSpan.FromHours(1), true)) return Results.Json(new { ok = true, recorded = false });
            var status = Db.Scalar("SELECT status FROM users WHERE id=@i", ("@i", uid)) as string;
            var now = DateTime.UtcNow;
            if (status == "offline" || now - lastPing.GetOrAdd(uid, DateTime.MinValue) < TimeSpan.FromMinutes(9)) return Results.Json(new { ok = true, recorded = false });
            lastPing[uid] = now;
            Db.Exec("INSERT INTO activity(userId,hour,n) VALUES(@u,@h,1) ON CONFLICT(userId,hour) DO UPDATE SET n=n+1", ("@u", uid), ("@h", now.Hour));
            if (Convert.ToInt32(Db.Scalar("SELECT MAX(n) FROM activity WHERE userId=@u", ("@u", uid)) ?? 0) > 2000)
                Db.Exec("UPDATE activity SET n=n/2 WHERE userId=@u", ("@u", uid));   // keep recent habits dominant
            return Results.Json(new { ok = true, recorded = true });
        }));

        // ---------- recommendations ----------
        api.MapGet("recommend/groups", (HttpContext c) => WithUser(c, uid => Results.Json(RecommendGroups(uid))));
        api.MapGet("recommend/people", (HttpContext c) => WithUser(c, uid => Results.Json(RecommendPeople(uid))));
    }

    static object RecommendGroups(long me)
    {
        var meRow = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", me))!;
        int myAge = Convert.ToInt32(meRow["age"]); var myGames = Arr(meRow["games"]); var myRegion = (string)meRow["region"]!;
        var mine = ReadExtras(Db.Row("SELECT * FROM profile_extras WHERE userId=@i", ("@i", me)));
        var activity = LoadActivity(); var extras = new Dictionary<long, Extras>();
        foreach (var r in Db.Rows("SELECT * FROM profile_extras")) extras[Convert.ToInt64(r["userId"])] = ReadExtras(r);
        var myW = HourWeights(mine, activity.GetValueOrDefault(me));
        var friends = Db.Rows("SELECT a,b FROM friends WHERE a=@m OR b=@m", ("@m", me)).Select(r => Convert.ToInt64(r["a"]) == me ? Convert.ToInt64(r["b"]) : Convert.ToInt64(r["a"])).ToHashSet();
        var members = new Dictionary<long, List<long>>();
        foreach (var r in Db.Rows("SELECT groupId,userId FROM members")) { var g = Convert.ToInt64(r["groupId"]); if (!members.TryGetValue(g, out var l)) members[g] = l = new(); l.Add(Convert.ToInt64(r["userId"])); }

        var rows = Db.Rows(GroupSel + " WHERE COALESCE(g.privacy,'public') <> 'private' AND g.id NOT IN (SELECT groupId FROM members WHERE userId=@me)", ("@me", me));
        var scored = new List<(double score, Why why, Dictionary<string, object?> row)>();
        foreach (var r in rows)
        {
            int lo = Convert.ToInt32(r["ageMin"]), hi = Convert.ToInt32(r["ageMax"]);
            if (!Age.GroupVisible(myAge, lo, hi)) continue;
            double s = 0; var why = new Why(); var game = (string)r["game"]!;
            if (myGames.Contains(game)) { s += 50; why.Add($"Matches your game: {game}"); }
            if ((string)r["region"]! == myRegion) { s += 15; why.Add($"Same region ({myRegion})"); }
            if (myAge > 0 && myAge >= lo && myAge <= hi) { s += 10; why.Add("Fits your age"); }
            var mode = (string)r["mode"]!;
            if (mine.Mode == "both" ? true : mine.Mode == mode) { s += 8; if (mine.Mode != "both") why.Add(mode == "competitive" ? "Competitive, like you" : "Casual, like you"); }
            var ids = members.GetValueOrDefault(Convert.ToInt64(r["id"]!)) ?? new();
            int fr = ids.Count(i => friends.Contains(i));
            if (fr > 0) { s += Math.Min(40, fr * 20); why.Add(fr == 1 ? "1 of your friends is in it" : $"{fr} of your friends are in it"); }
            var ov = ids.Where(i => i != me).Take(12).Select(i => Overlap(myW, HourWeights(extras.GetValueOrDefault(i) ?? new Extras(), activity.GetValueOrDefault(i)))).Where(v => v >= 0).ToList();
            if (ov.Count > 0 && ov.Average() >= 0.3) { s += 15 * Math.Min(1, ov.Average() / 0.6); why.Add("Members are online at your times"); }
            s += Math.Min(Convert.ToInt32(r["memberCount"]), 10) * 0.5;
            if (s >= 15) scored.Add((s, why, r));
        }
        return scored.OrderByDescending(x => x.score).Take(12).Select(x => new { group = GroupObj(x.row), score = Math.Round(x.score), reasons = x.why.Top(3) }).ToList();
    }

    static object RecommendPeople(long me)
    {
        var meRow = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", me))!;
        int myAge = Convert.ToInt32(meRow["age"]); var myGames = Arr(meRow["games"]); var myRegion = (string)meRow["region"]!;
        var mine = ReadExtras(Db.Row("SELECT * FROM profile_extras WHERE userId=@i", ("@i", me)));
        var activity = LoadActivity(); var extras = new Dictionary<long, Extras>();
        foreach (var r in Db.Rows("SELECT * FROM profile_extras")) extras[Convert.ToInt64(r["userId"])] = ReadExtras(r);
        var myW = HourWeights(mine, activity.GetValueOrDefault(me));

        var adj = new Dictionary<long, HashSet<long>>();
        foreach (var r in Db.Rows("SELECT a,b FROM friends"))
        {
            long a = Convert.ToInt64(r["a"]), b = Convert.ToInt64(r["b"]);
            if (!adj.TryGetValue(a, out var sa)) adj[a] = sa = new(); sa.Add(b);
            if (!adj.TryGetValue(b, out var sb)) adj[b] = sb = new(); sb.Add(a);
        }
        var myFriends = adj.GetValueOrDefault(me) ?? new();
        var pending = Db.Rows("SELECT fromId,toId FROM frequests WHERE fromId=@m OR toId=@m", ("@m", me)).Select(r => Convert.ToInt64(r["fromId"]) == me ? Convert.ToInt64(r["toId"]) : Convert.ToInt64(r["fromId"])).ToHashSet();
        var groupsOf = new Dictionary<long, HashSet<long>>();
        foreach (var r in Db.Rows("SELECT groupId,userId FROM members")) { var u = Convert.ToInt64(r["userId"]); if (!groupsOf.TryGetValue(u, out var s)) groupsOf[u] = s = new(); s.Add(Convert.ToInt64(r["groupId"])); }
        var myGroups = groupsOf.GetValueOrDefault(me) ?? new();

        var cands = Db.Rows("SELECT * FROM users WHERE id<>@me AND onboarded=1 AND COALESCE(banned,0)=0 ORDER BY id DESC LIMIT 1500", ("@me", me));
        var scored = new List<(double score, Why why, Dictionary<string, object?> row, string[] shared)>();
        foreach (var r in cands)
        {
            var id = Convert.ToInt64(r["id"]);
            if (myFriends.Contains(id) || pending.Contains(id)) continue;
            int age = Convert.ToInt32(r["age"]);
            if (!Age.UserVisible(myAge, age)) continue;
            double s = 0; var why = new Why();
            var shared = Arr(r["games"]).Intersect(myGames).ToArray();
            if (shared.Length > 0) { s += Math.Min(60, shared.Length * 20); why.Add(shared.Length == 1 ? $"You both play {shared[0]}" : $"You both play {shared[0]} and {shared.Length - 1} more"); }
            if ((string)r["region"]! == myRegion) { s += 15; why.Add($"Same region ({myRegion})"); }
            if (myAge > 0 && age > 0) { var d = Math.Abs(age - myAge); if (d <= 3) { s += 10; why.Add("Similar age"); } else if (d <= 6) s += 5; }
            var x = extras.GetValueOrDefault(id) ?? new Extras();
            if (mine.Mode == x.Mode || mine.Mode == "both" || x.Mode == "both") { s += 6; if (mine.Mode == x.Mode && mine.Mode != "both") why.Add(mine.Mode == "competitive" ? "Both competitive" : "Both casual"); }
            var tagHits = mine.Tags.Intersect(x.Tags).ToArray();
            if (tagHits.Length > 0) { s += Math.Min(12, tagHits.Length * 4); why.Add("Both " + string.Join(" & ", tagHits.Take(2))); }
            if (mine.Langs.Intersect(x.Langs).Any()) { s += 8; why.Add("Speak " + mine.Langs.Intersect(x.Langs).First()); }
            var ov = Overlap(myW, HourWeights(x, activity.GetValueOrDefault(id)));
            if (ov >= 0.3) { s += 20 * Math.Min(1, ov / 0.6); why.Add("Online at similar times"); }
            var mutual = (adj.GetValueOrDefault(id) ?? new()).Count(f => myFriends.Contains(f));
            if (mutual > 0) { s += Math.Min(30, mutual * 15); why.Add(mutual == 1 ? "1 mutual friend" : $"{mutual} mutual friends"); }
            var common = (groupsOf.GetValueOrDefault(id) ?? new()).Count(g => myGroups.Contains(g));
            if (common > 0) { s += Math.Min(20, common * 10); why.Add(common == 1 ? "In a group with you" : $"In {common} of your groups"); }
            if (s >= 20) scored.Add((s, why, r, shared));
        }
        return scored.OrderByDescending(x => x.score).Take(10).Select(x => new { person = PersonObj(x.row, false), score = Math.Round(x.score), reasons = x.why.Top(3), sharedGames = x.shared }).ToList();
    }
}

/// <summary>Collects match reasons and keeps the most interesting ones first.</summary>
sealed class Why
{
    readonly List<(int pri, string text)> items = new();
    public void Add(string text) => items.Add((Pri(text), text));
    public IEnumerable<string> Top(int n) => items.OrderByDescending(i => i.pri).Take(n).Select(i => i.text).ToList();
    static int Pri(string t) =>
        t.StartsWith("Matches your game") || t.StartsWith("You both play") ? 100 :
        t.Contains("friends are in") || t.Contains("friend is in") ? 95 :
        t.Contains("mutual") ? 90 : t.StartsWith("In ") ? 85 :
        t.Contains("nline at") ? 80 : t.StartsWith("Both ") ? 60 : t.StartsWith("Speak") ? 55 :
        t.StartsWith("Same region") ? 50 : t.Contains("like you") ? 45 : 40;
}

public record ExtrasIn(string? Bio, string? PlayMode, string[]? Tags, string[]? Languages, int? Tz, bool[]? Weekdays, bool[]? Weekends);
public record GameDetail(string? Game, string? Rank, string? Role);
public record GameDetailsIn(GameDetail[]? Games);
