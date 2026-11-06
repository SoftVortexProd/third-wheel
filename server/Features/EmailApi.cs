using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using static Core;

/// <summary>
/// Email: a verified address on the account, and "forgot password".
/// Nothing is sent unless the server owner sets up an SMTP account (any provider: Brevo, Resend, Mailgun, Gmail app password, ...):
///   TW_SMTP_HOST, TW_SMTP_PORT (587), TW_SMTP_USER, TW_SMTP_PASS, TW_MAIL_FROM ("Third Wheel &lt;no-reply@your-domain&gt;"), TW_SMTP_SECURITY = starttls (default) | ssl | none
/// Links are one-time tokens that only their hash is stored for. Password reset only ever goes to a VERIFIED address, so nobody can take over an account by adding their own.
/// </summary>
public static class EmailApi
{
    public record ForgotIn(string? Email);
    public record ResetIn(string? Token, string? Password);
    public record EmailIn(string? Email, string? Password);
    static string Env(string n) => Environment.GetEnvironmentVariable(n) ?? "";
    public static bool Configured => Env("TW_SMTP_HOST").Length > 0 && Env("TW_MAIL_FROM").Length > 0;
    static readonly Regex EmailRx = new(@"^[^\s@<>""',;]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)+$", RegexOptions.Compiled);
    public static bool ValidEmail(string? e) => !string.IsNullOrEmpty(e) && e.Length <= 120 && EmailRx.IsMatch(e);

    public static void Migrate()
    {
        var cols = Db.Rows("PRAGMA table_info(users)").Select(r => (string)r["name"]!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!cols.Contains("email")) Db.Exec("ALTER TABLE users ADD COLUMN email TEXT");
        if (!cols.Contains("emailVerified")) Db.Exec("ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0");
        if (!cols.Contains("pendingEmail")) Db.Exec("ALTER TABLE users ADD COLUMN pendingEmail TEXT");
        Db.Exec(@"CREATE TABLE IF NOT EXISTS email_tokens(hash TEXT PRIMARY KEY, userId INTEGER NOT NULL, email TEXT, purpose TEXT NOT NULL, exp TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_email_tokens_user ON email_tokens(userId, purpose);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_verified_email ON users(lower(email)) WHERE emailVerified=1;");
        Db.Exec("DELETE FROM email_tokens WHERE exp < @n", ("@n", Now()));
    }

    // ---------- sending ----------
    public static void Send(string to, string subject, string text)
    {
        if (!Configured) return;
        _ = Task.Run(async () =>
        {
            try
            {
                var msg = new MimeMessage(); msg.From.Add(MailboxAddress.Parse(Env("TW_MAIL_FROM"))); msg.To.Add(MailboxAddress.Parse(to)); msg.Subject = subject;
                var html = "<div style=\"font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111\">" + WebUtility.HtmlEncode(text).Replace("\n", "<br>")
                    + "</div>";
                // make links clickable
                html = Regex.Replace(html, @"(https?://[^\s<]+)", "<a href=\"$1\">$1</a>");
                msg.Body = new BodyBuilder { TextBody = text, HtmlBody = html }.ToMessageBody();
                using var smtp = new SmtpClient { Timeout = 20000 };
                var port = int.TryParse(Env("TW_SMTP_PORT"), out var p) ? p : 587;
                var sec = Env("TW_SMTP_SECURITY").ToLowerInvariant() switch { "ssl" => SecureSocketOptions.SslOnConnect, "none" => SecureSocketOptions.None, _ => SecureSocketOptions.StartTls };
                await smtp.ConnectAsync(Env("TW_SMTP_HOST"), port, sec);
                if (Env("TW_SMTP_USER").Length > 0) await smtp.AuthenticateAsync(Env("TW_SMTP_USER"), Env("TW_SMTP_PASS"));
                await smtp.SendAsync(msg); await smtp.DisconnectAsync(true);
            }
            catch (Exception ex) { Console.WriteLine("email send failed: " + ex.Message); }
        });
    }

    // ---------- tokens ----------
    static string NewToken(long uid, string? email, string purpose, TimeSpan life)
    {
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        Db.Exec("DELETE FROM email_tokens WHERE userId=@u AND purpose=@p", ("@u", uid), ("@p", purpose));   // only the newest link works
        Db.Exec("INSERT INTO email_tokens(hash,userId,email,purpose,exp) VALUES(@h,@u,@e,@p,@x)", ("@h", Sha(raw)), ("@u", uid), ("@e", email), ("@p", purpose), ("@x", DateTime.UtcNow.Add(life).ToString("o")));
        return raw;
    }
    static Dictionary<string, object?>? Find(string? raw, string purpose)
    {
        if (string.IsNullOrEmpty(raw) || raw.Length > 100) return null;
        var row = Db.Row("SELECT * FROM email_tokens WHERE hash=@h AND purpose=@p", ("@h", Sha(raw)), ("@p", purpose));
        return row != null && string.CompareOrdinal((string)row["exp"]!, Now()) > 0 ? row : null;
    }

    static string Origin(HttpContext c)
    {
        var ip = c.Connection.RemoteIpAddress;
        if (ip != null && IPAddress.IsLoopback(ip))
        {
            var host = c.Request.Headers["X-Forwarded-Host"].ToString().Split(',')[0].Trim(); var proto = c.Request.Headers["X-Forwarded-Proto"].ToString().Split(',')[0].Trim();
            if (host.Length > 0 && Regex.IsMatch(host, @"^[A-Za-z0-9.\-]+(:\d{1,5})?$")) return $"{(proto == "http" ? "http" : "https")}://{host}";
        }
        return $"{c.Request.Scheme}://{c.Request.Host}";
    }

    /// <summary>Is this address usable for a new account / change? (null = fine, otherwise the message)</summary>
    public static string? Refuse(string email, long? exceptUser = null)
    {
        if (!ValidEmail(email)) return "Enter a valid email address.";
        if (Db.Scalar("SELECT 1 FROM users WHERE lower(email)=lower(@e) AND banned=1", ("@e", email)) != null) return "That email can't be used.";
        if (Db.Scalar("SELECT 1 FROM users WHERE lower(email)=lower(@e) AND emailVerified=1 AND id<>@u", ("@e", email), ("@u", exceptUser ?? 0)) != null) return "That email is already used by another account.";
        return null;
    }

    /// <summary>Send the "confirm your email" message for a new or changed address.</summary>
    public static void SendVerification(HttpContext c, long uid, string email)
    {
        var tok = NewToken(uid, email, "verify", TimeSpan.FromHours(48));
        var name = Who(uid);
        Send(email, "Confirm your email for Third Wheel", $"Hi {name},\n\nPlease confirm this email address for your Third Wheel account:\n\n{Origin(c)}/verify-email?t={tok}\n\nThe link works for 48 hours. If you didn't create a Third Wheel account, you can ignore this message.");
    }

    /// <summary>A provider (Google / Discord) already confirmed this address: mark it verified without an email, unless somebody else owns it.</summary>
    public static void AdoptVerified(long uid, string email)
    {
        if (!ValidEmail(email)) return;
        if (Db.Scalar("SELECT 1 FROM users WHERE lower(email)=lower(@e) AND emailVerified=1 AND id<>@u", ("@e", email), ("@u", uid)) != null) return;
        if (Db.Scalar("SELECT 1 FROM users WHERE lower(email)=lower(@e) AND banned=1 AND id<>@u", ("@e", email), ("@u", uid)) != null) return;
        var cur = Db.Row("SELECT email, emailVerified FROM users WHERE id=@i", ("@i", uid));
        if (cur != null && Convert.ToInt32(cur["emailVerified"]) == 1) return;   // keep the one they already confirmed
        Db.Exec("UPDATE users SET email=@e, emailVerified=1, pendingEmail=NULL WHERE id=@i", ("@e", email), ("@i", uid));
    }

    static IResult Page(string title, string msg, bool ok)
    {
        var t = WebUtility.HtmlEncode(title); var m = WebUtility.HtmlEncode(msg);
        return Results.Content($"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{t}</title><style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fafafa;font:16px system-ui,sans-serif}}.c{{max-width:420px;margin:24px;padding:28px;border:1px solid #26262c;border-radius:16px;background:#111114;text-align:center}}h1{{font-size:22px;margin:0 0 10px}}p{{color:#a3a3ad;line-height:1.5}}a{{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:10px;background:#4f5ee6;color:#fff;text-decoration:none;font-weight:600}}</style></head><body><div class=\"c\"><h1>{(ok ? "✓ " : "")}{t}</h1><p>{m}</p><a href=\"/\">Open Third Wheel</a></div></body></html>", "text/html; charset=utf-8");
    }

    public static void Map(WebApplication app, RouteGroupBuilder api)
    {
        // the link in the confirmation email
        app.MapGet("/verify-email", (HttpContext c, string? t) =>
        {
            if (Limited("ve:" + ClientIp(c), 60, TimeSpan.FromMinutes(10), true)) return Page("Too many tries", "Please wait a few minutes.", false);
            var row = Find(t, "verify");
            if (row == null) return Page("Link expired", "That confirmation link is no longer valid. Sign in and ask for a new one in Settings.", false);
            var uid = (long)row["userId"]!; var email = (string)row["email"]!;
            if (Db.Scalar("SELECT 1 FROM users WHERE lower(email)=lower(@e) AND emailVerified=1 AND id<>@u", ("@e", email), ("@u", uid)) != null) return Page("Already used", "That email address is already confirmed on another account.", false);
            Db.Exec("UPDATE users SET email=@e, emailVerified=1, pendingEmail=NULL WHERE id=@i", ("@e", email), ("@i", uid));
            Db.Exec("DELETE FROM email_tokens WHERE userId=@u AND purpose='verify'", ("@u", uid));
            return Page("Email confirmed", "Thanks! Your email address is confirmed. You can close this tab.", true);
        });

        api.MapGet("me/email", (HttpContext c) => WithUser(c, me =>
        {
            var u = Db.Row("SELECT email, emailVerified, pendingEmail, COALESCE(oauthOnly,0) oauthOnly FROM users WHERE id=@i", ("@i", me))!;
            return Results.Json(new { email = u["email"] as string, verified = Convert.ToInt32(u["emailVerified"]) == 1, pending = u["pendingEmail"] as string, canSend = Configured, oauthOnly = Convert.ToInt32(u["oauthOnly"]) == 1 });
        }));

        api.MapPost("me/email/resend", (HttpContext c) => WithUser(c, me =>
        {
            if (!Configured) return Err("Email isn't set up on this server.", 501);
            if (Limited($"mr:{me}", 3, TimeSpan.FromHours(1), true)) return Err("You've asked a few times already. Try again in an hour.", 429);
            var u = Db.Row("SELECT email, emailVerified, pendingEmail FROM users WHERE id=@i", ("@i", me))!;
            var target = (u["pendingEmail"] as string) ?? (Convert.ToInt32(u["emailVerified"]) == 1 ? null : u["email"] as string);
            if (string.IsNullOrEmpty(target)) return Err("There's nothing to confirm.", 409);
            SendVerification(c, me, target);
            return Results.Json(new { ok = true });
        }));

        // add or change the address (the new one only becomes the account's email once its link is clicked)
        api.MapPut("me/email", (HttpContext c, EmailIn b) => WithUser(c, me =>
        {
            if (!Configured) return Err("Email isn't set up on this server.", 501);
            if (Limited($"mc:{me}", 5, TimeSpan.FromHours(1), true)) return Err("Too many changes. Try again later.", 429);
            var u = Db.Row("SELECT * FROM users WHERE id=@i", ("@i", me))!;
            if (Convert.ToInt32(u["oauthOnly"] ?? 0) == 0 && !Db.Verify(b.Password ?? "", Convert.FromBase64String((string)u["salt"]!), Convert.FromBase64String((string)u["hash"]!))) return Err("Wrong password.", 401);
            var email = (b.Email ?? "").Trim();
            var why = Refuse(email, me); if (why != null) return Err(why);
            if (Convert.ToInt32(u["emailVerified"]) == 0 && string.IsNullOrEmpty(u["email"] as string)) Db.Exec("UPDATE users SET email=@e, emailVerified=0, pendingEmail=NULL WHERE id=@i", ("@e", email), ("@i", me));
            else if (!string.Equals(u["email"] as string, email, StringComparison.OrdinalIgnoreCase)) Db.Exec("UPDATE users SET pendingEmail=@e WHERE id=@i", ("@e", email), ("@i", me));
            SendVerification(c, me, email);
            return Results.Json(new { ok = true });
        }));

        // ---- forgot password ----
        api.MapPost("auth/forgot", (HttpContext c, ForgotIn b) =>
        {
            if (!Configured) return Err("Password reset by email isn't set up on this server. Ask an admin to reset it for you.", 501);
            var ip = ClientIp(c);
            if (Limited("fg:" + ip, 8, TimeSpan.FromHours(1), true)) return Err("Too many requests. Try again later.", 429);
            var email = (b.Email ?? "").Trim();
            if (!ValidEmail(email)) return Err("Enter the email address on your account.");
            if (!Limited("fge:" + email.ToLowerInvariant(), 3, TimeSpan.FromHours(1), true))
            {
                var u = Db.Row("SELECT id, banned FROM users WHERE lower(email)=lower(@e) AND emailVerified=1", ("@e", email));
                if (u != null && Convert.ToInt32(u["banned"]) == 0)
                {
                    var uid = (long)u["id"]!; var tok = NewToken(uid, null, "reset", TimeSpan.FromHours(1));
                    Send(email, "Reset your Third Wheel password", $"Hi {Who(uid)},\n\nSomeone (hopefully you) asked to reset the password for your Third Wheel account. Open this link to choose a new one:\n\n{Origin(c)}/#/reset/{tok}\n\nThe link works for 1 hour. If this wasn't you, ignore this message; your password stays as it is.");
                }
            }
            return Results.Json(new { ok = true });   // same answer whether or not the address exists
        });

        api.MapPost("auth/reset", (HttpContext c, ResetIn b) =>
        {
            if (Limited("rs:" + ClientIp(c), 20, TimeSpan.FromHours(1), true)) return Err("Too many attempts. Try again later.", 429);
            var pw = b.Password ?? "";
            if (pw.Length < 8 || pw.Length > 72) return Err("Password must be 8-72 characters.");
            var row = Find(b.Token, "reset");
            if (row == null) return Err("That reset link has expired. Ask for a new one.", 410);
            var uid = (long)row["userId"]!;
            var salt = RandomNumberGenerator.GetBytes(16);
            Db.Exec("UPDATE users SET hash=@h, salt=@s, oauthOnly=0 WHERE id=@i", ("@h", Convert.ToBase64String(Db.Hash(pw, salt))), ("@s", Convert.ToBase64String(salt)), ("@i", uid));
            Db.Exec("DELETE FROM sessions WHERE userId=@u", ("@u", uid));            // signed out everywhere
            Db.Exec("DELETE FROM email_tokens WHERE userId=@u AND purpose='reset'", ("@u", uid));
            return Results.Json(new { ok = true });
        });
    }
}
