# Run ON the Windows server, in an elevated PowerShell, from the extracted package folder.
#   .\install-server.ps1                      -> plain HTTP on port 1732 (no encryption!)  [-Port N to change]
#   .\install-server.ps1 -Domain play.example.com  -> server listens on localhost, Caddy provides HTTPS
#       No domain? Use your IP with sslip.io, e.g. for 5.83.140.216:  -Domain 5-83-140-216.sslip.io  (it resolves to that IP, and Caddy gets a real certificate for it).
#       Add -KeepPlainPort to ALSO keep the old http://IP:<Port> address working (old app versions, and a fallback while you check that HTTPS works).
#   Add -KlipyKey <key> once to enable the GIF picker (stored as a service setting; later updates keep it). -TenorKey is the old name and still works.
#   Add -DiscordClientId <id> -DiscordSecret <secret> once to enable "Verify Discord" (create an app at discord.com/developers, add the redirect https://YOUR-ADDRESS/api/verify/discord/callback).
param([string]$Domain = "", [switch]$KeepPlainPort, [int]$Port = 1732, [string]$KlipyKey = "", [string]$TenorKey = "", [string]$DiscordClientId = "", [string]$DiscordSecret = "")
$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "app"
if (-not (Test-Path (Join-Path $src "Server.exe"))) { throw "app\Server.exe not found. Run this from the extracted package folder." }
$root = "C:\ThirdWheel"; $app = "$root\app"; $data = "$root\data"
New-Item -ItemType Directory -Force $app, $data | Out-Null

$svc = Get-Service ThirdWheel -ErrorAction SilentlyContinue
if ($svc) { Stop-Service ThirdWheel -Force; Start-Sleep 2 }
Get-Process -Name Server -ErrorAction SilentlyContinue | Stop-Process -Force
Copy-Item "$src\*" $app -Recurse -Force

# Listen address: public when there is no reverse proxy, localhost-only when Caddy fronts it.
$urls = if ($Domain) { "http://127.0.0.1:5173" + $(if ($KeepPlainPort) { ";http://0.0.0.0:$Port" } else { "" }) } else { "http://0.0.0.0:$Port" }

if (-not $svc) {
    sc.exe create ThirdWheel binPath= "$app\Server.exe" start= auto obj= "NT AUTHORITY\LocalService" DisplayName= "Third Wheel server" | Out-Null
    sc.exe failure ThirdWheel reset= 86400 actions= restart/5000/restart/5000/restart/30000 | Out-Null
}
# Per-service environment variables (read by the server): data folder + listen address.
$svcKey = "HKLM:\SYSTEM\CurrentControlSet\Services\ThirdWheel"
$vars = @("TW_DATA=$data", "TW_URLS=$urls")
if (-not $KlipyKey -and $TenorKey) { $KlipyKey = $TenorKey }   # old parameter name
if ($KlipyKey -and $KlipyKey -notmatch '^[A-Za-z0-9_\-]{10,120}$') { throw "That doesn't look like a Klipy API key (letters, numbers, - and _ only)." }
if ($KlipyKey) { $vars += "TW_KLIPY_KEY=$KlipyKey" }
else { $vars += @((Get-ItemProperty $svcKey -Name Environment -ErrorAction SilentlyContinue).Environment) | Where-Object { $_ -like "TW_KLIPY_KEY=*" -or $_ -like "TW_TENOR_KEY=*" } }   # keep a key set earlier
# Discord verification (optional): set once, kept on later updates.
if ($DiscordClientId -and $DiscordClientId -notmatch '^\d{5,25}$') { throw "The Discord client id should be only digits." }
if ($DiscordSecret -and $DiscordSecret -notmatch '^[A-Za-z0-9_\-]{10,120}$') { throw "That doesn't look like a Discord client secret." }
if ($DiscordClientId -and $DiscordSecret) { $vars += "TW_DISCORD_CLIENT_ID=$DiscordClientId", "TW_DISCORD_CLIENT_SECRET=$DiscordSecret" }
else { $vars += @((Get-ItemProperty $svcKey -Name Environment -ErrorAction SilentlyContinue).Environment) | Where-Object { $_ -like "TW_DISCORD_*" } }
Set-ItemProperty $svcKey -Name Environment -Type MultiString -Value $vars
icacls $data /grant "NT AUTHORITY\LocalService:(OI)(CI)M" | Out-Null
icacls $app /grant "NT AUTHORITY\LocalService:(OI)(CI)RX" | Out-Null

# Firewall: only the ports that need to be public.
$ports = if ($Domain) { @(80, 443) + $(if ($KeepPlainPort) { @($Port) } else { @() }) } else { @($Port) }
Get-NetFirewallRule -DisplayName "Third Wheel" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "Third Wheel" -Direction Inbound -Protocol TCP -LocalPort $ports -Action Allow | Out-Null

Start-Service ThirdWheel
Start-Sleep 3
try { $r = Invoke-WebRequest "http://127.0.0.1:$(if ($Domain) { 5173 } else { $Port })/api/meta" -UseBasicParsing -TimeoutSec 5; Write-Host "Server is up (HTTP $($r.StatusCode))." }
catch { Write-Warning "Server did not answer yet. Check: Get-Service ThirdWheel ; Get-EventLog -LogName Application -Newest 10" }

if ($Domain) {
    $caddyDir = "$root\caddy"; New-Item -ItemType Directory -Force $caddyDir | Out-Null
    Set-Content "$caddyDir\Caddyfile" "$Domain {`n    reverse_proxy 127.0.0.1:5173`n}`n" -Encoding ascii
    if ($Domain -notmatch '^[A-Za-z0-9.\-]+$') { throw "Invalid domain." }
    if (-not (Test-Path "$caddyDir\caddy.exe")) {
        # Official release from github.com/caddyserver/caddy, checked against the checksums file published with it.
        Write-Host "Downloading Caddy ..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $tmp = Join-Path ([IO.Path]::GetTempPath()) ("tw-caddy-" + [Guid]::NewGuid().ToString("N")); New-Item -ItemType Directory $tmp | Out-Null
        try {
            $rel = Invoke-RestMethod "https://api.github.com/repos/caddyserver/caddy/releases/latest" -Headers @{ "User-Agent" = "ThirdWheel-install" } -UseBasicParsing
            $zipAsset = $rel.assets | Where-Object { $_.name -match '^caddy_[\d\.]+_windows_amd64\.zip$' } | Select-Object -First 1
            $sumAsset = $rel.assets | Where-Object { $_.name -match '^caddy_[\d\.]+_checksums\.txt$' } | Select-Object -First 1
            if (-not $zipAsset -or -not $sumAsset) { throw "Could not find the Windows download in the latest Caddy release." }
            Invoke-WebRequest $zipAsset.browser_download_url -OutFile "$tmp\caddy.zip" -UseBasicParsing
            $sums = (Invoke-WebRequest $sumAsset.browser_download_url -UseBasicParsing).Content; if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
            $want = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($zipAsset.name) } | Select-Object -First 1).Trim().Split(" ")[0].ToLower()
            $got = (Get-FileHash "$tmp\caddy.zip" -Algorithm SHA512).Hash.ToLower()
            if ($want -notmatch '^[0-9a-f]{128}$' -or $got -ne $want) { throw "Caddy download failed its checksum. Not installing it." }
            Expand-Archive "$tmp\caddy.zip" "$tmp\x" -Force
            Copy-Item (Get-ChildItem "$tmp\x" -Recurse -Filter caddy.exe | Select-Object -First 1).FullName "$caddyDir\caddy.exe" -Force
            Write-Host "Caddy $($rel.tag_name) installed (checksum OK)."
        }
        catch { Write-Warning "Caddy download failed ($($_.Exception.Message)). Save caddy.exe into $caddyDir manually and re-run." }
        finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    }
    # caddy logs to stderr even when all is fine; with $ErrorActionPreference = "Stop" that would abort the script, so relax it for this one call
    $prevEap = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & "$caddyDir\caddy.exe" validate --config "$caddyDir\Caddyfile" --adapter caddyfile 2>&1 | Out-Null
    $caddyOk = ($LASTEXITCODE -eq 0); $ErrorActionPreference = $prevEap
    if (-not $caddyOk) { Write-Warning "The Caddyfile did not validate; check $caddyDir\Caddyfile." }
    if (Test-Path "$caddyDir\caddy.exe") {
        if (-not (Get-Service caddy -ErrorAction SilentlyContinue)) { sc.exe create caddy start= auto binPath= "$caddyDir\caddy.exe run --config $caddyDir\Caddyfile" | Out-Null }
        Restart-Service caddy -ErrorAction SilentlyContinue; if ((Get-Service caddy).Status -ne 'Running') { Start-Service caddy }
        Write-Host "Caddy started: https://$Domain (certificate is issued automatically; $Domain must point at this server)."
    } else {
        Write-Warning "Download Caddy for Windows (caddyserver.com/download), save it as $caddyDir\caddy.exe, then run this script again."
    }
} else {
    Write-Warning "Plain HTTP: passwords and sessions cross the internet unencrypted. Use -Domain for HTTPS."
}
Write-Host "Also open the same TCP ports in your hosting provider's firewall / security group if it has one."
