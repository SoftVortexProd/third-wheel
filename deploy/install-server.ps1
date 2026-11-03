# Run ON the Windows server, in an elevated PowerShell, from the extracted package folder.
#   .\install-server.ps1                      -> plain HTTP on port 80 (no encryption!)
#   .\install-server.ps1 -Domain play.example.com  -> server listens on localhost, Caddy provides HTTPS
param([string]$Domain = "", [int]$Port = 80)
$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "app"
if (-not (Test-Path (Join-Path $src "Server.exe"))) { throw "app\Server.exe not found. Run this from the extracted package folder." }
$root = "C:\ThirdWheel"; $app = "$root\app"; $data = "$root\data"
New-Item -ItemType Directory -Force $app, $data | Out-Null

$svc = Get-Service ThirdWheel -ErrorAction SilentlyContinue
if ($svc) { Stop-Service ThirdWheel -Force; Start-Sleep 2 }
Copy-Item "$src\*" $app -Recurse -Force

# Listen address: public when there is no reverse proxy, localhost-only when Caddy fronts it.
$urls = if ($Domain) { "http://127.0.0.1:5173" } else { "http://0.0.0.0:$Port" }

if (-not $svc) {
    sc.exe create ThirdWheel binPath= "$app\Server.exe" start= auto obj= "NT AUTHORITY\LocalService" DisplayName= "Third Wheel server" | Out-Null
    sc.exe failure ThirdWheel reset= 86400 actions= restart/5000/restart/5000/restart/30000 | Out-Null
}
# Per-service environment variables (read by the server): data folder + listen address.
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\ThirdWheel" -Name Environment -Type MultiString -Value @("TW_DATA=$data", "TW_URLS=$urls")
icacls $data /grant "NT AUTHORITY\LocalService:(OI)(CI)M" | Out-Null
icacls $app /grant "NT AUTHORITY\LocalService:(OI)(CI)RX" | Out-Null

# Firewall: only the ports that need to be public.
$ports = if ($Domain) { @(80, 443) } else { @($Port) }
Get-NetFirewallRule -DisplayName "Third Wheel" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "Third Wheel" -Direction Inbound -Protocol TCP -LocalPort $ports -Action Allow | Out-Null

Start-Service ThirdWheel
Start-Sleep 3
try { $r = Invoke-WebRequest "http://127.0.0.1:$(if ($Domain) { 5173 } else { $Port })/api/meta" -UseBasicParsing -TimeoutSec 5; Write-Host "Server is up (HTTP $($r.StatusCode))." }
catch { Write-Warning "Server did not answer yet. Check: Get-Service ThirdWheel ; Get-EventLog -LogName Application -Newest 10" }

if ($Domain) {
    $caddyDir = "$root\caddy"; New-Item -ItemType Directory -Force $caddyDir | Out-Null
    Set-Content "$caddyDir\Caddyfile" "$Domain {`n    reverse_proxy 127.0.0.1:5173`n}`n" -Encoding ascii
    if (-not (Test-Path "$caddyDir\caddy.exe")) {
        Write-Host "Downloading Caddy from caddyserver.com ..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        try { Invoke-WebRequest "https://caddyserver.com/api/download?os=windows&arch=amd64" -OutFile "$caddyDir\caddy.exe" -UseBasicParsing }
        catch { Write-Warning "Download failed ($($_.Exception.Message)). Save caddy.exe into $caddyDir manually and re-run." }
    }
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
