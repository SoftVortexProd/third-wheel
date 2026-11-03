using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using static Core;

/// <summary>Password changes for users, and admin tools to edit a user's profile/settings/password and to rename groups.</summary>
public static class AccountApi
{
    static readonly Regex Ctrl = new(@"[\p{C}\p{Zl}\p{Zp}]", RegexOptions.Compiled);
    static readonly string[] Statuses = { "online", "idle", "dnd", "offline" };

    static void SetPassword(long uid, string pw)
    {
        var salt = System.Security.Cryptography.RandomNumberGenerator.GetBytes(16);
        Db.Exec("UPDATE users SET hash=@h, salt=@s WHERE id=@i", ("@h", Convert.ToBase64String(Db.Hash(pw, salt))), ("@s", Convert.ToBase64String(salt)), ("@i", uid));
    }

    public static void Migrate() { }

    public static void Map(RouteGroupBuilder api)
    {
        // ---- a user changes their own password ----
        api.MapPost("me/password", (HttpContext c, PasswordIn b) => WithUser(c, uid =>
        {
            var key = $"pw:{uid}";
            if (Limited(key, 5, TimeSpan.FromMinutes(5), false)) return Err("Too many attempts. Wait a few minutes.", 429);
            var u = Db.Row("SELECT salt, hash FROM users WHERE id=@i", ("@i", uid))!;
            if (!Db.Verify(b.Current ?? "", Convert.FromBase64String((string)u["salt"]!), Convert.FromBase64String((string)u["hash"]!)))
            {
                Limited(key, 5, TimeSpan.FromMinutes(5), true);
                return Err("Your current password is incorrect.", 403);
            }
            var pw = b.Password ?? "";
            if (pw.Length < 8 || pw.Length > 72) return Err("New password must be 8-72 characters.");
            if (pw == b.Current) return Err("Choose a password different from your current one.");
            SetPassword(uid, pw);
            // Sign out every other device; this one stays signed in.
            var mine = c.Request.Cookies.TryGetValue("tw_session", out var tok) ? Sha(tok) : "";
            Db.Exec("DELETE FROM sessions WHERE userId=@i AND tokenHash<>@t", ("@i", uid), ("@t", mine));
            return Results.Json(new { ok = true });
        }));

        // ---- admin: look at / change another user ----
        api.MapGet("admin/users/{id:long}", (HttpContext c, long id) => WithAdmin(c, _ =>
        {
            var u = UserDto(id);
            return u == null ? Err("User not found.", 404) : Results.Json(u);
        }));

        // Partial update: only the fields present in the body are changed.
        api.MapPut("admin/users/{id:long}", (HttpContext c, long id, JsonElement b) => WithAdmin(c, me =>
        {
            var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", id));
            if (u == null) return Err("User not found.", 404);
            if (id == me) return Err("Use Settings to edit your own account.");
            if (Convert.ToInt32(u["isAdmin"]) == 1) return Err("Remove their admin role first.", 403);
            if (b.ValueKind != JsonValueKind.Object) return Err("Bad request.");
            var set = new List<string>(); var ps = new List<(string, object?)> { ("@i", id) }; var changed = new List<string>();

            if (b.TryGetProperty("username", out var un))
            {
                var name = (un.GetString() ?? "").Trim();
                if (!userRx.IsMatch(name)) return Err("Username must be 3-20 letters, numbers or underscores.");
                if (Db.Scalar("SELECT 1 FROM users WHERE username=@n COLLATE NOCASE AND id<>@i", ("@n", name), ("@i", id)) != null) return Err("That username is taken.", 409);
                set.Add("username=@un"); ps.Add(("@un", name)); changed.Add("username");
            }
            if (b.TryGetProperty("displayName", out var dn))
            {
                var disp = Ctrl.Replace(dn.GetString() ?? "", "").Trim();
                if (disp.Length > 32) return Err("Display name can be at most 32 characters.");
                set.Add("display=@dn"); ps.Add(("@dn", disp.Length == 0 ? null : Enc(disp))); changed.Add("display name");
            }
            if (b.TryGetProperty("region", out var rg))
            {
                var region = rg.GetString() ?? "";
                if (!Db.Regions.Contains(region)) return Err("Unknown region.");
                set.Add("region=@rg"); ps.Add(("@rg", region)); changed.Add("region");
            }
            if (b.TryGetProperty("age", out var ag))
            {
                if (ag.ValueKind != JsonValueKind.Number || !ag.TryGetInt32(out var age) || age is < 13 or > 99) return Err("Age must be 13-99.");
                set.Add("age=@ag"); ps.Add(("@ag", age)); changed.Add("age");
            }
            if (b.TryGetProperty("status", out var st))
            {
                var status = st.GetString() ?? "";
                if (!Statuses.Contains(status)) return Err("Bad status.");
                set.Add("status=@st"); ps.Add(("@st", status)); changed.Add("status");
            }
            if (b.TryGetProperty("playing", out var pl))
            {
                var p = (pl.GetString() ?? "").Trim();
                set.Add("playing=@pl"); ps.Add(("@pl", p.Length == 0 ? null : Enc(Clean(p, 40)))); changed.Add("playing");
            }
            if (b.TryGetProperty("favoriteGames", out var fg))
            {
                if (fg.ValueKind != JsonValueKind.Array) return Err("favoriteGames must be a list.");
                var games = fg.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => Db.Games.Contains(x)).Distinct().Take(12).ToArray();
                set.Add("games=@fg"); ps.Add(("@fg", JsonSerializer.Serialize(games))); changed.Add("favorite games");
            }
            if (set.Count == 0) return Err("Nothing to change.");
            Db.Exec("UPDATE users SET " + string.Join(", ", set) + " WHERE id=@i", ps.ToArray());
            Audit(me, "edited " + string.Join(", ", changed) + " of", (string)u["username"]!);
            return Results.Json(UserDto(id));
        }));

        // "Remove a profile": clears the picture, display name and status line (the account itself stays; use Delete to remove it).
        api.MapPost("admin/users/{id:long}/reset-profile", (HttpContext c, long id) => WithAdmin(c, me =>
        {
            var u = Db.Row("SELECT username, isAdmin FROM users WHERE id=@i", ("@i", id));
            if (u == null) return Err("User not found.", 404);
            if (id == me) return Err("Use Settings to edit your own account.");
            if (Convert.ToInt32(u["isAdmin"]) == 1) return Err("Remove their admin role first.", 403);
            Db.Exec("DELETE FROM avatars WHERE userId=@i", ("@i", id));
            Db.Exec("UPDATE users SET avatarVer=0, display=NULL, playing=NULL WHERE id=@i", ("@i", id));
            Audit(me, "reset profile of", (string)u["username"]!);
            return Results.Json(UserDto(id));
        }));

        api.MapPost("admin/users/{id:long}/password", (HttpContext c, long id, AdminPasswordIn b) => WithAdmin(c, me =>
        {
            var u = Db.Row("SELECT username, isAdmin FROM users WHERE id=@i", ("@i", id));
            if (u == null) return Err("User not found.", 404);
            if (id == me) return Err("Use Settings to change your own password.");
            if (Convert.ToInt32(u["isAdmin"]) == 1) return Err("Remove their admin role first.", 403);
            var pw = b.Password ?? "";
            if (pw.Length < 8 || pw.Length > 72) return Err("Password must be 8-72 characters.");
            SetPassword(id, pw);
            Db.Exec("DELETE FROM sessions WHERE userId=@i", ("@i", id));   // they must log in again with the new password
            Audit(me, "set a new password for", (string)u["username"]!);
            return Results.Json(new { ok = true });
        }));

        // ---- admin: rename a group ----
        api.MapPut("admin/groups/{id:long}", (HttpContext c, long id, GroupRenameIn b) => WithAdmin(c, me =>
        {
            var g = Db.Row("SELECT name FROM grps WHERE id=@i", ("@i", id));
            if (g == null) return Err("Group not found.", 404);
            var name = Ctrl.Replace(b.Name ?? "", "").Trim();
            if (name.Length < 3 || name.Length > 40) return Err("Group name must be 3-40 characters.");
            Db.Exec("UPDATE grps SET name=@n WHERE id=@i", ("@n", Enc(name)), ("@i", id));
            Audit(me, "renamed group", $"{WebUtility.HtmlDecode((string)g["name"]!)} -> {name}");
            return Results.Json(new { ok = true, name = Enc(name) });
        }));
    }
}

public record PasswordIn(string? Current, string? Password);
public record AdminPasswordIn(string? Password);
public record GroupRenameIn(string? Name);
