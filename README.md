# Haven

A calmer desktop for Windows.

Haven is a Windows desktop shell that adds a menu bar, dock, widgets, search, and desktop customization on top of Windows — while keeping Windows underneath. When you exit or uninstall it, it puts things back.

![Haven desktop](website/haven%20website/haven-desktop.png)

## Features

- **Menu bar & Dock** — A macOS-inspired menu bar and dock for launching and managing apps.
- **Widgets** — Place and resize desktop widgets like clock, weather, calendar, and more.
- **Search** — Quick search for apps, files, and commands.
- **Themes & customization** — Wallpapers, visual styles, and layout options.
- **Spaces / window management** — Desktop workflow features like Mission Control, Stage Manager, snapping, and gestures.
- **Lock screen** — Optional Haven lock screen with password/Windows Hello support.
- **Built-in updates & installer** — Per-user install, no admin required.

## System requirements

- Windows 11, or Windows 10 21H2+
- 64-bit
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (already included on Windows 11)

## Install

Download the latest installer from [GitHub Releases](https://github.com/bash-zip/haven/releases).

> Haven is not code-signed yet, so Windows SmartScreen may show a warning. Click **More info → Run anyway** if you trust the release.

You can also build from source (see below).

## Build from source

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- Windows 10/11

### Build and run

```powershell
git clone https://github.com/bash-zip/haven.git
cd haven
dotnet build Haven/Haven.csproj
dotnet run --project Haven/Haven.csproj
```

### Publish release artifacts

```powershell
.\release.ps1 -Version 0.5.0 -Repo bash-zip/haven
```

## Development notes

- Main app: `Haven/` (WPF + WebView2, C#)
- Web UI: `Haven/wwwroot/`
- Installer/setup: `Setup/`, `release.ps1`
- Website: `site/`

## Safety / escape hatch

If something gets stuck, Haven includes recovery options:

- **Ctrl + Alt + Q** — Exit Haven and restore the normal Windows taskbar
- `Haven.exe --restore-taskbar` — Manual taskbar recovery

## License

[MIT](LICENSE) © 2026 bash