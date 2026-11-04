using System.Text.Json;
using static Core;

/// <summary>
/// Group roles (owner / mod / member), moderation (kick, ban, mute), rules, privacy + join requests, and age separation for groups.
///
/// Legacy decisions (age separation): a group is a "minor" group when ageMax &lt;= 17 and an "adult" group otherwise, so old groups that
/// span 13-99 count as ADULT groups (hidden from under-18s; new under-18 joins are refused). Existing memberships and existing
/// cross-age friendships keep working; only NEW cross-age connections (friend requests, invites, joins, profile views) are blocked.
/// </summary>
public static class GroupsApi
{
    /// <summary>
    /// SQL fragment for any query on `grps g` that LISTS groups (feed, search, recommendations). Needs the @me parameter.
    /// Excludes private groups unless the viewer is a member, and groups the viewer is banned from.
    /// </summary>
    public const string ListableSql = "(COALESCE(g.privacy,'public')<>'private' OR EXISTS (SELECT 1 FROM members m2 WHERE m2.groupId=g.id AND m2.userId=@me)) " +
                                      "AND g.id NOT IN (SELECT groupId FROM group_bans WHERE userId=@me)";

    /// <summary>SQL fragment restricting `grps g` to the viewer's age side (empty when age separation is off).</summary>
    public static string AgeSql(int viewerAge) => !Age.On ? "" : Age.IsMinor(viewerAge) ? " AND g.ageMax<=17" : " AND g.ageMax>=18";

    public static string GenerateJoinCode()
    {
        const string chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        for (int attempt = 0; attempt < 25; attempt++)
        {
            var code = string.Create(6, chars, (span, src) =>
            {
                var bytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(6);
                for (int i = 0; i < 6; i++) span[i] = src[bytes[i] % src.Length];
            });
            if (Db.Scalar("SELECT 1 FROM grps WHERE joinCode=@c", ("@c", code)) == null)
                return code;
        }
        return Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    }

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS group_bans(groupId INTEGER, userId INTEGER, byId INTEGER, reason TEXT, at TEXT, PRIMARY KEY(groupId,userId));
CREATE TABLE IF NOT EXISTS group_mutes(groupId INTEGER, userId INTEGER, until TEXT, byId INTEGER, at TEXT, PRIMARY KEY(groupId,userId));
CREATE TABLE IF NOT EXISTS join_requests(id INTEGER PRIMARY KEY, groupId INTEGER, userId INTEGER, at TEXT, UNIQUE(groupId,userId));");
        var cols = Db.Rows("PRAGMA table_info(grps)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!cols.Contains("rules")) Db.Exec("ALTER TABLE grps ADD COLUMN rules TEXT DEFAULT ''");
        if (!cols.Contains("maxMembers")) Db.Exec("ALTER TABLE grps ADD COLUMN maxMembers INTEGER DEFAULT 0");
        if (!cols.Contains("slowmode")) Db.Exec("ALTER TABLE grps ADD COLUMN slowmode INTEGER DEFAULT 0");
        if (!cols.Contains("joinCode"))
        {
            Db.Exec("ALTER TABLE grps ADD COLUMN joinCode TEXT");
            Db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS ix_grp_code ON grps(joinCode)");
            var noCodes = Db.Rows("SELECT id FROM grps WHERE joinCode IS NULL OR joinCode=''");
            foreach (var r in noCodes)
            {
                Db.Exec("UPDATE grps SET joinCode=@c WHERE id=@id", ("@c", GenerateJoinCode()), ("@id", r["id"]));
            }
        }
    }

    // ---------- small helpers ----------
    static string? RoleOf(long gid, long uid) => Db.Scalar("SELECT role FROM members WHERE groupId=@g AND userId=@u", ("@g", gid), ("@u", uid)) as string;
    static bool IsBanned(long gid, long uid) => Db.Scalar("SELECT 1 FROM group_bans WHERE groupId=@g AND userId=@u", ("@g", gid), ("@u", uid)) != null;
    static bool IsInvited(long gid, long uid) => Db.Scalar("SELECT 1 FROM invites WHERE groupId=@g AND toId=@u", ("@g", gid), ("@u", uid)) != null;
    static Dictionary<string, object?>? Extra(long gid) => Db.Row("SELECT privacy, rules, ownerId, joinCode, maxMembers, slowmode FROM grps WHERE id=@g", ("@g", gid));
    static Dictionary<string, object?> ToDict(object o) =>
        JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.SerializeToElement(o).GetRawText())!;
    static string PrivacyOf(Dictionary<string, object?>? x) => x?["privacy"] as string is { Length: > 0 } p ? p : "public";

    /// <summary>Is a mute still active? Expired mutes are removed. Returns the until-value ("forever" or an ISO time), else null.</summary>
    static string? ActiveMute(long gid, long uid)
    {
        var until = Db.Scalar("SELECT until FROM group_mutes WHERE groupId=@g AND userId=@u", ("@g", gid), ("@u", uid)) as string;
        if (until == null) return null;
        if (until != "forever" && DateTime.TryParse(until, null, System.Globalization.DateTimeStyles.RoundtripKind, out var t) && t <= DateTime.UtcNow)
        {
            Db.Exec("DELETE FROM group_mutes WHERE groupId=@g AND userId=@u", ("@g", gid), ("@u", uid));
            return null;
        }
        return until;
    }

    /// <summary>
    /// Can this viewer see this group at all? Members and site admins always can; invited users can; everyone else needs a non-private group on
    /// their side of the age split and no ban.
    /// </summary>
    static bool CanSee(long gid, Dictionary<string, object?> g, Dictionary<string, object?>? x, long viewer)
    {
        if (IsAdmin(viewer) || IsMember(gid, viewer)) return true;
        if (IsBanned(gid, viewer)) return false;
        if (IsInvited(gid, viewer)) return true;
        if (PrivacyOf(x) == "private") return false;
        return Age.GroupVisible(Age.Of(viewer), Convert.ToInt32(g["ageMin"]), Convert.ToInt32(g["ageMax"]));
    }

    /// <summary>Removes a member. Hands ownership on if the owner left (oldest mod, else oldest member) and deletes the group when it empties. Returns true when the group was deleted.</summary>
    public static bool RemoveMember(long gid, long uid)
    {
        var wasOwner = RoleOf(gid, uid) == "owner";
        Db.Exec("DELETE FROM members WHERE groupId=@g AND userId=@u", ("@g", gid), ("@u", uid));
        Db.Exec("DELETE FROM group_mutes WHERE groupId=@g AND userId=@u", ("@g", gid), ("@u", uid));
        if (Convert.ToInt64(Db.Scalar("SELECT COUNT(*) FROM members WHERE groupId=@g", ("@g", gid))) == 0) { DeleteGroup(gid); return true; }
        if (wasOwner)
        {
            var next = Db.Row("SELECT userId FROM members WHERE groupId=@g ORDER BY CASE role WHEN 'mod' THEN 0 ELSE 1 END, rowid LIMIT 1", ("@g", gid));
            if (next != null)
            {
                Db.Exec("UPDATE members SET role='owner' WHERE groupId=@g AND userId=@u", ("@g", gid), ("@u", next["userId"]));
                Db.Exec("UPDATE grps SET ownerId=@u WHERE id=@g", ("@g", gid), ("@u", next["userId"]));
            }
        }
        return false;
    }

    /// <summary>Authorises `actor` to moderate `target` inside the group. Moderators can only act on plain members; owners and site admins on anyone else.</summary>
    static IResult? ModGate(long gid, long actor, long target, out string? targetRole)
    {
        targetRole = RoleOf(gid, target);
        if (targetRole == null) return Err("They are not in this group.", 404);
        if (actor == target) return Err("You can't do that to yourself.");
        if (IsAdmin(actor)) return null;
        var ar = RoleOf(gid, actor);
        if (ar == "owner") return null;
        if (ar == "mod") return targetRole == "member" ? null : Err("Moderators can't act on the owner or other moderators.", 403);
        return Err("Moderators only.", 403);
    }

    static void AuditIfAdmin(long gid, long actor, string what, long target)
    {
        var ar = RoleOf(gid, actor);
        if (ar is "owner" or "mod" || !IsAdmin(actor)) return;
        var name = Db.Scalar("SELECT name FROM grps WHERE id=@g", ("@g", gid)) as string ?? gid.ToString();
        var who = Db.Scalar("SELECT username FROM users WHERE id=@u", ("@u", target)) as string ?? target.ToString();
        Audit(actor, what, $"{who} in {name}");
    }

    // ---------- routes ----------
    public static void Map(RouteGroupBuilder api)
    {
        // Muted / banned people get a clear message when they try to post (the message handler calls this).
        GroupPostBlock = (gid, uid) =>
        {
            if (IsBanned(gid, uid)) return "You are banned from this group.";
            var until = ActiveMute(gid, uid);
            if (until != null)
            {
                return until == "forever" ? "You are muted in this group until a moderator unmutes you."
                    : $"You are muted in this group until {DateTime.Parse(until, null, System.Globalization.DateTimeStyles.RoundtripKind):yyyy-MM-dd HH:mm} UTC.";
            }
            var sm = Convert.ToInt32(Db.Scalar("SELECT slowmode FROM grps WHERE id=@g", ("@g", gid)) ?? 0);
            if (sm > 0 && !CanModerateGroup(gid, uid))
            {
                var last = Db.Scalar("SELECT createdAt FROM messages WHERE groupId=@g AND userId=@u ORDER BY id DESC LIMIT 1", ("@g", gid), ("@u", uid)) as string;
                if (!string.IsNullOrEmpty(last) && DateTime.TryParse(last, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt))
                {
                    var elapsed = (DateTime.UtcNow - dt).TotalSeconds;
                    if (elapsed < sm)
                    {
                        var wait = Math.Ceiling(sm - elapsed);
                        return $"Slowmode is active ({sm}s). Wait {wait}s before posting.";
                    }
                }
            }
            return null;
        };

        api.MapGet("groups/mine", (HttpContext c) => WithUser(c, uid =>
            Results.Json(Db.Rows(GroupSel + " WHERE g.id IN (SELECT groupId FROM members WHERE userId=@me) ORDER BY g.name COLLATE NOCASE", ("@me", uid)).Select(GroupObj))));

        // ----- create -----
        api.MapPost("groups", (HttpContext c, GroupCreateIn b) => WithUser(c, uid =>
        {
            if (Limited($"gc:{uid}", 10, TimeSpan.FromHours(1), true)) return Err("You're creating groups too fast. Try again later.", 429);
            var name = Clean(b.Name, 40);
            if (name.Length < 3) return Err("Group name must be at least 3 characters.");
            if (!NameFilter.NameAllowed(name, IsAdmin(uid))) return Err(NameFilter.NameMessage);
            if (!NameFilter.TextAllowed(b.Description) || !NameFilter.TextAllowed(b.Rules)) return Err(NameFilter.TextMessage);
            var game = GamesApi.Canonical(b.Game);   // a group is for a real game from the list, never free text
            if (game == null) return Err("Pick a real game from the list.");
            if (b.Mode is not ("casual" or "competitive")) return Err("Mode must be casual or competitive.");
            if (!Db.Regions.Contains(b.Region ?? "")) return Err("Unknown region.");
            var privacy = b.Privacy ?? "public";
            if (privacy is not ("public" or "request" or "private")) return Err("Privacy must be public, request or private.");
            // Age audience: under-18s create groups inside 13-17, adults inside 18-99 (admins can switch the separation off).
            var age = Age.Of(uid); var minor = Age.IsMinor(age);
            int aMin = !Age.On ? 13 : minor ? 13 : 18, aMax = !Age.On ? 99 : minor ? 17 : 99;
            int lo = b.AgeMin ?? aMin, hi = b.AgeMax ?? aMax;
            if (lo < aMin || hi > aMax || lo > hi) return Err($"Groups you create must be for ages {aMin}–{aMax}.");
            var color = Db.Palette[Random.Shared.Next(Db.Palette.Length)];
            int maxM = Math.Clamp(b.MaxMembers ?? 0, 0, 500);
            int sm = Math.Clamp(b.Slowmode ?? 0, 0, 300);
            var joinCode = GenerateJoinCode();
            var gid = Db.Insert("INSERT INTO grps(name,game,mode,region,ageMin,ageMax,description,color,ownerId,created,privacy,rules,joinCode,maxMembers,slowmode) VALUES(@n,@g,@m,@r,@lo,@hi,@d,@c,@o,@t,@p,@ru,@jc,@mm,@sm)",
                ("@n", Enc(name)), ("@g", game), ("@m", b.Mode), ("@r", b.Region), ("@lo", lo), ("@hi", hi), ("@d", Enc(Clean(b.Description, 300))),
                ("@c", color), ("@o", uid), ("@t", Now()), ("@p", privacy), ("@ru", Enc(Clean(b.Rules, 1000))), ("@jc", joinCode), ("@mm", maxM), ("@sm", sm));
            Db.Exec("INSERT INTO members(groupId,userId,role) VALUES(@g,@u,'owner')", ("@g", gid), ("@u", uid));
            return Results.Json(GroupObj(Db.Row(GroupSel + " WHERE g.id=@g", ("@g", gid), ("@me", uid))!));
        }));

        // ----- detail -----
        api.MapGet("groups/{id:long}", (HttpContext c, long id) => WithUser(c, uid =>
        {
            var g = Db.Row(GroupSel + " WHERE g.id=@g", ("@g", id), ("@me", uid));
            var x = Extra(id);
            if (g == null || x == null || !CanSee(id, g, x, uid)) return Err("Group not found.", 404);
            var myRole = RoleOf(id, uid);
            var isMember = myRole != null;
            var mod = CanModerateGroup(id, uid);
            var privacy = PrivacyOf(x);
            var members = new List<object>();
            if (isMember || privacy == "public" || IsAdmin(uid))
            {
                var rows = Db.Rows(@"SELECT u.*, m.role FROM members m JOIN users u ON u.id=m.userId WHERE m.groupId=@g
                    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'mod' THEN 1 ELSE 2 END, u.username COLLATE NOCASE", ("@g", id));
                foreach (var r in rows)
                {
                    var d = ToDict(PersonObj(r, AreFriends(uid, (long)r["id"]!)));
                    d["role"] = (string)r["role"]!;
                    if (mod) d["mutedUntil"] = ActiveMute(id, (long)r["id"]!);
                    members.Add(d);
                }
            }
            var o = ToDict(GroupObj(g));
            o["privacy"] = privacy; o["rules"] = x["rules"] as string ?? ""; o["myRole"] = myRole;
            o["canModerate"] = mod; o["isOwner"] = myRole == "owner" || IsAdmin(uid);
            o["joinCode"] = x["joinCode"] as string ?? "";
            o["maxMembers"] = Convert.ToInt32(x["maxMembers"] ?? 0);
            o["slowmode"] = Convert.ToInt32(x["slowmode"] ?? 0);
            o["members"] = members;
            o["invited"] = !isMember && IsInvited(id, uid);
            o["requested"] = !isMember && Db.Scalar("SELECT 1 FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", uid)) != null;
            o["pending"] = mod ? Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM join_requests WHERE groupId=@g", ("@g", id))) : 0;
            return Results.Json(o);
        }));

        // ----- join / leave -----
        api.MapPost("groups/{id:long}/join", (HttpContext c, long id) => WithUser(c, uid =>
        {
            var g = Db.Row(GroupSel + " WHERE g.id=@g", ("@g", id), ("@me", uid));
            var x = Extra(id);
            if (g == null || x == null) return Err("Group not found.", 404);
            if (IsMember(id, uid)) return Results.Json(GroupObj(g));
            if (IsBanned(id, uid)) return Err("You are banned from this group.", 403);
            var maxMem = Convert.ToInt32(x["maxMembers"] ?? 0);
            if (maxMem > 0 && Convert.ToInt32(g["memberCount"]) >= maxMem && !IsAdmin(uid))
                return Err($"This group is full (maximum {maxMem} members).", 409);
            var invited = IsInvited(id, uid);
            if (!invited && !IsAdmin(uid))
            {
                if (!CanSee(id, g, x, uid)) return Err("Group not found.", 404);
                if (PrivacyOf(x) == "request") return Results.Json(new { error = "This group needs approval. Send a request to join.", needsRequest = true }, statusCode: 409);
            }
            Db.Exec("INSERT OR IGNORE INTO members(groupId,userId,role) VALUES(@g,@u,'member')", ("@g", id), ("@u", uid));
            Db.Exec("DELETE FROM invites WHERE groupId=@g AND toId=@u", ("@g", id), ("@u", uid));
            Db.Exec("DELETE FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", uid));
            return Results.Json(GroupObj(Db.Row(GroupSel + " WHERE g.id=@g", ("@g", id), ("@me", uid))!));
        }));

        api.MapPost("groups/{id:long}/leave", (HttpContext c, long id) => WithUser(c, uid =>
        {
            if (!IsMember(id, uid)) return Err("You are not in this group.", 404);
            var deleted = RemoveMember(id, uid);   // last one out deletes the group; an owner leaving hands the group on
            return Results.Json(new { ok = true, deleted });
        }));

        // ----- join requests -----
        api.MapPost("groups/{id:long}/request", (HttpContext c, long id) => WithUser(c, uid =>
        {
            var g = Db.Row(GroupSel + " WHERE g.id=@g", ("@g", id), ("@me", uid));
            var x = Extra(id);
            if (g == null || x == null || !CanSee(id, g, x, uid)) return Err("Group not found.", 404);
            if (IsMember(id, uid)) return Err("You are already in this group.", 409);
            if (IsBanned(id, uid)) return Err("You are banned from this group.", 403);
            if (PrivacyOf(x) != "request") return Err(PrivacyOf(x) == "public" ? "This group is open: just join it." : "This group is invite-only.", 409);
            if (Limited($"jr:{uid}", 20, TimeSpan.FromHours(1), true)) return Err("Too many requests. Try again later.", 429);
            Db.Exec("INSERT OR IGNORE INTO join_requests(groupId,userId,at) VALUES(@g,@u,@t)", ("@g", id), ("@u", uid), ("@t", Now()));
            return Results.Json(new { ok = true, pending = true });
        }));

        api.MapDelete("groups/{id:long}/request", (HttpContext c, long id) => WithUser(c, uid =>
        {
            Db.Exec("DELETE FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", uid));
            return Results.Json(new { ok = true });
        }));

        api.MapGet("groups/{id:long}/requests", (HttpContext c, long id) => WithUser(c, uid =>
        {
            if (!CanModerateGroup(id, uid)) return Err("Moderators only.", 403);
            return Results.Json(Db.Rows("SELECT u.*, r.at reqAt FROM join_requests r JOIN users u ON u.id=r.userId WHERE r.groupId=@g ORDER BY r.id", ("@g", id))
                .Select(r => { var d = ToDict(PersonObj(r, AreFriends(uid, (long)r["id"]!))); d["requestedAt"] = r["reqAt"] as string; return d; }));
        }));

        api.MapPost("groups/{id:long}/requests/{target:long}/approve", (HttpContext c, long id, long target) => WithUser(c, uid =>
        {
            if (!CanModerateGroup(id, uid)) return Err("Moderators only.", 403);
            if (Db.Scalar("SELECT 1 FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", target)) == null) return Err("No such request.", 404);
            if (IsBanned(id, target)) { Db.Exec("DELETE FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", target)); return Err("That person is banned from this group.", 409); }
            Db.Exec("INSERT OR IGNORE INTO members(groupId,userId,role) VALUES(@g,@u,'member')", ("@g", id), ("@u", target));
            Db.Exec("DELETE FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", target));
            AuditIfAdmin(id, uid, "approved join request", target);
            return Results.Json(new { ok = true });
        }));

        api.MapPost("groups/{id:long}/requests/{target:long}/deny", (HttpContext c, long id, long target) => WithUser(c, uid =>
        {
            if (!CanModerateGroup(id, uid)) return Err("Moderators only.", 403);
            Db.Exec("DELETE FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", target));
            return Results.Json(new { ok = true });
        }));

        // ----- settings: name / description / privacy (owner), rules (owner + mods) -----
        api.MapPut("groups/{id:long}/settings", (HttpContext c, long id, GroupSettingsIn b) => WithUser(c, uid =>
        {
            if (Db.Scalar("SELECT 1 FROM grps WHERE id=@g", ("@g", id)) == null) return Err("Group not found.", 404);
            var owner = RoleOf(id, uid) == "owner" || IsAdmin(uid);
            if ((b.Name != null || b.Description != null || b.Privacy != null || b.MaxMembers != null || b.Slowmode != null) && !owner) return Err("Only the owner can change group settings.", 403);
            if (b.Rules != null && !CanModerateGroup(id, uid)) return Err("Only moderators can edit the rules.", 403);
            if (Limited($"gs:{uid}", 30, TimeSpan.FromMinutes(10), true)) return Err("Slow down a little.", 429);
            if (!NameFilter.TextAllowed(b.Description) || !NameFilter.TextAllowed(b.Rules)) return Err(NameFilter.TextMessage);
            if (b.Name != null)
            {
                var n = Clean(b.Name, 40);
                if (n.Length < 3) return Err("Group name must be at least 3 characters.");
                if (!NameFilter.NameAllowed(n, IsAdmin(uid))) return Err(NameFilter.NameMessage);
                Db.Exec("UPDATE grps SET name=@v WHERE id=@g", ("@v", Enc(n)), ("@g", id));
            }
            if (b.Description != null) Db.Exec("UPDATE grps SET description=@v WHERE id=@g", ("@v", Enc(Clean(b.Description, 300))), ("@g", id));
            if (b.Rules != null) Db.Exec("UPDATE grps SET rules=@v WHERE id=@g", ("@v", Enc(Clean(b.Rules, 1000))), ("@g", id));
            if (b.Privacy != null)
            {
                if (b.Privacy is not ("public" or "request" or "private")) return Err("Privacy must be public, request or private.");
                Db.Exec("UPDATE grps SET privacy=@v WHERE id=@g", ("@v", b.Privacy), ("@g", id));
            }
            if (b.MaxMembers != null) Db.Exec("UPDATE grps SET maxMembers=@v WHERE id=@g", ("@v", Math.Clamp(b.MaxMembers.Value, 0, 500)), ("@g", id));
            if (b.Slowmode != null) Db.Exec("UPDATE grps SET slowmode=@v WHERE id=@g", ("@v", Math.Clamp(b.Slowmode.Value, 0, 300)), ("@g", id));
            return Results.Json(new { ok = true });
        }));

        // ----- join codes -----
        api.MapGet("groups/by-code/{code}", (HttpContext c, string code) => WithUser(c, uid =>
        {
            var clean = (code ?? "").Trim().ToUpperInvariant();
            var g = Db.Row(GroupSel + " WHERE UPPER(g.joinCode)=@c", ("@c", clean), ("@me", uid));
            if (g == null) return Err("Group not found with that code.", 404);
            var id = (long)g["id"]!;
            var x = Extra(id);
            if (x == null || !CanSee(id, g, x, uid)) return Err("Group not accessible.", 403);
            var o = ToDict(GroupObj(g));
            o["privacy"] = PrivacyOf(x);
            o["rules"] = x["rules"] as string ?? "";
            return Results.Json(o);
        }));

        api.MapPost("groups/by-code/{code}/join", (HttpContext c, string code) => WithUser(c, uid =>
        {
            var clean = (code ?? "").Trim().ToUpperInvariant();
            var g = Db.Row(GroupSel + " WHERE UPPER(g.joinCode)=@c", ("@c", clean), ("@me", uid));
            if (g == null) return Err("Invalid group code.", 404);
            var id = (long)g["id"]!;
            var x = Extra(id);
            if (g == null || x == null) return Err("Group not found.", 404);
            if (IsMember(id, uid)) return Results.Json(GroupObj(g));
            if (IsBanned(id, uid)) return Err("You are banned from this group.", 403);
            if (!Age.GroupVisible(Age.Of(uid), Convert.ToInt32(g["ageMin"]), Convert.ToInt32(g["ageMax"])) && !IsAdmin(uid))
                return Err("You do not meet the age requirement for this group.", 403);
            var maxMem = Convert.ToInt32(x["maxMembers"] ?? 0);
            if (maxMem > 0 && Convert.ToInt32(g["memberCount"]) >= maxMem && !IsAdmin(uid))
                return Err($"This group is full (maximum {maxMem} members).", 409);
            Db.Exec("INSERT OR IGNORE INTO members(groupId,userId,role) VALUES(@g,@u,'member')", ("@g", id), ("@u", uid));
            Db.Exec("DELETE FROM invites WHERE groupId=@g AND toId=@u", ("@g", id), ("@u", uid));
            Db.Exec("DELETE FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", uid));
            return Results.Json(GroupObj(Db.Row(GroupSel + " WHERE g.id=@g", ("@g", id), ("@me", uid))!));
        }));

        // ----- roles -----
        api.MapPost("groups/{id:long}/members/{target:long}/role", (HttpContext c, long id, long target, RoleChangeIn b) => WithUser(c, uid =>
        {
            if (b.Role is not ("mod" or "member" or "owner")) return Err("Role must be mod, member or owner.");
            if (RoleOf(id, uid) != "owner" && !IsAdmin(uid)) return Err("Only the owner can change roles.", 403);
            var tr = RoleOf(id, target);
            if (tr == null) return Err("They are not in this group.", 404);
            if (target == uid && !IsAdmin(uid)) return Err("You can't change your own role.");
            if (tr == b.Role) return Results.Json(new { ok = true });
            if (b.Role == "owner")
            {
                // transfer: the current owner becomes a moderator
                Db.Exec("UPDATE members SET role='mod' WHERE groupId=@g AND role='owner'", ("@g", id));
                Db.Exec("UPDATE grps SET ownerId=@u WHERE id=@g", ("@g", id), ("@u", target));
            }
            else if (tr == "owner") return Err("Transfer ownership to someone else first.", 409);
            Db.Exec("UPDATE members SET role=@r WHERE groupId=@g AND userId=@u", ("@r", b.Role), ("@g", id), ("@u", target));
            AuditIfAdmin(id, uid, "set group role " + b.Role, target);
            return Results.Json(new { ok = true });
        }));

        // ----- kick / ban / mute -----
        api.MapPost("groups/{id:long}/members/{target:long}/kick", (HttpContext c, long id, long target) => WithUser(c, uid =>
        {
            var deny = ModGate(id, uid, target, out _); if (deny != null) return deny;
            RemoveMember(id, target);
            AuditIfAdmin(id, uid, "kicked", target);
            return Results.Json(new { ok = true });
        }));

        api.MapPost("groups/{id:long}/members/{target:long}/ban", (HttpContext c, long id, long target, GroupBanIn b) => WithUser(c, uid =>
        {
            var deny = ModGate(id, uid, target, out _); if (deny != null) return deny;
            RemoveMember(id, target);
            Db.Exec("INSERT OR REPLACE INTO group_bans(groupId,userId,byId,reason,at) VALUES(@g,@u,@b,@r,@t)", ("@g", id), ("@u", target), ("@b", uid), ("@r", Enc(Clean(b.Reason, 120))), ("@t", Now()));
            Db.Exec("DELETE FROM invites WHERE groupId=@g AND toId=@u", ("@g", id), ("@u", target));
            Db.Exec("DELETE FROM join_requests WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", target));
            AuditIfAdmin(id, uid, "banned", target);
            return Results.Json(new { ok = true });
        }));

        api.MapGet("groups/{id:long}/bans", (HttpContext c, long id) => WithUser(c, uid =>
        {
            if (!CanModerateGroup(id, uid)) return Err("Moderators only.", 403);
            return Results.Json(Db.Rows("SELECT u.*, b.reason, b.at banAt FROM group_bans b JOIN users u ON u.id=b.userId WHERE b.groupId=@g ORDER BY b.at DESC", ("@g", id))
                .Select(r => { var d = ToDict(PersonObj(r, false)); d["reason"] = r["reason"] as string; d["bannedAt"] = r["banAt"] as string; return d; }));
        }));

        api.MapDelete("groups/{id:long}/bans/{target:long}", (HttpContext c, long id, long target) => WithUser(c, uid =>
        {
            if (!CanModerateGroup(id, uid)) return Err("Moderators only.", 403);
            Db.Exec("DELETE FROM group_bans WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", target));
            AuditIfAdmin(id, uid, "unbanned", target);
            return Results.Json(new { ok = true });
        }));

        api.MapPost("groups/{id:long}/members/{target:long}/mute", (HttpContext c, long id, long target, MuteIn b) => WithUser(c, uid =>
        {
            var deny = ModGate(id, uid, target, out _); if (deny != null) return deny;
            if (b.Minutes is not (0 or 10 or 60 or 1440)) return Err("Choose 10 minutes, 1 hour, 1 day or until unmuted.");
            var until = b.Minutes == 0 ? "forever" : DateTime.UtcNow.AddMinutes(b.Minutes).ToString("o");
            Db.Exec("INSERT OR REPLACE INTO group_mutes(groupId,userId,until,byId,at) VALUES(@g,@u,@x,@b,@t)", ("@g", id), ("@u", target), ("@x", until), ("@b", uid), ("@t", Now()));
            AuditIfAdmin(id, uid, "muted", target);
            return Results.Json(new { ok = true, until });
        }));

        api.MapDelete("groups/{id:long}/members/{target:long}/mute", (HttpContext c, long id, long target) => WithUser(c, uid =>
        {
            var deny = ModGate(id, uid, target, out _); if (deny != null) return deny;
            Db.Exec("DELETE FROM group_mutes WHERE groupId=@g AND userId=@u", ("@g", id), ("@u", target));
            return Results.Json(new { ok = true });
        }));
    }
}

public record GroupCreateIn(string? Name, string? Game, string? Mode, string? Region, int? AgeMin, int? AgeMax, string? Description, string? Privacy, string? Rules, int? MaxMembers, int? Slowmode);
public record GroupSettingsIn(string? Name, string? Description, string? Rules, string? Privacy, int? MaxMembers, int? Slowmode);
public record RoleChangeIn(string? Role);
public record GroupBanIn(string? Reason);
public record MuteIn(int Minutes);
