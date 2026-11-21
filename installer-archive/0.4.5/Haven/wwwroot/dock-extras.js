'use strict';

/* =========================================================================
   Dock extras: any folder as a stack, a "recent apps" section, and Quick Look
   (Space) for files in search results and stacks.
   ========================================================================= */

/* ---------- Folder stacks ---------- */

async function openFolderStack(anchor, folder, title, openPath) {
  const pop = $('#stack-pop');
  if (!pop.hidden && pop.dataset.folder === folder) { closeOverlays(); return; }
  closeOverlays();
  pop.dataset.folder = folder;
  const panel = $('#stack-panel');
  const r = anchor.getBoundingClientRect();
  panel.style.left = Math.max(12, Math.min(innerWidth - 392, r.left + r.width / 2 - 190)) + 'px';
  panel.style.bottom = (innerHeight - r.top + 14) + 'px';
  panel.replaceChildren(h('div', { class: 'muted', style: 'padding:24px; text-align:center', text: 'Loading…' }));
  pop.hidden = false;
  syncShell();
  Sound.play('open');
  let items = [];
  try { items = await call('recentFiles', { folder, count: 16 }) || []; } catch { /* ignore */ }
  stackFocus = 0;
  stackItems = items;
  panel.replaceChildren(
    h('div', { class: 'stack-head' }, h('b', { text: title }),
      h('button', { class: 'link', text: 'Open in File Explorer ↗', onclick: () => { closeOverlays(); openFolder(openPath || folder); } })),
    items.length ? h('div', { class: 'stack-grid' }, items.map((f, i) => {
      const el = h('button', { class: 'stack-item', title: f.name, 'data-i': i },
        f.icon ? h('img', { src: f.icon, alt: '' }) : f.isFolder ? svg(ICONS.folder) : letterIcon(f.name),
        h('span', { text: f.name }));
      el.addEventListener('click', () => { closeOverlays(); call('openPath', { path: f.path }).catch(err => toast(err.message)); });
      el.addEventListener('mouseenter', () => { stackFocus = i; });
      el.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showMenu(e.clientX, e.clientY, [
          { label: 'Open', action: () => { closeOverlays(); call('openPath', { path: f.path }); } },
          { label: 'Quick Look', hint: 'Space', action: () => openQuickLook(f.path) },
          { label: 'Show in File Explorer', action: () => { closeOverlays(); call('revealPath', { path: f.path }); } },
        ]);
      });
      return el;
    })) : h('div', { class: 'muted', style: 'padding:24px; text-align:center', text: 'This folder is empty.' }));
  pop.focus?.();
}

let stackItems = [];
let stackFocus = 0;

// The Downloads stack uses the same popup (and gains Quick Look with Space).
// eslint-disable-next-line no-global-assign
openDownloadsStack = anchor => openFolderStack(anchor, 'downloads', 'Downloads', env.downloads);

async function addFolderToDock() {
  const path = await call('pickFolder', { title: 'Add a folder to the Dock' }).catch(() => null);
  if (!path) return;
  const list = (S.dockFolders || []).filter(f => f.path.toLowerCase() !== path.toLowerCase());
  setPref('dockFolders', [...list, { path, name: path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path }]);
}

/* ---------- Recent apps ---------- */

function noteRecentApp(app) {
  if (!app?.id) return;
  const list = [app.id, ...(S.recentApps || []).filter(id => id !== app.id)].slice(0, 12);
  if (JSON.stringify(list) === JSON.stringify(S.recentApps)) return;
  S.recentApps = list;
  save();
}

{
  const baseLaunch = launchApp;
  // eslint-disable-next-line no-global-assign
  launchApp = function (app, el) { noteRecentApp(app); return baseLaunch(app, el); };
  const baseActivate = activateGroup;
  // eslint-disable-next-line no-global-assign
  activateGroup = function (group, el, app) { noteRecentApp(app || group?.app); return baseActivate(group, el, app); };
}

/* ---------- Putting them in the Dock ---------- */

{
  const baseRender = renderDock;
  // eslint-disable-next-line no-global-assign
  renderDock = function (force = false) {
    baseRender(force);
    if (!IS_SHELL) return;
    const dock = $('#dock');
    const pinned = new Set(S.dock || []);
    const runningIds = new Set([...groupWindows().values()].map(g => g.app?.id).filter(Boolean));
    const recents = S.dockRecents ? (S.recentApps || []).filter(id => !pinned.has(id) && !runningIds.has(id)).map(id => appById.get(id)).filter(Boolean).slice(0, 3) : [];
    const key = JSON.stringify([recents.map(a => a.id), S.dockFolders || []]);
    if (dock.dataset.extras === key && dock.querySelector('.dock-extra, .dock-extras-none')) return;
    dock.dataset.extras = key;
    dock.querySelectorAll('.dock-extra, .dock-extras-none').forEach(e => e.remove());
    if (!recents.length && !(S.dockFolders || []).length) { dock.append(h('span', { class: 'dock-extras-none', hidden: true })); return; }

    // Recent apps: their own little section before the system items, like on a Mac.
    const firstSep = dock.querySelector('.dock-sep');
    if (recents.length && firstSep) {
      const sep = h('div', { class: 'dock-sep dock-extra' });
      firstSep.before(sep);
      for (const app of recents) {
        const el = dockItem({ label: app.name, icon: appIcon(app), appId: app.id, kind: 'recent', onClick: e => launchApp(app, e),
          menu: () => [{ label: 'Open', action: el2 => launchApp(app, el2) }, { label: 'Keep in Dock', action: () => pin(app.id) },
            { label: 'Remove from Recents', action: () => { S.recentApps = (S.recentApps || []).filter(id => id !== app.id); save(); renderDock(true); } }] });
        el.classList.add('dock-extra');
        firstSep.before(el);
      }
    }

    // Folder stacks sit next to Downloads.
    const anchor = dock.querySelector('[data-tile="trash"]');
    for (const f of S.dockFolders || []) {
      const el = dockItem({ label: f.name, icon: h('div', { class: 'folder-tile' }, svg(ICONS.folder)), kind: 'folder', dropFolder: true,
        onClick: e => openFolderStack(e, f.path, f.name),
        menu: () => [
          { label: 'Open in File Explorer', action: () => openFolder(f.path) },
          '-',
          { label: 'Remove from Dock', action: () => setPref('dockFolders', (S.dockFolders || []).filter(x => x !== f)) },
        ] });
      el.classList.add('dock-extra');
      anchor ? anchor.before(el) : dock.append(el);
    }
  };
}

/* ---------- Quick Look with Space ---------- */

document.addEventListener('keydown', e => {
  if (e.key !== ' ' || !IS_SHELL) return;
  // In a stack: preview the file under the pointer.
  if (!$('#stack-pop').hidden && stackItems[stackFocus]) { e.preventDefault(); openQuickLook(stackItems[stackFocus].path); return; }
  // In search: Shift + Space previews the highlighted file (plain Space keeps typing).
  if (!$('#spotlight').hidden && e.shiftKey) {
    const entry = spotlightResults[spotlightIndex];
    if (entry?.kind === 'file') { e.preventDefault(); openQuickLook(entry.path); }
  }
}, true);

// Search results get a right-click menu with Quick Look too.
{
  const baseSearch = search;
  // eslint-disable-next-line no-global-assign
  search = function (query) {
    return baseSearch(query).map(e => e.kind === 'file' && !e.menu ? {
      ...e, hint: 'Shift + Space to preview',
      menu: () => [
        { label: 'Open', action: () => { closeOverlays(); call('openPath', { path: e.path }); } },
        { label: 'Quick Look', action: () => openQuickLook(e.path) },
        { label: 'Show in File Explorer', action: () => { closeOverlays(); call('revealPath', { path: e.path }); } },
      ],
    } : e);
  };
}

/* ---------- Settings ---------- */

{
  const desktopPage = PAGES.desktop;
  PAGES.desktop = () => [
    ...desktopPage(),
    section('Dock folders & recents'),
    group(
      row('Show recent apps in the Dock', 'Up to three apps you used recently that aren’t kept in the Dock.', toggle(!!S.dockRecents, v => setPref('dockRecents', v))),
      ...(S.dockFolders || []).map(f => row(f.name, f.path, button('Remove', () => setPref('dockFolders', (S.dockFolders || []).filter(x => x !== f))))),
      row('Add a folder to the Dock', 'It opens as a stack of its newest files, like Downloads.', button('Add Folder…', addFolderToDock, true))),
  ];
}

/* ---------- Dock icon positions (for windows shrinking into their icon) ---------- */

let dockIconsKey = '';
let dockIconsTimer;
function sendDockIcons() {
  clearTimeout(dockIconsTimer);
  dockIconsTimer = setTimeout(() => {
    if (!IS_SHELL || !host) return;
    const dpr = devicePixelRatio || 1;
    const icons = {};
    for (const el of $$('#dock .dock-item[data-exe]')) {
      const r = el.getBoundingClientRect();
      if (r.width) icons[el.dataset.exe] = [r.left, r.top, r.right, r.bottom].map(v => Math.round(v * dpr));
    }
    // Windows of apps that aren't in the Dock fly to the middle of it.
    const key = JSON.stringify(icons);
    if (key === dockIconsKey) return;
    dockIconsKey = key;
    call('setDockIcons', { icons }).catch(() => {});
  }, 400);
}

{
  const baseRender = renderDock;
  // eslint-disable-next-line no-global-assign
  renderDock = function (force) { baseRender(force); sendDockIcons(); };
}
addEventListener('resize', sendDockIcons);

{
  const desktopPage = PAGES.desktop;
  PAGES.desktop = () => [
    ...desktopPage(),
    section('Animations'),
    group(row('Minimize into the Dock', 'Windows shrink into their Dock icon when minimized and grow back out when restored (instead of Windows’ own animation).',
      toggle(S.windowAnimations !== false, v => { setPref('windowAnimations', v); call('setWindowAnimations', { on: v }); }))),
  ];
}
