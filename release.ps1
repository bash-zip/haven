# Builds a Haven release: a self-contained download (no .NET install needed), its checksum,
# and the update manifest that installed copies check.
#
#   powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 0.3.0 -Repo yourname/haven
#
# Output in .\release\:
#   Haven-<version>-win-x64.zip   what people download (unzip, run Haven.exe, choose Install)
#   latest.json                   the update manifest
#
# Publishing on GitHub: create release "v<version>" and attach both files, e.g.
#   gh release create v0.3.0 release\Haven-0.3.0-win-x64.zip release\latest.json --title "Haven 0.3.0" --notes "..."
# Installed copies read https://github.com/<repo>/releases/latest/download/latest.json, so the
# newest release is always the one they find.
#
# Code signing (strongly recommended for public releases; avoids SmartScreen warnings): set
# HAVEN_SIGN_THUMBPRINT to your code-signing certificate's thumbprint and have signtool.exe on PATH.

param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Repo = '',
    [string]$Notes = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root 'release'
$app = Join-Path $out 'Haven'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force $app | Out-Null

Write-Host "Building Haven $Version (Release, self-contained)..."
dotnet publish (Join-Path $root 'Haven\Haven.csproj') -c Release -r win-x64 --self-contained true `
    -p:Version=$Version -p:PublishReadyToRun=true -o $app --nologo -v q
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

if ($Repo) {
    Set-Content (Join-Path $app 'update-feed.txt') "https://github.com/$Repo/releases/latest/download/latest.json" -Encoding ascii
} else {
    Write-Warning 'No -Repo given: this build will not check for updates.'
}

if ($env:HAVEN_SIGN_THUMBPRINT) {
    Write-Host 'Signing...'
    & signtool.exe sign /sha1 $env:HAVEN_SIGN_THUMBPRINT /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 (Join-Path $app 'Haven.exe')
    if ($LASTEXITCODE -ne 0) { throw 'Signing failed.' }
} else {
    Write-Warning 'Not signed: Windows SmartScreen will warn people who download it.'
}

$zipName = "Haven-$Version-win-x64.zip"
$zip = Join-Path $out $zipName
# Compress-Archive (PowerShell 5.1) writes entry names with BACKSLASHES, which breaks
# extraction into the wrong (nested) folders. Use the .NET zip API: forward slashes always.
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $zip) { Remove-Item $zip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($app, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $true) # includeBaseDirectory: the zip keeps its Haven/ folder
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash

$url = if ($Repo) { "https://github.com/$Repo/releases/download/v$Version/$zipName" } else { $zipName }
$json = [ordered]@{ version = $Version; url = $url; sha256 = $hash; notes = $Notes } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $out 'latest.json'), $json, (New-Object Text.UTF8Encoding $false))

# HavenSetup.exe: one file to double-click, carrying the zip above.
Write-Host 'Building HavenSetup.exe...'
$setupDir = Join-Path $root 'Setup'
Copy-Item $zip (Join-Path $setupDir 'payload.zip') -Force
$setupOut = Join-Path $out 'setup-build'
dotnet publish (Join-Path $setupDir 'Setup.csproj') -c Release -p:Version=$Version -o $setupOut --nologo -v q
if ($LASTEXITCODE -ne 0) { throw 'Setup build failed.' }
$setupExe = Join-Path $out "HavenSetup-$Version.exe"
Move-Item (Join-Path $setupOut 'HavenSetup.exe') $setupExe -Force
Remove-Item $setupOut -Recurse -Force
Remove-Item (Join-Path $setupDir 'payload.zip') -Force
if ($env:HAVEN_SIGN_THUMBPRINT) {
    & signtool.exe sign /sha1 $env:HAVEN_SIGN_THUMBPRINT /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $setupExe
}

Write-Host ''
Write-Host "Done: $zip"
Write-Host "Setup: $setupExe"
Write-Host "SHA-256 $hash"
if ($Repo) { Write-Host "Publish: gh release create v$Version `"$zip`" `"$(Join-Path $out 'latest.json')`" --title `"Haven $Version`"" }
