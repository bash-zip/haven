# Haven beta: testing guide

Thanks for trying Haven. It replaces how your Windows desktop looks and works (menu bar, Dock,
widgets, search) while Windows stays your operating system. Everything it changes is put back
when you exit or uninstall it.

## Before you start

- Windows 11 (or Windows 10 21H2+), 64-bit. Microsoft Edge WebView2 (already on Windows 11).
- Haven isn't code-signed yet, so Windows SmartScreen may say "Windows protected your PC".
  Click **More info → Run anyway**. Some antivirus tools flag keyboard hooks; that's Haven
  taking over the Windows key and Alt + Tab.
- **The escape hatch:** Ctrl + Alt + Q exits Haven and brings your normal taskbar back. If
  anything ever looks stuck, run `Haven.exe --restore-taskbar`.

## Install

1. Unzip `Haven-<version>-win-x64.zip` anywhere.
2. Run `Haven.exe` and choose **Yes** to install (or **No** to just run it from that folder).
3. Haven installs for your account only (no admin needed), adds a Start menu entry, and updates
   itself. Uninstall from Windows **Settings → Apps → Haven**, or Haven Settings → About.

## First thing: run the system check

Haven **Settings → About Haven → System check → Run Check**. If anything shows a red "!", copy
the report (**Copy Report** just below it) and send it along.

## What to try (tick what works, note what doesn't)

**Every day**
- [ ] Settings stick: change the theme, wallpaper, Dock apps and widget positions, exit
      (Ctrl + Alt + Q), start Haven again. Everything should be exactly as you left it.
- [ ] Sign out and back in (or restart) with "Start Haven when you sign in" on. Same check.
- [ ] Maximized windows stop at the menu bar and fill down to the bottom edge.
- [ ] The Dock hides when a window overlaps it and comes back when you point at the bottom.
- [ ] Clicking Dock apps opens / brings them forward; right-click menus work.

**Keyboard**
- [ ] Windows key alone opens the App Library (and **not** the Start menu as well).
- [ ] Win + Tab (Overview), Win + A (Quick Controls), Win + N (Notifications), Win + S (search),
      Win + V (clipboard history), Win + D (show desktop), Win + 1…9 (Dock apps).
- [ ] Typing normally never triggers shortcuts by itself.
- [ ] Alt + Tab shows Haven's switcher.

**Touchpad** (precision touchpads)
- [ ] Three-finger swipe left/right moves between apps; up = Overview; down = App Windows.
- [ ] Four-finger swipe left/right changes desktops.
- [ ] Windows' own gesture popups don't appear (you may need to sign out and in once).

**Look & feel**
- [ ] Style Studio themes apply fully, and survive a restart.
- [ ] Widgets: drag, resize from the corner, add from the Widget Gallery.
- [ ] Visualizers move with music (Settings → Visualizers, or the Visualizer widget).

**Lock screen**
- [ ] Ctrl + L locks; your password unlocks (starting password: `root`, change it in Settings).
- [ ] Windows Hello unlock (if you use Hello).
- [ ] Win + L still locks Windows, even while Haven is locked.

**Other**
- [ ] Screenshots: Ctrl + Shift + 3 / 4 save to Pictures\Screenshots.
- [ ] A second monitor gets its own menu bar, wallpaper and Dock.
- [ ] Exit Haven: the Windows taskbar comes back exactly as before.
- [ ] Uninstall: taskbar, touchpad gestures and window animations are back to normal.

## Reporting a problem

Haven Settings → About Haven → **Copy Report**, then paste it with a sentence about what you
did and what happened. The report holds the version, Windows version, displays, the system
check and recent errors. It never includes your files or settings values. Logs live in
`%LOCALAPPDATA%\Haven\logs` if you're asked for them.

## Known limits in this beta

- Haven's lock screen covers the screen but isn't real security (Ctrl + Alt + Del gets past it).
  Turn on Settings → Lock Screen → **Lock Windows too** for that.
- "Ask Claude" in search needs your own Anthropic API key.
- The Stocks widget uses a public quote feed that may change without notice.
- App menus in the menu bar only appear for classic Windows apps with standard menus.
