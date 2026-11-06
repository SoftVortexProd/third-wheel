using System.Text.Json;
using static Core;

/// <summary>Profile looks: animated avatar frames (RCKT only) and the order/visibility of the sections on your profile.</summary>
public static class CosmeticsApi
{
    public static readonly (string Id, string Name)[] Frames =
    {
        ("aurora", "Aurora"), ("ember", "Ember"), ("neon", "Neon"), ("glitch", "Glitch"), ("royal", "Royal"),
        ("frost", "Frost"), ("toxic", "Toxic"), ("void", "Void"), ("rainbow", "Rainbow"), ("pulse", "Heartbeat"),
        ("halo", "Angel Halo"), ("horns", "Demon Horns"), ("stars", "Golden Stars"),
        ("cyber", "Cyber Crosshair"), ("hearts", "Pixel Hearts"), ("sakura", "Cherry Blossoms"), ("sparks", "Electric Sparks")
    };

    public static readonly (string Id, string Name)[] Effects =
    {
        ("sakura", "Falling Sakura"), ("matrix", "Digital Rain"), ("fireflies", "Glow Fireflies"), ("scanlines", "Retro CRT"), ("flame", "Flame Aura"),
        ("snow", "Snowfall"), ("rain", "Rainstorm"), ("embers", "Rising Embers"), ("stars", "Starfield"), ("bubbles", "Bubbles"),
        ("confetti", "Confetti"), ("hearts", "Floating Hearts"), ("sparks", "Lightning"), ("aurora", "Aurora"), ("autumn", "Autumn Leaves")
    };
    /// <summary>Sections of a profile, in the default order. "reputation" is the good-teammate badge.</summary>
    public static readonly string[] Sections = { "bio", "games", "tags", "play", "when", "reputation", "clips" };

    public record FrameIn(string? Frame);
    public record EffectIn(string? Effect);
    public record LayoutIn(string[]? Order, string[]? Hidden);

    public static void Migrate()
    {
        var u = Db.Rows("PRAGMA table_info(users)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!u.Contains("frame")) Db.Exec("ALTER TABLE users ADD COLUMN frame TEXT");
        if (!u.Contains("effect")) Db.Exec("ALTER TABLE users ADD COLUMN effect TEXT");
        if (!u.Contains("layout")) Db.Exec("ALTER TABLE users ADD COLUMN layout TEXT");
        var g = Db.Rows("PRAGMA table_info(user_games)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (g.Count > 0 && !g.Contains("hours")) Db.Exec("ALTER TABLE user_games ADD COLUMN hours INTEGER");
    }

    public static bool Valid(string? frame) => !string.IsNullOrEmpty(frame) && Frames.Any(f => f.Id == frame);
    public static bool ValidEffect(string? effect) => !string.IsNullOrEmpty(effect) && Effects.Any(e => e.Id == effect);

    /// <summary>What another person's profile page should show: order + hidden sections.</summary>
    public static (string[] Order, string[] Hidden) LayoutOf(long uid)
    {
        var json = Db.Scalar("SELECT layout FROM users WHERE id=@i", ("@i", uid)) as string;
        string[] order = Sections, hidden = Array.Empty<string>();
        if (!string.IsNullOrEmpty(json))
        {
            try
            {
                var d = JsonSerializer.Deserialize<LayoutIn>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (d?.Order != null) order = d.Order.Where(Sections.Contains).Distinct().Concat(Sections).Distinct().ToArray();   // anything missing goes to the end
                if (d?.Hidden != null) hidden = d.Hidden.Where(Sections.Contains).Distinct().ToArray();
            }
            catch { /* bad data: default layout */ }
        }
        return (order, hidden);
    }

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("frames", (HttpContext c) => WithUser(c, me => Results.Json(new
        {
            frames = Frames.Select(f => new { id = f.Id, name = f.Name }).ToList(),
            mine = Db.Scalar("SELECT frame FROM users WHERE id=@i", ("@i", me)) as string,
            rckt = IsRcktUser(me)
        })));

        api.MapPut("me/frame", (HttpContext c, FrameIn b) => WithUser(c, me =>
        {
            if (string.IsNullOrEmpty(b.Frame)) { Db.Exec("UPDATE users SET frame=NULL WHERE id=@i", ("@i", me)); return Results.Json(new { frame = (string?)null }); }
            if (!Valid(b.Frame)) return Err("Unknown frame.");
            if (!IsRcktUser(me)) return Err("Avatar frames are exclusive to RCKT. Ask an admin for RCKT.", 403);
            Db.Exec("UPDATE users SET frame=@f WHERE id=@i", ("@f", b.Frame), ("@i", me));
            return Results.Json(new { frame = b.Frame });
        }));

        api.MapGet("effects", (HttpContext c) => WithUser(c, me => Results.Json(new
        {
            effects = Effects.Select(f => new { id = f.Id, name = f.Name }).ToList(),
            mine = Db.Scalar("SELECT effect FROM users WHERE id=@i", ("@i", me)) as string,
            rckt = IsRcktUser(me)
        })));

        api.MapPut("me/effect", (HttpContext c, EffectIn b) => WithUser(c, me =>
        {
            if (string.IsNullOrEmpty(b.Effect)) { Db.Exec("UPDATE users SET effect=NULL WHERE id=@i", ("@i", me)); return Results.Json(new { effect = (string?)null }); }
            if (!ValidEffect(b.Effect)) return Err("Unknown effect.");
            if (!IsRcktUser(me)) return Err("Profile effects are exclusive to RCKT. Ask an admin for RCKT.", 403);
            Db.Exec("UPDATE users SET effect=@e WHERE id=@i", ("@e", b.Effect), ("@i", me));
            return Results.Json(new { effect = b.Effect });
        }));

        api.MapGet("me/profile-layout", (HttpContext c) => WithUser(c, me => { var (o, h) = LayoutOf(me); return Results.Json(new { order = o, hidden = h, sections = Sections }); }));
        api.MapPut("me/profile-layout", (HttpContext c, LayoutIn b) => WithUser(c, me =>
        {
            var order = (b.Order ?? Array.Empty<string>()).Where(Sections.Contains).Distinct().ToArray();
            var hidden = (b.Hidden ?? Array.Empty<string>()).Where(Sections.Contains).Distinct().ToArray();
            Db.Exec("UPDATE users SET layout=@l WHERE id=@i", ("@l", JsonSerializer.Serialize(new { order, hidden })), ("@i", me));
            var (o, h) = LayoutOf(me);
            return Results.Json(new { order = o, hidden = h });
        }));
    }
}
