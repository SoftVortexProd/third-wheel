using static Core;

/// <summary>
/// Gameplay clips on a profile. A clip is an ordinary uploaded video (see ChatApi uploads, which also converts it to WebM and can trim it);
/// "posting to a profile" just pins that file to the owner's profile. Anyone signed in who isn't blocked by/blocking the owner can watch it,
/// unless the owner switched the Clips section off in their profile layout.
/// </summary>
public static class ClipsApi
{
    public record ClipIn(long FileId, string? Title);
    const int MaxPerProfile = 12;

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS profile_clips(id INTEGER PRIMARY KEY, userId INTEGER NOT NULL, fileId INTEGER NOT NULL UNIQUE, title TEXT, createdAt TEXT);
CREATE INDEX IF NOT EXISTS ix_profile_clips_user ON profile_clips(userId, id DESC);");
    }

    /// <summary>Can this person open that file because it is a clip on someone's profile?</summary>
    public static bool PublicClip(long fileId, long viewer)
    {
        var owner = Db.Scalar("SELECT userId FROM profile_clips WHERE fileId=@f", ("@f", fileId));
        if (owner == null) return false;
        var o = Convert.ToInt64(owner);
        if (o == viewer) return true;
        return !IsBlocked(o, viewer) && !CosmeticsApi.LayoutOf(o).Hidden.Contains("clips");
    }

    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("me/clips", (HttpContext c, ClipIn b) => WithUser(c, me =>
        {
            var f = Db.Row("SELECT * FROM files WHERE id=@i AND ownerId=@u AND deletedAt IS NULL", ("@i", b.FileId), ("@u", me));
            if (f == null || (string)f["kind"]! != "video") return Err("Choose one of your uploaded videos.");
            if (f["msgId"] != null) return Err("That video was already sent in a chat.");
            if (Db.Scalar("SELECT 1 FROM profile_clips WHERE fileId=@f", ("@f", b.FileId)) != null) return Err("That clip is already on your profile.");
            if (Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM profile_clips WHERE userId=@u", ("@u", me))) >= MaxPerProfile) return Err($"A profile can show up to {MaxPerProfile} clips. Delete one first.");
            var id = Db.Insert("INSERT INTO profile_clips(userId,fileId,title,createdAt) VALUES(@u,@f,@t,@c)", ("@u", me), ("@f", b.FileId), ("@t", Clean(b.Title, 60)), ("@c", Now()));
            return Results.Json(new { id });
        }));

        api.MapDelete("me/clips/{id:long}", (HttpContext c, long id) => WithUser(c, me =>
        {
            var row = Db.Row("SELECT * FROM profile_clips WHERE id=@i AND userId=@u", ("@i", id), ("@u", me));
            if (row == null) return Err("Clip not found.", 404);
            Db.Exec("DELETE FROM profile_clips WHERE id=@i", ("@i", id));
            var f = Db.Row("SELECT path FROM files WHERE id=@i", ("@i", row["fileId"]));
            if (f != null) { try { File.Delete((string)f["path"]!); } catch { /* ignore */ } Db.Exec("UPDATE files SET deletedAt=@n WHERE id=@i", ("@n", Now()), ("@i", row["fileId"])); }
            return Results.Json(new { ok = true });
        }));

        api.MapGet("users/{id:long}/clips", (HttpContext c, long id) => WithUser(c, me =>
        {
            if (id != me && (IsBlocked(id, me) || CosmeticsApi.LayoutOf(id).Hidden.Contains("clips"))) return Results.Json(Array.Empty<object>());
            var rows = Db.Rows("SELECT p.id, p.fileId, p.title, p.createdAt, f.conv FROM profile_clips p JOIN files f ON f.id=p.fileId AND f.deletedAt IS NULL WHERE p.userId=@u ORDER BY p.id DESC LIMIT 12", ("@u", id));
            return Results.Json(rows.Select(r => new { id = (long)r["id"]!, url = $"/api/files/{(long)r["fileId"]!}", title = r["title"] as string, createdAt = (string)r["createdAt"]!, processing = (r["conv"] as string) == "pending" }));
        }));
    }
}
