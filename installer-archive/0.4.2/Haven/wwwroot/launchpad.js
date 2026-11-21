'use strict';

/* =========================================================================
   Launchpad: pages of apps with page dots, swiping or scrolling between pages,
   folders (drag one app onto another), rearranging, and dragging apps into the
   Dock. Typing searches every app, including the ones inside folders.
   ========================================================================= */

let lpPage = 0;
let lpWheelLock = 0;
let lpDrag = null;      // id of the app or folder being dragged
let lpOpenFolder = null;

/** The saved layout: app ids and { folder, name, apps } entries, with new apps added at the end. */
function launchpadLayout() {
  const known = new Set(apps.map(a => a.id));
  const placed = new Set();
  const layout = [];
  for (const entry of S.lpOrder || []) {
    if (typeof entry === 'string') {
      if (known.has(entry) && !placed.has(entry)) { layout.push(entry); placed.add(entry); }
    } else if (entry?.folder) {
      const list = entry.apps.filter(id => known.has(id) && !placed.has(id));
      list.forEach(id => placed.add(id));
      if (list.length) layout.push({ ...entry, apps: list });
    }
  }
  for (const a of apps) if (!placed.has(a.id)) layout.push(a.id);
  if (games.length) layout.push({ folder: 'games', name: 'Games', apps: [], games: true });
  return layout;
}

function saveLayout(layout) {
  S.lpOrder = layout.filter(e => !(e && e.games));
  save();
}

function pageSize() {
  const box = $('#launchpad-grid');
  const w = box.clientWidth || innerWidth * 0.9, hgt = (box.clientHeight || innerHeight * 0.7) - 40;
  const cols = Math.max(3, Math.floor(w / 128)), rows = Math.max(2, Math.floor(hgt / 132));
  return { cols, rows, per: cols * rows };
}

function renderLaunchpad() {
  const grid = $('#launchpad-grid');
  const q = $('#launchpad-search').value.trim().toLowerCase();
  if (!apps.length) {
    grid.replaceChildren(h('div', { class: 'empty', text: 'Finding your apps…' }));
    return;
  }

  // Searching shows one flat list of matches.
  if (q) {
    const hits = [...apps, ...games].filter(a => a.name.toLowerCase().includes(q));
    grid.classList.add('searching');
    grid.replaceChildren(hits.length
      ? h('div', { class: 'grid' }, hits.map(a => games.includes(a) ? gameTile(a) : appTile(a)))
      : h('div', { class: 'empty', text: `No results for “${q}”` }));
    return;
  }
  grid.classList.remove('searching');

  const layout = launchpadLayout();
  const { cols, per } = pageSize();
  const pages = Math.max(1, Math.ceil(layout.length / per));
  lpPage = Math.min(lpPage, pages - 1);

  const track = h('div', { class: 'lp-track', style: `transform: translateX(${-lpPage * 100}%)` });
  for (let p = 0; p < pages; p++) {
    track.append(h('div', { class: 'lp-page', style: `grid-template-columns: repeat(${cols}, 1fr)` },
      layout.slice(p * per, (p + 1) * per).map(entry => typeof entry === 'string' ? appTile(appById.get(entry)) : folderTile(entry))));
  }
  const dots = h('div', { class: 'lp-dots' }, Array.from({ length: pages }, (_, i) =>
    h('button', { class: i === lpPage ? 'on' : '', 'aria-label': `Page ${i + 1}`, onclick: () => goPage(i) })));
  grid.replaceChildren(track, pages > 1 ? dots : null);
  if (lpOpenFolder) showFolder(lpOpenFolder);
}

function goPage(i) {
  const pages = $$('.lp-page').length;
  lpPage = Math.max(0, Math.min(pages - 1, i));
  const track = $('.lp-track');
  if (track) track.style.transform = `translateX(${-lpPage * 100}%)`;
  $$('.lp-dots button').forEach((b, n) => b.classList.toggle('on', n === lpPage));
}

function appTile(app) {
  if (!app) return null;
  const el = h('button', { class: 'tile', title: app.name, draggable: 'true' }, appIcon(app), h('span', { class: 'name', text: app.name }));
  el.dataset.id = app.id;
  el.addEventListener('click', () => { closeOverlays(); launchApp(app); });
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    showMenu(e.clientX, e.clientY, [
      { label: 'Open', action: () => { closeOverlays(); launchApp(app); } },
      '-',
      isPinned(app.id) ? { label: 'Remove from Dock', action: () => unpin(app.id) } : { label: 'Keep in Dock', action: () => pin(app.id) },
      inFolder(app.id) && { label: 'Remove from Folder', action: () => removeFromFolder(app.id) },
      '-',
      ...iconMenuItems('app:' + app.id),
    ]);
  });
  wireTileDrag(el, app.id);
  return el;
}

function gameTile(game) {
  const el = h('button', { class: 'tile game', title: game.name }, appIcon(game), h('span', { class: 'name', text: game.name }));
  el.addEventListener('click', () => { closeOverlays(); launchGame(game); });
  return el;
}

function folderTile(folder) {
  const members = folder.games ? games.slice(0, 9) : folder.apps.slice(0, 9).map(id => appById.get(id)).filter(Boolean);
  const el = h('button', { class: 'tile folder', title: folder.name, draggable: folder.games ? null : 'true' },
    h('div', { class: 'folder-icon' }, members.map(a => appIcon(a))),
    h('span', { class: 'name', text: folder.name }));
  el.dataset.folder = folder.folder;
  el.addEventListener('click', () => showFolder(folder.folder));
  if (!folder.games) wireTileDrag(el, folder.folder);
  return el;
}

function inFolder(id) {
  return (S.lpOrder || []).some(e => e?.folder && e.apps.includes(id));
}

function removeFromFolder(id) {
  const layout = launchpadLayout().map(e => e?.folder && !e.games ? { ...e, apps: e.apps.filter(x => x !== id) } : e).filter(e => !(e?.folder && !e.games && !e.apps.length));
  layout.push(id);
  saveLayout(layout);
  renderLaunchpad();
}

/* ---------- Folders ---------- */

function showFolder(folderId) {
  lpOpenFolder = folderId;
  const folder = launchpadLayout().find(e => e?.folder === folderId);
  $('#lp-folder')?.remove();
  if (!folder) { lpOpenFolder = null; return; }
  const items = folder.games ? games : folder.apps.map(id => appById.get(id)).filter(Boolean);
  const name = h('input', { class: 'folder-name', value: folder.name, readonly: folder.games ? true : null, spellcheck: 'false' });
  name.addEventListener('change', () => {
    const layout = launchpadLayout().map(e => e?.folder === folderId ? { ...e, name: name.value.trim() || 'Folder' } : e);
    saveLayout(layout);
  });
  const panel = h('div', { class: 'folder-panel' }, name,
    h('div', { class: 'grid' }, items.map(a => folder.games ? gameTile(a) : appTile(a))),
    !folder.games && h('div', { class: 'folder-hint', text: 'Drag an app out of the folder to remove it.' }));
  const overlay = h('div', { class: 'lp-folder', id: 'lp-folder' }, panel);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) { lpOpenFolder = null; overlay.remove(); } });
  // Dropping an app outside the folder panel takes it out of the folder.
  overlay.addEventListener('dragover', e => { if (lpDrag && !panel.contains(e.target)) e.preventDefault(); });
  overlay.addEventListener('drop', e => {
    if (!lpDrag || panel.contains(e.target)) return;
    e.preventDefault();
    const id = lpDrag;
    lpOpenFolder = null;
    removeFromFolder(id);
  });
  $('#launchpad .launchpad-inner').append(overlay);
}

/* ---------- Dragging: rearrange, make folders, or drop into the Dock ---------- */

function wireTileDrag(el, id) {
  el.addEventListener('dragstart', e => {
    lpDrag = id;
    e.dataTransfer.setData('text/haven-app', id.startsWith('f-') ? '' : id);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('drag-source');
    // Let the Dock underneath show through so apps can be dropped into it.
    setTimeout(() => $('#launchpad').classList.add('dragging-out'), 0);
  });
  el.addEventListener('dragend', () => {
    lpDrag = null;
    el.classList.remove('drag-source');
    $('#launchpad').classList.remove('dragging-out');
    $$('.tile.drop-into, .tile.drop-before').forEach(t => t.classList.remove('drop-into', 'drop-before'));
  });
  el.addEventListener('dragover', e => {
    if (!lpDrag || lpDrag === id) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const intoZone = e.clientX > r.left + r.width * 0.28 && e.clientX < r.right - r.width * 0.28;
    // Folders can't go inside folders.
    const canNest = !lpDrag.startsWith('f-');
    el.classList.toggle('drop-into', intoZone && canNest);
    el.classList.toggle('drop-before', !intoZone || !canNest);
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-into', 'drop-before'));
  el.addEventListener('drop', e => {
    if (!lpDrag || lpDrag === id) return;
    e.preventDefault();
    e.stopPropagation();
    const into = el.classList.contains('drop-into');
    el.classList.remove('drop-into', 'drop-before');
    dropOnTile(lpDrag, id, into);
  });
}

function dropOnTile(dragId, targetId, into) {
  let layout = launchpadLayout().filter(e => !(e?.games));
  // Take the dragged item out of wherever it is.
  let dragged = null;
  layout = layout.map(e => {
    if (e === dragId) { dragged = e; return null; }
    if (e?.folder === dragId) { dragged = e; return null; }
    if (e?.folder && e.apps.includes(dragId)) { dragged = dragId; return { ...e, apps: e.apps.filter(x => x !== dragId) }; }
    return e;
  }).filter(e => e && !(e.folder && !e.apps.length));
  if (!dragged) return;

  const idx = layout.findIndex(e => e === targetId || e?.folder === targetId);
  if (idx < 0) layout.push(dragged);
  else if (into && typeof dragged === 'string') {
    const target = layout[idx];
    if (typeof target === 'string') {
      layout[idx] = { folder: 'f-' + Date.now().toString(36), name: suggestFolderName(target, dragged), apps: [target, dragged] };
    } else {
      layout[idx] = { ...target, apps: [...target.apps, dragged] };
    }
  } else {
    layout.splice(idx, 0, dragged);
  }
  saveLayout(layout);
  Sound.play('drop');
  renderLaunchpad();
}

/** A folder name from what the two apps have in common (same maker or kind), like a Mac does. */
function suggestFolderName(a, b) {
  const n1 = appById.get(a)?.name || '', n2 = appById.get(b)?.name || '';
  const first = n1.split(' ')[0];
  if (first.length > 2 && n2.startsWith(first)) return first;
  const words = { Games: /game|steam|epic|xbox|minecraft|launcher/i, Creativity: /photo|paint|figma|design|studio|blender|obs|video/i,
    Productivity: /word|excel|powerpoint|outlook|onenote|notion|office|docs/i, Social: /discord|slack|teams|whatsapp|telegram|zoom/i,
    Development: /code|visual studio|terminal|git|python|node|powershell/i, Utilities: /calculator|clock|settings|manager|tool|notepad/i };
  for (const [name, re] of Object.entries(words)) if (re.test(n1) && re.test(n2)) return name;
  return 'Folder';
}

/* ---------- Paging with the wheel, trackpad, keys and edge swipes ---------- */

function initLaunchpadPaging() {
  const lp = $('#launchpad');
  lp.addEventListener('wheel', e => {
    if ($('#launchpad-search').value.trim() || lpOpenFolder) return;
    const now = Date.now();
    if (now < lpWheelLock) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 25) return;
    lpWheelLock = now + 450;
    goPage(lpPage + (d > 0 ? 1 : -1));
  }, { passive: true });
  lp.addEventListener('keydown', e => {
    if (e.target.id === 'launchpad-search' && e.target.value) return;
    if (e.key === 'ArrowRight') goPage(lpPage + 1);
    else if (e.key === 'ArrowLeft') goPage(lpPage - 1);
  });
  addEventListener('resize', () => { if (!lp.hidden) renderLaunchpad(); });
}

addEventListener('DOMContentLoaded', () => { if (IS_SHELL) initLaunchpadPaging(); });
