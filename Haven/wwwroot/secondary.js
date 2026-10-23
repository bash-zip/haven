'use strict';

/* =========================================================================
   Haven on another display (part=secondary): this screen's wallpaper, a menu
   bar with the app in front on this screen and the clock, and a Dock with
   your Dock apps plus whatever is running on this screen.
   ========================================================================= */

const IS_SECONDARY = PART === 'secondary';
const SCREEN = Number(new URLSearchParams(location.search).get('screen')) || 1;

function secBuild() {
  document.documentElement.classList.add('part-secondary');
  const root = h('div', { class: 'sec-root' },
    h('header', { class: 'sec-bar' },
      h('button', { class: 'sec-logo', title: 'Search', onclick: () => toShell('openSpotlight') },
        svg('<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M1 1h6.6v6.6H1zM8.4 1H15v6.6H8.4zM1 8.4h6.6V15H1zM8.4 8.4H15V15H8.4z"/></svg>')),
      h('b', { class: 'sec-app', id: 'sec-app' }),
      h('span', { class: 'sec-spacer' }),
      h('button', { class: 'sec-icon', title: 'Search', onclick: () => toShell('openSpotlight') }, svg('<svg viewBox="0 0 20 20" width="14" height="14"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>')),
      h('span', { class: 'sec-clock', id: 'sec-clock' })),
    h('div', { class: 'sec-dock-wrap' }, h('nav', { class: 'sec-dock dock', id: 'sec-dock' })));
  document.body.append(root);
}

function secTick() {
  const now = new Date();
  $('#sec-clock').textContent = now.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: !S.clock24,
  });
}

let secScreens = {};
async function secPoll() {
  try {
    const res = await call('windows');
    windows = res?.windows || [];
    foreground = res?.foreground || 0;
    if (windows.length) secScreens = await call('windowScreens', { hwnds: windows.map(w => w.hwnd) }) || {};
  } catch { /* keep last */ }
  secRender();
  setTimeout(secPoll, 1500);
}

let secKey = '';
function secRender() {
  const here = windows.filter(w => (secScreens[w.hwnd] ?? 0) === SCREEN);
  const fg = here.find(w => w.hwnd === foreground);
  const fgApp = fg && appForWindow(fg);
  $('#sec-app').textContent = fg ? (fgApp?.name || prettyExe(fg.exe)) : 'Desktop';

  const pinned = (S.dock || []).map(id => appById.get(id)).filter(Boolean);
  const groups = new Map();
  for (const w of here) {
    const k = w.exe.toLowerCase();
    if (!groups.has(k)) groups.set(k, { exe: w.exe, icon: w.icon, wins: [], app: appForWindow(w) });
    groups.get(k).wins.push(w);
  }
  const allGroups = groupWindows(); // running anywhere, for the dots under pinned apps
  const key = JSON.stringify([pinned.map(a => a.id), [...groups.keys()], [...allGroups.keys()], S.dockSize, S.iconOverrides]);
  if (key === secKey) return;
  secKey = key;

  const item = (label, icon, running, onClick) => {
    const el = h('button', { class: 'dock-item' + (running ? ' running' : ''), 'aria-label': label }, icon, h('span', { class: 'label', text: label }));
    el.addEventListener('click', () => onClick(el));
    return el;
  };
  const dock = $('#sec-dock');
  dock.replaceChildren(
    ...pinned.map(app => {
      const g = groupForApp(app, allGroups);
      return item(app.name, appIcon(app), !!g, () => {
        const local = g?.wins.find(w => (secScreens[w.hwnd] ?? 0) === SCREEN) || g?.wins[0];
        local ? focusWindow(local) : launchApp(app);
      });
    }),
    ...[...groups.values()].filter(g => !pinned.some(a => groupForApp(a, new Map([[g.exe.toLowerCase(), g]])))).map(g =>
      item(g.app?.name || prettyExe(g.exe), appIcon({ name: g.app?.name || prettyExe(g.exe), icon: g.app?.icon || g.icon }), true, () => focusWindow(g.wins[0]))));
  secReserve();
}

let secReserveKey = '';
function secReserve() {
  const dpr = devicePixelRatio || 1;
  const top = Math.ceil($('.sec-bar').getBoundingClientRect().bottom * dpr);
  const bottom = S.secDock === false ? 0 : Math.round((innerHeight - $('#sec-dock').getBoundingClientRect().top + 6) * dpr);
  const key = top + ',' + bottom;
  if (key === secReserveKey) return;
  secReserveKey = key;
  call('reserve', { top, bottom }).catch(() => {});
}

if (IS_SECONDARY) {
  addEventListener('DOMContentLoaded', () => {
    secBuild();
    setTimeout(async () => {
      await loadApps().catch(() => {});
      secTick();
      setInterval(secTick, 15000);
      secPoll();
    }, 300);
    addEventListener('resize', () => { secReserveKey = ''; secReserve(); });
  });
  // Settings from the main screen (wallpaper, theme, Dock) arrive as state.
  const baseRemote = onRemoteState;
  // eslint-disable-next-line no-global-assign
  onRemoteState = function (next) { baseRemote(next); secKey = ''; secRender(); };
}

/* ---------- Settings ---------- */

{
  const displaysPage = PAGES.displays;
  PAGES.displays = () => [
    ...displaysPage(),
    section('Other displays'),
    group(
      row('Haven on every display', 'Other screens get their own wallpaper, a menu bar and a Dock with your apps.',
        toggle(S.otherDisplays !== false, v => { setPref('otherDisplays', v); call('setOtherDisplays', { on: v }); })),
      row('Dock on other displays', 'Your Dock apps, plus what’s running on that screen.', toggle(S.secDock !== false, v => setPref('secDock', v)))),
  ];
}
