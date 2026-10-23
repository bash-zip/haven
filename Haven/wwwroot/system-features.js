'use strict';

/* =========================================================================
   System tray, Spaces, the app's own menus, screenshots, Notification Center,
   screen saver, Stage Manager, and updates. (Shell layer.)
   ========================================================================= */

/* ---------- System tray in the menu bar ---------- */

let trayIcons = [];

function renderTray() {
  const box = $('#tray');
  box.hidden = !S.trayIcons || !trayIcons.length;
  box.replaceChildren(...trayIcons.map(icon => {
    const btn = h('button', { class: 'menu-icon tray-icon', title: icon.title || '' },
      icon.icon ? h('img', { src: icon.icon, alt: '' }) : h('span', { text: (icon.title || '?').charAt(0) }));
    const send = (button, e) => {
      // The app expects the click where its icon is on screen, in physical pixels.
      const r = btn.getBoundingClientRect(), dpr = devicePixelRatio;
      call('trayClick', { id: icon.id, button, x: Math.round((r.left + r.width / 2) * dpr), y: Math.round(r.bottom * dpr) });
      e.preventDefault();
      e.stopPropagation();
    };
    btn.addEventListener('click', e => send('left', e));
    btn.addEventListener('dblclick', e => send('double', e));
    btn.addEventListener('contextmenu', e => send('right', e));
    return btn;
  }));
  requestAnimationFrame(updateRegion);
}

async function setTrayIcons(on) {
  S.trayIcons = on;
  save();
  try { trayIcons = await call('setTray', { on }) || []; } catch { trayIcons = []; }
  renderTray();
}

/* ---------- The app's own menus ---------- */

let appMenuFor = 0;
let appMenuNames = [];

async function refreshAppMenus() {
  const w = activeWindow();
  const hwnd = w?.hwnd || 0;
  if (hwnd === appMenuFor) return;
  appMenuFor = hwnd;
  appMenuNames = [];
  if (hwnd && S.appMenus) {
    try { appMenuNames = await call('appMenus', { hwnd }) || []; } catch { appMenuNames = []; }
    if (appMenuFor !== hwnd) return; // focus moved on while we were asking
  }
  renderAppMenus();
}

function renderAppMenus() {
  const native = $('#app-menus');
  const ours = $$('[data-menu="file"], [data-menu="view"], [data-menu="go"], [data-menu="window"]');
  const show = appMenuNames.length > 0;
  ours.forEach(el => { el.style.display = show ? 'none' : ''; });
  native.replaceChildren(...appMenuNames.map((name, index) => h('button', {
    class: 'menu-title', text: name,
    onclick: () => call('openAppMenu', { hwnd: appMenuFor, index }).catch(err => toast(err.message)),
  })));
}

/* ---------- Spaces ---------- */

async function spacesMenuItems() {
  let res = { list: [], current: 0 };
  try { res = await call('desktops') || res; } catch { /* ignore */ }
  return [
    ...res.list.map(d => ({ label: d.name, checked: d.index === res.current, action: () => call('switchDesktop', { index: d.index }) })),
    '-',
    { label: 'New Desktop', hint: 'Ctrl+Win+D', action: () => call('newDesktop') },
    { label: 'Next Desktop', hint: 'Ctrl+Win+→', action: () => call('stepDesktop', { direction: 1 }) },
    { label: 'Previous Desktop', hint: 'Ctrl+Win+←', action: () => call('stepDesktop', { direction: -1 }) },
    res.list.length > 1 && { label: 'Close This Desktop', hint: 'Ctrl+Win+F4', action: () => call('closeDesktop') },
  ];
}

/* ---------- Screenshots ---------- */

let shotTimer;

function onScreenshot({ path, url }) {
  Sound.play('shutter');
  if (!path) {
    // Clipboard only: nothing was saved, so the preview just confirms the copy.
    notify('Screenshot copied', 'Paste it anywhere with Ctrl + V.', { image: url });
    const el = $('#shot-preview');
    el.replaceChildren(h('img', { src: url, alt: '' }));
    el.onclick = () => { el.hidden = true; updateRegion(); };
    el.oncontextmenu = e => e.preventDefault();
    el.hidden = false;
    el.classList.remove('leaving');
    updateRegion();
    clearTimeout(shotTimer);
    shotTimer = setTimeout(() => { el.classList.add('leaving'); setTimeout(() => { el.hidden = true; updateRegion(); }, 300); }, 4000);
    return;
  }
  notify('Screenshot saved', path.split('\\').pop(), { path, image: url });
  // A small floating preview in the corner, as on a Mac. Click to open; it slides away on its own.
  const el = $('#shot-preview');
  el.replaceChildren(h('img', { src: url, alt: '' }));
  el.onclick = () => { el.hidden = true; updateRegion(); call('openPath', { path }); };
  el.oncontextmenu = e => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY, [
      { label: 'Open', action: () => call('openPath', { path }) },
      { label: 'Show in File Explorer', action: () => call('revealPath', { path }) },
    ]);
  };
  el.hidden = false;
  el.classList.remove('leaving');
  updateRegion();
  clearTimeout(shotTimer);
  shotTimer = setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => { el.hidden = true; updateRegion(); }, 300);
  }, 5000);
}

/* ---------- Notification Center ---------- */

const notifications = [];

/** Keeps a note in Notification Center. */
function notify(title, body, extra = {}) {
  notifications.unshift({ title, body, time: Date.now(), ...extra });
  notifications.splice(40);
  if (!$('#nc').hidden) renderNotificationCenter();
}

function toggleNotificationCenter() {
  const nc = $('#nc');
  if (!nc.hidden) { closeOverlays(); return; }
  closeOverlays();
  nc.hidden = false;
  renderNotificationCenter();
  syncShell();
  loadNcEvents();
}

let ncEvents = null;

async function loadNcEvents() {
  try { ncEvents = await call('events'); } catch { ncEvents = null; }
  if (!$('#nc').hidden) renderNotificationCenter();
}

function renderNotificationCenter() {
  const panel = $('#nc-panel');
  const now = new Date();
  const timeAgo = t => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'now' : m < 60 ? `${m}m ago` : new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !S.clock24 });
  };
  const events = ncEvents?.available ? ncEvents.events : [];
  const m = media;
  panel.replaceChildren(
    h('div', { class: 'nc-date' }, h('b', { text: now.toLocaleDateString(undefined, { weekday: 'long' }) }),
      h('span', { text: now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) })),

    h('div', { class: 'nc-head' }, h('span', { text: 'Notifications' }),
      notifications.length ? h('button', { class: 'link', text: 'Clear', onclick: () => { notifications.length = 0; renderNotificationCenter(); } }) : null),
    notifications.length
      ? h('div', { class: 'nc-list' }, notifications.map(n => h('div', {
          class: 'nc-card', onclick: () => { if (n.path) { closeOverlays(); call('openPath', { path: n.path }); } else if (n.hwnd) { closeOverlays(); call('focus', { hwnd: n.hwnd }); } },
        },
        n.image ? h('img', { class: 'nc-thumb', src: n.image, alt: '' }) : null,
        h('div', { class: 'nc-text' }, h('div', { class: 'nc-row' }, h('b', { text: n.title }), h('small', { text: timeAgo(n.time) })), n.body && h('span', { text: n.body })))))
      : h('div', { class: 'nc-empty', text: 'No notifications' }),

    m && h('div', { class: 'nc-head' }, h('span', { text: 'Now Playing' })),
    m && h('div', { class: 'nc-card nc-media' },
      h('span', { class: 'cc-art', style: m.art ? `background-image:url("${m.art}")` : '' }, m.art ? null : svg(ICONS.music)),
      h('div', { class: 'nc-text' }, h('b', { text: m.title }), h('span', { text: m.artist || sourceName(m.app) })),
      h('button', { class: 'cc-mute', onclick: async () => { await call('mediaControl', { action: 'toggle' }); setTimeout(async () => { await refreshMedia(); renderNotificationCenter(); }, 350); } },
        svg(m.playing ? ICONS.pause : ICONS.play))),

    h('div', { class: 'nc-head' }, h('span', { text: 'Up Next' })),
    events.length
      ? h('div', { class: 'nc-list' }, events.map(ev => {
          const start = new Date(ev.start);
          return h('div', { class: 'nc-card' }, h('i', { class: 'event-dot' }), h('div', { class: 'nc-text' },
            h('b', { text: ev.title || 'Untitled' }),
            h('span', { text: ev.allDay ? 'All day' : start.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: !S.clock24 }) })));
        }))
      : h('div', { class: 'nc-empty', text: ncEvents?.available === false ? 'Calendar isn’t shared with Haven.' : 'Nothing scheduled.' }),
  );
}

/* ---------- Screen saver ---------- */

let saverOn = false;
let saverReturnTo = 0;

async function pollIdle() {
  setTimeout(pollIdle, 5000);
  const minutes = Number(S.saverMinutes) || 0;
  if (!minutes || saverOn || isLocked()) return;
  // Not while something is playing (a video, music) or a menu or window of Haven is open.
  if (media?.playing || anyOverlayOpen()) return;
  let idle = 0;
  try { idle = (await call('idle'))?.seconds || 0; } catch { return; }
  if (idle >= minutes * 60) startSaver();
}

function startSaver() {
  saverOn = true;
  saverReturnTo = foreground;
  const el = $('#saver');
  el.hidden = false;
  tickSaver();
  el._timer = setInterval(tickSaver, 1000);
  syncShell();
  // Ignore the first moment so the mouse settling doesn't end it immediately.
  setTimeout(() => { el.dataset.ready = '1'; }, 800);
}

function tickSaver() {
  const now = new Date();
  $('#saver-time').textContent = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !S.clock24 }).replace(/\s?[AP]M$/i, '');
  $('#saver-date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function endSaver() {
  const el = $('#saver');
  if (!saverOn || !el.dataset.ready) return;
  saverOn = false;
  delete el.dataset.ready;
  clearInterval(el._timer);
  el.hidden = true;
  syncShell();
  if (S.saverLock) lockScreen();
  else if (saverReturnTo) call('focus', { hwnd: saverReturnTo });
}

/* ---------- Stage Manager ---------- */

async function setStageManager(on) {
  S.stageManager = on;
  save();
  try { await call('setStage', { on }); } catch (err) { toast(err.message); }
  if (!$('#control-center').hidden) renderControlCenter();
  refreshSettingsPage();
}

/* ---------- Updates (installed copies) ---------- */

let updateInfo = null;

async function checkForUpdate(ask) {
  try { updateInfo = await call('updateStatus', { force: !ask }); } catch { return; }
  if (updateInfo?.available && ask) {
    const v = updateInfo.latest ? `Haven ${updateInfo.latest}` : 'A newer version of Haven';
    notify('Update available', `${v} is ready to install.`);
    if (await confirmDialog('Update Haven?', `${v} is ready.${updateInfo.notes ? ' ' + updateInfo.notes : ''} Haven will restart to install it; your apps keep running and your settings stay as they are.`, 'Update and Restart'))
      call('applyUpdate').catch(err => toast(err.message));
  }
  refreshSettingsPage();
}

/* ---------- Wiring into menus, Control Center, hot corners and events ---------- */

{
  const baseWindow = MENUS.window;
  MENUS.window = () => [
    ...baseWindow().slice(0, 2),
    { label: S.stageManager ? 'Turn Off Stage View' : 'Turn On Stage View', action: () => setStageManager(!S.stageManager) },
    '-',
    { label: 'Spaces…', action: async () => { const r = $('[data-menu="window"]').getBoundingClientRect(); showMenu(r.left, r.bottom + 3, await spacesMenuItems()); } },
    ...baseWindow().slice(2),
  ];
  const baseFile = MENUS.file;
  MENUS.file = () => [
    ...baseFile(),
    '-',
    { label: 'Screenshot of Screen', hint: 'Ctrl+Shift+3', action: () => setTimeout(() => call('screenshot', { region: false }), 250) },
    { label: 'Screenshot of Area…', hint: 'Ctrl+Shift+4', action: () => setTimeout(() => call('screenshot', { region: true }), 250) },
  ];
}

ACTIONS.notifications = ['Notifications', () => toggleNotificationCenter()];
ACTIONS.stage = ['Stage View on/off', () => setStageManager(!S.stageManager)];
ACTIONS.saver = ['Start Screen Saver', () => startSaver()];

// Control Center gets a Stage Manager tile.
{
  const baseRender = renderControlCenter;
  // eslint-disable-next-line no-global-assign
  renderControlCenter = function () {
    baseRender();
    const grid = $('#cc-panel .cc-col');
    if (grid && !grid.querySelector('.cc-stage')) {
      grid.append(h('button', { class: 'cc-block cc-square cc-stage' + (S.stageManager ? ' on' : ''), onclick: () => setStageManager(!S.stageManager) },
        h('span', { class: 'cc-tile-icon' }, svg('<svg viewBox="0 0 20 20"><rect x="7" y="4" width="10" height="12" rx="2" fill="currentColor"/><rect x="2" y="5" width="3" height="4" rx="1" fill="currentColor" opacity=".6"/><rect x="2" y="11" width="3" height="4" rx="1" fill="currentColor" opacity=".6"/></svg>')),
        h('span', { text: 'Stage View' })));
    }
  };
}

// Toasts and attention requests also land in Notification Center.
{
  const baseToast = toast;
  // eslint-disable-next-line no-global-assign
  toast = function (text) { baseToast(text); if (IS_SHELL) notify('Haven', text); };
  const baseAttention = onAttention;
  // eslint-disable-next-line no-global-assign
  onAttention = function (hwnd) {
    baseAttention(hwnd);
    const w = windows.find(x => x.hwnd === hwnd);
    if (w && w.hwnd !== foreground) notify(appForWindow(w)?.name || prettyExe(w.exe), w.title, { hwnd });
  };
  const baseEvent = onHostEvent;
  // eslint-disable-next-line no-global-assign
  onHostEvent = function (name, data) {
    if (name === 'tray') { trayIcons = data || []; renderTray(); return; }
    if (name === 'screenshot') { onScreenshot(data); return; }
    return baseEvent(name, data);
  };
  const baseActive = renderActiveApp;
  // eslint-disable-next-line no-global-assign
  renderActiveApp = function () { baseActive(); if (IS_SHELL) refreshAppMenus(); };
  const baseClose = closeOverlays;
  // eslint-disable-next-line no-global-assign
  closeOverlays = function () { baseClose(); $('#nc').hidden = true; if (saverOn) endSaver(); };
}

Sound.shutter = true;
{
  const basePlay = Sound.play.bind(Sound);
  Sound.play = function (kind) {
    if (kind !== 'shutter') return basePlay(kind);
    if (!S.uiSounds || S.dnd) return;
    try { this.tone(1800, 0, 0.05, { type: 'square', gain: 0.03, attack: 0.001 }); this.tone(900, 0.06, 0.07, { type: 'square', gain: 0.025, attack: 0.001 }); } catch { /* ignore */ }
  };
}

addEventListener('DOMContentLoaded', () => {
  if (PART !== 'shell' && PART !== 'preview') return;
  $('#menubar-clock').addEventListener('click', toggleNotificationCenter);
  $('#nc').addEventListener('mousedown', e => { if (e.target.id === 'nc') closeOverlays(); });
  const saver = $('#saver');
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel']) saver.addEventListener(ev, endSaver);
  setTimeout(async () => {
    try { trayIcons = await call('trayIcons') || []; } catch { trayIcons = []; }
    renderTray();
    pollIdle();
    checkForUpdate(true);
  }, 1500);
});
