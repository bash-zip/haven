'use strict';

/* =========================================================================
   Shell-layer features: Control Center, status icons, app switcher, trackpad
   gestures, hot corners, attention bounces, Dock drag & drop, the Downloads
   stack, Quick Look, the upgraded search, and interface sounds.
   ========================================================================= */

/** Like call(), but also hands the host real files (with paths) dropped on the page. */
function callWithFiles(type, args, files) {
  if (!host?.postMessageWithAdditionalObjects) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    host.postMessageWithAdditionalObjects({ id, type, args }, files);
  });
}

/* ---------- Sounds (synthesised; no audio files) ---------- */

const Sound = {
  ctx: null,
  get audio() { return this.ctx || (this.ctx = new AudioContext()); },
  tone(freq, start, dur, { type = 'sine', gain = 0.12, attack = 0.01 } = {}) {
    const a = this.audio, t = a.currentTime + start;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },
  play(kind) {
    if (kind === 'startup' ? !S.startupSound : (!S.uiSounds || S.dnd)) return;
    try {
      switch (kind) {
        case 'startup': // a warm, open chord that blooms and fades
          [261.6, 329.6, 392.0, 523.3, 659.3].forEach((f, i) => this.tone(f, i * 0.035, 2.6, { gain: 0.07, attack: 0.08 }));
          this.tone(130.8, 0, 2.8, { gain: 0.06, attack: 0.1 });
          break;
        case 'pop': this.tone(880, 0, 0.12, { gain: 0.08 }); this.tone(1320, 0.03, 0.1, { gain: 0.05 }); break;
        case 'tick': this.tone(1600, 0, 0.04, { type: 'triangle', gain: 0.05, attack: 0.002 }); break;
        case 'drop': this.tone(520, 0, 0.16, { gain: 0.1 }); this.tone(390, 0.06, 0.18, { gain: 0.08 }); break;
        case 'open': this.tone(660, 0, 0.18, { gain: 0.05, attack: 0.04 }); this.tone(990, 0.05, 0.2, { gain: 0.04, attack: 0.04 }); break;
        case 'switch': this.tone(1200, 0, 0.05, { type: 'triangle', gain: 0.035, attack: 0.002 }); break;
      }
    } catch { /* audio unavailable */ }
  },
};

/* ---------- Status icons & Control Center ---------- */

const STATUS_ICONS = {
  wifi: bars => `<svg viewBox="0 0 20 20" width="16" height="16"><path d="M2.5 8a11 11 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="${bars >= 4 ? 1 : 0.3}"/><path d="M5 10.8a7.2 7.2 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="${bars >= 3 ? 1 : 0.3}"/><path d="M7.5 13.5a3.5 3.5 0 0 1 5 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="${bars >= 2 ? 1 : 0.3}"/><circle cx="10" cy="16" r="1.3" fill="currentColor"/></svg>`,
  ethernet: '<svg viewBox="0 0 20 20" width="16" height="16"><rect x="4" y="3" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 12v5M6 17h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  offline: '<svg viewBox="0 0 20 20" width="16" height="16"><path d="M2.5 8a11 11 0 0 1 15 0M5 10.8a7.2 7.2 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".35"/><path d="M4 4l12 12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  volume: (level, muted) => `<svg viewBox="0 0 20 20" width="16" height="16"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor"/>${muted || level === 0
    ? '<path d="M13 8l4 4M17 8l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    : `<path d="M12.5 8a3 3 0 0 1 0 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>${level > 40 ? '<path d="M14.7 5.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' : ''}`}</svg>`,
};

let net = null, volume = null, brightness = null, radios = null;

async function pollStatus() {
  try { [net, volume] = await Promise.all([call('network'), call('volume')]); } catch { /* ignore */ }
  renderStatusIcons();
  if (!$('#control-center').hidden) renderControlCenter();
  setTimeout(pollStatus, 4000);
}

function renderStatusIcons() {
  const wifi = $('#wifi-status');
  if (net) {
    wifi.hidden = false;
    wifi.innerHTML = !net.connected ? STATUS_ICONS.offline : net.type === 'wifi' ? STATUS_ICONS.wifi(net.bars ?? 4) : STATUS_ICONS.ethernet;
    wifi.title = net.connected ? (net.name || 'Connected') + (net.internet ? '' : ' (no internet)') : 'Not connected';
  }
  const vol = $('#volume-status');
  if (volume) {
    vol.hidden = false;
    vol.innerHTML = STATUS_ICONS.volume(volume.level, volume.muted);
    vol.title = volume.muted ? 'Muted' : `Volume ${volume.level}%`;
  }
}

async function toggleControlCenter() {
  const cc = $('#control-center');
  if (!cc.hidden) { closeOverlays(); return; }
  closeOverlays();
  cc.hidden = false;
  renderControlCenter();
  syncShell();
  Sound.play('pop');
  try { [brightness, radios, volume, net] = await Promise.all([call('brightness'), call('radios'), call('volume'), call('network')]); } catch { /* ignore */ }
  if (!cc.hidden) renderControlCenter();
}

function ccTile(label, sub, on, icon, onclick, disabled) {
  return h('button', { class: 'cc-tile' + (on ? ' on' : '') + (disabled ? ' disabled' : ''), onclick: disabled ? null : onclick },
    h('span', { class: 'cc-tile-icon' }, svg(icon)), h('span', { class: 'cc-tile-text' }, h('b', { text: label }), h('span', { text: sub })));
}

function ccSlider(label, icon, value, onInput, onChange, extra) {
  const r = h('input', { type: 'range', min: '0', max: '100', step: '1', value: value ?? 0, class: 'cc-range' });
  const paint = () => r.style.setProperty('--fill', r.value + '%');
  paint();
  r.addEventListener('input', () => { paint(); onInput?.(Number(r.value)); });
  r.addEventListener('change', () => onChange?.(Number(r.value)));
  return h('div', { class: 'cc-block' }, h('div', { class: 'cc-label', text: label }),
    h('div', { class: 'cc-slider' }, h('span', { class: 'cc-slider-icon' }, svg(icon)), r, extra));
}

let volumeTimer;

function renderControlCenter() {
  const panel = $('#cc-panel');
  panel.className = `cc-panel customized cc-${['balanced', 'compact', 'spacious'].includes(S.controlCenterDensity) ? S.controlCenterDensity : 'balanced'}${S.controlCenterGlow ? ' cc-luminous' : ''}${S.controlCenterShape === 'sharp' ? ' cc-sharp' : ''}`;
  panel.style.setProperty('--cc-accent', S.controlCenterAccent || 'var(--accent)');
  panel.style.setProperty('--cc-scale', String(Math.max(.9, Math.min(1.15, Number(S.controlCenterScale) || 1))));
  const wifiOn = radios?.wifi ?? (net?.type === 'wifi');
  const btOn = radios?.bluetooth;
  const m = media;
  const setRadio = (kind, on) => call('setRadio', { kind, on }).then(r => { radios = r; renderControlCenter(); }).catch(err => toast(err.message));

  panel.replaceChildren(
    h('div', { class: 'cc-grid' },
      h('div', { class: 'cc-block cc-tiles' },
        ccTile('Wi-Fi', wifiOn ? (net?.type === 'wifi' ? net.name : 'On') : 'Off', wifiOn, NAV_ICONS.wifi,
          () => setRadio('wifi', !wifiOn), radios?.wifi == null),
        ccTile('Bluetooth', btOn ? 'On' : 'Off', btOn, NAV_ICONS.bluetooth, () => setRadio('bluetooth', !btOn), radios?.bluetooth == null),
        ccTile('Do Not Disturb', S.dnd ? 'On' : 'Off', S.dnd,
          '<svg viewBox="0 0 20 20"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" fill="currentColor"/></svg>',
          () => { S.dnd = !S.dnd; save(); renderControlCenter(); })),
      h('div', { class: 'cc-col' },
        h('button', { class: 'cc-block cc-square' + (isDark() ? ' on' : ''), onclick: () => { setTheme(isDark() ? 'light' : 'dark'); renderControlCenter(); } },
          h('span', { class: 'cc-tile-icon' }, svg(NAV_ICONS.appearance)), h('span', { text: 'Dark Mode' })),
        h('button', { class: 'cc-block cc-square', onclick: () => { closeOverlays(); call('missionControl', {}); } },
          h('span', { class: 'cc-tile-icon' }, svg(NAV_ICONS.widgets)), h('span', { text: 'Overview' })))),

    brightness != null && ccSlider('Display', '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.5" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/></g></svg>',
      brightness, null, v => { brightness = v; call('setBrightness', { level: v }).catch(err => toast(err.message)); }),

    volume && ccSlider('Sound', NAV_ICONS.sound, volume.muted ? 0 : volume.level,
      v => { clearTimeout(volumeTimer); volumeTimer = setTimeout(() => call('setVolume', { level: v }).then(r => { volume = r; renderStatusIcons(); }), 40); },
      () => Sound.play('tick'),
      h('button', { class: 'cc-mute' + (volume.muted ? ' on' : ''), title: volume.muted ? 'Unmute' : 'Mute',
        onclick: () => call('setMute', { muted: !volume.muted }).then(r => { volume = r; renderStatusIcons(); renderControlCenter(); }) },
        svg(STATUS_ICONS.volume(volume.level, !volume.muted)))),

    m && h('div', { class: 'cc-block cc-media' },
      h('span', { class: 'cc-art', style: m.art ? `background-image:url("${m.art}")` : '' }, m.art ? null : svg(ICONS.music)),
      h('div', { class: 'cc-media-text' }, h('b', { text: m.title }), h('span', { text: m.artist || sourceName(m.app) })),
      h('div', { class: 'cc-media-controls' },
        ...[['previous', '<svg viewBox="0 0 20 20"><path d="M5 4h2v12H5zM16 4v12L8 10z" fill="currentColor"/></svg>'],
          ['toggle', m.playing ? ICONS.pause : ICONS.play],
          ['next', '<svg viewBox="0 0 20 20"><path d="M13 4h2v12h-2zM4 4v12l8-6z" fill="currentColor"/></svg>']]
          .map(([action, icon]) => h('button', { onclick: async () => { await call('mediaControl', { action }); setTimeout(async () => { await refreshMedia(); renderControlCenter(); }, 350); } }, svg(icon))))),

    h('div', { class: 'cc-customize' },
      h('span', { text: 'CONTROL SURFACE' }),
      h('button', { text: 'Customize', onclick: openControlCenterSettings })),
    h('div', { class: 'cc-links' },
      h('button', { text: 'Network…', onclick: () => { closeOverlays(); openSettingsPage('network'); } }),
      h('button', { text: 'Sound…', onclick: () => { closeOverlays(); openSettingsPage('sound'); } }),
      h('button', { text: 'Haven Settings…', onclick: () => openSettings() })),
  );
}

/* ---------- App switcher (Alt+Tab) and the swipe HUD ---------- */

let sw = null; // { apps: [{ name, icon, win }], index }

/** Running apps, one entry each, most recently used first. */
function appsByRecency() {
  const seen = new Map();
  for (const w of windows) {
    const key = w.exe.toLowerCase();
    if (seen.has(key)) continue;
    const match = appForWindow(w);
    seen.set(key, { key, name: match?.name || prettyExe(w.exe), icon: match?.icon || w.icon, win: w, app: match });
  }
  return [...seen.values()];
}

/** Running apps in Dock order, for swiping left and right through them like spaces. */
function appsInDockOrder() {
  const recent = appsByRecency();
  const order = [];
  for (const id of S.dock || []) {
    const hit = recent.find(r => r.app?.id === id);
    if (hit && !order.includes(hit)) order.push(hit);
  }
  for (const r of recent) if (!order.includes(r)) order.push(r);
  return order;
}

function renderSwitcher() {
  const strip = $('#switcher-strip');
  strip.replaceChildren(...sw.apps.map((a, i) => h('div', { class: 'sw-app' + (i === sw.index ? ' on' : '') },
    appIcon({ name: a.name, icon: a.icon }), h('span', { text: a.name }))));
  $('#switcher').hidden = false;
  updateRegion();
}

async function onSwitcher(cmd) {
  if (cmd === 'open') {
    try { const res = await call('windows'); windows = res?.windows || windows; foreground = res?.foreground || foreground; } catch { /* use last */ }
    const apps = appsByRecency();
    if (!apps.length) return;
    sw = { apps, index: apps.length > 1 ? 1 : 0 };
    renderSwitcher();
    return;
  }
  if (!sw) return;
  if (cmd === 'next' || cmd === 'prev') {
    sw.index = (sw.index + (cmd === 'next' ? 1 : -1) + sw.apps.length) % sw.apps.length;
    Sound.play('switch');
    renderSwitcher();
  } else if (cmd === 'commit' || cmd === 'cancel') {
    const chosen = sw.apps[sw.index];
    sw = null;
    $('#switcher').hidden = true;
    updateRegion();
    if (cmd === 'commit' && chosen) focusWindow(chosen.win);
  }
}


/* ---------- Trackpad gestures & hot corners ---------- */

let swipeKey = '';

/** Tells the host which app comes next to the left and right (Dock order), so swipes start instantly. */
function syncSwipeOrder() {
  if (PART !== 'shell') return;
  const order = appsInDockOrder().map(a => ({ exe: a.win.exe, hwnd: a.win.hwnd }));
  const key = JSON.stringify(order);
  if (key === swipeKey) return;
  swipeKey = key;
  call('setSwipeOrder', { apps: order });
}

function onGesture({ direction, fingers }) {
  // The other finger count (not the one chosen for apps) moves between spaces, as on a Mac.
  if (fingers && fingers !== (S.gestureFingers || 3)) {
    if (direction === 'left' || direction === 'right') { call('stepDesktop', { direction: direction === 'left' ? 1 : -1 }); Sound.play('switch'); return; }
    if (direction === 'up') return runAction('mission');
    if (direction === 'down') return runAction('desktop');
  }
  if (direction === 'up') return runAction('mission');
  if (direction === 'down') return runAction('appexpose');
  // Left and right step through running apps in Dock order, like swiping between spaces:
  // the screen slides over to the next app. At either end it bounces instead of wrapping.
  const apps = appsInDockOrder();
  const step = direction === 'left' ? 1 : -1;
  const fgWin = windows.find(w => w.hwnd === foreground);
  const i = fgWin ? apps.findIndex(a => a.key === fgWin.exe.toLowerCase()) : -1;
  const j = i < 0 ? (step > 0 ? 0 : apps.length - 1) : i + step;
  const target = apps[j];
  call('slide', { hwnd: target ? target.win.hwnd : 0, direction: step });
  if (target) {
    Sound.play('switch');
    foreground = target.win.hwnd; // so a quick second swipe continues from here
  }
}

const ACTIONS = {
  none: ['Nothing', () => {}],
  mission: ['Overview', () => call('missionControl', {})],
  appexpose: ['App Windows', () => call('missionControl', { app: true })],
  desktop: ['Show Desktop', () => call('system', { action: 'desktop' })],
  launchpad: ['App Library', () => openLaunchpad()],
  control: ['Quick Controls', () => toggleControlCenter()],
  search: ['Search', () => openSpotlight()],
  start: ['Start Menu', () => call('system', { action: 'start' })],
  lock: ['Lock Screen', () => call('system', { action: 'lock' })],
};

/** Multi-finger taps, which Windows would otherwise answer with its own Search and notifications. */
function onTap(fingers) {
  if (fingers === 3) return; // avoid unexpected search-bar popups from accidental three-finger taps
  else if (fingers === 4) toggleNotificationCenter();
}

function openControlCenterSettings() {
  const color = h('input', { type: 'color', value: S.controlCenterAccent || '#3b82f6', oninput: e => { S.controlCenterAccent = e.target.value; save(); renderControlCenter(); } });
  openModal('Control Center Appearance', [
    row('Density', 'Choose the spacing and scale of the quick controls.', segmented([['compact', 'Compact'], ['balanced', 'Balanced'], ['spacious', 'Spacious']], S.controlCenterDensity || 'balanced', v => { S.controlCenterDensity = v; save(); renderControlCenter(); })),
    row('Panel shape', null, segmented([['soft', 'Soft'], ['sharp', 'Sharp']], S.controlCenterShape || 'soft', v => { S.controlCenterShape = v; save(); renderControlCenter(); })),
    row('Accent colour', 'Use the Haven accent or set a custom highlight colour.', color),
    row('Accent glow', null, toggle(!!S.controlCenterGlow, v => { S.controlCenterGlow = v; save(); renderControlCenter(); })),
    row('Panel scale', null, slider(90, 115, 1, Math.round((S.controlCenterScale || 1) * 100), v => { S.controlCenterScale = v / 100; renderControlCenter(); }, v => { S.controlCenterScale = v / 100; save(); renderControlCenter(); })),
    button('Reset appearance', () => { for (const k of ['controlCenterDensity', 'controlCenterShape', 'controlCenterAccent', 'controlCenterGlow', 'controlCenterScale']) delete S[k]; save(); renderControlCenter(); openControlCenterSettings(); }),
  ]);
}

/** Windows shortcuts Haven answers instead of Windows (see SwitcherHook.cs). */
function onShortcut(action) {
  if (action.startsWith('dock:')) {
    const items = [...document.querySelectorAll('#dock .dock-item:not([data-tile])')];
    items[Number(action.slice(5)) - 1]?.click();
    return;
  }
  switch (action) {
    case 'launchpad': $('#launchpad').hidden ? openLaunchpad() : closeOverlays(); break;
    case 'search': openSpotlight(); break;
    case 'clipboard': S.clipboardHistory !== false ? openSpotlight('clipboard') : toast('Turn on clipboard history in Settings → General.'); break;
    case 'desktop': runAction('desktop'); break;
    case 'control': toggleControlCenter(); break;
    case 'notifications': toggleNotificationCenter(); break;
    case 'settings': openSettings(); break;
    case 'logo': $('#logo-menu').click(); break;
  }
}

function runAction(id) {
  (ACTIONS[id] || ACTIONS.none)[1]();
}

function applyInputSettings() {
  call('setInput', { gestures: S.gestures, fingers: S.gestureFingers, switcher: S.appSwitcher, windowsKeys: S.windowsKeys !== false })
    .then(r => { touchpadDetected = !!r?.touchpad; }).catch(() => {});
}
let touchpadDetected = false;

/* ---------- Attention (an app flashing its taskbar button) ---------- */

function onAttention(hwnd) {
  if (S.dnd) return;
  const w = windows.find(x => x.hwnd === hwnd);
  if (!w || w.hwnd === foreground) return;
  attentionApps.add(w.exe.toLowerCase());
  renderDock(true);
}

function clearAttentionForForeground() {
  const fg = windows.find(w => w.hwnd === foreground);
  if (fg && attentionApps.delete(fg.exe.toLowerCase())) renderDock(true);
}

/* ---------- Dock: reorder by dragging, drop files to open them ---------- */

let draggingDockId = null;

function makeDockDraggable(el, appId) {
  el.draggable = true;
  el.addEventListener('dragstart', e => {
    draggingDockId = appId;
    e.dataTransfer.setData('text/haven-app', appId);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('drag-source');
  });
  el.addEventListener('dragend', () => { draggingDockId = null; el.classList.remove('drag-source'); clearDropMarks(); });
}

function clearDropMarks() {
  for (const x of $$('.dock-item.drop-before, .dock-item.drop-after, .dock-item.drop-target')) x.classList.remove('drop-before', 'drop-after', 'drop-target');
}

function initDockDrops() {
  const dock = $('#dock');
  // Dragging an app (from the Dock itself or from Launchpad) over the Dock shows where it will land.
  dock.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('text/haven-app')) return;
    e.preventDefault();
    clearDropMarks();
    const item = e.target.closest('.dock-item[draggable="true"]');
    if (!item) return;
    const r = item.getBoundingClientRect();
    item.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
  });
  dock.addEventListener('dragleave', e => { if (!dock.contains(e.relatedTarget)) clearDropMarks(); });
  dock.addEventListener('drop', e => {
    const id = e.dataTransfer.getData('text/haven-app');
    if (!id) return;
    e.preventDefault();
    const item = $('.dock-item.drop-before, .dock-item.drop-after');
    const order = (S.dock || []).filter(x => x !== id);
    let at = order.length;
    if (item) {
      const targetId = [...$$('.dock-item[draggable="true"]')].indexOf(item);
      const pinnedIds = (S.dock || []).filter(x => appById.has(x));
      const target = pinnedIds[targetId];
      const idx = order.indexOf(target);
      if (idx >= 0) at = item.classList.contains('drop-after') ? idx + 1 : idx;
    }
    order.splice(at, 0, id);
    S.dock = order;
    clearDropMarks();
    save();
    renderDock(true);
    Sound.play('drop');
    if ($('#launchpad').classList.contains('dragging-out')) closeOverlays();
  });
}

function acceptFileDrops(el, target) {
  el.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    el.classList.add('drop-target');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
  el.addEventListener('drop', async e => {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    el.classList.remove('drop-target');
    const files = [...e.dataTransfer.files];
    bounce(el);
    if (target.dropFolder) { toast('Drop files on an app to open them with it.'); return; }
    try { await callWithFiles('openWith', { appId: target.appId, exePath: target.exePath }, files); }
    catch (err) { toast(err.message); }
  });
}

/* ---------- Downloads stack ---------- */

async function openDownloadsStack(anchor) {
  const pop = $('#stack-pop');
  if (!pop.hidden) { closeOverlays(); return; }
  closeOverlays();
  const panel = $('#stack-panel');
  const r = anchor.getBoundingClientRect();
  panel.style.left = Math.max(12, Math.min(innerWidth - 392, r.left + r.width / 2 - 190)) + 'px';
  panel.style.bottom = (innerHeight - r.top + 14) + 'px';
  panel.replaceChildren(h('div', { class: 'muted', style: 'padding:24px; text-align:center', text: 'Loading…' }));
  pop.hidden = false;
  syncShell();
  Sound.play('open');
  let items = [];
  try { items = await call('recentFiles', { folder: 'downloads', count: 12 }) || []; } catch { /* ignore */ }
  panel.replaceChildren(
    h('div', { class: 'stack-head' }, h('b', { text: 'Downloads' }), h('button', { class: 'link', text: 'Open in File Explorer ↗', onclick: () => { closeOverlays(); openFolder(env.downloads); } })),
    items.length ? h('div', { class: 'stack-grid' }, items.map(f => {
      const el = h('button', { class: 'stack-item', title: f.name },
        f.icon ? h('img', { src: f.icon, alt: '' }) : f.isFolder ? svg(ICONS.folder) : letterIcon(f.name),
        h('span', { text: f.name }));
      el.addEventListener('click', () => { closeOverlays(); call('openPath', { path: f.path }).catch(err => toast(err.message)); });
      el.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showMenu(e.clientX, e.clientY, [
          { label: 'Open', action: () => { closeOverlays(); call('openPath', { path: f.path }); } },
          { label: 'Quick Look', action: () => openQuickLook(f.path) },
          { label: 'Show in File Explorer', action: () => { closeOverlays(); call('revealPath', { path: f.path }); } },
        ]);
      });
      return el;
    })) : h('div', { class: 'muted', style: 'padding:24px; text-align:center', text: 'Your Downloads folder is empty.' }));
}

/* ---------- Quick Look ---------- */

async function openQuickLook(path) {
  closeOverlays();
  const ql = $('#quicklook');
  const panel = $('#ql-panel');
  panel.replaceChildren(h('div', { class: 'muted', style: 'padding:40px; text-align:center', text: 'Loading preview…' }));
  ql.hidden = false;
  syncShell();
  let p;
  try { p = await call('preview', { path }); }
  catch (err) { panel.replaceChildren(h('div', { style: 'padding:40px', text: err.message })); return; }

  const size = p.isFolder ? `${p.items ?? 0} items` : formatBytes(p.size);
  const body = p.text != null
    ? h('pre', { class: 'ql-text', text: p.text })
    : p.image ? h('img', { class: 'ql-image', src: p.image, alt: '' })
      : h('div', { class: 'muted', style: 'padding:60px; text-align:center', text: 'No preview available.' });
  panel.replaceChildren(
    h('div', { class: 'ql-head' },
      h('button', { class: 'ql-close', 'aria-label': 'Close', text: '×', onclick: closeOverlays }),
      h('div', { class: 'ql-title' }, h('b', { text: p.name }), h('span', { text: `${size} · ${new Date(p.modified).toLocaleString()}` })),
      h('button', { class: 'button', text: 'Show in Folder', onclick: () => { closeOverlays(); call('revealPath', { path }); } }),
      h('button', { class: 'button primary', text: 'Open', onclick: () => { closeOverlays(); call('openPath', { path }); } })),
    h('div', { class: 'ql-body' }, body));
  focusSoon('.ql-close');
}

function formatBytes(n) {
  if (!n) return '0 bytes';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/* ---------- Search: apps, games, settings, files, maths, units, the web ---------- */

let fileHits = [];
let fileQuery = '';
let fileTimer;

/** A small, safe calculator: + - * / ^ %, parentheses, sqrt, sin, cos, tan, log, ln, pi, e. */
function calculate(expr) {
  const src = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').toLowerCase().trim();
  if (!/^[\d\s.+\-*/^%()a-z]+$/.test(src) || !/\d/.test(src) || !/[+\-*/^%(a-z]/.test(src.replace(/^-/, ''))) return null;
  let i = 0;
  const peek = () => src[i], skip = () => { while (src[i] === ' ') i++; };
  const fns = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round };
  function primary() {
    skip();
    if (peek() === '(') { i++; const v = sum(); skip(); if (src[i++] !== ')') throw 0; return v; }
    if (peek() === '-') { i++; return -primary(); }
    const word = /^[a-z]+/.exec(src.slice(i));
    if (word) {
      i += word[0].length;
      if (word[0] === 'pi') return Math.PI;
      if (word[0] === 'e') return Math.E;
      if (fns[word[0]]) return fns[word[0]](primary());
      throw 0;
    }
    const num = /^\d*\.?\d+(e[+-]?\d+)?/.exec(src.slice(i));
    if (!num) throw 0;
    i += num[0].length;
    skip();
    if (peek() === '%') { i++; return Number(num[0]) / 100; }
    return Number(num[0]);
  }
  function power() { let v = primary(); skip(); if (peek() === '^') { i++; v = v ** power(); } return v; }
  function product() { let v = power(); for (;;) { skip(); const c = peek(); if (c === '*') { i++; v *= power(); } else if (c === '/') { i++; v /= power(); } else return v; } }
  function sum() { let v = product(); for (;;) { skip(); const c = peek(); if (c === '+') { i++; v += product(); } else if (c === '-') { i++; v -= product(); } else return v; } }
  try {
    const v = sum();
    skip();
    if (i !== src.length || !Number.isFinite(v)) return null;
    return Number(v.toPrecision(12));
  } catch { return null; }
}

const UNITS = {
  length: { m: 1, meter: 1, meters: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, mile: 1609.344, miles: 1609.344, yd: 0.9144, ft: 0.3048, feet: 0.3048, foot: 0.3048, in: 0.0254, inch: 0.0254, inches: 0.0254 },
  mass: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523, st: 6.35029318, t: 1000 },
  volume: { l: 1, liter: 1, liters: 1, ml: 0.001, gal: 3.785411784, cup: 0.2365882365, cups: 0.2365882365, floz: 0.0295735296, pt: 0.473176473, qt: 0.946352946 },
  speed: { kmh: 1, kph: 1, mph: 1.609344, ms: 3.6, knots: 1.852, kn: 1.852 },
  data: { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824 },
  time: { s: 1, sec: 1, min: 60, h: 3600, hr: 3600, hours: 3600, day: 86400, days: 86400, week: 604800, weeks: 604800 },
};
const TEMPS = { c: 'c', '°c': 'c', celsius: 'c', f: 'f', '°f': 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' };

function convert(query) {
  const m = /^(-?[\d.,]+)\s*([a-z°/]+)\s+(?:to|in|as|=)\s+([a-z°/]+)$/i.exec(query.trim());
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  const from = m[2].toLowerCase().replace('/', ''), to = m[3].toLowerCase().replace('/', '');
  if (TEMPS[from] && TEMPS[to]) {
    const c = TEMPS[from] === 'c' ? value : TEMPS[from] === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
    const out = TEMPS[to] === 'c' ? c : TEMPS[to] === 'f' ? c * 9 / 5 + 32 : c + 273.15;
    return `${Number(out.toFixed(2))} °${TEMPS[to].toUpperCase()}`;
  }
  for (const table of Object.values(UNITS)) {
    if (table[from] && table[to]) return `${Number((value * table[from] / table[to]).toPrecision(6))} ${m[3]}`;
  }
  return null;
}

/** Places in Settings that search can jump to. */
function settingsEntries() {
  return SETTINGS_NAV.filter(n => n !== '-').map(n => ({
    kind: 'setting', name: n.label, keys: (n.keys || '') + ' ' + n.label.toLowerCase(), nav: n,
  }));
}

function search(query) {
  const q = query.trim().toLowerCase();
  if (spotlightMode === 'clipboard') return clipEntries(q, 200);
  if (!q) return [];
  const score = name => {
    const n = name.toLowerCase();
    return n.startsWith(q) ? 0 : n.split(/[\s\-_.&]+/).some(w => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 9;
  };
  const results = [];

  const calc = calculate(query);
  if (calc !== null) results.push({ kind: 'calc', name: `= ${calc.toLocaleString(undefined, { maximumFractionDigits: 10 })}`, detail: query.trim(), value: String(calc) });
  const conv = convert(query);
  if (conv) results.push({ kind: 'calc', name: `= ${conv}`, detail: query.trim(), value: conv });

  const apps2 = [...apps.map(item => ({ kind: 'app', item, name: item.name })), ...games.map(item => ({ kind: 'game', item, name: item.name }))]
    .map(e => ({ ...e, score: score(e.name) })).filter(e => e.score < 9)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, 6);
  results.push(...apps2);

  const sets = settingsEntries().filter(e => score(e.name) < 9 || e.keys.includes(q)).slice(0, 3);
  results.push(...sets);

  if (fileQuery === q) results.push(...fileHits.slice(0, 6).map(f => ({ kind: 'file', name: f.name, detail: f.path, icon: f.icon, path: f.path })));

  if (q.length >= 2) results.push(...clipEntries(q, 3));
  if (S.claudeEnabled !== false) results.push(askEntry(query.trim()));
  results.push({ kind: 'web', name: `Search the web for “${query.trim()}”`, query: query.trim() });
  return results;
}

function renderSpotlight() {
  const query = $('#spotlight-input').value;
  const q = query.trim().toLowerCase();
  // Files come from the Windows index, so fetch them shortly after typing pauses.
  if (q.length >= 2 && q !== fileQuery) {
    clearTimeout(fileTimer);
    fileTimer = setTimeout(async () => {
      try { fileHits = await call('searchFiles', { query: q }) || []; } catch { fileHits = []; }
      fileQuery = q;
      if ($('#spotlight-input').value.trim().toLowerCase() === q) renderSpotlight();
    }, 180);
  }
  spotlightResults = search(query);
  spotlightIndex = Math.min(spotlightIndex, Math.max(0, spotlightResults.length - 1));

  const list = $('#spotlight-results');
  const labels = { calc: 'Calculator', app: 'Apps', game: 'Games', setting: 'Settings', file: 'Files', web: 'Web',
    clip: spotlightMode === 'clipboard' ? 'Clipboard history' : 'Clipboard', ask: 'Claude' };
  let lastKind = null;
  const rows = [];
  spotlightResults.forEach((entry, i) => {
    const group = entry.kind === 'game' ? 'app' : entry.kind;
    if (group !== lastKind) { rows.push(h('li', { class: 'sl-group', text: labels[entry.kind] })); lastKind = group; }
    const icon = entry.iconEl ? entry.iconEl()
      : entry.kind === 'app' || entry.kind === 'game' ? appIcon(entry.item)
      : entry.kind === 'setting' ? navIcon(entry.nav, 'sl-nav-icon')
        : entry.kind === 'file' ? (entry.icon ? h('img', { class: 'app-icon', src: entry.icon, alt: '' }) : letterIcon(entry.name))
          : entry.kind === 'calc' ? h('span', { class: 'sl-glyph', text: '=' })
            : h('span', { class: 'sl-glyph' }, svg(NAV_ICONS.globe));
    const li = h('li', { class: 'sl-row' + (i === spotlightIndex ? ' active' : '') },
      icon,
      h('span', { class: 'name' }, h('span', { text: entry.name }), entry.detail && h('small', { text: entry.detail })),
      h('span', { class: 'kind', text: entry.hint ?? (entry.kind === 'calc' ? 'Enter to copy' : entry.kind === 'game' ? 'Game' : '') }));
    if (entry.menu) li.addEventListener('contextmenu', ev => { ev.preventDefault(); showMenu(ev.clientX, ev.clientY, entry.menu(), li); });
    li.addEventListener('mousemove', () => { if (spotlightIndex !== i) { spotlightIndex = i; renderSpotlight(); } });
    li.addEventListener('click', () => runSpotlightEntry(entry));
    rows.push(li);
  });
  list.replaceChildren(...rows);
  $('#spotlight-results .active')?.scrollIntoView({ block: 'nearest' });
}

function runSpotlightEntry(entry) {
  switch (entry.kind) {
    case 'calc':
      navigator.clipboard?.writeText(entry.value).then(() => toast(`Copied ${entry.value}`)).catch(() => {});
      closeOverlays();
      break;
    case 'setting': closeOverlays(); goSettingsFromSearch(entry.nav); break;
    case 'file': closeOverlays(); call('openPath', { path: entry.path }).catch(err => toast(err.message)); break;
    case 'web': closeOverlays(); call('webSearch', { query: entry.query }); break;
    case 'clip': closeOverlays(); call('clipPaste', { id: entry.id, paste: true }); break;
    case 'ask': askClaude(entry.query); break;
    default: closeOverlays(); launchItem(entry);
  }
}

function goSettingsFromSearch(nav) {
  if (nav.ext) openSettingsPage(nav.ext);
  else openSettings(nav.id);
}

/* ---------- Menus: window tiling and Mission Control ---------- */

{
  const baseWindow = MENUS.window;
  MENUS.window = () => [
    { label: 'Overview', hint: 'Ctrl+↑', action: () => call('missionControl', {}) },
    { label: 'App Windows', hint: 'Ctrl+↓', action: () => call('missionControl', { app: true }) },
    '-',
    { label: 'Tile to Left Half', hint: 'Ctrl+Alt+←', action: () => call('snap', { where: 'left' }) },
    { label: 'Tile to Right Half', hint: 'Ctrl+Alt+→', action: () => call('snap', { where: 'right' }) },
    { label: 'Fill Screen', hint: 'Ctrl+Alt+Enter', action: () => call('snap', { where: 'fill' }) },
    { label: 'Center', hint: 'Ctrl+Alt+C', action: () => call('snap', { where: 'center' }) },
    '-',
    ...baseWindow(),
  ];
  const baseGo = MENUS.go;
  MENUS.go = () => [...baseGo(), '-', { label: 'Show Desktop', action: () => call('system', { action: 'desktop' }) }];
}

/* ---------- Toasts respect Do Not Disturb and play a sound ---------- */

{
  const baseToast = toast;
  // eslint-disable-next-line no-global-assign
  toast = function (text) {
    if (IS_SHELL && S.dnd && !/^(Copied|Dock reset|Found|Rescanning)/.test(text)) return;
    baseToast(text);
    if (IS_SHELL) Sound.play('pop');
  };
}

/* ---------- Start-up ---------- */

function initShellFeatures() {
  pollStatus();
  initDockDrops();
  applyInputSettings();
  $('#control-center').addEventListener('mousedown', e => { if (e.target.id === 'control-center') closeOverlays(); });
  $('#stack-pop').addEventListener('mousedown', e => { if (e.target.id === 'stack-pop') closeOverlays(); });
  $('#quicklook').addEventListener('mousedown', e => { if (e.target.id === 'quicklook') closeOverlays(); });
  $('#quicklook').addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); closeOverlays(); } });
  // Play the chime once per sign-in session, not on every reload.
  try {
    if (!sessionStorage.getItem('haven-chimed')) { sessionStorage.setItem('haven-chimed', '1'); setTimeout(() => Sound.play('startup'), 400); }
  } catch { /* storage unavailable */ }
}

COMMANDS.quicklook = d => openQuickLook(d.path);

/* ---------- Start at sign-in ---------- */

async function setAutostart(on) {
  try {
    env.autostart = await call('setAutostart', { on });
    toast(env.autostart ? 'Haven will start when you sign in.' : 'Haven won’t start automatically.');
  } catch (err) { toast(err.message); }
  refreshSettingsPage();
}

{
  const baseLogo = MENUS.logo;
  MENUS.logo = () => {
    const items = baseLogo();
    const exit = items.findIndex(i => i && i.label === 'Exit Haven');
    items.splice(exit > 0 ? exit - 1 : items.length, 0, '-',
      { label: 'Start Haven at Sign-In', checked: !!env.autostart, action: () => setAutostart(!env.autostart) });
    return items;
  };
}

/** The first time Haven runs, offer to make it the desktop every time you sign in. */
async function offerAutostart() {
  if (S.askedAutostart || env.autostart || !host) return;
  S.askedAutostart = true;
  save();
  const yes = await confirmDialog('Start Haven when you sign in?',
    'Haven will be your desktop as soon as you log in to Windows. You can change this any time in Settings → General.',
    'Start at Sign-In');
  if (yes) setAutostart(true);
}

addEventListener('DOMContentLoaded', () => {
  if (PART === 'shell') setTimeout(offerAutostart, 3000);
});
