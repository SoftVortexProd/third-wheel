# Builds the Third Wheel desktop exe: publish C# server -> package Python shell -> copy server alongside.
param([switch]$SkipServer)
# Native tools log to stderr; failures are caught via $LASTEXITCODE checks instead.
$ErrorActionPreference = "Continue"
Stop-Process -Name "ThirdWheel", "QtWebEngineProcess" -Force -ErrorAction SilentlyContinue
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

# The app only uses QtCore/Gui/Widgets and QtWebEngine. Leaving the rest of PySide6 (and unused stdlib bits) out keeps the exe much smaller.
$exclude = @(
    'PySide6.QtQuick', 'PySide6.QtQuickWidgets', 'PySide6.QtQuickControls2', 'PySide6.QtQml', 'PySide6.QtQuick3D',
    'PySide6.Qt3DCore', 'PySide6.Qt3DRender', 'PySide6.Qt3DInput', 'PySide6.Qt3DLogic', 'PySide6.Qt3DAnimation', 'PySide6.Qt3DExtras',
    'PySide6.QtDesigner', 'PySide6.QtUiTools', 'PySide6.QtHelp', 'PySide6.QtTest',
    'PySide6.QtMultimedia', 'PySide6.QtMultimediaWidgets', 'PySide6.QtSpatialAudio', 'PySide6.QtTextToSpeech',
    'PySide6.QtSensors', 'PySide6.QtBluetooth', 'PySide6.QtNfc', 'PySide6.QtSerialPort', 'PySide6.QtSerialBus',
    'PySide6.QtCharts', 'PySide6.QtDataVisualization', 'PySide6.QtGraphs', 'PySide6.QtGraphsWidgets',
    'PySide6.QtLocation', 'PySide6.QtPdf', 'PySide6.QtPdfWidgets', 'PySide6.QtRemoteObjects', 'PySide6.QtScxml', 'PySide6.QtStateMachine',
    'PySide6.QtSql', 'PySide6.QtHttpServer', 'PySide6.QtWebView', 'PySide6.QtConcurrent',
    'tkinter', 'unittest', 'pydoc', 'doctest', 'test', 'distutils', 'lib2to3', 'idlelib', 'turtledemo'
)
$excludeArgs = @(); foreach ($m in $exclude) { $excludeArgs += '--exclude-module'; $excludeArgs += $m }

Push-Location (Join-Path $root "desktop")
try {
    & $py -m PyInstaller --noconfirm --clean --noconsole --name ThirdWheel `
        --icon (Join-Path $root "desktop\app.ico") --add-data "$(Join-Path $root 'desktop\app.ico');." `
        --distpath (Join-Path $root "dist") --workpath (Join-Path $root "build") --specpath (Join-Path $root "build") `
        @excludeArgs app.py
    if ($LASTEXITCODE -ne 0) { throw "pyinstaller failed" }
} finally { Pop-Location }

# Chromium parts the app never uses: the DevTools UI (the context menu and F12 are disabled in release) and spare spell-check/UI language packs.
$pyside = Join-Path $root "dist\ThirdWheel\_internal\PySide6"
Get-ChildItem (Join-Path $pyside "resources") -Filter "qtwebengine_devtools_resources*.pak" -ErrorAction SilentlyContinue | Remove-Item -Force
$loc = Join-Path $pyside "translations\qtwebengine_locales"
if (Test-Path $loc) { Get-ChildItem $loc -Filter "*.pak" | Where-Object { $_.BaseName -notin @("en-US", "sv") } | Remove-Item -Force }

# Trim unused translations (*.qm) other than en and sv to reduce size
$trans = Join-Path $pyside "translations"
if (Test-Path $trans) {
    Get-ChildItem $trans -Filter "*.qm" | Where-Object { $_.BaseName -notmatch "_(en|sv)$" } | Remove-Item -Force
}

# Trim unused imageformat and position plugins
$imgf = Join-Path $pyside "plugins\imageformats"
if (Test-Path $imgf) {
    @("qtiff.dll", "qwbmp.dll", "qtga.dll", "qicns.dll", "qpdf.dll") | ForEach-Object {
        $p = Join-Path $imgf $_; if (Test-Path $p) { Remove-Item $p -Force }
    }
}
$pos = Join-Path $pyside "plugins\position"
if (Test-Path $pos) { Remove-Item $pos -Recurse -Force }

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

$exe = Join-Path $root "dist\ThirdWheel\ThirdWheel.exe"
$cert = Get-Item "Cert:\CurrentUser\My\F4833A212DD2FD4E70A535FAD5E64ED2DCDA67F1" -ErrorAction SilentlyContinue
if ($cert -and (Test-Path $exe)) {
    try {
        Set-AuthenticodeSignature -FilePath $exe -Certificate $cert -TimestampServer "http://timestamp.digicert.com" | Out-Null
    } catch {
        Set-AuthenticodeSignature -FilePath $exe -Certificate $cert | Out-Null
    }
    Write-Host "Signed $exe with Authenticode certificate ($($cert.Subject))"

    $cerPath = Join-Path $root "dist\ThirdWheel\ThirdWheel.cer"
    Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
    $installBat = @'
@echo off
echo Installing Third Wheel publisher certificate...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Import-Certificate -FilePath '%~dp0ThirdWheel.cer' -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null; Import-Certificate -FilePath '%~dp0ThirdWheel.cer' -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' | Out-Null"
echo.
echo Third Wheel publisher certificate installed successfully. Windows now trusts SoftVortexProd / Third Wheel.
echo.
pause
'@
    Set-Content (Join-Path $root "dist\ThirdWheel\install-certificate.bat") $installBat -Encoding ascii
}

Write-Host "Built: $exe"
