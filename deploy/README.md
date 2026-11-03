# Hosting Third Wheel on a Windows server

1. **On your PC** build the package: `.\deploy\publish.ps1` → `dist\ThirdWheel-server.zip`
2. **Copy it to the server** (RDP: `mstsc /v:<server-ip>`, then paste the zip into the remote desktop), extract it, e.g. to `C:\tw-package`.
3. **On the server**, in an elevated PowerShell:
   ```powershell
   cd C:\tw-package
   .\install-server.ps1                       # plain HTTP on port 1732 (-Port N to change)
   .\install-server.ps1 -Domain play.example.com   # HTTPS via Caddy (recommended)
   ```
   This installs a `ThirdWheel` Windows service (auto-start, auto-restart), keeps data in `C:\ThirdWheel\data`, and opens only the needed firewall ports.
4. Open the same ports (80, or 80 + 443) in your hosting provider's firewall if it has one.
5. **Point the desktop app at it:** copy `desktop\config.example.json` to `desktop\config.json`, set `"server"`, run `.\build.ps1`. (`config.json` is git-ignored.) Or set the `TW_SERVER` environment variable.
6. **Phones:** open the server URL in the phone browser → "Add to Home Screen".

## Admin account

Run this **on the server** (elevated PowerShell). It promotes an existing account, or creates a new admin and asks for its password (typed hidden, never stored in a file or environment variable):

```powershell
$env:TW_DATA = "C:\ThirdWheel\data"
C:\ThirdWheel\app\Server.exe --create-admin YourName
```

Admins get an **Admin** shield icon in the top bar: overview and site controls (maintenance mode, closing individual pages with a message), user management (suspend, make/remove admin, delete) and group management (delete). Admins keep full access while the site is in maintenance mode.

## Automatic updates from your PC (one-time setup, then one command)

1. **On the server** (elevated PowerShell, from the extracted package): `.\enable-ssh.ps1` and open TCP 22 in your hosting firewall (ideally only for your own IP).
2. **On your PC:** copy `deploy\sync.config.example.json` to `deploy\sync.config.json` and fill in your server's address. Then run `.\deploy\sync.ps1 -SetupKey`. SSH asks for the server's Administrator password once (typed into ssh itself, never saved) and installs a key.
3. **On the server:** `.\enable-ssh.ps1 -KeyOnly` turns off password logins so only your key works.

From then on:

```powershell
.\deploy\sync.ps1           # build, upload, install and restart (data is kept)
.\deploy\sync.ps1 -Watch    # keep running and redeploy automatically whenever server code changes
.\deploy\sync.ps1 -DryRun   # build and show what would happen, without connecting
.\deploy\sync.ps1 -KlipyKey <your key>   # turn on the GIF picker (KLIPY); the key is stored on the server and later syncs keep it
```

(You can also set `$env:TW_KLIPY_KEY` on your PC instead of typing the key each time. It's never printed or saved in a file.)

```powershell
```

Without the SSH setup, update manually by repeating steps 1–3 above (data is kept).

**Use HTTPS.** Over plain HTTP, passwords and login cookies cross the internet unencrypted. HTTPS needs a domain name pointing at the server (a free DuckDNS name works).
