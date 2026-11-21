'use strict';

/* =========================================================================
   Haven System Settings: a sidebar of categories, a search box, and pages of
   grouped rows. Lives in the shell layer; uses the helpers and state in app.js.
   ========================================================================= */

const NAV_ICONS = {
  user: '<svg viewBox="0 0 20 20"><circle cx="10" cy="7" r="3.2" fill="currentColor"/><path d="M3.5 17c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5z" fill="currentColor"/></svg>',
  gear: ICONS.settings.replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24"'),
  appearance: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor"/></svg>',
  desktop: '<svg viewBox="0 0 20 20"><rect x="2.5" y="3.5" width="15" height="10" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 17h6M10 13.5V17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  image: '<svg viewBox="0 0 20 20"><rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="8" r="1.5" fill="currentColor"/><path d="M3.5 15l4.5-4.5 3 3 2.5-2.5 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  widgets: '<svg viewBox="0 0 20 20"><g fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></g></svg>',
  menubar: '<svg viewBox="0 0 20 20"><rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 7h15" stroke="currentColor" stroke-width="1.6"/></svg>',
  display: '<svg viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="10" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 17h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 11l2.5-3 2 2 3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  cloud: '<svg viewBox="0 0 20 20"><path d="M6 15.5h8.5a3.5 3.5 0 0 0 .2-7A5 5 0 0 0 5 9.6 3 3 0 0 0 6 15.5z" fill="currentColor"/></svg>',
  globe: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 10h14M10 3c2.2 2.2 2.2 11.8 0 14M10 3c-2.2 2.2-2.2 11.8 0 14" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  sound: '<svg viewBox="0 0 20 20"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15 5.5a6.5 6.5 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  wifi: '<svg viewBox="0 0 20 20"><path d="M2.5 8a11 11 0 0 1 15 0M5 10.8a7.2 7.2 0 0 1 10 0M7.5 13.5a3.5 3.5 0 0 1 5 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="16" r="1.2" fill="currentColor"/></svg>',
  bluetooth: '<svg viewBox="0 0 20 20"><path d="M6 6.5l8 7L10 17V3l4 3.5-8 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  mouse: '<svg viewBox="0 0 20 20"><rect x="5.5" y="2.5" width="9" height="15" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.5v2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  keyboard: '<svg viewBox="0 0 20 20"><rect x="2" y="5" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 8.5h1M8 8.5h1M11 8.5h1M14 8.5h1M6.5 12h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  accessibility: '<svg viewBox="0 0 20 20"><circle cx="10" cy="4.5" r="1.6" fill="currentColor"/><path d="M4 7.5l6 1.2 6-1.2M10 8.7v3.3l-2.5 5M10 12l2.5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  power: '<svg viewBox="0 0 20 20"><rect x="3" y="6" width="13" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="8" width="7" height="4" rx="1" fill="currentColor"/><path d="M17.5 9v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 20 20"><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/><path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  brush: '<svg viewBox="0 0 20 20"><path d="M16.5 3.5c-1-1-6 3.5-8 6.5l1.5 1.5c3-2 7.5-7 6.5-8z" fill="currentColor"/><path d="M7.2 11c-2 0-3.2 1.3-3.2 3.2 0 1-.5 1.8-1.5 2.3 3.3.6 6.2-.4 6.2-3.5z" fill="currentColor"/></svg>',
  trackpad: '<svg viewBox="0 0 20 20"><rect x="3" y="3.5" width="14" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12.5h14M10 12.5v4" stroke="currentColor" stroke-width="1.4"/></svg>',
  info: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="6.5" r="1.1" fill="currentColor"/></svg>',
};

const SETTINGS_NAV = [
  { id: 'profile', label: 'Your Profile', icon: 'user', color: '#7f6cf2', keys: 'name picture account avatar' },
  '-',
  { id: 'general', label: 'General', icon: 'gear', color: '#8e8e93', keys: 'startup windows taskbar exit shortcuts reset data' },
  { id: 'appearance', label: 'Appearance', icon: 'appearance', color: '#3a3a3e', keys: 'theme dark light sand burgundy navy black accent colour color icon style glass liquid frosted tint refraction' },
  { id: 'customize', label: 'Customize', icon: 'brush', color: '#e0559a', keys: 'icon icons logo launchpad hide show menu bar dock desktop label rename css custom picture png svg ico' },
  { id: 'desktop', label: 'Desktop & Dock', icon: 'desktop', color: '#6c5ce7', keys: 'dock size magnify hide autohide icons desktop clean stacks hot corners mission control snapping tile' },
  { id: 'wallpaper', label: 'Wallpaper', icon: 'image', color: '#2c9bd6', keys: 'background picture image photo' },
  { id: 'profiles', label: 'Desktop Looks', icon: 'appearance', color: '#8b5cf6', keys: 'profile preset save export import share layout theme desktop look' },
  '-',
  { id: 'widgets', label: 'Widgets', icon: 'widgets', color: '#2fa57a', keys: 'widget style tint solid batteries clock calendar weather reminders now playing media' },
  { id: 'controlcenter', label: 'Control Center', icon: 'menubar', color: '#697b91', keys: 'quick controls volume brightness wifi bluetooth appearance control center panel' },
  { id: 'menubar', label: 'Menu Bar', icon: 'menubar', color: '#5d6d82', keys: 'clock 24 hour seconds date style binary analog dots split islands floating now playing island language exit' },
  { id: 'displays', label: 'Displays', icon: 'display', color: '#3b7ff5', keys: 'scale scaling size interface resolution zoom' },
  { id: 'weather', label: 'Weather', icon: 'cloud', color: '#3aa5f2', keys: 'location city units celsius fahrenheit' },
  { id: 'lock', label: 'Lock Screen', icon: 'lock', color: '#3a3a3e', keys: 'lock password ctrl l security sign in' },
  { id: 'trackpad', label: 'Trackpad & Gestures', icon: 'trackpad', color: '#5e5ce6', keys: 'swipe gesture fingers touchpad switch apps mission control' },
  { id: 'sounds', label: 'Sounds', icon: 'sound', color: '#ef4b5c', keys: 'startup chime interface sounds do not disturb' },
  '-',
  { id: 'language', label: 'Language & Region', icon: 'globe', color: '#22a39a', ext: 'language' },
  { id: 'sound', label: 'Windows Sound', icon: 'sound', color: '#d6455a', ext: 'sound' },
  { id: 'network', label: 'Wi-Fi & Network', icon: 'wifi', color: '#3b82f6', ext: 'network' },
  { id: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth', color: '#2f6df6', ext: 'bluetooth' },
  { id: 'mouse', label: 'Mouse', icon: 'mouse', color: '#7d7d84', ext: 'mouse' },
  { id: 'keyboard', label: 'Keyboard', icon: 'keyboard', color: '#7d7d84', ext: 'keyboard' },
  { id: 'accessibility', label: 'Accessibility', icon: 'accessibility', color: '#2f7cf6', ext: 'accessibility' },
  { id: 'power', label: 'Power & Battery', icon: 'power', color: '#30b158', ext: 'power' },
  '-',
  { id: 'about', label: 'About Haven', icon: 'info', color: '#8e8e93', keys: 'version credits' },
];

let settingsPage = 'appearance';
let settingsQuery = '';
let windowsLibrary = null; // wallpapers that ship with Windows, loaded on first visit

/* ---------- Building blocks ---------- */

const navIcon = (item, cls = '') => h('span', { class: 'nav-icon ' + cls, style: `background:${item.color}` }, svg(NAV_ICONS[item.icon]));
const group = (...rows) => h('div', { class: 'sw-group' }, rows.flat().filter(Boolean));
const section = text => h('div', { class: 'sw-section', text });
const note = text => h('div', { class: 'sw-note', text });
const button = (label, onclick, primary) => h('button', { class: 'button' + (primary ? ' primary' : ''), text: label, onclick });
const toggle = (on, onChange) => h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), onclick: () => onChange(!on) });

function row(title, desc, ...controls) {
  return h('div', { class: 'sw-row' },
    h('div', { class: 'sw-row-text' }, h('div', { class: 'sw-row-title', text: title }), desc && h('div', { class: 'sw-row-desc', text: desc })),
    controls.length ? h('div', { class: 'sw-row-control' }, controls) : null);
}

function pickCard(label, frame, on, onclick) {
  return h('button', { class: 'pick-card' + (on ? ' on' : ''), onclick }, h('div', { class: 'frame' }, frame), h('span', { text: label }));
}

function slider(min, max, step, value, onInput, onChange) {
  const r = h('input', { type: 'range', min, max, step, value });
  r.addEventListener('input', () => onInput?.(Number(r.value)));
  r.addEventListener('change', () => onChange?.(Number(r.value)));
  return r;
}

/** Change a setting, save it, and redraw everything that depends on it. */
function setPref(key, value) {
  S[key] = value;
  save();
  applyTheme();
  applyScale();
  applyCustomization(); // bar layout, hidden parts, custom icons (menu-bar toggles live here too)
  renderDock(true);
  refreshSettingsPage();
}

/* ---------- Window ---------- */

function settingsOpen() {
  return IS_SHELL && !$('#modal').hidden && $('#modal .modal').classList.contains('settings-window');
}

function openSettings(focus) {
  if (!IS_SHELL) return toShell('openSettings', { focus });
  if (focus === 'city') settingsPage = 'weather';
  else if (focus && SETTINGS_NAV.some(n => n.id === focus)) settingsPage = focus;
  settingsQuery = '';
  openModal('Settings', [], 'settings-window');
  buildSettingsWindow();
}

function buildSettingsWindow() {
  const body = $('#modal-body');
  const search = h('input', { placeholder: 'Search settings', value: settingsQuery, id: 'sw-search' });
  search.addEventListener('input', () => {
    settingsQuery = search.value;
    if (settingsQuery.trim().length >= 2) { settingsPage = '__search'; renderSettingsNav(); refreshSettingsPage(); return; }
    const first = filteredNav().find(n => n !== '-' && !n.ext);
    if (first && !filteredNav().some(n => n.id === settingsPage)) settingsPage = first.id;
    renderSettingsNav();
    refreshSettingsPage();
  });

  const titlebar = h('div', { class: 'sw-titlebar' },
    h('div', { class: 'sw-lights' },
      h('button', { class: 'red', 'aria-label': 'Close', text: '×', onclick: closeOverlays }),
      h('button', { class: 'yellow', 'aria-label': 'Minimize', text: '–', onclick: closeOverlays }),
      h('button', { class: 'green', 'aria-label': 'Zoom', text: '+', onclick: () => $('#modal .modal').classList.toggle('zoomed') })),
    h('div', { class: 'sw-title', id: 'sw-title' }));
  makeDraggable(titlebar);

  body.replaceChildren(h('div', { class: 'sw' },
    titlebar,
    h('aside', { class: 'sw-side' },
      h('button', { class: 'sw-profile', onclick: () => goSettings('profile') },
        avatarEl(), h('div', {}, h('b', { text: displayName() || 'You' }), h('span', { text: 'Local profile' }))),
      h('label', { class: 'sw-search' }, svg('<svg viewBox="0 0 20 20" width="14" height="14"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'), search),
      h('nav', { class: 'sw-nav', id: 'sw-nav' }),
      h('button', { class: 'sw-exit', title: 'Ctrl + Alt + Q', onclick: () => call('quit') },
        svg('<svg viewBox="0 0 20 20" width="14" height="14"><path d="M8 4H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16h3M12 6.5 15.5 10 12 13.5M15.5 10H8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
        h('span', { text: 'Exit Haven' }))),
    h('section', { class: 'sw-page', id: 'sw-page' })));
  renderSettingsNav();
  refreshSettingsPage();
}

function avatarEl() {
  const a = h('span', { class: 'avatar' });
  if (account.picture) a.style.backgroundImage = `url("${account.picture}")`;
  else a.textContent = (displayName() || '?').charAt(0).toUpperCase();
  return a;
}

function makeDraggable(handle) {
  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const modal = $('#modal .modal');
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(modal.style.transform) || [0, 0, 0];
    const ox = +m[1] - e.clientX, oy = +m[2] - e.clientY;
    const move = ev => { modal.style.transform = `translate(${ev.clientX + ox}px, ${ev.clientY + oy}px)`; };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
}

function filteredNav() {
  const q = settingsQuery.trim().toLowerCase();
  if (!q) return SETTINGS_NAV;
  return SETTINGS_NAV.filter(n => n !== '-' && (n.label.toLowerCase().includes(q) || (n.keys || '').includes(q)));
}

function renderSettingsNav() {
  const nav = $('#sw-nav');
  if (!nav) return;
  nav.replaceChildren(...filteredNav().map(item => item === '-'
    ? h('div', { class: 'sw-nav-sep' })
    : h('button', { class: item.id === settingsPage ? 'on' : '', onclick: () => goSettings(item.id) },
      navIcon(item), h('span', { text: item.label }), item.ext && h('span', { class: 'ext', text: '↗' }))));
}

function goSettings(id) {
  const item = SETTINGS_NAV.find(n => n.id === id);
  if (item?.ext) { openSettingsPage(item.ext); return; } // these live in Windows Settings
  settingsPage = id;
  renderSettingsNav();
  refreshSettingsPage();
  $('#sw-page')?.scrollTo(0, 0);
}

/** Every settings row across every page, indexed once for search. */
let searchIndexCache = null;
function searchIndex() {
  if (searchIndexCache) return searchIndexCache;
  const index = [];
  for (const item of SETTINGS_NAV) {
    if (item === '-' || item.ext || !PAGES[item.id]) continue;
    try {
      const holder = document.createElement('div');
      holder.append(...PAGES[item.id]().filter(Boolean));
      let section = '';
      holder.querySelectorAll('.sw-section, .sw-row').forEach(el => {
        if (el.classList.contains('sw-section')) { section = el.textContent.trim(); return; }
        const title = el.querySelector?.('.sw-row-title')?.textContent.trim();
        if (!title) return;
        index.push({ page: item.id, pageLabel: item.label, section, title,
          desc: el.querySelector?.('.sw-row-desc')?.textContent.trim() || '', el });
      });
    } catch { /* a page that fails to render offline simply isn't searchable */ }
  }
  searchIndexCache = index;
  return index;
}

function refreshSettingsPage() {
  if (!settingsOpen()) return;
  const page = $('#sw-page');
  if (settingsPage === '__search') {
    const q = settingsQuery.trim().toLowerCase();
    const hits = !q ? [] : searchIndex().filter(r =>
      r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) || r.section.toLowerCase().includes(q)).slice(0, 40);
    $('#sw-title').textContent = 'Search';
    page.replaceChildren(
      h('div', { class: 'sw-page-head' }, navIcon({ icon: 'gear', color: '#8e8e93' }), h('h3', { text: 'Search' })),
      h('div', { class: 'sw-note', text: hits.length ? `${hits.length} matching setting${hits.length === 1 ? '' : 's'}` : 'Nothing matches. Try a shorter word.' }),
      ...hits.map(r => h('button', { class: 'sw-search-hit', onclick: () => {
        goSettings(r.page);
        requestAnimationFrame(() => {
          const row = [...document.querySelectorAll('#sw-page .sw-row')].find(x => x.querySelector('.sw-row-title')?.textContent.trim() === r.title);
          row?.scrollIntoView({ block: 'center' });
          row?.classList.add('search-hit');
          setTimeout(() => row?.classList.remove('search-hit'), 1600);
        });
      } },
        h('div', { class: 'sw-row-text' },
          h('div', { class: 'sw-row-title', text: r.title }),
          h('div', { class: 'sw-row-desc', text: [r.section, r.pageLabel].filter(Boolean).join(' · ') + (r.desc ? ' — ' + r.desc : '') })),
        h('span', { class: 'sw-search-go', text: '→' }))));
    return;
  }
  const item = SETTINGS_NAV.find(n => n.id === settingsPage) || SETTINGS_NAV[0];
  $('#sw-title').textContent = item.label;
  const scroll = page.scrollTop;
  page.replaceChildren(
    h('div', { class: 'sw-page-head' }, navIcon(item), h('h3', { text: item.label })),
    ...(PAGES[settingsPage] || PAGES.appearance)().filter(Boolean));
  page.scrollTop = scroll;
}

// Names app.js uses for "redraw Settings if it's open".
function renderSettings() { refreshSettingsPage(); }
function rerenderSettings() { refreshSettingsPage(); }

/* ---------- Pages ---------- */

const SAMPLE_GLYPHS = [
  ['#4a90e2', '<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 16.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'],
  ['#e0577a', NAV_ICONS.sound],
  ['#5aa96b', NAV_ICONS.image],
];

const PAGES = {
  profile: () => [
    group(h('div', { class: 'sw-profile-big' }, avatarEl(), h('div', {},
      h('div', { style: 'font: 600 18px var(--font-display)', text: displayName() || 'You' }),
      h('div', { class: 'muted', text: account.displayName ? `Windows account: ${account.displayName}` : 'Local profile' })))),
    section('Name'),
    group(row('Display name', 'Shown in the menu bar and Settings. Leave empty to use your Windows name.',
      (() => {
        const input = h('input', { class: 'field', style: 'width:220px', value: S.name, placeholder: (account.displayName || '').split(' ')[0] || 'Your name', maxlength: '40' });
        input.addEventListener('input', () => { S.name = input.value; save(); renderAccount(); });
        return input;
      })())),
    section('Picture'),
    group(row('Account picture', 'Haven uses your Windows account picture.', button('Change in Windows…', () => openSettingsPage('accounts')))),
    note('Your profile, reminders and layout are stored only on this PC.'),
  ],

  general: () => [
    section('Startup'),
    group(
      row('Start Haven when you sign in', 'Haven becomes your desktop every time you log in to Windows.',
        toggle(env.autostart, v => setAutostart(v))),
      row('Hide the Windows taskbar', 'Haven always puts the taskbar back when you exit.', toggle(S.hideTaskbar, setTaskbarHidden)),
      row('Use Haven’s app switcher for Alt + Tab', 'One icon per app, with its windows grouped.',
        toggle(S.appSwitcher, v => { setPref('appSwitcher', v); applyInputSettings(); })),
      row('Haven takes over Windows shortcuts', 'The Windows key opens App Library. Win + Tab, Win + A, Win + N, Win + S, Win + D, Win + arrows, Win + 1–9 and Print Screen go to Haven instead of Windows. Turn off to give them back to Windows.',
        toggle(S.windowsKeys !== false, v => { setPref('windowsKeys', v); applyInputSettings(); }))),
    section('Exit'),
    group(row('Exit Haven', 'Go back to the regular Windows desktop and taskbar. Your open apps keep running. Shortcut: Ctrl + Alt + Q.',
      button('Exit Haven', () => call('quit'), true))),
    section('Keyboard shortcuts'),
    group(
      row('Search apps, files, settings and maths', null, h('kbd', { text: 'Alt + Space' }), h('kbd', { text: 'Win + S' })),
      row('App Library', null, h('kbd', { text: 'Win' })),
      row('Quick Controls · Notifications', null, h('kbd', { text: 'Win + A' }), h('kbd', { text: 'Win + N' })),
      row('Open the Nth app in the Dock', null, h('kbd', { text: 'Win + 1 … 9' })),
      row('Switch apps', null, h('kbd', { text: 'Alt + Tab' })),
      row('Overview', 'Every open window at a glance.', h('kbd', { text: 'Ctrl + ↑' }), h('kbd', { text: 'Win + Tab' })),
      row('App Windows', 'Windows of the app in front.', h('kbd', { text: 'Ctrl + ↓' })),
      row('Tile window left / right / top / bottom', null, h('kbd', { text: 'Ctrl + Alt + Arrows' })),
      row('Tile to a quarter', null, h('kbd', { text: 'Ctrl + Alt + U / I / J / K' })),
      row('Fill screen · Center', null, h('kbd', { text: 'Ctrl + Alt + Enter' }), h('kbd', { text: 'Ctrl + Alt + C' })),
      row('Quick Look the selected desktop file', null, h('kbd', { text: 'Space' })),
      row('Screenshot', 'The Windows Snipping Tool handles screenshots.', h('kbd', { text: 'Win + Shift + S' })),
      row('Lock screen', null, h('kbd', { text: 'Ctrl + L' })),
      row('Exit Haven', 'Your open apps keep running.', h('kbd', { text: 'Ctrl + Alt + Q' })),
      row('Rename a desktop icon', null, h('kbd', { text: 'F2' })),
      row('Close App Library, search or a window', null, h('kbd', { text: 'Esc' }))),
    section('Maintenance'),
    group(
      row('Haven’s data folder', 'Settings, icon cache and wallpapers you added.', button('Open', () => openFolder(env.dataDir))),
      row('Reset all settings', 'Restores the default look and layout. Reminders are kept.', button('Reset…', async () => {
        if (!(await confirmDialog('Reset all settings?', 'Your theme, Dock, wallpaper and layout go back to the defaults. Reminders are kept.', 'Reset'))) return;
        S = { ...DEFAULTS, reminders: S.reminders, stateVersion: 2 };
        save(); applyTheme(); applyWallpaper(); applyScale(); loadApps();
      }))),
  ],

  appearance: () => {
    const t = resolvedTheme();
    const themeCards = Object.entries(THEMES).map(([id, def]) => {
      let frame;
      if (id === 'auto') {
        frame = h('div', { class: 'theme-prev split' }, h('div', { class: 'tp-win', style: '--p: 128 132 140; --p-line: #fff' },
          h('div', { class: 'tp-side' }), h('div', { class: 'tp-main' }, h('i'), h('i'), h('i'))), h('div', { class: 'tp-dock', style: '--p: 128 132 140' }));
      } else {
        const p = id === 'custom' ? hexToRgb(S.customSurface).join(' ') : def.surface;
        const line = def.mode === 'light' || (id === 'custom' && luminance(hexToRgb(S.customSurface)) > 0.55) ? '#333' : '#fff';
        frame = h('div', { class: 'theme-prev' }, h('div', { class: 'tp-win', style: `--p: ${p}; --p-line: ${line}; opacity: ${def.alpha ? 0.75 : 1}` },
          h('div', { class: 'tp-side' }), h('div', { class: 'tp-main' }, h('i'), h('i'), h('i'))), h('div', { class: 'tp-dock', style: `--p: ${p}` }));
      }
      return pickCard(def.label, frame, S.theme === id, () => {
        // Glassy themes only read as glassy if the widgets aren't forced solid.
        if ((id === 'glass' || id === 'transparent') && S.widgetStyle === 'solid') setPref('widgetStyle', 'glass');
        setPref('theme', id);
      });
    });

    const customHex = /^#[0-9a-f]{6}$/i.test(S.accent) ? S.accent : accentHex();
    const colorPicker = h('input', { type: 'color', class: 'color-input', value: customHex });
    const hexField = h('input', { class: 'field hex-input', value: customHex, maxlength: '7', spellcheck: 'false' });
    colorPicker.addEventListener('input', () => { hexField.value = colorPicker.value; S.accent = colorPicker.value; applyTheme(); });
    colorPicker.addEventListener('change', () => setPref('accent', colorPicker.value));
    hexField.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hexField.value)) setPref('accent', hexField.value.toLowerCase()); });

    return [
      section('Theme'),
      group(h('div', { class: 'sw-pad' }, h('div', { class: 'card-grid' }, themeCards))),
      S.theme === 'custom' && group(row('Custom theme colour', 'Panels, the menu bar and the Dock take this colour.',
        (() => { const c = h('input', { type: 'color', class: 'color-input', value: S.customSurface }); c.addEventListener('change', () => setPref('customSurface', c.value)); return c; })())),
      note(`Your theme styles Haven’s panels, menus and widgets. ${t.mode === 'dark' ? 'Dark' : 'Light'} text and controls are used to keep everything readable. Auto follows your Windows appearance.`),

      section('Accent colour'),
      group(
        h('div', { class: 'accent-row' }, Object.entries(ACCENTS).map(([id, [label, color]]) =>
          h('button', { class: 'accent-pick' + (S.accent === id ? ' on' : ''), onclick: () => setPref('accent', id) },
            h('i', { style: `background:${color}; --accent-text:${luminance(hexToRgb(color)) > 0.7 ? '#111' : '#fff'}` }), h('span', { text: label })))),
        row('Custom accent', 'Buttons, selected items and other details.', colorPicker, hexField),
        row('Reset accent', 'Keep your theme and go back to the blue accent.', button('Reset to blue', () => setPref('accent', 'blue')))),

      section('Icon style'),
      group(h('div', { class: 'sw-pad' }, h('div', { class: 'card-grid wide' },
        [['default', 'Default'], ['dark', 'Dark'], ['clear', 'Clear']].map(([id, label]) => pickCard(label,
          h('div', { class: 'icon-sample' }, SAMPLE_GLYPHS.map(([color, glyph]) => h('i', {
            style: id === 'default' ? `background:${color}; color:#fff`
              : id === 'dark' ? `background:#1f2126; color:${color}`
                : 'background:rgba(255,255,255,.22); color:#fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.45)',
          }, svg(glyph)))),
          S.iconStyle === id, () => setPref('iconStyle', id)))))),
      note('Show app icons in their original colours, a darker finish, or a clear glass look.'),

      section('Glass'),
      group(
        row('Material', 'Liquid glass is clear and bends the wallpaper at its edges. Frosted glass is softly blurred.',
          segmented([['liquid', 'Liquid'], ['frosted', 'Frosted'], ['off', 'Off']], S.glass ? S.glassStyle : 'off', v => {
            S.glass = v !== 'off';
            if (v !== 'off') S.glassStyle = v;
            save(); applyTheme(); refreshSettingsPage();
          })),
        S.glass && S.glassStyle === 'liquid' && row('Refraction', 'How strongly the glass bends what’s behind it.',
          slider(0, 100, 5, S.refraction, null, v => { S.refraction = v; save(); refreshLiquid(); })),
        S.glass && row('Tint', 'From clear glass to a solid panel.',
          slider(0.1, 0.9, 0.05, S.glassTint, v => { S.glassTint = v; applyTheme(); }, () => save()))),

      section('More'),
      group(
        row('Wallpaper', 'Haven’s waves, Windows wallpapers, or your own pictures.', button('Choose…', () => goSettings('wallpaper'))),
        row('Widget appearance', 'Glass, solid, or your own tint.', button('Customize…', () => goSettings('widgets')))),
    ];
  },

  desktop: () => [
    section('Dock'),
    group(
      row('Size', null, slider(32, 72, 2, S.dockSize, v => { S.dockSize = v; applyScale(); }, v => setPref('dockSize', v))),
      row('Magnify icons on hover', null, toggle(S.magnify, v => setPref('magnify', v))),
      row('Dock style', 'Glass blurs what’s behind it. Solid is an opaque slab. Clear shows just the icons.',
        segmented([['glass', 'Glass'], ['solid', 'Solid'], ['clear', 'Clear']], S.dockSkin || 'glass', v => setPref('dockSkin', v))),
      row('Icon shape', null, segmented([['rounded', 'Rounded'], ['circle', 'Circle']], S.dockShape || 'rounded', v => setPref('dockShape', v))),
      row('Hide the Dock automatically', 'Move the pointer to the Dock’s edge to bring it back.',
        segmented([['off', 'Never'], ['smart', 'When a window overlaps'], ['desktop', 'Desktop only'], ['always', 'Always']], S.dockAutohide, v => { setPref('dockAutohide', v); updateDockVisibility(); })),
      row('Dock position', 'Bottom, left or right edge of the screen.',
        segmented([['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], S.dockPos || 'bottom', v => { setPref('dockPos', v); renderDock(true); updateDockVisibility(); })),
      row('Apps in the Dock', 'Right-click any app in App Library to keep it in the Dock.',
        button('Reset Dock', () => { S.dock = null; loadApps(); toast('Dock reset.'); }), button('Rescan apps', rescanApps))),
    section('Calm by design'),
    group(
      row('Pause when an app covers the desktop', 'Animations, live wallpaper and background polling rest while a maximized or fullscreen app is in front.', toggle(S.calmMaximized !== false, v => setPref('calmMaximized', v))),
      row('Pause everything on battery', 'The desktop goes fully calm whenever the PC unplugs, and wakes when charging resumes.', toggle(!!S.calmBattery, v => { setPref('calmBattery', v); if (typeof setBatteryCalm === 'function') setBatteryCalm(v && !!pcBattery && !pcBattery.charging); }))),
    section('Desktop'),
    section('Desktop'),
    group(
      row('Show icons on the desktop', 'Files and shortcuts from your Desktop folder.', toggle(S.showIcons, v => setPref('showIcons', v))),
      row('Icon size', null, segmented(ICON_SIZES, S.iconSize, v => setPref('iconSize', v))),
      row('Arrange icons', 'Drag icons anywhere. Clean Up puts them back in order.', button('Clean Up', () => setPref('iconPos', {}))),
      row('Use Stacks', 'Group desktop files by kind: images, documents, PDFs and more.', toggle(S.useStacks, v => setPref('useStacks', v))),
      row('Show widgets', null, toggle(S.showWidgets, v => setPref('showWidgets', v)))),
    section('Stage View'),
    group(row('Stage View', 'Keep the app you’re using in the centre, with your other recent apps as live previews on the left. Click a preview to swap.',
      toggle(!!S.stageManager, v => setStageManager(v)))),
    section('Spaces'),
    group(
      row('Spaces', 'Separate desktops for different tasks. They appear along the top of Overview; click + to add one.', button('Add a Space', () => call('newDesktop'))),
      row('Switch spaces', 'Swipe left or right with four fingers, or use these keys.', h('kbd', { text: 'Ctrl + Win + ← / →' }))),
    section('Hot corners'),
    group(h('div', { class: 'corner-grid' },
      [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']].map(([c, label]) => {
        const sel = h('select', { class: 'field corner-select' }, Object.entries(ACTIONS).map(([id, [name]]) =>
          h('option', { value: id, selected: (S.hotCorners?.[c] || 'none') === id ? true : null, text: name })));
        sel.addEventListener('change', () => setPref('hotCorners', { ...S.hotCorners, [c]: sel.value }));
        return h('label', { class: 'corner corner-' + c }, h('span', { text: label }), sel);
      }),
      h('div', { class: 'corner-screen' }))),
    note('Push the pointer into a corner of the screen to run its action.'),
  ],

  wallpaper: () => {
    const current = S.wallpaper;
    const isUrl = u => typeof current === 'object' && current?.url === u;
    const tile = (label, bg, on, onclick) => pickCard(label, h('div', { class: 'wall-thumb', style: `background:${bg}` }), on, onclick);

    if (windowsLibrary === null) {
      windowsLibrary = 'loading';
      call('wallpaperLibrary').then(list => { windowsLibrary = list || []; refreshSettingsPage(); })
        .catch(() => { windowsLibrary = []; refreshSettingsPage(); });
    }

    return [
      group(row('Follow the time of day', 'The wallpaper brightens at midday, warms at sunrise and sunset, and dims at night.',
        toggle(S.dynamicWallpaper, v => setPref('dynamicWallpaper', v)))),
      section('Haven collection'),
      group(h('div', { class: 'sw-pad' }, h('div', { class: 'card-grid wide' },
        Object.entries(WAVE_PALETTES).map(([id, p]) => tile(p.label, waveWallpaper(id), current === id || WALLPAPER_ALIASES[current] === id, () => setWallpaper(id)))))),

      section('Framing'),
      group(
        row('Picture fit', 'Choose how photos fill your screen: crop to fill, fit the whole image, stretch, or keep original size.',
          segmented([['cover', 'Fill'], ['contain', 'Fit'], ['stretch', 'Stretch'], ['center', 'Original']], S.wallpaperFit || 'cover', v => setPref('wallpaperFit', v))),
        row('Horizontal focus', 'Shift the crop to keep your subject in view.', slider(0, 100, 1, S.wallpaperX ?? 50, v => { S.wallpaperX = v; applyWallpaper(); }, v => setPref('wallpaperX', v))),
        row('Vertical focus', 'Move the image up or down inside the frame.', slider(0, 100, 1, S.wallpaperY ?? 50, v => { S.wallpaperY = v; applyWallpaper(); }, v => setPref('wallpaperY', v)))),

      section('Windows'),
      group(h('div', { class: 'sw-pad' }, h('div', { class: 'card-grid wide' },
        tile('Current Windows wallpaper', windowsWallpaperUrl ? `url("${windowsWallpaperUrl}") center / cover` : '#333', current === 'windows',
          () => { windowsWallpaperUrl = undefined; setWallpaper('windows'); }),
        windowsLibrary === 'loading'
          ? h('div', { class: 'muted', style: 'align-self:center', text: 'Loading Windows wallpapers…' })
          : (windowsLibrary || []).map(w => tile(w.name, `url("${w.thumb}") center / cover`, isUrl(w.url), () => setWallpaper({ url: w.url })))))),

      section('Your pictures'),
      group(h('div', { class: 'sw-pad' }, h('div', { class: 'card-grid wide' },
        (S.myWallpapers || []).map((u, i) => tile(`Picture ${i + 1}`, `url("${u}") center / cover`, isUrl(u), () => setWallpaper({ url: u }))),
        pickCard('Add a picture…', h('div', { class: 'wall-add', text: '+' }), false, async () => {
          try {
            const url = await call('pickWallpaper');
            if (!url) return;
            S.myWallpapers = [...(S.myWallpapers || []), url];
            setWallpaper({ url });
          } catch (err) { toast(err.message); }
        })))),
      section('Live wallpapers'),
      group(
        row('Current live wallpaper', S.liveWallpaper?.url ? 'A local video is playing as your desktop background.' : 'No live wallpaper selected. The still wallpaper remains the fallback.', S.liveWallpaper?.url && button('Turn off', () => { setPref('liveWallpaper', null); })),
      row('Choose a video…', 'Select a local MP4, WebM or AVI. Video remains on this PC, loops silently, and can use more battery/GPU than a still image.', button('Browse videos…', async () => {
          try {
            const url = await call('pickLiveWallpaper');
            if (url) setPref('liveWallpaper', { url, kind: 'video' });
          } catch (err) { toast(err.message); }
        }, true))),
      section('Top music player'),
      group(
        row('Move the music pill', 'Drag the player at the top of the screen to any position. Reset returns it to the centre.', button('Reset position', () => setPref('islandPos', { x: 44, y: 3 }))),
        row('Visibility', 'Show or hide the top music player.', toggle(S.island !== false, v => setPref('island', v)))),
      ];
  },

  controlcenter: () => [
    section('Control Center appearance'),
    group(
      row('Density', 'Adjust the spacing and overall feel of Quick Controls.', segmented([['compact', 'Compact'], ['balanced', 'Balanced'], ['spacious', 'Spacious']], S.controlCenterDensity || 'balanced', v => setPref('controlCenterDensity', v))),
      row('Panel shape', null, segmented([['soft', 'Soft'], ['sharp', 'Sharp']], S.controlCenterShape || 'soft', v => setPref('controlCenterShape', v))),
      row('Accent glow', 'Add a subtle glow around the Control Center surface.', toggle(!!S.controlCenterGlow, v => setPref('controlCenterGlow', v))),
      row('Panel scale', null, slider(90, 115, 1, Math.round((S.controlCenterScale || 1) * 100), v => { S.controlCenterScale = v / 100; renderControlCenter(); }, v => setPref('controlCenterScale', v / 100))),
      row('Highlight colour', 'Set a dedicated Control Center highlight.', (() => { const c = h('input', { type: 'color', class: 'color-input', value: S.controlCenterAccent || '#3b82f6' }); c.addEventListener('input', () => { S.controlCenterAccent = c.value; save(); renderControlCenter(); }); return c; })()),
    ),
    note('Open Quick Controls with the menu-bar sliders icon or Win + A, then choose Customize for the same controls.'),
  ],

  widgets: () => [
    section('Desktop clock & widget design'),
    group(
      row('Clock face', 'Analogue remains the default. Digital and dot-matrix faces are optional.', segmented([['analog', 'Analogue'], ['digital', 'Digital'], ['dots', 'Dot matrix']], S.desktopClockFace || 'analog', v => setPref('desktopClockFace', v))),
      row('Time format', null, segmented([[false, '12-hour'], [true, '24-hour']], !!S.desktopClock24, v => { setPref('desktopClock24', v); tickClock(); })),
      row('Show seconds', null, toggle(!!S.desktopClockSeconds, v => { setPref('desktopClockSeconds', v); tickClock(); })),
      row('Show date', null, toggle(S.desktopClockDate !== false, v => { setPref('desktopClockDate', v); tickClock(); })),
      row('Alignment', null, segmented([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], S.desktopClockAlign || 'center', v => setPref('desktopClockAlign', v))),
      row('Digital size', null, slider(24, 90, 1, S.desktopClockSize || 48, v => { $('[data-widget="clock"]')?.style.setProperty('--clock-size', `${v}px`); }, v => setPref('desktopClockSize', v))),
      row('Dot spacing', null, slider(0, 20, 1, Math.round((S.desktopClockTracking ?? .08) * 100), v => { $('[data-widget="clock"]')?.style.setProperty('--clock-tracking', `${v / 100}em`); }, v => setPref('desktopClockTracking', v / 100))),
      row('Matching widget style', 'Style the desktop clock, batteries and Now Playing together.', segmented([['classic', 'Classic'], ['dot', 'Dots'], ['mono', 'Mono'], ['soft', 'Soft']], S.widgetDesign || 'classic', v => setPref('widgetDesign', v)),
        segmented([['accent', 'Accent'], ['white', 'White'], ['text', 'Text'], ['custom', 'Custom']], S.widgetDesignColor || 'accent', v => setPref('widgetDesignColor', v)),
        (() => { const c = h('input', { type: 'color', class: 'color-input', value: S.widgetDesignCustomColor || '#ef4444', title: 'Custom widget color', 'aria-label': 'Custom widget color' }); c.addEventListener('input', () => { S.widgetDesignCustomColor = c.value; S.widgetDesignColor = 'custom'; applyTheme(); save(); }); return c; })())),
      h('div', { class: 'widget-style-preview', 'data-design': S.widgetDesign || 'classic' },
        h('div', { class: 'widget-style-preview-clock' }, h('b', { text: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()) }), h('span', { text: 'MON · MAY 18' })),
        h('div', { class: 'widget-style-preview-row' }, h('i', { class: 'widget-style-preview-ring' }), h('span', {}, h('b', { text: 'Headphones' }), h('small', { text: '86% · Charging' }))),
        h('div', { class: 'widget-style-preview-media' }, h('i'), h('span', {}, h('b', { text: 'Midnight City' }), h('small', { text: 'M83' })))),
      row('Save this as a look', 'Save the clock and widget styling with your current theme.', button('Save look…', () => promptText('Name this desktop look', 'My Widget Look', name => setPref('profiles', [...(S.profiles || []), { id: Date.now().toString(36), name, look: currentLook() }])))),
    section('Widget appearance'),
    group(h('div', { class: 'sw-pad' }, h('div', { class: 'card-grid wide' },
      [['glass', 'Glass'], ['solid', 'Solid'], ['tinted', 'Tinted']].map(([id, label]) => pickCard(label,
        h('div', { class: 'icon-sample', style: `background:${waveWallpaper('dune')}` },
          h('i', { style: 'width:70%; height:60%; border-radius:10px; ' + (id === 'glass'
            ? 'background:rgba(255,255,255,.18); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 0 0 1px rgba(255,255,255,.35); backdrop-filter: blur(6px)'
            : id === 'solid' ? `background: rgb(${resolvedTheme().surface})` : `background:${S.widgetTint}cc`) })),
        S.widgetStyle === id, () => setPref('widgetStyle', id)))))),
    S.widgetStyle === 'tinted' && group(row('Tint colour', null,
      (() => { const c = h('input', { type: 'color', class: 'color-input', value: S.widgetTint }); c.addEventListener('change', () => setPref('widgetTint', c.value)); return c; })())),
    section('Widgets on the desktop'),
    group(
      row('Show widgets', null, toggle(S.showWidgets, v => setPref('showWidgets', v))),
      row('SIGNAL Audio Deck', 'A multi-view music panel with a live spectrum, waveform, radial display and transport controls.', button('Customize…', () => openAudioDeckSettings())),
      Object.entries(WIDGETS).map(([id, label]) => row(label, null,
        toggle(!S.hidden.includes(id), v => setPref('hidden', v ? S.hidden.filter(x => x !== id) : [...S.hidden, id])))),
      row('Rearrange', 'Start arranging, moving and resizing desktop widgets.', button('Arrange widgets', () => { closeOverlays(); toggleEditing(true); })),
      row('Place widgets anywhere', 'Press and hold a widget to move it, or use its right-click menu. Drop it back on the panel to return it.',
        button('Put all back in the panel', () => { setPref('widgetPos', {}); setPref('widgetSize', {}); }))),
    section('World Clock'),
    group(
      (S.worldClocks || []).map(([city, tz], i) => row(city, tz.replace(/_/g, ' '),
        button('Remove', () => setPref('worldClocks', S.worldClocks.filter((_, n) => n !== i))))),
      (() => {
        const zones = (Intl.supportedValuesOf?.('timeZone') || []).filter(z => z.includes('/'));
        const sel = h('select', { class: 'field', style: 'width:240px' }, h('option', { value: '', text: 'Add a city…' }),
          zones.map(z => h('option', { value: z, text: z.split('/').pop().replace(/_/g, ' ') + ' — ' + z.split('/')[0] })));
        sel.addEventListener('change', () => {
          if (!sel.value) return;
          setPref('worldClocks', [...(S.worldClocks || []), [sel.value.split('/').pop().replace(/_/g, ' '), sel.value]].slice(-4));
        });
        return row('Add a city', 'Up to four cities.', sel);
      })()),
  ],

  menubar: () => [
    section('Clock'),
    group(
      row('Clock style', 'How the time appears in the menu bar.', segmented([['text', 'Text'], ['dots', 'Dot matrix'], ['analog', 'Analogue'], ['binary', 'Binary']], S.barClockFace || 'text', v => setPref('barClockFace', v))),
      row('Use 24-hour time', null, toggle(S.clock24, v => setPref('clock24', v))),
      row('Show seconds', 'Shown in the text, dot-matrix and binary faces.', toggle(S.clockSeconds, v => setPref('clockSeconds', v))),
      row('Show the date', 'Text face only.', toggle(S.clockDate, v => setPref('clockDate', v)))),
    section('Layout'),
    group(
      row('Split menu bar', 'Float the menus and the status icons as separate islands, with your wallpaper showing between them.', toggle(S.barSplit, v => setPref('barSplit', v)))),
    section('Items'),
    group(
      row('Now playing', 'A player at the top of the screen with what’s playing. Click it for the full panel; right-click for styles and chips.', toggle(S.island, v => { setPref('island', v); renderIsland(); })),
      ...(S.island ? [row('Player style', 'How the player appears at the top: floating over the desktop, or pinned inside the menu bar.', segmented([['pill', 'Pill'], ['card', 'Card'], ['bar', 'In bar'], ['mini', 'Mini']], playerStyle(), v => { setPref('playerStyle', v); renderIsland(); }))] : []),
      row('Keyboard language', 'Click it to switch languages (Win + Space).', toggle(S.showLanguage, v => { setPref('showLanguage', v); renderLanguage(); })),
      row('System tray icons', 'Discord, Steam, OneDrive and other tray icons, on the right. Click or right-click them as usual.', toggle(S.trayIcons, v => setTrayIcons(v))),
      row('The app’s own menus', 'Show the menus of the app in front (File, Edit, View…) when it has standard ones.', toggle(S.appMenus, v => { setPref('appMenus', v); appMenuFor = -1; refreshAppMenus(); }))),
  ],

  displays: () => [
    section('Interface size'),
    group(h('div', { class: 'sw-pad' }, h('div', { class: 'card-grid' },
      SCALES.map(([v, label]) => {
        const z = v === 'auto' ? autoScale() : Number(v);
        return pickCard(label, h('div', { class: 'scale-sample', style: `font-size:${Math.round(22 * z)}px`, text: 'Aa' }),
          String(S.uiScale) === v, () => setPref('uiScale', v));
      })))),
    note(`Auto picks ${Math.round(autoScale() * 100)}% for your ${screen.width} × ${screen.height} screen (after Windows scaling). Everything in Haven, from the menu bar to the widgets, follows this size.`),
    section('Windows display'),
    group(row('Resolution, scaling and arrangement', 'Haven adjusts itself whenever these change.', button('Display settings…', () => openSettingsPage('display')))),
  ],

  weather: () => {
    const results = h('div', { class: 'row', style: 'padding: 0 16px 14px' });
    const input = h('input', { class: 'field', style: 'width:220px', placeholder: 'Search for a city' });
    const find = async () => {
      const q = input.value.trim();
      if (!q) return;
      results.replaceChildren(h('span', { class: 'muted', text: 'Searching…' }));
      try {
        const list = await geocode(q);
        results.replaceChildren(...(list.length ? list.map(r => button(`${r.name}${r.admin ? ' — ' + r.admin : ''}`, () => setPref('city', r)))
          : [h('span', { class: 'muted', text: 'No matching city.' })]));
      } catch { results.replaceChildren(h('span', { class: 'muted', text: 'Couldn’t reach the weather service.' })); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
    return [
      section('Location'),
      group(
        row('Current', S.city ? `${S.city.name}${S.city.admin ? ' — ' + S.city.admin : ''}` : 'Your location from Windows location services',
          S.city && button('Use current location', () => setPref('city', null))),
        row('Choose a city', null, input, button('Find', find, true)),
        results),
      section('Units'),
      group(row('Temperature', null, segmented([['c', '°C'], ['f', '°F']], S.units, v => setPref('units', v)))),
      note('Forecasts come from Open-Meteo. No account is needed.'),
    ];
  },

  customize: () => {
    const show = id => toggle(!isPartHidden(id), v => { setPartHidden(id, !v); refreshSettingsPage(); });
    const partRows = ids => ids.map(id => row(PARTS[id][0], null, show(id)));
    const iconCell = (key, fallback) => {
      const url = customIcon(key);
      return url ? h('img', { class: 'custom-thumb', src: url, alt: '' }) : fallback;
    };

    const tileRows = Object.entries(SYSTEM_TILES).map(([name, def]) => {
      const label = h('input', { class: 'field', style: 'width:150px', value: S.labels?.[name] || '', placeholder: def, maxlength: '30' });
      label.addEventListener('change', () => { S.labels = { ...(S.labels || {}), [name]: label.value.trim() }; save(); renderDock(true); });
      return h('div', { class: 'sw-row' },
        h('div', { class: 'part-row-label' }, iconCell(name, h('span', { class: 'custom-thumb', style: 'display:grid;place-items:center' }, tileIcon(name))),
          h('div', { class: 'sw-row-text' }, h('div', { class: 'sw-row-title', text: def }))),
        h('div', { class: 'sw-row-control', style: 'flex:1' }, label,
          button('Change Icon…', () => chooseIcon(name)),
          customIcon(name) && button('Reset', () => resetIcon(name)),
          show('dock-' + name)));
    });

    const appOverrides = Object.keys(S.iconOverrides || {}).filter(k => k.startsWith('app:'));
    const hiddenDesk = S.hiddenDesktop || [];
    const css = h('textarea', { class: 'css-editor', spellcheck: 'false', placeholder: '/* Your own CSS, applied to the menu bar, Dock, desktop and widgets. Example: */\n.dock { border-radius: 8px; }\n.menubar { height: 26px; }\n.widget { border-radius: 8px; }' });
    css.value = S.customCss || '';

    return [
      note('Change any icon, rename the Dock’s built-in items, and hide anything you don’t want to see. Tip: right-click any icon in the Dock or App Library, or the Windows logo, to change its picture.'),

      section('Icons'),
      group(
        row('Menu bar logo', 'Use your own picture instead of the Windows logo.',
          iconCell('logo', null), button('Change…', () => chooseIcon('logo')), customIcon('logo') && button('Reset', () => resetIcon('logo'))),
        appOverrides.length
          ? appOverrides.map(k => { const app = appById.get(k.slice(4)); return row(app?.name || 'App', 'Custom app icon', iconCell(k, null), button('Change…', () => chooseIcon(k)), button('Reset', () => resetIcon(k))); })
          : row('App icons', 'Right-click any app in the Dock or App Library and choose Change Icon. Works with PNG, SVG, JPEG, ICO, WebP and GIF.')),

      section('Dock items'),
      group(tileRows),
      group(partRows(['dock', 'dock-running', 'dock-minimized', 'dock-separators', 'dock-dots', 'dock-labels'])),

      section('Menu bar'),
      group(partRows(['menubar', 'menubar-logo', 'menubar-app', 'menubar-menus', 'menubar-wifi', 'menubar-volume', 'menubar-battery',
        'menubar-search', 'menubar-control', 'menubar-language', 'menubar-avatar', 'menubar-name', 'menubar-clock']),
        row('Now playing pill', null, toggle(S.island, v => setPref('island', v)))),

      section('Desktop'),
      group(
        row('Desktop icons', null, toggle(S.showIcons, v => setPref('showIcons', v))),
        partRows(['desktop-icon-labels', 'desktop-widgets-header', 'widget-headers']),
        row('Widgets', 'Choose which widgets appear in Widgets settings.', button('Widgets…', () => goSettings('widgets')))),
      section('Hidden desktop items'),
      group(hiddenDesk.length
        ? hiddenDesk.map(p => row(p.split('\\').pop(), p, button('Show', () => unhideDesktopItem(p))))
        : row('Nothing hidden', 'Right-click an icon on the desktop and choose Hide from Desktop.')),

      section('Advanced: custom CSS'),
      group(h('div', { class: 'sw-pad' }, css,
        h('div', { class: 'row', style: 'margin-top:10px; justify-content:flex-end' },
          button('Reset', () => { S.customCss = ''; save(); applyCustomization(); refreshSettingsPage(); }),
          button('Apply', () => { S.customCss = css.value; save(); applyCustomization(); toast('Custom CSS applied.'); }, true)))),
      note('Custom CSS can restyle anything: .menubar, .dock, .dock-item, .widget, .desk-icon, .island, .cc-panel, .launchpad and more. If something breaks, press Reset.'),
    ];
  },

  profiles: () => {
    const PROFILE_KEYS = ['theme','accent','customSurface','glass','glassStyle','glassTint','refraction','wallpaper','wallpaperFit','wallpaperX','wallpaperY','dynamicWallpaper','deepDotUi','lockClockStyle',
      'dock','dockSize','dockPos','magnify','dockAutohide','iconStyle','iconSize','uiScale','widgetStyle','widgetTint','showWidgets','hidden',
      'widgetScale','widgetSize','widgetPos','widgetOrder','widgetOpacity','widgetLock','widgetOpts','hideParts','iconOverrides','labels','customCss','showIcons','useStacks','island','lockLayout',
      'desktopClockFace','desktopClock24','desktopClockSeconds','desktopClockDate','desktopClockAlign','desktopClockSize','desktopClockColor','desktopClockTracking','widgetDesign','widgetDesignColor','widgetDesignCustomColor','widgetSize','islandPos',
      'liveWallpaper','customWidgets',
      'clock24','clockSeconds','clockDate','showLanguage','trayIcons','barSplit','barClockFace'];
    const title = h('input', { class: 'field', style: 'width:220px', placeholder: 'Name this desktop look', maxlength: '40' });
    const currentLook = () => Object.fromEntries(PROFILE_KEYS.filter(k => S[k] !== undefined).map(k => [k, S[k]]));
    const apply = profile => {
      for (const key of PROFILE_KEYS) if (Object.prototype.hasOwnProperty.call(profile.settings || {}, key)) S[key] = profile.settings[key];
      save(); applyTheme(); applyDeep?.(); applyWallpaper(); applyScale(); applyCustomization(); renderDock(true);
      applyWidgetVisibility(); refreshSettingsPage(); toast(`“${profile.name}” applied.`);
    };
    const download = profile => {
      const blob = new Blob([JSON.stringify({ format: 'haven-look', version: 1, name: profile.name, settings: profile.settings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = h('a', { href: url, download: `${profile.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'haven-look'}.havenlook.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const importFile = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    importFile.addEventListener('change', async () => {
      const file = importFile.files?.[0]; if (!file) return;
      try {
        if (file.size > 256000) throw new Error('Look file is too large.');
        const data = JSON.parse(await file.text());
        if (data.format !== 'haven-look' || !data.settings || typeof data.settings !== 'object') throw new Error('That is not a Haven look file.');
        const safe = Object.fromEntries(PROFILE_KEYS.filter(k => Object.prototype.hasOwnProperty.call(data.settings, k)).map(k => [k, data.settings[k]]));
        const profile = { id: crypto.randomUUID(), name: String(data.name || 'Imported look').slice(0, 40), settings: safe };
        S.profiles = [...(S.profiles || []), profile]; save(); refreshSettingsPage(); toast('Look imported.');
      } catch (err) { toast(err.message || 'Could not import that look.'); }
      importFile.value = '';
    });
    const profiles = (S.profiles || []).map(p => row(p.name, 'A saved Haven desktop look.',
      button('Apply', () => apply(p), true), button('Export', () => download(p)), button('Delete', () => {
        S.profiles = S.profiles.filter(x => x.id !== p.id); save(); refreshSettingsPage();
      })));
    return [
      section('Your desktop looks'),
      group(row('Name', 'Capture the appearance and layout you have now. Your reminders, profile and system settings are never included.', title,
        button('Save current look', () => {
          const name = title.value.trim(); if (!name) { title.focus(); toast('Give this look a name first.'); return; }
          S.profiles = [...(S.profiles || []), { id: crypto.randomUUID(), name: name.slice(0, 40), settings: currentLook() }];
          title.value = ''; save(); refreshSettingsPage(); toast('Desktop look saved.');
        }, true))),
      group(button('Import a look…', () => importFile.click()), importFile),
      ...(profiles.length ? profiles : [group(note('No saved looks yet. Save your current desktop to get started.'))]),
      note('Looks are stored on this PC. Export a .havenlook.json file to share or back one up; imported looks only change visual and layout preferences.'),
    ];
  },

  lock: () => {
    const current = h('input', { type: 'password', class: 'field', style: 'width:200px', placeholder: 'Current password' });
    const next = h('input', { type: 'password', class: 'field', style: 'width:200px', placeholder: 'New password' });
    const again = h('input', { type: 'password', class: 'field', style: 'width:200px', placeholder: 'Repeat new password' });
    const status = h('span', { class: 'muted' });
    const change = async () => {
      if (!(await checkLockPassword(current.value))) { status.textContent = 'The current password isn’t right.'; return; }
      if (!next.value) { status.textContent = 'Enter a new password.'; return; }
      if (next.value !== again.value) { status.textContent = 'The new passwords don’t match.'; return; }
      await setLockPassword(next.value);
      current.value = next.value = again.value = '';
      status.textContent = 'Password changed.';
    };
    return [
      section('Lock'),
      group(
        row('Lock Haven now', 'Shows the lock screen. Click or press any key, then enter your password.', button('Lock Screen', () => { closeOverlays(); lockScreen(); }, true)),
        row('Keyboard shortcut', null, h('kbd', { text: 'Ctrl + L' })),
        row('Lock when Haven starts', 'Ask for the password every time Haven starts, for example at sign-in.', toggle(!!S.lockOnStart, v => setPref('lockOnStart', v))),
        row('Lock Windows too', 'Ctrl + L also locks Windows itself (real security: your Windows password, PIN or Hello), with Haven’s lock screen waiting behind it.', toggle(!!S.lockWindowsToo, v => setPref('lockWindowsToo', v)))),
      section('Windows Hello'),
      group(
        row('Unlock with Windows Hello', 'Use your face, fingerprint or Windows PIN instead of typing your Haven password (if Hello is set up on this PC).', toggle(S.lockHello !== false, v => setPref('lockHello', v))),
        row('Ask right away', 'Start Windows Hello as soon as the login appears, like Touch ID.', toggle(S.lockHelloAuto !== false, v => setPref('lockHelloAuto', v)))),
      section('On the lock screen'),
      group(
        row('Now Playing', 'What’s playing, with play/pause and skip.', toggle(S.lockMedia !== false, v => setPref('lockMedia', v))),
        row('Battery', null, toggle(S.lockBattery !== false, v => setPref('lockBattery', v))),
        row('Notification count', 'How many notifications arrived (not what they say).', toggle(S.lockNotifications !== false, v => setPref('lockNotifications', v)))),
      section('Screen saver'),
      group(
        row('Start after', 'Shows your wallpaper slowly drifting, with the time. Not while something is playing.',
          segmented([[0, 'Never'], [2, '2 min'], [5, '5 min'], [10, '10 min'], [20, '20 min']], Number(S.saverMinutes) || 0, v => setPref('saverMinutes', v))),
        row('Ask for password afterwards', 'Show the lock screen when the screen saver ends.', toggle(!!S.saverLock, v => setPref('saverLock', v))),
        row('Preview', null, button('Start Screen Saver', () => { closeOverlays(); setTimeout(startSaver, 300); }))),
      section('Password'),
      group(
        row('Current password', S.lockHash ? null : 'The starting password is “root”.', current),
        row('New password', null, next),
        row('Repeat new password', null, again),
        row('', null, status, button('Change Password', change, true))),
      note('Haven’s lock and Windows’ lock are separate. Haven’s lock covers the screen and blocks Alt+Tab, the Windows key and Alt+F4, but it isn’t real security: Ctrl+Alt+Del still works. Windows still locks as usual, by itself or with Win + L, even while Haven is locked. Haven keeps only a hash of its password.'),
    ];
  },

  trackpad: () => [
    section('Gestures'),
    group(
      row('Swipe between apps', 'Swipe left or right to move through your open apps. Swipe up for Overview, down for App Windows. With the other number of fingers, swipe left or right to change spaces. Three-finger taps do nothing; four-finger taps open Notifications.',
        toggle(S.gestures, v => { setPref('gestures', v); applyInputSettings(); })),
      row('Fingers', null, segmented([[3, 'Three'], [4, 'Four']], S.gestureFingers, v => { setPref('gestureFingers', v); applyInputSettings(); }))),
    note(touchpadDetected ? 'Your precision touchpad is working with Haven.' : 'Haven detects your touchpad the first time you use it.'),
    section('Windows gestures'),
    note('While Haven’s gestures are on, Windows’ own three- and four-finger swipes and taps are switched off so only Haven responds. They come back when you exit Haven or turn gestures off. Windows applies this at sign-in, so if Windows still reacts, sign out and back in once.'),
  ],

  sounds: () => [
    section('Haven sounds'),
    group(
      row('Play a chime when Haven starts', null, toggle(S.startupSound, v => setPref('startupSound', v))),
      row('Interface sounds', 'Soft clicks for the switcher, Dock, Quick Controls and notifications.', toggle(S.uiSounds, v => setPref('uiSounds', v))),
      row('Preview', null, button('Startup chime', () => Sound.play('startup')), button('Click', () => Sound.play('pop')))),
    section('Do Not Disturb'),
    group(row('Do Not Disturb', 'Silences Haven’s sounds, notifications and bouncing Dock icons.', toggle(S.dnd, v => setPref('dnd', v)))),
    section('Windows'),
    group(row('Output, input and volume', null, button('Windows sound settings…', () => openSettingsPage('sound')))),
  ],

  about: () => [
    group(h('div', { class: 'sw-profile-big' },
      h('span', { class: 'nav-icon', style: 'width:64px;height:64px;border-radius:16px;background:linear-gradient(150deg,#3b82f6,#8b5cf6)' },
        svg('<svg viewBox="0 0 16 16" width="30" height="30"><path fill="#fff" d="M1 1h6.6v6.6H1zM8.4 1H15v6.6H8.4zM1 8.4h6.6V15H1zM8.4 8.4H15V15H8.4z"/></svg>')),
      h('div', {}, h('div', { style: 'font: 700 22px var(--font-display)', text: 'Haven' }),
        h('div', { class: 'muted', text: `Version ${env.version || ''}` })))),
    note('Haven is a desktop that runs on top of Windows. Windows stays your operating system, and your apps keep running when you exit. Not affiliated with Apple or Microsoft.'),
    section('Installation'),
    group(
      row(updateInfo?.installed ? `Installed · version ${updateInfo.version}` : updateInfo?.dev ? `Development build · version ${updateInfo?.version || ''}` : 'Not installed', updateInfo?.location || ''),
      updateInfo?.installed
        ? row(updateInfo.available ? `Haven ${updateInfo.latest || ''} is ready` : 'Haven is up to date',
            updateInfo.error || (updateInfo.available && updateInfo.notes) || (updateInfo.source ? 'Haven checks for updates on its own every few hours.' : 'This copy has no update feed.'),
            updateInfo.available ? button('Update and Restart', () => call('applyUpdate').catch(err => toast(err.message)), true) : button('Check Now', () => checkForUpdate(false)))
        : row('Install Haven', updateInfo?.dev ? 'Run release.ps1 to build an installable copy, or install.ps1 to install this build.' : 'Installs Haven for your account, with a Start menu entry, updates and an uninstaller.',
            !updateInfo?.dev && button('Install…', () => call('installHaven').catch(err => toast(err.message)), true)),
      updateInfo?.installed && row('Uninstall Haven', 'Puts your taskbar and Windows settings back and removes Haven. You can keep your settings for later.', button('Uninstall…', () => call('uninstallHaven').catch(err => toast(err.message))))),
    section('Credits'),
    group(row('Weather', 'Open-Meteo.com, under CC BY 4.0.'), row('Wallpapers', 'Haven’s waves are generated on your PC. Windows wallpapers come from your Windows installation.')),
  ],
};
