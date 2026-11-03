# Hosting Third Wheel on a Windows server

1. **On your PC** build the package: `.\deploy\publish.ps1` → `dist\ThirdWheel-server.zip`
2. **Copy it to the server** (RDP: `mstsc /v:<server-ip>`, then paste the zip into the remote desktop), extract it, e.g. to `C:\tw-package`.
3. **On the server**, in an elevated PowerShell:
   ```powershell
   cd C:\tw-package
   .\install-server.ps1                       # plain HTTP on port 80
   .\install-server.ps1 -Domain play.example.com   # HTTPS via Caddy (recommended)
   ```
   This installs a `ThirdWheel` Windows service (auto-start, auto-restart), keeps data in `C:\ThirdWheel\data`, and opens only the needed firewall ports.
4. Open the same ports (80, or 80 + 443) in your hosting provider's firewall if it has one.
5. **Point the desktop app at it:** copy `desktop\config.example.json` to `desktop\config.json`, set `"server"`, run `.\build.ps1`. (`config.json` is git-ignored.) Or set the `TW_SERVER` environment variable.
6. **Phones:** open the server URL in the phone browser → "Add to Home Screen".

Update later: repeat steps 1–3 (data is kept).

**Use HTTPS.** Over plain HTTP, passwords and login cookies cross the internet unencrypted. HTTPS needs a domain name pointing at the server (a free DuckDNS name works).
