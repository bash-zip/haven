# Builds Haven and installs it to %LOCALAPPDATA%\Programs\Haven, with a Start menu entry.
# Run it again any time to update. (Installed Haven also offers updates on its own when
# a newer build appears in .\publish.)
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$publish = Join-Path $root 'publish'
$target = Join-Path $env:LOCALAPPDATA 'Programs\Haven'

Write-Host 'Building Haven (Release)...'
dotnet publish (Join-Path $root 'Haven\Haven.csproj') -c Release -o $publish --nologo -v q
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

Write-Host 'Installing...'
# Close Haven (the watchdog puts the taskbar back), then copy the new files over.
Get-Process Haven -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
New-Item -ItemType Directory -Force $target | Out-Null
robocopy $publish $target /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Set-Content (Join-Path $target 'update-source.txt') $publish -Encoding utf8

# Start menu entry
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Haven.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = Join-Path $target 'Haven.exe'
$link.WorkingDirectory = $target
$link.Description = 'Haven: a calmer desktop on top of Windows'
$link.Save()

# Keep "start at sign-in" pointing at the installed copy.
$exe = Join-Path $target 'Haven.exe'
if (Get-ScheduledTask -TaskName 'Haven' -ErrorAction SilentlyContinue) {
    Start-Process $exe -ArgumentList '--autostart', 'on' -Wait
}

Write-Host "Installed to $target. Starting Haven..."
Start-Process $exe
