# Run ONCE on the Windows server (elevated PowerShell) so your PC can push updates with deploy\sync.ps1.
#   .\enable-ssh.ps1            install + start OpenSSH Server, open port 22
#   .\enable-ssh.ps1 -KeyOnly   AFTER `sync.ps1 -SetupKey` works: turn off password logins (strongly recommended)
param([switch]$KeyOnly)
$ErrorActionPreference = "Stop"

if ($KeyOnly) {
    $cfg = "$env:ProgramData\ssh\sshd_config"
    if (-not (Test-Path $cfg)) { throw "OpenSSH is not installed yet. Run this script without -KeyOnly first." }
    $text = Get-Content $cfg
    if ($text -match '^\s*#?\s*PasswordAuthentication') { $text = $text -replace '^\s*#?\s*PasswordAuthentication.*', 'PasswordAuthentication no' }
    else { $text += 'PasswordAuthentication no' }
    Set-Content $cfg $text -Encoding ascii
    Restart-Service sshd
    Write-Host "Password logins are off. Only your key works over SSH (Remote Desktop is unaffected)."
    return
}

$cap = Get-WindowsCapability -Online -Name "OpenSSH.Server*" | Select-Object -First 1
if ($cap.State -ne "Installed") { Write-Host "Installing OpenSSH Server ..."; Add-WindowsCapability -Online -Name $cap.Name | Out-Null }
Set-Service sshd -StartupType Automatic
Start-Service sshd
Get-NetFirewallRule -DisplayName "Third Wheel SSH" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "Third Wheel SSH" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow | Out-Null
Write-Host "SSH is running on port 22. Also open TCP 22 in your hosting provider's firewall, ideally only for your own IP."
Write-Host "Next, on your PC:  .\deploy\sync.ps1 -SetupKey"
