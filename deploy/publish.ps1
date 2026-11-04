# Builds the hosted-server package on YOUR PC: dist\ThirdWheel-server.zip
# Usage:  .\deploy\publish.ps1            (includes ffmpeg for video conversion)
#         .\deploy\publish.ps1 -NoFfmpeg   (smaller package, for a server that already has ffmpeg; sync.ps1 decides this for you)
param([switch]$NoFfmpeg)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$pkg = Join-Path $root "dist\deploy\package"
if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $pkg "app") | Out-Null

dotnet publish (Join-Path $root "server\Server.csproj") -c Release -r win-x64 --self-contained `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o (Join-Path $pkg "app")
if ($LASTEXITCODE -ne 0) { throw "server publish failed" }

Copy-Item (Join-Path $PSScriptRoot "install-server.ps1") $pkg
if (-not $NoFfmpeg) {
    & (Join-Path $PSScriptRoot "get-ffmpeg.ps1")
    New-Item -ItemType Directory -Force (Join-Path $pkg "app\ffmpeg") | Out-Null
    Copy-Item (Join-Path $PSScriptRoot "ffmpeg\ffmpeg.exe") (Join-Path $pkg "app\ffmpeg\ffmpeg.exe")
}
$zip = Join-Path $root "dist\ThirdWheel-server.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $pkg "*") -DestinationPath $zip
Write-Host ("Package ready: {0} ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
Write-Host "Next: copy it to the server, extract it, then run install-server.ps1 there (see deploy\README.md)."
