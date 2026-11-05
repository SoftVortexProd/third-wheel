using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using static Core;

/// <summary>
/// Live connection (WebSocket at /ws). The server tells connected clients "something changed" the moment it happens, and the client then fetches the new data
/// through the normal API (so every permission check stays where it was). If the socket is down the app falls back to polling. The same socket carries
/// voice-chat signalling (see Voice below).
/// </summary>
public static class Realtime
{
    sealed class Conn
    {
        public required WebSocket Ws; public required long Uid; public readonly SemaphoreSlim Gate = new(1, 1); public Guid Id = Guid.NewGuid();
        public int Budget = 60; public DateTime BudgetAt = DateTime.UtcNow;   // inbound messages per 10 s
    }
    static readonly ConcurrentDictionary<long, ConcurrentDictionary<Guid, Conn>> Users = new();
    const int MaxPerUser = 8;

    public static bool IsOnline(long uid) => Users.TryGetValue(uid, out var d) && !d.IsEmpty;
    public static int Connections => Users.Values.Sum(d => d.Count);

    // ---------------- sending ----------------
    static async Task SendAsync(Conn c, string json)
    {
        if (c.Ws.State != WebSocketState.Open) return;
        var bytes = Encoding.UTF8.GetBytes(json);
        await c.Gate.WaitAsync();
        try { await c.Ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None); }
        catch { /* the receive loop notices a dead socket */ }
        finally { c.Gate.Release(); }
    }
    public static void ToUser(long uid, object payload)
    {
        if (!Users.TryGetValue(uid, out var d) || d.IsEmpty) return;
        var json = JsonSerializer.Serialize(payload);
        foreach (var c in d.Values) _ = SendAsync(c, json);
    }
    public static void ToUsers(IEnumerable<long> uids, object payload) { var json = JsonSerializer.Serialize(payload); foreach (var u in uids.Distinct()) SendRaw(u, json); }
    static void SendRaw(long uid, string json) { if (Users.TryGetValue(uid, out var d)) foreach (var c in d.Values) _ = SendAsync(c, json); }
    public static void Broadcast(object payload) { var json = JsonSerializer.Serialize(payload); foreach (var u in Users.Keys) SendRaw(u, json); }
    static List<long> Members(long gid) => Db.Rows("SELECT userId FROM members WHERE groupId=@g", ("@g", gid)).Select(r => (long)r["userId"]!).ToList();

    // ---------------- events the rest of the server raises ----------------
    /// <summary>A chat changed (new/edited/deleted/reacted/pinned message, typing, read receipt). `id` is the group id, or for a DM the OTHER person's id as seen by `me`.</summary>
    public static void Chat(string kind, long id, long me)
    {
        if (kind == "g") ToUsers(Members(id), new { t = "chat", k = "g", id });
        else { ToUser(id, new { t = "chat", k = "d", id = me }); ToUser(me, new { t = "chat", k = "d", id }); }
    }
    /// <summary>Unread counters / mentions changed for these people.</summary>
    public static void Notify(params long[] uids) => ToUsers(uids, new { t = "notify" });
    /// <summary>Friends, requests, invites, group membership or someone's status changed.</summary>
    public static void Social(params long[] uids) => ToUsers(uids, new { t = "social" });
    public static void FriendsOf(long uid)
    {
        var ids = Db.Rows("SELECT CASE WHEN a=@u THEN b ELSE a END f FROM friends WHERE a=@u OR b=@u", ("@u", uid)).Select(r => (long)r["f"]!).ToList(); ids.Add(uid);
        Social(ids.ToArray());
    }
    public static void Lfg() => Broadcast(new { t = "lfg" });

    // ---------------- the socket ----------------
    public static void Map(WebApplication app)
    {
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(25) });
        VideoConvert.Changed += fileId =>
        {
            var f = Db.Row("SELECT convKind, convKey FROM files WHERE id=@i", ("@i", fileId));
            if (f == null) return;
            var table = (string)f["convKind"]! == "g" ? "messages" : "dms";
            Db.Exec($"UPDATE {table} SET updatedAt=@n WHERE fileId=@i", ("@n", Now()), ("@i", fileId));   // so the next sync includes the finished video
            if ((string)f["convKind"]! == "g" && long.TryParse((string)f["convKey"]!, out var gid)) Chat("g", gid, 0);
            else { var p = ((string)f["convKey"]!).Split(':'); if (p.Length == 2 && long.TryParse(p[0], out var a) && long.TryParse(p[1], out var b)) { ToUser(a, new { t = "chat", k = "d", id = b }); ToUser(b, new { t = "chat", k = "d", id = a }); } }
        };

        app.Map("/ws", async (HttpContext ctx) =>
        {
            if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
            // Cross-site WebSocket hijacking: the browser always sends Origin, and it has to be this very site.
            var origin = ctx.Request.Headers.Origin.ToString();
            if (origin.Length > 0)
            {
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var ou) || !string.Equals(ou.Authority, ctx.Request.Host.Value, StringComparison.OrdinalIgnoreCase)) { ctx.Response.StatusCode = 403; return; }
            }
            var uid = CurrentUser(ctx);
            if (uid == null) { ctx.Response.StatusCode = 401; return; }
            using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
            var conn = new Conn { Ws = ws, Uid = uid.Value };
            var mine = Users.GetOrAdd(conn.Uid, _ => new());
            if (mine.Count >= MaxPerUser) { var oldest = mine.Values.First(); try { await oldest.Ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, "too many tabs", CancellationToken.None); } catch { } mine.TryRemove(oldest.Id, out _); }
            mine[conn.Id] = conn;
            if (mine.Count == 1)
            {
                Db.Exec("UPDATE users SET status='online' WHERE id=@i AND status='offline'", ("@i", conn.Uid));
                FriendsOf(conn.Uid);
            }
            try
            {
                await SendAsync(conn, JsonSerializer.Serialize(new { t = "hello" }));
                var buf = new byte[16 * 1024];
                while (ws.State == WebSocketState.Open)
                {
                    var sb = new StringBuilder(); WebSocketReceiveResult r;
                    do
                    {
                        r = await ws.ReceiveAsync(buf, CancellationToken.None);
                        if (r.MessageType == WebSocketMessageType.Close) break;
                        sb.Append(Encoding.UTF8.GetString(buf, 0, r.Count));
                        if (sb.Length > 64 * 1024) { await ws.CloseAsync(WebSocketCloseStatus.MessageTooBig, "too big", CancellationToken.None); return; }
                    } while (!r.EndOfMessage);
                    if (r.MessageType == WebSocketMessageType.Close) break;
                    if (DateTime.UtcNow - conn.BudgetAt > TimeSpan.FromSeconds(10)) { conn.Budget = 60; conn.BudgetAt = DateTime.UtcNow; }
                    if (--conn.Budget < 0) continue;   // flooding: drop
                    try { Handle(conn, sb.ToString()); } catch { /* a malformed message never kills the socket */ }
                }
            }
            catch { /* connection dropped */ }
            finally
            {
                mine.TryRemove(conn.Id, out _);
                if (mine.IsEmpty)
                {
                    Users.TryRemove(conn.Uid, out _);
                    Db.Exec("UPDATE users SET status='offline', playing=NULL WHERE id=@i AND status<>'offline'", ("@i", conn.Uid));
                    FriendsOf(conn.Uid);
                }
                Voice.Dropped(conn.Uid, conn.Id);
                try { if (ws.State is WebSocketState.Open or WebSocketState.CloseReceived) await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); } catch { }
            }
        });
    }

    static void Handle(Conn c, string text)
    {
        using var doc = JsonDocument.Parse(text);
        var root = doc.RootElement;
        var t = root.TryGetProperty("t", out var tp) ? tp.GetString() ?? "" : "";
        if (t == "ping") { _ = SendAsync(c, "{\"t\":\"pong\"}"); return; }
        if (t.StartsWith("vc.", StringComparison.Ordinal)) Voice.Handle(c.Uid, c.Id, t, root, (uid, json) => SendRaw(uid, json), (id, json) => { if (Users.TryGetValue(c.Uid, out var d) && d.TryGetValue(id, out var cc)) _ = SendAsync(cc, json); });
    }
}

/// <summary>
/// Group voice chat (WebRTC mesh, up to 6 people per group). The server only introduces people and relays their connection setup messages; the audio goes
/// directly between them. A room belongs to a group: only members who aren't banned or muted-from-the-group can join.
/// </summary>
public static class Voice
{
    public const int MaxPeople = 6;
    sealed record Peer(long Uid, Guid Conn, DateTime Since);
    sealed class Room { public readonly List<Peer> Peers = new(); public DateTime? SessionStart; public readonly HashSet<long> Everyone = new(); }
    static readonly ConcurrentDictionary<long, Room> Rooms = new();   // group id -> room
    static readonly object Gate = new();

    /// <summary>Who is in a group's room right now (user ids).</summary>
    public static List<long> Present(long gid) { lock (Gate) return Rooms.TryGetValue(gid, out var r) ? r.Peers.Select(p => p.Uid).Distinct().ToList() : new(); }
    public static Dictionary<long, List<long>> All() { lock (Gate) return Rooms.Where(kv => kv.Value.Peers.Count > 0).ToDictionary(kv => kv.Key, kv => kv.Value.Peers.Select(p => p.Uid).Distinct().ToList()); }

    static void Update(long gid) => Realtime.ToUsers(Db.Rows("SELECT userId FROM members WHERE groupId=@g", ("@g", gid)).Select(r => (long)r["userId"]!), new { t = "vc.update", gid, who = Present(gid) });

    public static void Handle(long uid, Guid conn, string t, JsonElement m, Action<long, string> toUser, Action<Guid, string> toConn)
    {
        long gid = m.TryGetProperty("gid", out var g) && g.TryGetInt64(out var gv) ? gv : 0;
        if (t == "vc.join")
        {
            if (gid <= 0 || !IsMember(gid, uid)) { toConn(conn, J(new { t = "vc.error", gid, error = "Join the group to use its voice chat." })); return; }
            var blocked = Core.GroupPostBlock(gid, uid);   // banned / muted people don't get to talk either
            if (blocked != null) { toConn(conn, J(new { t = "vc.error", gid, error = blocked })); return; }
            if (Limit($"vcj:{uid}", 30)) { toConn(conn, J(new { t = "vc.error", gid, error = "Slow down a little." })); return; }
            List<long> others;
            lock (Gate)
            {
                // one voice room per person: leave any other one first
                foreach (var (og, rm) in Rooms) if (og != gid && rm.Peers.Any(p => p.Uid == uid)) LeaveLocked(og, uid, null);
                var room = Rooms.GetOrAdd(gid, _ => new Room());
                if (room.Peers.Any(p => p.Uid == uid)) room.Peers.RemoveAll(p => p.Uid == uid);   // rejoining from another tab/device replaces the old one
                if (room.Peers.Count >= MaxPeople) { toConn(conn, J(new { t = "vc.error", gid, error = $"This voice chat is full ({MaxPeople} people)." })); return; }
                others = room.Peers.Select(p => p.Uid).ToList();
                room.Peers.Add(new Peer(uid, conn, DateTime.UtcNow));
                room.Everyone.Add(uid);
                if (room.Peers.Count >= 2 && room.SessionStart == null) room.SessionStart = DateTime.UtcNow;
            }
            // the newcomer gets the list and calls everybody; the others wait for those calls
            toConn(conn, J(new { t = "vc.joined", gid, peers = others.Select(o => new { uid = o, name = Who(o) }).ToList(), max = MaxPeople }));
            foreach (var o in others) toUser(o, J(new { t = "vc.peer", gid, uid, name = Who(uid) }));
            Update(gid);
        }
        else if (t == "vc.leave") { lock (Gate) LeaveLocked(gid, uid, conn); Update(gid); }
        else if (t == "vc.signal")
        {
            long to = m.TryGetProperty("to", out var tv) && tv.TryGetInt64(out var tl) ? tl : 0;
            if (to <= 0 || !m.TryGetProperty("data", out var data) || data.GetRawText().Length > 20000) return;
            lock (Gate) { if (!Rooms.TryGetValue(gid, out var room) || !room.Peers.Any(p => p.Uid == uid) || !room.Peers.Any(p => p.Uid == to)) return; }   // only between people in the same room
            toUser(to, J(new { t = "vc.signal", gid, from = uid, data }));
        }
        else if (t == "vc.state")   // mute / speaking flags: shown next to names
        {
            var muted = m.TryGetProperty("muted", out var mu) && mu.ValueKind == JsonValueKind.True;
            List<long> peers; lock (Gate) { if (!Rooms.TryGetValue(gid, out var room) || !room.Peers.Any(p => p.Uid == uid)) return; peers = room.Peers.Select(p => p.Uid).Where(x => x != uid).ToList(); }
            foreach (var p in peers) toUser(p, J(new { t = "vc.state", gid, uid, muted }));
        }
    }

    public static void MapApi(RouteGroupBuilder api)
    {
        // STUN is free and public. For people behind strict networks a TURN relay is needed (TW_TURN_URL / TW_TURN_USER / TW_TURN_PASS on the server).
        api.MapGet("voice/ice", (HttpContext c) => Core.WithUser(c, _ =>
        {
            var servers = new List<object> { new { urls = new[] { "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302" } } };
            var turn = Environment.GetEnvironmentVariable("TW_TURN_URL"); var user = Environment.GetEnvironmentVariable("TW_TURN_USER"); var pass = Environment.GetEnvironmentVariable("TW_TURN_PASS");
            if (!string.IsNullOrWhiteSpace(turn) && !string.IsNullOrWhiteSpace(user) && !string.IsNullOrWhiteSpace(pass))
                servers.Add(new { urls = turn.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries), username = user, credential = pass });
            return Results.Json(new { iceServers = servers, max = MaxPeople });
        }));

        // who is in a group's voice chat right now (for the "Voice" button and the member list)
        api.MapGet("groups/{id:long}/voice", (HttpContext c, long id) => Core.WithUser(c, me =>
        {
            if (!IsMember(id, me)) return Core.Err("Join the group to see its voice chat.", 403);
            var ids = Present(id); if (ids.Count == 0) return Results.Json(new { max = MaxPeople, people = Array.Empty<object>() });
            var people = Db.Rows($"SELECT * FROM users WHERE id IN ({string.Join(",", ids)})").Select(u => (object)Core.PersonObj(u, Core.AreFriends(me, (long)u["id"]!))).ToList();
            return Results.Json(new { max = MaxPeople, people });
        }));
    }

    /// <summary>A socket closed: if that was the connection holding the person's seat, free the seat.</summary>
    public static void Dropped(long uid, Guid conn)
    {
        var rooms = new List<long>();
        lock (Gate) foreach (var (gid, room) in Rooms) if (room.Peers.Any(p => p.Uid == uid && p.Conn == conn)) { LeaveLocked(gid, uid, conn); rooms.Add(gid); }
        foreach (var g in rooms) Update(g);
    }

    static void LeaveLocked(long gid, long uid, Guid? conn)
    {
        if (!Rooms.TryGetValue(gid, out var room)) return;
        if (room.Peers.RemoveAll(p => p.Uid == uid && (conn == null || p.Conn == conn)) == 0) return;
        foreach (var o in room.Peers) Realtime.ToUser(o.Uid, new { t = "vc.left", gid, uid });
        if (room.Peers.Count < 2 && room.SessionStart != null)
        {
            var start = room.SessionStart.Value; var who = room.Everyone.ToList(); room.SessionStart = null;
            if (room.Peers.Count == 0) { room.Everyone.Clear(); Rooms.TryRemove(gid, out _); } else { room.Everyone.Clear(); foreach (var p in room.Peers) room.Everyone.Add(p.Uid); }
            if (DateTime.UtcNow - start >= TimeSpan.FromMinutes(2) && who.Count >= 2) _ = Task.Run(() => SessionsApi.Record("voice", gid, start, DateTime.UtcNow, who));   // history
        }
        else if (room.Peers.Count == 0) Rooms.TryRemove(gid, out _);
    }

    static string J(object o) => JsonSerializer.Serialize(o);
    static bool Limit(string key, int perMinute) => Core.Limited(key, perMinute, TimeSpan.FromMinutes(1), true);
    static string Who(long uid) => Core.Who(uid);
}
