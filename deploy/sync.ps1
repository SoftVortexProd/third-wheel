# Pushes the current server code to your Windows server and restarts it. Runs on YOUR PC.
#   .\deploy\sync.ps1              build, upload and install once
#   .\deploy\sync.ps1 -Watch       keep running; redeploy automatically whenever server code changes
#   .\deploy\sync.ps1 -SetupKey    one-time: create an SSH key and authorise it on the server (ssh asks for the server password itself)
#   .\deploy\sync.ps1 -DryRun      build the package and show what would run, without connecting
# Settings come from deploy\sync.config.json (see sync.config.example.json); parameters override them.
#   Add -DiscordClientId <id> -DiscordSecret <secret> once (or set $env:TW_DISCORD_CLIENT_ID / $env:TW_DISCORD_CLIENT_SECRET) to turn on "Verify Discord"; the server keeps them.
#   Add -KlipyKey <key> (or set $env:TW_KLIPY_KEY on your PC) to turn on the GIF picker; it is stored on the server and later syncs keep it. -TenorKey is the old name.
param([switch]$Watch, [switch]$SetupKey, [switch]$DryRun, [string]$Server, [string]$User, [int]$Port, [string]$Domain, [string]$KlipyKey, [string]$TenorKey, [string]$DiscordClientId, [string]$DiscordSecret, [string]$SteamApiKey)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$cfg = @{ server = ""; user = "Administrator"; port = 1732; domain = ""; keepPlainPort = $false }
$cfgFile = Join-Path $PSScriptRoot "sync.config.json"
if (Test-Path $cfgFile) { (Get-Content $cfgFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cfg[$_.Name] = $_.Value } }
if ($Server) { $cfg.server = $Server }; if ($User) { $cfg.user = $User }; if ($Port) { $cfg.port = $Port }; if ($Domain) { $cfg.domain = $Domain }
if (-not $cfg.server) { throw "No server set. Copy deploy\sync.config.example.json to deploy\sync.config.json and fill it in, or pass -Server." }
# These values end up in command lines: accept only plain hostnames, usernames, ports.
if ($cfg.server -notmatch '^[A-Za-z0-9.\-]+$') { throw "Invalid server host." }
if ($cfg.user -notmatch '^[A-Za-z0-9._\-]+$') { throw "Invalid user name." }
if ($cfg.domain -and $cfg.domain -notmatch '^[A-Za-z0-9.\-]+$') { throw "Invalid domain." }
if (-not $KlipyKey) { $KlipyKey = if ($TenorKey) { $TenorKey } elseif ($env:TW_KLIPY_KEY) { $env:TW_KLIPY_KEY } else { $env:TW_TENOR_KEY } }
if ($KlipyKey -and $KlipyKey -notmatch '^[A-Za-z0-9_\-]{10,120}$') { throw "That doesn't look like a Klipy API key (letters, numbers, - and _ only)." }
if (-not $DiscordClientId) { $DiscordClientId = $env:TW_DISCORD_CLIENT_ID }; if (-not $DiscordSecret) { $DiscordSecret = $env:TW_DISCORD_CLIENT_SECRET }
if ($DiscordClientId -and $DiscordClientId -notmatch '^\d{5,25}$') { throw "The Discord client id should be only digits." }
if ($DiscordSecret -and $DiscordSecret -notmatch '^[A-Za-z0-9_\-]{10,120}$') { throw "That doesn't look like a Discord client secret." }
if (-not $SteamApiKey) { $SteamApiKey = if ($cfg.steamApiKey) { $cfg.steamApiKey } else { $env:TW_STEAM_API_KEY } }
if ($SteamApiKey -and $SteamApiKey -notmatch '^[A-Za-z0-9]{16,64}$') { throw "That doesn't look like a Steam API key." }
# Optional extra server settings (Google sign-in, TURN, ...) from deploy\server-secrets.env: one TW_NAME=value per line. The file never leaves your PC except as part of the install command, and is gitignored.
$extraB64 = ""
$envFile = Join-Path $PSScriptRoot "server-secrets.env"
if (Test-Path $envFile) {
    $extra = [ordered]@{}
    foreach ($line in Get-Content $envFile) {
        $l = $line.Trim(); if (-not $l -or $l.StartsWith("#")) { continue }
        if ($l -notmatch '^(TW_[A-Z0-9_]{2,60})=(.*)$') { throw "server-secrets.env: this line isn't NAME=value: $($l.Split('=')[0])" }
        $extra[$Matches[1]] = $Matches[2].Trim().Trim('"')
    }
    if ($extra.Count) { $extraB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($extra | ConvertTo-Json -Compress))) }
}
$cfg.port = [int]$cfg.port
$target = "$($cfg.user)@$($cfg.server)"

foreach ($tool in "ssh", "scp", "ssh-keygen") { if (-not (Get-Command $tool -ErrorAction SilentlyContinue) -and -not $DryRun) { throw "$tool not found. Install the 'OpenSSH Client' Windows feature." } }
$key = Join-Path $env:USERPROFILE ".ssh\thirdwheel_ed25519"
$opts = @("-o", "StrictHostKeyChecking=accept-new")
if (Test-Path $key) { $opts += @("-i", $key, "-o", "IdentitiesOnly=yes") }

function ConvertTo-Encoded([string]$script) { [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('$ProgressPreference="SilentlyContinue"; ' + $script)) }   # no progress bars in the log
function Invoke-Remote([string]$script) {
    & ssh -n @opts $target "powershell -NoProfile -NonInteractive -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand $(ConvertTo-Encoded $script)"   # -n: never wait for input (it hangs when run from a background job)
    if ($LASTEXITCODE -ne 0) { throw "Remote command failed (exit $LASTEXITCODE)." }
}

if ($SetupKey) {
    if (-not (Test-Path $key)) {
        New-Item -ItemType Directory -Force (Split-Path $key) | Out-Null
        ssh-keygen -t ed25519 -f $key -N '""' -C "thirdwheel-sync" | Out-Null
        Write-Host "Created $key"
    }
    $remote = '$k=[Console]::In.ReadToEnd().Trim().TrimStart([char]0xFEFF); $f="$env:ProgramData\ssh\administrators_authorized_keys"; New-Item -ItemType Directory -Force (Split-Path $f) | Out-Null; if(-not (Test-Path $f) -or -not (Select-String -Path $f -SimpleMatch $k -Quiet)){ Add-Content -Path $f -Value $k -Encoding ascii }; icacls $f /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null; "key installed"'
    Write-Host "Authorising your key on $($cfg.server) ... ssh will ask for the server's Administrator password (typed into ssh, not saved)."
    (Get-Content "$key.pub" -Raw) | & ssh -o StrictHostKeyChecking=accept-new $target "powershell -NoProfile -NonInteractive -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand $(ConvertTo-Encoded $remote)"
    if ($LASTEXITCODE -ne 0) { throw "Could not install the key." }
    Write-Host "Done. From now on sync.ps1 logs in with the key. Then, on the server, run .\enable-ssh.ps1 -KeyOnly to switch off password logins."
    return
}

function Deploy {
    $stamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$stamp] Building package ..."
    # ffmpeg is about 100 MB: only send it when the server does not have it yet
    $hasFfmpeg = $false
    if (-not $DryRun) { try { $hasFfmpeg = ((& ssh -n @opts $target "powershell -NoProfile -NonInteractive -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand $(ConvertTo-Encoded 'Test-Path C:\ThirdWheel\app\ffmpeg\ffmpeg.exe')") -join '').Trim() -eq 'True' } catch { } }
    & (Join-Path $PSScriptRoot "publish.ps1") -NoFfmpeg:$hasFfmpeg | Out-Null
    $zip = Join-Path $root "dist\ThirdWheel-server.zip"
    $installArgs = "-Port $($cfg.port)" + $(if ($cfg.domain) { " -Domain $($cfg.domain)" } else { "" }) + $(if ($cfg.domain -and $cfg.keepPlainPort) { " -KeepPlainPort" } else { "" }) + $(if ($KlipyKey) { " -KlipyKey $KlipyKey" } else { "" }) + $(if ($DiscordClientId -and $DiscordSecret) { " -DiscordClientId $DiscordClientId -DiscordSecret $DiscordSecret" } else { "" }) + $(if ($SteamApiKey) { " -SteamApiKey $SteamApiKey" } else { "" })
    if ($extraB64) { $installArgs += " -ExtraEnv $extraB64" }
    $remote = @"
`$ErrorActionPreference='Stop'; `$d='C:\ThirdWheel\incoming'
Remove-Item "`$d\pkg" -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive "`$d\pkg.zip" "`$d\pkg" -Force
Set-Location "`$d\pkg"; .\install-server.ps1 $installArgs
"@
    if ($DryRun) {
        Write-Host ("Package: {0} ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
        Write-Host "Would run:  ssh $target  (create C:\ThirdWheel\incoming)"
        Write-Host "Would run:  scp $zip ${target}:C:/ThirdWheel/incoming/pkg.zip"
        $shown = $remote; if ($extraB64) { $shown = $shown.Replace($extraB64, "<hidden>") }; if ($KlipyKey) { $shown = $shown.Replace($KlipyKey, "<hidden>") }; if ($DiscordSecret) { $shown = $shown.Replace($DiscordSecret, "<hidden>") }; if ($SteamApiKey) { $shown = $shown.Replace($SteamApiKey, "<hidden>") }   # never print secrets
        Write-Host "Would run on the server:`n$shown"
        return
    }
    Write-Host "[$stamp] Uploading to $($cfg.server) ..."
    Invoke-Remote 'New-Item -ItemType Directory -Force C:\ThirdWheel\incoming | Out-Null'
    & scp @opts $zip "${target}:C:/ThirdWheel/incoming/pkg.zip"
    if ($LASTEXITCODE -ne 0) { throw "Upload failed." }
    Write-Host "[$stamp] Installing and restarting ..."
    Invoke-Remote $remote
    Write-Host "[$(Get-Date -Format HH:mm:ss)] Deployed."
}

if (-not $Watch) { Deploy; return }

# Watch mode: redeploy whenever a server source file changes (waits for edits to settle first).
function Get-Signature {
    Get-ChildItem (Join-Path $root "server") -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\(bin|obj)\\' } |
        ForEach-Object { "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } | Out-String
}
Write-Host "Watching server\ for changes. Ctrl+C to stop."
$last = Get-Signature
try { Deploy } catch { Write-Warning $_.Exception.Message }
while ($true) {
    Start-Sleep -Seconds 4
    $now = Get-Signature
    if ($now -ne $last) {
        do { $prev = $now; Start-Sleep -Seconds 6; $now = Get-Signature } while ($now -ne $prev)   # settle
        $last = $now
        try { Deploy } catch { Write-Warning $_.Exception.Message }
    }
}
