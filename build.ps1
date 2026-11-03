# Builds the Third Wheel desktop exe: publish C# server -> package Python shell -> copy server alongside.
param([switch]$SkipServer)
# Native tools log to stderr; failures are caught via $LASTEXITCODE checks instead.
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { py -m venv (Join-Path $root ".venv") }
& $py -m pip install --quiet --disable-pip-version-check -r (Join-Path $root "desktop\requirements.txt")

if (-not $SkipServer) {
    dotnet publish (Join-Path $root "server\Server.csproj") -c Release -r win-x64 --self-contained `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o (Join-Path $root "dist\server")
    if ($LASTEXITCODE -ne 0) { throw "server publish failed" }
}

& $py (Join-Path $root "desktop\make_icon.py")
Push-Location (Join-Path $root "desktop")
try {
    & $py -m PyInstaller --noconfirm --clean --noconsole --name ThirdWheel `
        --icon (Join-Path $root "desktop\app.ico") --add-data "$(Join-Path $root 'desktop\app.ico');." `
        --distpath (Join-Path $root "dist") --workpath (Join-Path $root "build") --specpath (Join-Path $root "build") `
        app.py
    if ($LASTEXITCODE -ne 0) { throw "pyinstaller failed" }
} finally { Pop-Location }

$target = Join-Path $root "dist\ThirdWheel\server"
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
$cfg = Join-Path $root "desktop\config.json"
if (Test-Path $cfg) {
    # Hosted mode: the app talks to the server in config.json, so no local server is bundled.
    Copy-Item $cfg (Join-Path $root "dist\ThirdWheel\config.json")
    Write-Host "Hosted mode -> $((Get-Content $cfg -Raw | ConvertFrom-Json).server)"
} else {
    Copy-Item (Join-Path $root "dist\server") $target -Recurse
    Write-Host "Local mode (no desktop\config.json): bundled server included."
}
Write-Host "Built: $root\dist\ThirdWheel\ThirdWheel.exe"
