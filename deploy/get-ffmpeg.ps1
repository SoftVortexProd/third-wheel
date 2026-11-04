# Downloads ffmpeg (Windows build from gyan.dev) into deploy\ffmpeg\, checks the published SHA-256, keeps only ffmpeg.exe.
# publish.ps1 runs this automatically when deploy\ffmpeg\ffmpeg.exe is missing. The server uses it to convert uploaded videos to WebM.
$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "ffmpeg"
if ((Test-Path (Join-Path $dir "ffmpeg.exe"))) { Write-Host "ffmpeg already present."; return }
$base = "https://www.gyan.dev/ffmpeg/builds"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("tw-ffmpeg-" + [Guid]::NewGuid().ToString("N")); New-Item -ItemType Directory $tmp | Out-Null
try {
    $zip = Join-Path $tmp "ffmpeg.zip"
    Write-Host "Downloading ffmpeg (about 90 MB; only ffmpeg.exe is kept) ..."
    Invoke-WebRequest "$base/ffmpeg-release-essentials.zip" -OutFile $zip -UseBasicParsing
    $want = (Invoke-WebRequest "$base/ffmpeg-release-essentials.zip.sha256" -UseBasicParsing).Content.ToString().Trim().Split()[0].ToLower()
    $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if ($want -notmatch '^[0-9a-f]{64}$' -or $got -ne $want) { throw "ffmpeg download failed its checksum (expected $want, got $got). Not using it." }
    Write-Host "Checksum OK."
    Expand-Archive $zip (Join-Path $tmp "x") -Force
    New-Item -ItemType Directory -Force $dir | Out-Null
    foreach ($n in "ffmpeg.exe") {
        $f = Get-ChildItem (Join-Path $tmp "x") -Recurse -Filter $n | Select-Object -First 1
        if (-not $f) { throw "$n not found in the download." }
        Copy-Item $f.FullName (Join-Path $dir $n) -Force
    }
    Write-Host "ffmpeg ready in $dir"
} finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
