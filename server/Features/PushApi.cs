using System.Net;
using System.Text.Json;
using WebPush;
using static Core;

/// <summary>
/// Web Push (notifications when the app isn't open). Needs HTTPS (a browser rule, not ours): over plain http the browser never offers push.
/// The server keeps one VAPID key pair; each device that turns notifications on registers a subscription. Only the real push services are ever contacted.
/// </summary>
public static class PushApi
{
    public record SubIn(string? Endpoint, SubKeys? Keys);
    public record SubKeys(string? P256dh, string? Auth);
    public record UnsubIn(string? Endpoint);

    static VapidDetails? vapid;
    static readonly WebPushClient client = new();

    public static void Migrate()
    {
        Db.Exec(@"CREATE TABLE IF NOT EXISTS push_keys(id INTEGER PRIMARY KEY CHECK(id=1), pub TEXT, priv TEXT);
CREATE TABLE IF NOT EXISTS push_subs(id INTEGER PRIMARY KEY, userId INTEGER, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, createdAt TEXT);
CREATE INDEX IF NOT EXISTS ix_push_user ON push_subs(userId);");
        var row = Db.Row("SELECT pub, priv FROM push_keys WHERE id=1");
        if (row == null)
        {
            var k = VapidHelper.GenerateVapidKeys();
            Db.Exec("INSERT INTO push_keys(id,pub,priv) VALUES(1,@a,@b)", ("@a", k.PublicKey), ("@b", k.PrivateKey));
            row = Db.Row("SELECT pub, priv FROM push_keys WHERE id=1");
        }
        vapid = new VapidDetails("mailto:noreply@example.com", (string)row!["pub"]!, (string)row["priv"]!);
    }

    /// <summary>Only the browsers' own push services: the endpoint comes from the client, so it must never point anywhere else (no server-side request forgery).</summary>
    static bool KnownService(string? endpoint)
    {
        if (string.IsNullOrEmpty(endpoint) || endpoint.Length > 600 || !Uri.TryCreate(endpoint, UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps) return false;
        var h = u.Host.ToLowerInvariant();
        return h == "fcm.googleapis.com" || h == "android.googleapis.com" || h == "updates.push.services.mozilla.com" || h.EndsWith(".push.services.mozilla.com")
            || h == "web.push.apple.com" || h.EndsWith(".push.apple.com") || h.EndsWith(".notify.windows.com");
    }

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("push/key", (HttpContext c) => WithUser(c, _ => Results.Json(new { key = vapid!.PublicKey })));

        api.MapPost("push/subscribe", (HttpContext c, SubIn b) => WithUser(c, me =>
        {
            if (!KnownService(b.Endpoint) || string.IsNullOrWhiteSpace(b.Keys?.P256dh) || string.IsNullOrWhiteSpace(b.Keys?.Auth) || b.Keys.P256dh.Length > 200 || b.Keys.Auth.Length > 100)
                return Err("That device can't receive notifications.");
            if (Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM push_subs WHERE userId=@u", ("@u", me))) >= 10 && Db.Scalar("SELECT 1 FROM push_subs WHERE endpoint=@e", ("@e", b.Endpoint)) == null)
                Db.Exec("DELETE FROM push_subs WHERE id=(SELECT MIN(id) FROM push_subs WHERE userId=@u)", ("@u", me));   // keep the newest 10 devices
            Db.Exec(@"INSERT INTO push_subs(userId,endpoint,p256dh,auth,createdAt) VALUES(@u,@e,@p,@a,@t)
                ON CONFLICT(endpoint) DO UPDATE SET userId=@u, p256dh=@p, auth=@a", ("@u", me), ("@e", b.Endpoint), ("@p", b.Keys!.P256dh), ("@a", b.Keys.Auth), ("@t", Now()));
            return Results.Json(new { ok = true });
        }));

        api.MapPost("push/unsubscribe", (HttpContext c, UnsubIn b) => WithUser(c, me =>
        {
            Db.Exec("DELETE FROM push_subs WHERE userId=@u AND endpoint=@e", ("@u", me), ("@e", b.Endpoint ?? ""));
            return Results.Json(new { ok = true });
        }));

        api.MapGet("push/status", (HttpContext c) => WithUser(c, me =>
            Results.Json(new { devices = Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM push_subs WHERE userId=@u", ("@u", me))) })));
    }

    /// <summary>Send a notification to every device a user has registered. Never throws and never blocks the request that caused it. `body` is plain text.</summary>
    public static void Notify(long userId, string title, string body, string url, string? tag = null)
    {
        if (vapid == null) return;
        var subs = Db.Rows("SELECT id, endpoint, p256dh, auth FROM push_subs WHERE userId=@u", ("@u", userId));
        if (subs.Count == 0) return;
        var payload = JsonSerializer.Serialize(new { title = Cut(title, 60), body = Cut(body, 140), url, tag });
        _ = Task.Run(async () =>
        {
            foreach (var s in subs)
            {
                try { await client.SendNotificationAsync(new PushSubscription((string)s["endpoint"]!, (string)s["p256dh"]!, (string)s["auth"]!), payload, vapid); }
                catch (WebPushException ex) when (ex.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound or HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized)
                { try { Db.Exec("DELETE FROM push_subs WHERE id=@i", ("@i", s["id"])); } catch { /* ignore */ } }   // the device unsubscribed
                catch { /* push services hiccup: not worth failing anything */ }
            }
        });
    }

    static string Cut(string s, int n) { s = WebUtility.HtmlDecode(s ?? ""); return s.Length <= n ? s : s[..(n - 1)] + "…"; }
}
