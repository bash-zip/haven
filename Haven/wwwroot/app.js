'use strict';

/* =========================================================================
   Haven: desktop shell UI.

   The same page runs in two layers (see ShellHost.cs):
     ?part=desktop  wallpaper, widgets and desktop icons, behind every window
     ?part=shell    menu bar, Dock, Launchpad, search and menus, above every window
   Opened in a plain browser there is no host: it runs both parts on mock data.
   ========================================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ---------- Host bridge ---------- */

const host = window.chrome?.webview;
const PART = new URLSearchParams(location.search).get('part') || (host ? 'desktop' : 'preview');
const IS_DESKTOP = PART !== 'shell' && PART !== 'secondary';   // draws wallpaper, widgets, icons
const IS_SHELL = PART !== 'desktop' && PART !== 'secondary';   // draws menu bar, Dock, overlays
// 'secondary': another display (wallpaper, a small menu bar and a Dock; see secondary.js)
document.documentElement.classList.add('part-' + PART);

const pending = new Map();
let seq = 0;

function call(type, args) {
  if (!host) return Promise.resolve(Mock[type] ? Mock[type](args) : null);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    host.postMessage({ id, type, args });
  });
}

host?.addEventListener('message', e => {
  const msg = e.data;
  if (msg.event) return onHostEvent(msg.event, msg.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
});

/** Runs a command in the layer that owns it: here if this page draws it, otherwise in the other layer. */
function toShell(name, data) {
  if (IS_SHELL) return COMMANDS[name]?.(data, PART);
  call('send', { to: 'shell', name, data });
}
function toDesktop(name, data) {
  if (IS_DESKTOP) return COMMANDS[name]?.(data, PART);
  call('send', { to: 'desktop', name, data });
}

function onHostEvent(name, data) {
  switch (name) {
    case 'command': COMMANDS[data.name]?.(data.data, data.from); break;
    case 'state': markSynced(data); onRemoteState(data); break;
    case 'statePatch': onStatePatch(data); break;
    case 'search': openSpotlight(); break;
    case 'notice': toast(data); break;
    case 'desktopChanged': loadDesktop(); break;
    case 'displayChanged': applyScale(); if (IS_DESKTOP) renderDesktopIcons(); break;
    case 'dockOverlap': dockOverlap = !!data; updateDockVisibility(); break;
    case 'switcher': onSwitcher(data); break;
    case 'slid': Sound.play('switch'); break;
    case 'gesture': onGesture(data); break;
    case 'tap': onTap(data); break;
    case 'shortcut': onShortcut(data); break;
    case 'clipboard': loadClipItems(); break;
    case 'claude': onClaudeEvent(data); break;
    case 'hotCorner': runAction(S.hotCorners?.[data] || 'none'); break;
    case 'attention': onAttention(data); break;
    case 'windowsChanged': clearTimeout(windowsTimer); windowsTimer = setTimeout(pollWindowsNow, 120); break;
  }
}

/* ---------- Mock host (browser preview only) ---------- */

const Mock = (() => {
  let state = null;
  try { state = JSON.parse(localStorage.getItem('haven-mock-state')); } catch { /* ignore */ }
  const names = ['File Explorer', 'Microsoft Edge', 'Spotify', 'Visual Studio Code', 'Settings', 'Calculator',
    'Notepad', 'Photos', 'Terminal', 'Discord', 'Steam', 'Paint', 'Clock', 'Mail', 'OBS Studio', 'Figma',
    'Slack', 'Word', 'Excel', 'PowerPoint', 'Camera', 'Snipping Tool', 'Task Manager', 'Zoom'];
  const started = Date.now();
  return {
    env: () => ({ user: 'you', downloads: 'C:\\Users\\you\\Downloads', documents: 'C:\\Users\\you\\Documents',
      desktop: 'C:\\Users\\you\\Desktop', pictures: 'C:\\Users\\you\\Pictures', version: 'preview', taskbarHidden: true }),
    account: () => ({ user: 'you', displayName: 'Alex Rivera', picture: null }),
    windowsWallpaper: () => null,
    batteries: () => [{ name: 'Wireless Mouse', level: 91, kind: 'mouse' }],
    location: () => ({ lat: 51.51, lon: -0.13 }),
    apps: () => names.map(n => ({ id: n, name: n, icon: null, exe: n === 'Spotify' ? 'Spotify.exe' : null })),
    games: () => [
      { id: '1145360', name: 'Hades', image: null, uri: 'steam://rungameid/1145360' },
      { id: '413150', name: 'Stardew Valley', image: null, uri: 'steam://rungameid/413150' },
    ],
    windows: () => ({
      foreground: 1,
      windows: [
        { hwnd: 1, title: 'Spotify Premium', exe: 'Spotify.exe', exePath: 'C:\\Spotify.exe', icon: null },
        { hwnd: 2, title: 'Notes.txt - Notepad++', exe: 'notepad++.exe', exePath: 'C:\\npp\\notepad++.exe', icon: null },
      ],
    }),
    desktopItems: () => ['Project Notes.docx', 'Screenshots', 'Budget 2026.xlsx', 'Steam', 'Holiday.jpg', 'Resume.pdf']
      .map((n, i) => ({ id: 'C:\\Users\\you\\Desktop\\' + n, name: n, icon: null, isFolder: i === 1 })),
    media: () => ({ title: 'Midnight Drive', artist: 'The Night Shift', app: 'Spotify.exe', playing: true, art: null,
      position: 40 + (Date.now() - started) / 1000, duration: 214 }),
    getState: () => state,
    setState: st => { state = st; try { localStorage.setItem('haven-mock-state', JSON.stringify(st)); } catch { /* ignore */ } },
    patchState: ({ set = {}, del = [] }) => {
      state = { ...(state || {}), ...set };
      for (const k of del) delete state[k];
      try { localStorage.setItem('haven-mock-state', JSON.stringify(state)); } catch { /* ignore */ }
    },
    pickWallpaper: () => null,
  };
})();

/* ---------- State (shared by both layers through the host) ---------- */

const DEFAULTS = {
  name: '',
  city: null,            // { name, admin, lat, lon }; null = use this PC's location
  units: 'c',
  theme: 'dark',         // auto | light | dark
  wallpaper: 'windows',  // 'windows' | preset id | { url }
  dock: null,            // app ids; null until first run picks defaults
  reminders: [],         // { id, text, done }
  hidden: [],            // widget ids the user removed
  showWidgets: true,
  uiScale: 'auto',       // 'auto' or a zoom factor
  dockSize: 46,
  magnify: true,
  iconSize: 56,
  iconPos: {},           // desktop item path → [column from the right, row]
  hideTaskbar: true,
  glass: true,           // glass behind the menu bar, Dock and widgets
  glassStyle: 'liquid',  // liquid (clear, refractive) | frosted (heavy blur)
  refraction: 60,        // 0–100: how strongly liquid glass bends what's behind it
  glassTint: 0.45,       // how much colour sits on top of the glass (0 = clear, 1 = solid)
  accent: 'blue',
  clock24: false,
  clockSeconds: false,
  clockDate: true,
  showIcons: true,
  dockAutohide: 'smart', // off | smart (when a window overlaps) | always
  customSurface: '#2b2f3a',
  iconStyle: 'default',  // default | dark | clear
  widgetStyle: 'glass',  // glass | solid | tinted
  widgetTint: '#7b1c26',
  island: true,          // "now playing" pill at the top of the screen
  showLanguage: true,    // keyboard language in the menu bar
  myWallpapers: [],      // urls of images the user added
  gestures: true,        // trackpad swipes
  gestureFingers: 3,
  appSwitcher: true,     // Haven's Alt+Tab switcher
  windowsKeys: true,     // Haven answers the Windows key, Win+Tab, Win+A, Win+N, Print Screen…
  clipboardHistory: true, // remember what you copy (Win + V)
  hotCorners: { tl: 'none', tr: 'none', bl: 'mission', br: 'desktop' },
  uiSounds: true,
  startupSound: true,
  dnd: false,            // Do Not Disturb: no toasts, bounces or sounds
  useStacks: false,      // group desktop files by kind
  dynamicWallpaper: false,
  notes: '',
  worldClocks: [['New York', 'America/New_York'], ['London', 'Europe/London'], ['Tokyo', 'Asia/Tokyo']],
  lpOrder: null,         // Launchpad layout: app ids and folders
  hideParts: ['dock-minimized'], // parts of the menu bar, Dock and desktop that are hidden (see customize.js)
  iconOverrides: {},     // custom icons: launchpad, settings, downloads, trash, logo, app:<id>
  labels: {},            // custom names for the Dock's system items
  hiddenDesktop: [],     // desktop items hidden from the desktop
  customCss: '',
  screenshotSave: 'pictures', // pictures (Pictures\Screenshots) | clipboard | a folder path
  widgetScale: {},       // widget sizes: id → scale (1 = normal); floating widgets only
  widgetPos: {},         // widgets placed freely on the desktop: id → [x, y] as fractions of the screen
  widgetOrder: null,     // order of widgets in the panel
  trayIcons: true,       // system tray icons in the menu bar
  appMenus: true,        // show the front app's own menus when it has standard ones
  saverMinutes: 10,      // screen saver after this many idle minutes (0 = never)
  saverLock: false,      // ask for the password after the screen saver
  stageManager: false,
};

const ACCENTS = {
  blue: ['Blue', '#3b82f6'], burgundy: ['Burgundy', '#8f1d33'], moss: ['Moss', '#55794c'], champagne: ['Champagne', '#c4a57a'],
  slate: ['Slate', '#6f8197'], navy: ['Navy', '#284477'], purple: ['Purple', '#8b5cf6'], pink: ['Pink', '#e0559a'],
  orange: ['Orange', '#ee7a2c'], white: ['White', '#f2f2f4'],
};

/** Surface colours for each theme. Glass and Transparent let more of the wallpaper through. */
const THEMES = {
  light: { label: 'Light', mode: 'light', surface: '244 244 246' },
  dark: { label: 'Dark', mode: 'dark', surface: '30 30 33' },
  auto: { label: 'Auto', mode: 'auto' },
  sand: { label: 'Sand', mode: 'light', surface: '234 225 207' },
  burgundy: { label: 'Burgundy', mode: 'dark', surface: '62 20 28' },
  grey: { label: 'Grey', mode: 'dark', surface: '72 74 79' },
  glass: { label: 'Glass', mode: 'dark', surface: '110 118 128', alpha: 0.55 },
  transparent: { label: 'Transparent', mode: 'dark', surface: '18 18 20', alpha: 0.3 },
  black: { label: 'True Black', mode: 'dark', surface: '0 0 0' },
  navy: { label: 'Navy', mode: 'dark', surface: '22 32 56' },
  custom: { label: 'Custom', mode: 'dark' },
};

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [59, 130, 246];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }

function accentHex() {
  return ACCENTS[S.accent]?.[1] || (/^#[0-9a-f]{6}$/i.test(S.accent) ? S.accent : ACCENTS.blue[1]);
}

/** The active theme with Auto and Custom resolved to concrete colours. */
function resolvedTheme() {
  const t = THEMES[S.theme] || THEMES.dark;
  if (S.theme === 'custom') {
    const rgb = hexToRgb(S.customSurface);
    return { ...t, mode: luminance(rgb) > 0.55 ? 'light' : 'dark', surface: rgb.join(' ') };
  }
  const mode = t.mode === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : t.mode;
  return { ...t, mode, surface: t.surface || (mode === 'dark' ? '30 30 33' : '244 244 246') };
}

/** Haven's own wallpapers: layered waves drawn as SVG, so they're crisp at any resolution. */
const WAVE_PALETTES = {
  ember:    { label: 'Ember',    bg: ['#14040a', '#3b0d16'], waves: [['#6e1424', '#24050b'], ['#a8263a', '#3a0911']] },
  dune:     { label: 'Dune',     bg: ['#dccfb8', '#8796a6'], waves: [['#efe4d0', '#bba98a'], ['#6c7e92', '#37465a']] },
  graphite: { label: 'Graphite', bg: ['#0f1013', '#24262b'], waves: [['#3a3d44', '#141518'], ['#5c6068', '#1b1c20']] },
  midnight: { label: 'Midnight', bg: ['#050a19', '#13244c'], waves: [['#1d3a72', '#09132e'], ['#3f6db5', '#0e1c3f']] },
  orchid:   { label: 'Orchid',   bg: ['#24123a', '#7a4fb0'], waves: [['#a47bd8', '#4a2a77'], ['#e3a6ea', '#7c3fa1']] },
  lagoon:   { label: 'Lagoon',   bg: ['#05343f', '#0f7891'], waves: [['#36bad2', '#0a5466'], ['#8fe5f1', '#148fa7']] },
  amber:    { label: 'Amber',    bg: ['#341705', '#c3641a'], waves: [['#f0a14b', '#98440f'], ['#ffd18c', '#cf7920']] },
  meadow:   { label: 'Meadow',   bg: ['#0c2a22', '#3f8f6a'], waves: [['#7fcf9b', '#1f5a45'], ['#d4ef9a', '#4c9a63']] },
  silver:   { label: 'Silver',   bg: ['#e8eaee', '#b6bcc6'], waves: [['#ffffff', '#cdd2da'], ['#a7afbb', '#e8ebf0']] },
};
// Names used by earlier versions of Haven.
const WALLPAPER_ALIASES = { dusk: 'orchid' };
const waveCache = new Map();

function waveWallpaper(id) {
  id = WALLPAPER_ALIASES[id] || id;
  const p = WAVE_PALETTES[id];
  if (!p) return null;
  if (waveCache.has(id)) return waveCache.get(id);
  const W = 1920, H = 1080;
  let defs = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/></linearGradient>` +
    '<filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>';
  let body = '<rect width="1920" height="1080" fill="url(#bg)"/>';
  p.waves.forEach(([a, b], i) => {
    const y0 = H * (0.5 + i * 0.13), amp = 150 - i * 30, phase = 0.6 + i * 1.4;
    const pts = [];
    for (let x = 0; x <= W; x += 32) {
      const t = x / W;
      pts.push(`${x} ${(y0 - Math.sin(t * Math.PI * 1.5 + phase) * amp - Math.sin(t * Math.PI * 3.3 + phase * 2) * amp * 0.22).toFixed(1)}`);
    }
    const line = 'M' + pts.join(' L');
    defs += `<linearGradient id="w${i}" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    body += `<path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#w${i})"/>` +
      `<path d="${line}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="10" filter="url(#soft)" opacity=".45"/>` +
      `<path d="${line}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>`;
  });
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  const css = `url("data:image/svg+xml,${encodeURIComponent(svgText)}") center / cover no-repeat`;
  waveCache.set(id, css);
  return css;
}
const WIDGETS = {
  batteries: 'Batteries', clock: 'Clock', calendar: 'Calendar', weather: 'Weather', reminders: 'Reminders', media: 'Now Playing',
  notes: 'Notes', system: 'System', worldclock: 'World Clock', photos: 'Photos', events: 'Up Next',
};
const DEFAULT_DOCK = ['File Explorer', 'Microsoft Edge', 'Google Chrome', 'Firefox', 'Zen Browser', 'Steam', 'Spotify',
  'Visual Studio Code', 'Discord', 'Photos', 'Calculator'];
const SCALES = [['auto', 'Auto'], ['0.85', 'Small'], ['1', 'Default'], ['1.15', 'Large'], ['1.3', 'Larger']];
const ICON_SIZES = [[44, 'Small'], [56, 'Medium'], [72, 'Large']];

let S = { ...DEFAULTS };
let env = {};
let account = {};
let apps = [];
let games = [];
let windows = [];
let foreground = 0;
const appById = new Map();
let saveTimer;

/*
 * Saving: each page sends only the settings it changed, and the host merges them into the one
 * saved file. (Sending the whole state let the desktop and the menu bar overwrite each other's
 * newer settings with stale copies.) `synced` is what this page knows the file to hold.
 */
let synced = {};
function markSynced(obj) { for (const k of Object.keys(obj || {})) synced[k] = JSON.stringify(obj[k]); }

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushState, 80);
}

function flushState() {
  clearTimeout(saveTimer);
  const set = {}, del = [];
  for (const k of Object.keys(S)) {
    const json = JSON.stringify(S[k]);
    if (json !== undefined && json !== synced[k]) set[k] = S[k];
  }
  for (const k of Object.keys(synced)) if (!(k in S)) del.push(k);
  if (!Object.keys(set).length && !del.length) return;
  markSynced(set);
  for (const k of del) delete synced[k];
  call('patchState', { set, del }).catch(err => {
    // Not saved: forget that we sent it, so the next save tries again.
    for (const k of Object.keys(set)) delete synced[k];
    toast('Couldn’t save your settings: ' + err.message);
  });
}

/** Another page saved some settings: take just those. */
function onStatePatch({ set = {}, del = [] }) {
  for (const [k, v] of Object.entries(set)) { S[k] = v; synced[k] = JSON.stringify(v); }
  for (const k of del) { delete S[k]; delete synced[k]; }
  onRemoteState({ ...S });
}

// Save anything still waiting when the page goes away.
addEventListener('pagehide', flushState);

/** The other layer changed something; take its copy and redraw what depends on it. */
function onRemoteState(next) {
  const prev = S;
  S = { ...DEFAULTS, ...next };
  applyTheme();
  applyCustomization();
  if (JSON.stringify(prev.wallpaper) !== JSON.stringify(S.wallpaper)) applyWallpaper();
  applyScale();
  renderAccount();
  renderReminders();
  if (IS_DESKTOP) {
    applyWidgetVisibility();
    renderDesktopIcons();
    if (JSON.stringify(prev.city) !== JSON.stringify(S.city) || prev.units !== S.units) refreshWeather();
  }
  if (IS_SHELL) {
    renderDock(true);
    if (!$('#modal').hidden && $('#modal-title').textContent === 'Settings') renderSettings();
  }
}

/* ---------- Theme, wallpaper, scale ---------- */

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
darkQuery.addEventListener('change', applyTheme);

function applyTheme() {
  const root = document.documentElement;
  const t = resolvedTheme();
  root.dataset.theme = t.mode;
  const style = root.style;
  style.setProperty('--shell-rgb', t.surface);
  style.setProperty('--widget', `rgb(${t.surface} / ${(0.52 * (t.alpha ?? 1)).toFixed(2)})`);
  style.setProperty('--surface', `rgb(${t.surface} / .92)`);
  style.setProperty('--shell-alpha', S.glass ? String((S.glassTint * (t.alpha ?? 1)).toFixed(3)) : '1');

  const accent = accentHex();
  style.setProperty('--accent', accent);
  style.setProperty('--accent-text', luminance(hexToRgb(accent)) > 0.7 ? '#111' : '#fff');

  root.classList.toggle('no-glass', !S.glass);
  root.classList.toggle('liquid', S.glass && S.glassStyle === 'liquid');
  for (const s of ['default', 'dark', 'clear']) root.classList.toggle('icons-' + s, S.iconStyle === s);
  for (const s of ['glass', 'solid', 'tinted']) root.classList.toggle('widgets-' + s, S.widgetStyle === s);
  style.setProperty('--widget-tint', hexToRgb(S.widgetTint).join(' '));
  refreshLiquid();
  if (IS_SHELL) {
    renderIsland();
    renderLanguage();
    updateGlass();
  }
}

let windowsWallpaperUrl;

async function applyWallpaper() {
  let css;
  if (S.wallpaper === 'windows') {
    if (windowsWallpaperUrl === undefined) {
      try { windowsWallpaperUrl = await call('windowsWallpaper'); } catch { windowsWallpaperUrl = null; }
    }
    css = windowsWallpaperUrl ? `url("${windowsWallpaperUrl}") center / cover no-repeat` : waveWallpaper("graphite");
  } else if (S.wallpaper && typeof S.wallpaper === 'object') {
    css = `url("${S.wallpaper.url}") center / cover no-repeat`;
  } else {
    css = waveWallpaper(S.wallpaper) || waveWallpaper("graphite");
  }
  document.documentElement.style.setProperty('--wp', css);
}

/** Picks a comfortable size for the screen: smaller on compact laptops, larger on big monitors. */
function autoScale() {
  const h = screen.height, w = screen.width;
  if (h <= 720 || w <= 1280) return 0.85;
  if (h <= 800) return 0.9;
  if (h >= 2000) return 1.3;
  if (h >= 1400) return 1.15;
  return 1;
}

let appliedZoom = null;

function applyScale() {
  const zoom = S.uiScale === 'auto' ? autoScale() : Number(S.uiScale) || 1;
  const root = document.documentElement.style;
  root.setProperty('--dock-size', S.dockSize + 'px');
  root.setProperty('--icon-size', S.iconSize + 'px');
  if (zoom !== appliedZoom) {
    appliedZoom = zoom;
    if (host) call('setZoom', { zoom });
  }
  if (PART === 'shell') requestAnimationFrame(updateDockVisibility);
}

/* ---------- Liquid glass ----------
   Each widget gets its own SVG filter: a displacement map that is neutral in the middle and
   bends the backdrop near the rounded edges, like light through a thick, curved pane. The
   filter is used as part of the element's backdrop-filter, so the wallpaper behind the widget
   refracts. (In the shell layer there's no backdrop to bend; the native acrylic panes blur instead.) */

let liquidTimer;

function refreshLiquid() {
  if (!IS_DESKTOP) return;
  clearTimeout(liquidTimer);
  liquidTimer = setTimeout(buildLiquid, 120);
}

function liquidTargets() {
  return $$(".widget").filter(el => !el.hidden && el.offsetParent !== null);
}

/**
 * The refraction goes on an inner layer clipped to the widget's exact rounded shape: the engine
 * ignores rounded corners for filtered backdrops, so applying it to the widget itself let square
 * corners peek out.
 */
function liquidLayer(widget) {
  let layer = widget.querySelector(":scope > .lg-backdrop");
  if (!layer) { layer = h("div", { class: "lg-backdrop", "aria-hidden": "true" }); widget.prepend(layer); }
  return layer;
}

function buildLiquid() {
  const defs = $("#lg-defs defs");
  defs.replaceChildren();
  const on = S.glass && S.glassStyle === "liquid" && S.refraction > 0;
  for (const layer of $$(".lg-backdrop")) layer.style.backdropFilter = "";
  for (const el of $$(".widget")) el.style.backdropFilter = "";
  if (!on) return;

  liquidTargets().forEach((el, i) => {
    const w = el.offsetWidth, hgt = el.offsetHeight;
    if (!w || !hgt) return;
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const id = "lg-" + i;
    const filter = s("filter", {
      id, x: 0, y: 0, width: w, height: hgt, filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB",
    });
    filter.append(
      s("feImage", { href: displacementMap(w, hgt, radius), x: 0, y: 0, width: w, height: hgt, preserveAspectRatio: "none", result: "map" }),
      s("feDisplacementMap", { in: "SourceGraphic", in2: "map", scale: (S.refraction * 0.9).toFixed(1), xChannelSelector: "R", yChannelSelector: "G" }),
    );
    defs.append(filter);
    const layer = liquidLayer(el);
    layer.style.clipPath = `inset(0 round ${radius}px)`;
    layer.style.backdropFilter = `url(#${id}) blur(3px) saturate(185%) brightness(1.06)`;
    el.style.backdropFilter = "none"; // the layer does the blurring now
  });
}

const mapCache = new Map();

/** Red/green encode which way to bend: neutral (128) in the middle, pulling toward the centre near the edges. */
function displacementMap(w, hgt, radius) {
  const key = [w, hgt, radius].join('x');
  if (mapCache.has(key)) return mapCache.get(key);
  const k = 0.5; // half resolution is plenty; the filter stretches it
  const cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(hgt * k));
  const r = Math.max(1, radius * k);
  const band = Math.max(4, Math.min(30, Math.min(w, hgt) / 3) * k);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cw, ch);
  const d = img.data;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const px = x + 0.5, py = y + 0.5;
      let nx = 0, ny = 0, dist;
      const inCornerX = px < r || px > cw - r, inCornerY = py < r || py > ch - r;
      if (inCornerX && inCornerY) {
        const cx = px < r ? r : cw - r, cy = py < r ? r : ch - r;
        const vx = px - cx, vy = py - cy, len = Math.hypot(vx, vy) || 1;
        dist = r - len;
        nx = vx / len;
        ny = vy / len;
      } else {
        const dl = px, dr = cw - px, dt = py, db = ch - py;
        dist = Math.min(dl, dr, dt, db);
        if (dist === dl) nx = -1; else if (dist === dr) nx = 1; else if (dist === dt) ny = -1; else ny = 1;
      }
      const t = Math.min(1, Math.max(0, dist) / band);
      const m = (1 - t) * (1 - t); // strongest right at the edge, fading smoothly inward
      const i = (y * cw + x) * 4;
      d[i] = 128 - nx * 127 * m;
      d[i + 1] = 128 - ny * 127 * m;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  mapCache.set(key, url);
  return url;
}

/** Soft highlight that follows the pointer across glass surfaces. */
function initSheen() {
  let current = null;
  document.addEventListener('pointermove', e => {
    const el = e.target.closest?.('.widget, .dock');
    if (current && current !== el) current.style.setProperty('--sheen', 0);
    current = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    el.style.setProperty('--sheen', 1);
  });
  document.addEventListener('pointerleave', () => current?.style.setProperty('--sheen', 0));
}

/* ---------- Menu bar ---------- */

function tickMenubar() {
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', second: S.clockSeconds ? '2-digit' : undefined, hour12: !S.clock24,
  });
  const date = S.clockDate ? now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + '  ' : '';
  const text = date + time;
  const el = $('#menubar-clock');
  if (el.textContent !== text) el.textContent = text;
}

function displayName() {
  return (S.name || '').trim() || (account.displayName || env.user || '').split(' ')[0];
}

function renderAccount() {
  if (!IS_SHELL) return;
  const name = displayName();
  $('#account-name').textContent = name;
  const avatar = $('#avatar');
  if (account.picture) { avatar.style.backgroundImage = `url("${account.picture}")`; avatar.textContent = ''; }
  else { avatar.style.backgroundImage = ''; avatar.textContent = (name || '?').charAt(0).toUpperCase(); }
}

/** The bold title shows whichever app is in front, like the app menu on a Mac. */
function activeWindow() {
  return windows.find(w => w.hwnd === foreground) || null;
}

function activeAppName() {
  const w = activeWindow();
  if (!w) return 'Haven';
  return appForWindow(w)?.name || prettyExe(w.exe);
}

function renderActiveApp() {
  $('[data-menu="app"]').textContent = activeAppName();
}

/* ---------- Analog clock ---------- */

let hands;

function buildAnalogClock() {
  const face = $('#analog');
  face.replaceChildren();
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const r1 = major ? 86 : 88, r2 = 93;
    face.append(s('line', {
      class: 'tick' + (major ? ' major' : ''),
      x1: 100 + r1 * Math.sin(a), y1: 100 - r1 * Math.cos(a),
      x2: 100 + r2 * Math.sin(a), y2: 100 - r2 * Math.cos(a),
    }));
  }
  for (let n = 1; n <= 12; n++) {
    const a = (n / 12) * Math.PI * 2;
    const t = s('text', { class: 'num', x: 100 + 70 * Math.sin(a), y: 100 - 70 * Math.cos(a) });
    t.textContent = n;
    face.append(t);
  }
  hands = {
    hour: s('line', { class: 'hand hour', x1: 100, y1: 100, x2: 100, y2: 58 }),
    minute: s('line', { class: 'hand minute', x1: 100, y1: 100, x2: 100, y2: 30 }),
    second: s('line', { class: 'hand second', x1: 100, y1: 112, x2: 100, y2: 24 }),
  };
  face.append(hands.hour, hands.minute, hands.second, s('circle', { class: 'pin', cx: 100, cy: 100, r: 4 }));
}

function tickClock() {
  const now = new Date();
  const sec = now.getSeconds();
  const min = now.getMinutes() + sec / 60;
  const hr = (now.getHours() % 12) + min / 60;
  hands.hour.setAttribute('transform', `rotate(${hr * 30} 100 100)`);
  hands.minute.setAttribute('transform', `rotate(${min * 6} 100 100)`);
  hands.second.setAttribute('transform', `rotate(${sec * 6} 100 100)`);
}

/* ---------- Calendar ---------- */

let calOffset = 0;

function renderCalendar() {
  const today = new Date();
  const view = new Date(today.getFullYear(), today.getMonth() + calOffset, 1);
  $('#cal-month').textContent = view.toLocaleDateString(undefined, { month: 'long' });
  $('#cal-year').textContent = view.getFullYear();

  const grid = $('#cal-grid');
  grid.replaceChildren();
  for (const d of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) grid.append(h('span', { class: 'dow', text: d }));
  const start = new Date(view);
  start.setDate(1 - view.getDay());
  for (let i = 0; i < 42; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const other = day.getMonth() !== view.getMonth();
    const isToday = day.toDateString() === today.toDateString();
    grid.append(h('span', { class: 'day' + (other ? ' other' : '') + (isToday ? ' today' : ''), text: day.getDate() }));
  }
}

/* ---------- Batteries ---------- */

const DEVICE_ICONS = {
  mouse: '<svg viewBox="0 0 24 24"><rect x="6.5" y="3" width="11" height="18" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 6.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7.5 14h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  headphones: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="4.5" height="6.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  controller: '<svg viewBox="0 0 24 24"><path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.4l-.8 4a2.4 2.4 0 0 1-4.2 1L14.5 15h-5l-1.9 2.4a2.4 2.4 0 0 1-4.2-1l-.8-4A4.5 4.5 0 0 1 7 7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 10v3M6.5 11.5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="11" r=".9" fill="currentColor"/><circle cx="17.5" cy="13" r=".9" fill="currentColor"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="m15 4 5 5L9 20H4v-5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  laptop: '<svg viewBox="0 0 24 24"><rect x="4.5" y="5" width="15" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 18.5h19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  device: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 18h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

let pcBattery = null;
let deviceBatteries = [];

async function refreshBatteries(spin = false) {
  if (spin) spinButton($('#batteries-refresh'));
  try { deviceBatteries = await call('batteries') || []; } catch { deviceBatteries = []; }
  renderBatteries();
}

function batteryRing(level, kind) {
  const r = 26, c = 2 * Math.PI * r;
  const color = level <= 20 ? 'var(--low)' : 'var(--good)';
  const gauge = s('svg', { class: 'gauge', viewBox: '0 0 62 62' });
  gauge.append(
    s('circle', { cx: 31, cy: 31, r, fill: 'none', stroke: 'var(--separator)', 'stroke-width': 3.5 }),
    s('circle', { cx: 31, cy: 31, r, fill: 'none', stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round',
      'stroke-dasharray': `${(c * level) / 100} ${c}` }),
  );
  return h('div', { class: 'ring' }, gauge, h('div', { class: 'device-icon' }, svg(DEVICE_ICONS[kind] || DEVICE_ICONS.device)));
}

function renderBatteries() {
  if (!IS_DESKTOP) return;
  const items = deviceBatteries.map(b => ({ name: b.name, level: b.level, kind: b.kind, state: 'Connected' }));
  if (pcBattery) items.unshift({ name: 'This PC', level: pcBattery.level, kind: 'laptop', state: pcBattery.charging ? 'Charging' : 'On battery' });

  const list = $('#battery-list');
  list.classList.toggle('multi', items.length > 1);
  if (!items.length) {
    list.replaceChildren(h('div', { class: 'battery-empty', text: 'No devices are reporting a battery level. Connect a Bluetooth device to see it here.' }));
    return;
  }
  list.replaceChildren(...items.slice(0, 4).map(b => h('div', { class: 'battery-row' },
    batteryRing(b.level, b.kind),
    h('div', { style: 'min-width:0' },
      h('div', { class: 'battery-name', text: b.name, title: b.name }),
      h('div', { class: 'battery-pct', text: b.level + '%' }),
      h('div', { class: 'battery-state', text: b.state })))));
}

async function initPcBattery() {
  if (!navigator.getBattery) return;
  try {
    const battery = await navigator.getBattery();
    const update = () => {
      // Desktops report a permanently full, charging battery; treat that as no battery.
      const present = !(battery.charging && battery.level === 1 && battery.chargingTime === 0);
      pcBattery = present ? { level: Math.round(battery.level * 100), charging: battery.charging } : null;
      if (IS_SHELL) renderMenubarBattery();
      renderBatteries();
    };
    update();
    for (const ev of ['levelchange', 'chargingchange', 'chargingtimechange']) battery.addEventListener(ev, update);
  } catch { /* no battery API */ }
}

function renderMenubarBattery() {
  const el = $('#battery');
  el.hidden = !pcBattery;
  if (!pcBattery) return;
  const fill = Math.max(1, Math.round(16 * pcBattery.level / 100));
  const color = pcBattery.level <= 15 && !pcBattery.charging ? '#ff453a' : 'currentColor';
  el.replaceChildren(
    h('span', { text: pcBattery.level + '%' }),
    svg(`<svg width="25" height="12" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity=".5"/><rect x="22.5" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5"/><rect x="2.5" y="2.5" width="${fill + 1}" height="7" rx="1.5" fill="${color}"/></svg>`),
  );
}

function spinButton(btn) {
  btn.classList.remove('spin');
  void btn.offsetWidth;
  btn.classList.add('spin');
}

/* ---------- Icons ---------- */

function hue(str) {
  let x = 0;
  for (const c of str) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return x % 360;
}

function appIcon(item, className = '') {
  const src = (item.id && customIcon('app:' + item.id)) || item.icon || item.image;
  if (src) {
    const img = h('img', { class: 'app-icon ' + className, src, alt: '', draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(letterIcon(item.name, className)), { once: true });
    return img;
  }
  return letterIcon(item.name, className);
}

function letterIcon(name, className = '') {
  const hh = hue(name || '?');
  return h('div', {
    class: `app-icon letter-icon ${className}`,
    style: `background: linear-gradient(150deg, hsl(${hh} 75% 62%), hsl(${(hh + 40) % 360} 70% 45%))`,
  }, h('span', { text: (name || '?').trim().charAt(0).toUpperCase() }));
}

const ICONS = {
  launchpad: '<svg viewBox="0 0 24 24"><g fill="currentColor"><rect x="3" y="3" width="5" height="5" rx="1.4"/><rect x="9.5" y="3" width="5" height="5" rx="1.4"/><rect x="16" y="3" width="5" height="5" rx="1.4"/><rect x="3" y="9.5" width="5" height="5" rx="1.4"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.4"/><rect x="16" y="9.5" width="5" height="5" rx="1.4"/><rect x="3" y="16" width="5" height="5" rx="1.4"/><rect x="9.5" y="16" width="5" height="5" rx="1.4"/><rect x="16" y="16" width="5" height="5" rx="1.4"/></g></svg>',
  settings: '<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.7a7 7 0 0 1 0 1.9l2 1.7-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6a7 7 0 0 1-1.7-.9l-2.5.9-1.7-2.9 2-1.7a7 7 0 0 1 0-1.9l-2-1.7 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" transform="translate(0 1)"/></svg>',
  downloads: '<svg viewBox="0 0 24 24"><path d="M12 4v10m0 0-4-4m4 4 4-4M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7M6.5 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h5.2c1.1 0 1.9-.9 2-1.9l.9-12.6" fill="rgba(255,255,255,.08)" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 10v7M14 10v7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".7"/></svg>',
  folder: '<svg viewBox="0 0 48 48"><path d="M4 12a4 4 0 0 1 4-4h11l4 4h17a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#3b8fe8"/><path d="M4 18a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#62adf5"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  play: '<svg viewBox="0 0 20 20"><path d="M6.5 4v12l9.5-6z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 20 20"><path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 16 16"><path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.8 4.5 7.8z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="6.7" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
};

function tileIcon(name) {
  const custom = customIcon(name);
  if (custom) return h('img', { class: 'app-icon custom-icon', src: custom, alt: '', draggable: 'false' });
  return h('div', { class: `app-icon tile-icon tile-${name}` }, svg(ICONS[name]));
}

/* ---------- Apps, games, launching ---------- */

async function loadApps(refresh = false) {
  try {
    apps = await call('apps', { refresh });
  } catch (err) {
    toast('Couldn’t list your apps: ' + err.message);
    apps = [];
  }
  appById.clear();
  for (const a of apps) appById.set(a.id, a);

  if (!Array.isArray(S.dock)) {
    const byName = new Map(apps.map(a => [a.name.toLowerCase(), a]));
    S.dock = DEFAULT_DOCK.map(n => byName.get(n.toLowerCase())).filter(Boolean).slice(0, 9).map(a => a.id);
    save();
  }
  renderDock(true);
  renderActiveApp();
  if (!$('#launchpad').hidden) renderLaunchpad();
}

async function loadGames() {
  try { games = await call('games'); } catch { games = []; }
}

async function launchApp(app, sourceEl) {
  bounce(sourceEl);
  try { await call('launchApp', { id: app.id }); } catch (err) { toast(err.message); }
}

async function launchGame(game, sourceEl) {
  bounce(sourceEl);
  try { await call('launchUri', { uri: game.uri }); } catch (err) { toast(err.message); }
}

function launchItem(entry, sourceEl) {
  return entry.kind === 'game' ? launchGame(entry.item, sourceEl) : launchApp(entry.item, sourceEl);
}

async function openFolder(path) {
  try { await call('openFolder', { path }); } catch (err) { toast(err.message); }
}

async function openShell(target) {
  try { await call('openShell', { target }); } catch (err) { toast(err.message); }
}

async function openSettingsPage(page) {
  try { await call('openSettingsPage', { page }); } catch (err) { toast(err.message); }
}

function bounce(el) {
  const target = el?.closest?.('.dock-item');
  if (!target) return;
  target.classList.remove('bounce');
  void target.offsetWidth;
  target.classList.add('bounce');
  target.addEventListener('animationend', () => target.classList.remove('bounce'), { once: true });
}

function isPinned(id) { return (S.dock || []).includes(id); }
function pin(id) { if (!isPinned(id)) { S.dock = [...(S.dock || []), id]; save(); renderDock(true); } }
function unpin(id) { S.dock = (S.dock || []).filter(x => x !== id); save(); renderDock(true); }

const normalizeName = n => (n || '').toLowerCase().replace(/\.exe$/, '').replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '');

function appForExe(exe) {
  if (!exe) return null;
  const lower = exe.toLowerCase();
  const byExe = apps.find(a => a.exe && a.exe.toLowerCase() === lower);
  if (byExe) return byExe;
  // Fall back to the name: "Discord.exe" belongs to the "Discord" app even though its shortcut starts Update.exe.
  const base = normalizeName(exe);
  if (base.length < 3) return null;
  return apps.find(a => normalizeName(a.name) === base)
    || apps.find(a => normalizeName(a.name).startsWith(base) || base.startsWith(normalizeName(a.name)) && normalizeName(a.name).length >= 4)
    // "Code.exe" → "Visual Studio Code": the program's name is one of the app's words.
    || (base.length >= 4 ? apps.find(a => a.name.toLowerCase().split(/[^a-z0-9]+/).includes(base)) : null)
    || null;
}

/** The app a window belongs to: by its app id first (what Windows itself uses), then program file, then name. */
function appForWindow(w) {
  if (!w) return null;
  if (w.aumid) {
    const id = w.aumid.toLowerCase();
    const byId = apps.find(a => a.id.toLowerCase() === id);
    if (byId) return byId;
  }
  return appForExe(w.exe);
}

/** The running-window group (if any) that belongs to a pinned app. */
function groupForApp(app, groups) {
  for (const g of groups.values()) if (g.app?.id === app.id) return g;
  return null;
}

/* ---------- Dock ---------- */

let dockSignature = '';

function groupWindows() {
  const groups = new Map();
  for (const w of windows) {
    const key = w.exe.toLowerCase();
    if (!groups.has(key)) groups.set(key, { exe: w.exe, icon: w.icon, wins: [], app: appForWindow(w) });
    groups.get(key).wins.push(w);
  }
  return groups;
}

/** Clicking a running app: bring it forward, or minimize it if it's already in front (like the taskbar). */
function activateGroup(group, sourceEl, app) {
  if (!group) return launchApp(app, sourceEl);
  const front = group.wins.find(w => w.hwnd === foreground);
  if (front) call('minimize', { hwnd: front.hwnd });
  else focusWindow(group.wins[0]);
}

function renderDock(force = false) {
  if (!IS_SHELL) return;
  const groups = groupWindows();
  const pinned = (S.dock || []).map(id => appById.get(id)).filter(Boolean);
  const pinnedIds = new Set(pinned.map(a => a.id));
  const extra = [...groups.values()].filter(g => !pinnedIds.has(g.app?.id));
  const showMinimized = !isPartHidden('dock-minimized');

  const signature = JSON.stringify([
    pinned.map(a => [a.id, !!groupForApp(a, groups)]),
    extra.map(g => [g.exe, g.wins.length, g.wins.filter(w => w.minimized).length]),
    windows.filter(w => w.minimized).map(w => w.hwnd),
    [...attentionApps],
  ]);
  if (!force && signature === dockSignature) return;
  dockSignature = signature;

  const dock = $('#dock');
  dock.replaceChildren();
  dock.append(dockItem({ label: tileLabel('launchpad'), icon: tileIcon('launchpad'), tile: 'launchpad', onClick: () => openLaunchpad(),
    menu: () => [...iconMenuItems('launchpad'), '-', { label: 'Hide from Dock', action: () => setPartHidden('dock-launchpad', true) }] }));

  for (const app of pinned) {
    const group = groupForApp(app, groups);
    dock.append(dockItem({
      label: app.name,
      icon: appIcon(app),
      running: !!group,
      appId: app.id,
      exePath: group?.wins[0]?.exePath,
      attention: !!group && attentionApps.has(group.exe.toLowerCase()),
      onClick: el => activateGroup(group, el, app),
      menu: () => [
        ...(group ? group.wins.slice(0, 8).map(w => ({ label: truncate(w.title, 48), action: () => focusWindow(w) })) : []),
        group && '-',
        { label: group ? 'New Window' : 'Open', action: el => launchApp(app, el) },
        group && { label: group.wins.length > 1 ? 'Close All Windows' : 'Close Window', action: () => group.wins.forEach(w => call('closeWindow', { hwnd: w.hwnd })) },
        '-',
        ...iconMenuItems('app:' + app.id),
        { label: 'Remove from Dock', action: () => unpin(app.id) },
      ],
    }));
  }

  for (const group of showMinimized ? extra.filter(g => g.wins.some(w => !w.minimized)) : extra) {
    const match = group.app;
    const name = match?.name || prettyExe(group.exe);
    dock.append(dockItem({
      label: group.wins.length > 1 ? `${name} (${group.wins.length})` : name,
      icon: appIcon({ name, icon: match?.icon || group.icon }),
      running: true,
      kind: 'running',
      exePath: group.wins[0].exePath,
      attention: attentionApps.has(group.exe.toLowerCase()),
      onClick: el => activateGroup(group, el, match),
      menu: () => [
        ...group.wins.slice(0, 8).map(w => ({ label: truncate(w.title, 48), action: () => focusWindow(w) })),
        '-',
        { label: group.wins.length > 1 ? 'Close All Windows' : 'Close Window', action: () => group.wins.forEach(w => call('closeWindow', { hwnd: w.hwnd })) },
        match && { label: 'Keep in Dock', action: () => pin(match.id) },
        match && '-',
        ...(match ? iconMenuItems('app:' + match.id) : []),
      ],
    }));
  }

  dock.append(h('div', { class: 'dock-sep' }));
  dock.append(dockItem({ label: tileLabel('settings'), icon: tileIcon('settings'), tile: 'settings', onClick: () => openSettings(),
    menu: () => [...iconMenuItems('settings'), '-', { label: 'Hide from Dock', action: () => setPartHidden('dock-settings', true) }] }));
  if (env.downloads) dock.append(dockItem({
    label: tileLabel('downloads'), icon: tileIcon('downloads'), tile: 'downloads', onClick: el => openDownloadsStack(el), dropFolder: true,
    menu: () => [{ label: 'Open in File Explorer', action: () => openFolder(env.downloads) }, '-', ...iconMenuItems('downloads'),
      { label: 'Hide from Dock', action: () => setPartHidden('dock-downloads', true) }],
  }));
  // Minimized windows sit on the right, next to the Recycle Bin, like on a Mac.
  for (const w of showMinimized ? windows.filter(w => w.minimized).slice(0, 6) : []) {
    const match = appForWindow(w);
    dock.append(dockItem({
      label: w.title, icon: h('div', { class: 'minimized-icon' }, appIcon({ name: match?.name || prettyExe(w.exe), icon: match?.icon || w.icon })),
      kind: 'minimized',
      onClick: () => focusWindow(w),
      menu: () => [{ label: 'Restore', action: () => focusWindow(w) }, { label: 'Close Window', action: () => call('closeWindow', { hwnd: w.hwnd }) }],
    }));
  }
  dock.append(dockItem({ label: tileLabel('trash'), icon: tileIcon('trash'), tile: 'trash', onClick: () => openShell('trash'),
    menu: () => [{ label: 'Open', action: () => openShell('trash') }, '-', ...iconMenuItems('trash'), { label: 'Hide from Dock', action: () => setPartHidden('dock-trash', true) }] }));
  requestAnimationFrame(() => { updateRegion(); updateReserve(); });
  syncSwipeOrder();
}

function dockItem({ label, icon, running = false, onClick, menu, appId, exePath, attention, dropFolder, tile, kind }) {
  const el = h('button', { class: 'dock-item' + (running ? ' running' : '') + (attention ? ' attention' : ''), 'aria-label': label, 'data-tile': tile, 'data-kind': kind, 'data-exe': exePath ? exePath.split(/[\\/]/).pop().toLowerCase() : undefined },
    icon, h('span', { class: 'label', text: label }));
  el.addEventListener('click', () => onClick(el));
  if (menu) el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, menu(), el); });
  if (appId && isPinned(appId)) makeDockDraggable(el, appId);
  if (appId || exePath || dropFolder) acceptFileDrops(el, { appId, exePath, dropFolder });
  return el;
}

let dockHover = false;

function initDock() {
  const dock = $('#dock');
  dock.addEventListener('mouseenter', () => { dockHover = true; updateRegion(); });
  dock.addEventListener('mousemove', e => {
    if (!S.magnify) return;
    requestAnimationFrame(updateGlass); // the Dock widens as icons grow; keep the glass under it
    for (const item of dock.querySelectorAll('.dock-item')) {
      const r = item.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      item.style.setProperty('--s', (1 + 0.4 * Math.max(0, 1 - d / (S.dockSize * 2.8))).toFixed(3));
    }
  });
  dock.addEventListener('mouseleave', () => {
    dockHover = false;
    for (const item of dock.querySelectorAll('.dock-item')) item.style.setProperty('--s', 1);
    setTimeout(updateRegion, 160); // after the icons shrink back
  });
}

function prettyExe(exe) {
  const base = exe.replace(/\.exe$/i, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function truncate(str, n) { return str.length > n ? str.slice(0, n - 1) + '…' : str; }

/* ---------- Shell layer: clickable area, keyboard focus, reserved edges ---------- */

let regionKey = '';
let regionRaf = 0;
let shellInteractive = false;

const FULLSCREEN_OVERLAYS = ['#launchpad', '#spotlight', '#modal', '#quicklook', '#control-center', '#switcher', '#stack-pop', '#lock', '#nc', '#saver'];
const KEYBOARD_OVERLAYS = ['#launchpad', '#spotlight', '#modal', '#quicklook', '#lock', '#saver'];

/** Overlays that take the whole screen (so clicking outside closes them). */
function anyOverlayOpen() {
  return FULLSCREEN_OVERLAYS.some(sel => { const el = $(sel); return el && !el.hidden; });
}

/** Overlays you type into; the switcher and Control Center never steal focus from your app. */
function needsKeyboard() {
  return KEYBOARD_OVERLAYS.some(sel => { const el = $(sel); return el && !el.hidden; });
}

/**
 * Tells the host which parts of the see-through layer should take clicks. Normally that's just
 * the menu bar and the Dock; while a menu or overlay is open it's the whole screen, so clicking
 * anywhere else closes it instead of reaching the app underneath.
 */
function updateRegion() {
  if (PART !== 'shell') return;
  cancelAnimationFrame(regionRaf);
  regionRaf = requestAnimationFrame(() => {
    const dpr = devicePixelRatio;
    let payload;
    if (anyOverlayOpen() || !$('#context-menu').hidden) {
      payload = { full: true };
    } else {
      const rects = [];
      const add = (l, t, r, b) => rects.push([l, t, r, b].map(v => Math.round(v * dpr)));
      const bar = $('.menubar').getBoundingClientRect();
      add(bar.left, bar.top, bar.right, bar.bottom);
      if (!$('#island').hidden) { const i = $('#island').getBoundingClientRect(); add(i.left - 4, i.top, i.right + 4, i.bottom + 4); }
      if (dockTucked) {
        add(0, innerHeight - 3, innerWidth, innerHeight); // the reveal strip along the bottom edge
      } else {
        const d = $('#dock').getBoundingClientRect();
        // While hovered the icons grow and labels appear above them; give them room.
        const growX = dockHover ? S.dockSize * 2 : 4;
        const growUp = dockHover ? S.dockSize * 0.5 + 44 : 4;
        add(d.left - growX, d.top - growUp, d.right + growX, innerHeight);
      }
      if (!$('#toast').hidden) { const t = $('#toast').getBoundingClientRect(); add(t.left, t.top, t.right, t.bottom); }
      if (!$('#shot-preview').hidden) { const p = $('#shot-preview').getBoundingClientRect(); add(p.left - 4, p.top - 4, p.right + 4, p.bottom + 4); }
      payload = { full: false, rects };
    }
    updateGlass();
    const key = JSON.stringify(payload);
    if (key === regionKey) return;
    regionKey = key;
    call('setRegion', payload);
  });
}

/** Search, Launchpad and dialogs need the keyboard; the bar and Dock never steal focus from your app. */
function syncShell() {
  if (!IS_SHELL) return;
  const want = needsKeyboard();
  if (want !== shellInteractive || want) {
    shellInteractive = want;
    call('setInteractive', { on: want });
  }
  updateDockVisibility();
}

/* ---------- Glass panes & auto-hiding Dock (shell layer) ---------- */

let dockOverlap = false;   // the app in front overlaps the Dock (reported by the host)
let dockPeek = false;      // the pointer touched the bottom edge
let dockTucked = false;
let glassKey = '';
let dockRectKey = '';

function dockShouldHide() {
  return S.dockAutohide === 'always' || (S.dockAutohide === 'smart' && dockOverlap);
}

function updateDockVisibility() {
  if (PART !== 'shell') return;
  const tuck = dockShouldHide() && !dockPeek && !dockHover && !anyOverlayOpen() && $('#context-menu').hidden;
  if (tuck !== dockTucked) {
    dockTucked = tuck;
    $('#dock-wrap').classList.toggle('tucked', tuck);
    updateGlass(); // hide the pane right away; it comes back once the Dock has slid in
    setTimeout(updateGlass, 260);
  }
  updateRegion();
  updateReserve();
}

/** Positions the native frosted-glass panes exactly behind the menu bar and the Dock. */
function updateGlass() {
  if (PART !== 'shell') return;
  const dpr = devicePixelRatio;
  const plates = [];
  const d = $('#dock').getBoundingClientRect();
  if (S.glass) {
    const b = $('.menubar').getBoundingClientRect();
    if (b.width) plates.push([b.left, b.top, b.width, b.height, 0]);
    // The Dock draws its own glass: a native blur pane can't follow its rounded corners
    // or keep up smoothly while it magnifies.
  }
  const px = plates.map(p => p.map(v => Math.round(v * dpr)));
  const key = JSON.stringify(px);
  if (key !== glassKey) {
    glassKey = key;
    call('setGlass', { plates: px });
  }
  // Where the Dock sits when shown, so the host can tell when a window overlaps it.
  if (!dockTucked) {
    const rect = [d.left, d.top, d.right, innerHeight].map(v => Math.round(v * dpr));
    const rk = JSON.stringify(rect);
    if (rk !== dockRectKey) { dockRectKey = rk; call('setDockRect', { rect }); }
  }
}

function initDockReveal() {
  $('#dock-reveal').addEventListener('mouseenter', () => { dockPeek = true; updateDockVisibility(); });
  $('#dock').addEventListener('mouseleave', () => {
    setTimeout(() => { if (!dockHover) { dockPeek = false; updateDockVisibility(); } }, 500);
  });
}

let reserveKey = '';

/** Keeps maximized windows between the menu bar and the Dock. */
function updateReserve() {
  if (PART !== 'shell') return;
  const dpr = devicePixelRatio;
  const top = Math.ceil($('.menubar').getBoundingClientRect().bottom * dpr);
  // A Dock that hides itself doesn't need windows to keep clear of it.
  const dockShown = !!$('#dock').offsetParent && !isPartHidden('dock');
  const bottom = S.dockAutohide === 'off' && dockShown
    ? Math.round((innerHeight - $('#dock').getBoundingClientRect().top + 8) * dpr)
    : 0;
  const key = top + ',' + bottom;
  if (key === reserveKey) return;
  reserveKey = key;
  call('reserve', { top, bottom });
}

/* ---------- Running windows ---------- */

let windowsTimer;
const attentionApps = new Set();

async function pollWindowsNow() {
  try {
    const res = await call('windows');
    windows = res?.windows || [];
    foreground = res?.foreground || 0;
    clearAttentionForForeground();
    renderDock();
    renderActiveApp();
  } catch { /* ignore */ }
}

async function pollWindows() {
  try {
    const res = await call('windows');
    windows = res?.windows || [];
    foreground = res?.foreground || 0;
    clearAttentionForForeground();
    if ((res?.language || '') !== inputLanguage) { inputLanguage = res?.language || ''; renderLanguage(); }
    renderDock();
    renderActiveApp();
  } catch { /* keep last known */ }
  setTimeout(pollWindows, 1000);
}

async function focusWindow(w) {
  try { await call('focus', { hwnd: w.hwnd }); } catch (err) { toast(err.message); }
}

/* ---------- Launchpad ---------- */

function openLaunchpad() {
  if (!IS_SHELL) return toShell('openLaunchpad');
  closeOverlays();
  $('#launchpad').hidden = false;
  $('#launchpad-search').value = '';
  renderLaunchpad();
  syncShell();
  focusSoon('#launchpad-search');
}

function focusSoon(sel) {
  for (const delay of [0, 80, 250]) setTimeout(() => $(sel)?.focus(), delay);
}




/* ---------- Search ---------- */

let spotlightResults = [];
let spotlightIndex = 0;
let spotlightMode = 'search'; // search | clipboard

function openSpotlight(mode = 'search') {
  if (!IS_SHELL) return toShell('openSpotlight', mode);
  closeOverlays();
  spotlightMode = typeof mode === 'string' ? mode : 'search';
  $('#spotlight').hidden = false;
  $('#spotlight').classList.toggle('clip-mode', spotlightMode === 'clipboard');
  $('#spotlight-input').placeholder = spotlightMode === 'clipboard' ? 'Search clipboard history' : 'Search apps, files, settings, maths, or ask Claude';
  $('#spotlight-answer')?.replaceChildren();
  if ($('#spotlight-answer')) $('#spotlight-answer').hidden = true;
  if (spotlightMode === 'clipboard' || !clipItems.length) loadClipItems();
  $('#spotlight-input').value = '';
  renderSpotlight();
  syncShell();
  focusSoon('#spotlight-input');
}



function initSpotlight() {
  const input = $('#spotlight-input');
  input.addEventListener('input', () => { spotlightIndex = 0; renderSpotlight(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); spotlightIndex = Math.min(spotlightIndex + 1, spotlightResults.length - 1); renderSpotlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spotlightIndex = Math.max(spotlightIndex - 1, 0); renderSpotlight(); }
    else if (e.key === 'Enter') {
      const entry = spotlightResults[spotlightIndex];
      if (entry) runSpotlightEntry(entry);
    }
  });
  $('#spotlight').addEventListener('mousedown', e => { if (e.target.id === 'spotlight') closeOverlays(); });
}

/* ---------- Weather (Open-Meteo, no account needed) ---------- */

const WEATHER_GLYPHS = {
  sun: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.8 6.8l2.1 2.1M23.1 23.1l2.1 2.1M6.8 25.2l2.1-2.1M23.1 8.9l2.1-2.1"/></g></svg>',
  partly: '<svg viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12.5 8.5a5 5 0 0 1 8.8 3.6"/><path d="M12 4v1.5M5.6 6.6l1 1M3 13h1.5"/><path d="M10 26h13a4.5 4.5 0 0 0 0-9 6.5 6.5 0 0 0-12.6 1.2A3.9 3.9 0 0 0 10 26z" stroke-linejoin="round"/></g></svg>',
  cloud: '<svg viewBox="0 0 32 32"><path d="M9 24h15a5 5 0 0 0 .3-10A7.5 7.5 0 0 0 10 15.5 4.3 4.3 0 0 0 9 24z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  fog: '<svg viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 17h15a5 5 0 0 0 .3-10A7.5 7.5 0 0 0 10 8.5 4.3 4.3 0 0 0 9 17z" stroke-linejoin="round"/><path d="M6 22h20M9 26h14"/></g></svg>',
  rain: '<svg viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 19h15a5 5 0 0 0 .3-10A7.5 7.5 0 0 0 10 10.5 4.3 4.3 0 0 0 9 19z" stroke-linejoin="round"/><path d="M11 23l-1 3M16 23l-1 3M21 23l-1 3"/></g></svg>',
  snow: '<svg viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 19h15a5 5 0 0 0 .3-10A7.5 7.5 0 0 0 10 10.5 4.3 4.3 0 0 0 9 19z" stroke-linejoin="round"/></g><g fill="currentColor"><circle cx="11" cy="24" r="1.1"/><circle cx="16" cy="26" r="1.1"/><circle cx="21" cy="24" r="1.1"/></g></svg>',
  storm: '<svg viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19h15a5 5 0 0 0 .3-10A7.5 7.5 0 0 0 10 10.5 4.3 4.3 0 0 0 9 19z"/><path d="M16.5 20l-2.5 4h3.5l-2 4"/></g></svg>',
};

function describeWeather(code) {
  if (code === 0) return ['Clear', 'sun'];
  if (code <= 2) return ['Partly cloudy', 'partly'];
  if (code === 3) return ['Overcast', 'cloud'];
  if (code <= 48) return ['Fog', 'fog'];
  if (code <= 57) return ['Drizzle', 'rain'];
  if (code <= 67) return ['Rain', 'rain'];
  if (code <= 77) return ['Snow', 'snow'];
  if (code <= 82) return ['Showers', 'rain'];
  if (code <= 86) return ['Snow showers', 'snow'];
  return ['Thunderstorms', 'storm'];
}

let weatherTimer;
let pcLocation;

async function weatherPlace() {
  if (S.city) return { ...S.city, label: S.city.name };
  if (pcLocation === undefined) {
    try { pcLocation = await call('location'); } catch { pcLocation = null; }
  }
  return pcLocation ? { ...pcLocation, label: 'Current location' } : null;
}

async function refreshWeather() {
  if (!IS_DESKTOP) return;
  clearTimeout(weatherTimer);
  const box = $('#weather');
  const head = label => h('div', { class: 'w-head' },
    h('span', { class: 'w-title', text: label }),
    h('button', { class: 'w-icon-btn', 'aria-label': 'Change location', title: 'Change location', onclick: () => openSettings('city') }, svg(ICONS.pin)));

  const place = await weatherPlace();
  if (!place) {
    box.replaceChildren(head('Weather'), h('div', { class: 'setup' },
      h('span', { text: 'Turn on location in Windows, or pick a city.' }),
      h('button', { class: 'pill-button', text: 'Choose city', onclick: () => openSettings('city') })));
    return;
  }
  try {
    const unit = S.units === 'f' ? '&temperature_unit=fahrenheit' : '';
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1${unit}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const [label, glyph] = describeWeather(data.current.weather_code);
    const updated = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    box.replaceChildren(
      head(place.label),
      h('div', { class: 'now' },
        h('div', { class: 'temp', text: Math.round(data.current.temperature_2m) + '°' }),
        h('div', { class: 'w-glyph', 'aria-label': label }, svg(WEATHER_GLYPHS[glyph]))),
      h('div', { class: 'cond', text: label }),
      h('div', { class: 'range', text: `H: ${Math.round(data.daily.temperature_2m_max[0])}°  L: ${Math.round(data.daily.temperature_2m_min[0])}°` }),
      h('div', { class: 'foot' }, h('div', { text: `Updated ${updated}` }), h('div', { text: 'Weather by Open-Meteo' })),
    );
  } catch {
    box.replaceChildren(head(place.label), h('div', { class: 'setup', text: 'Weather is unavailable right now.' }));
  }
  weatherTimer = setTimeout(refreshWeather, 20 * 60_000);
}

async function geocode(name) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return (data.results || []).map(r => ({
    name: r.name, admin: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude,
  }));
}

/* ---------- Now playing ---------- */

let media = null;
let mediaAt = 0;

async function pollMedia() {
  await refreshMedia();
  setTimeout(pollMedia, 2500);
}

async function refreshMedia() {
  let m = null;
  try { m = await call('media'); } catch { /* no media session */ }
  media = m;
  mediaAt = performance.now();
  renderMedia();
}

function renderMedia() {
  if (IS_SHELL) renderIsland();
  if (!IS_DESKTOP) return;
  const m = media;
  $('#media').classList.toggle('idle', !m);
  $('#media').classList.toggle('playing', !!m?.playing);
  $('#media-elapsed').textContent = m?.duration ? clockTime(m.position) : '';
  $('#media-length').textContent = m?.duration ? clockTime(m.duration) : '';
  const art = $('#media-art');
  if (m?.art) { art.style.backgroundImage = `url("${m.art}")`; art.replaceChildren(); }
  else { art.style.backgroundImage = ''; if (!art.firstChild) art.append(svg(ICONS.music)); }
  $('#media-title').textContent = m ? m.title : 'Nothing playing';
  $('#media-artist').textContent = m ? (m.artist || ' ') : 'Play something in any app';
  $('#media-app').textContent = m ? sourceName(m.app) : 'Now playing';
  $('#media-toggle').replaceChildren(svg(m?.playing ? ICONS.pause : ICONS.play));
  updateProgress();
}

function clockTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/* ---------- Now-playing pill (shell layer) ---------- */

function renderIsland() {
  const el = $('#island');
  const m = media;
  const show = S.island && !!m;
  if (el.hidden === show) { el.hidden = !show; updateRegion(); }
  if (!show) return;
  const art = $('#island-art');
  if (m.art) { art.style.backgroundImage = `url("${m.art}")`; art.replaceChildren(); }
  else { art.style.backgroundImage = ''; if (!art.firstChild) art.append(svg(ICONS.music)); }
  $('#island-title').textContent = m.artist ? `${m.title} · ${m.artist}` : m.title;
  el.classList.toggle('playing', !!m.playing);
  $('#island-toggle').replaceChildren(svg(m.playing ? ICONS.pause : ICONS.play));
}

function initIsland() {
  const el = $('#island');
  for (const btn of $$('[data-island]', el)) {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      try { await call('mediaControl', { action: btn.dataset.island }); setTimeout(refreshMedia, 350); }
      catch (err) { toast(err.message); }
    });
  }
  // The pill grows on hover to show its controls; keep the clickable area in step.
  el.addEventListener('mouseenter', () => requestAnimationFrame(() => setTimeout(updateRegion, 200)));
  el.addEventListener('mouseleave', () => setTimeout(updateRegion, 250));
}

/* ---------- Keyboard language (shell layer) ---------- */

let inputLanguage = '';

function renderLanguage() {
  const btn = $('#lang-button');
  btn.hidden = !S.showLanguage || !inputLanguage;
  btn.textContent = inputLanguage;
}

function updateProgress() {
  if (!IS_DESKTOP) return;
  const bar = $('#media-progress');
  const m = media;
  if (!m || !m.duration) { bar.classList.add('none'); return; }
  bar.classList.remove('none');
  const elapsed = m.playing ? (performance.now() - mediaAt) / 1000 : 0;
  const pos = Math.min(m.duration, m.position + elapsed);
  $('#media-progress-fill').style.width = (100 * pos / m.duration).toFixed(2) + '%';
}

function sourceName(aumid) {
  if (!aumid) return 'Now playing';
  let name = aumid.split('!')[0].replace(/\.exe$/i, '').split('_')[0];
  name = name.split('.').pop();
  if (/^[0-9A-F]{12,}$/i.test(name)) return 'Browser';
  if (/spotify/i.test(name)) return 'Spotify';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function initMedia() {
  for (const btn of $$('[data-media]')) {
    btn.addEventListener('click', async () => {
      try {
        await call('mediaControl', { action: btn.dataset.media });
        setTimeout(refreshMedia, 350);
      } catch (err) { toast(err.message); }
    });
  }
  $('#media-refresh').addEventListener('click', e => { spinButton(e.currentTarget); refreshMedia(); });
  setInterval(updateProgress, 500);
}

/* ---------- Reminders ---------- */

function reminderItems() {
  if (!S.reminders.length) return [h('li', { class: 'empty-note', text: 'A clear mind starts here.' })];
  return S.reminders.map(r => h('li', { class: r.done ? 'done' : '' },
    h('button', { class: 'check', 'aria-label': r.done ? 'Mark not done' : 'Mark done', onclick: () => { r.done = !r.done; save(); renderReminders(); } }),
    h('span', { class: 'text', text: r.text, title: 'Double-click to edit', ondblclick: e => editReminder(e.currentTarget, r) }),
    h('button', { class: 'edit', 'aria-label': 'Edit', title: 'Edit', onclick: e => editReminder(e.currentTarget.previousSibling, r) },
      svg('<svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3L6 13H3v-3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>')),
    h('button', { class: 'remove', 'aria-label': 'Delete', text: '×', onclick: () => { S.reminders = S.reminders.filter(x => x !== r); save(); renderReminders(); } })));
}

function editReminder(span, r) {
  const input = h('input', { class: 'rem-edit', value: r.text, maxlength: '140' });
  span.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = commit => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    if (commit && text) { r.text = text; save(); }
    renderReminders();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
  input.addEventListener('blur', () => finish(true));
}

function renderReminders() {
  if (IS_DESKTOP) {
    $('#reminder-list').replaceChildren(...reminderItems());
    $('#reminder-count').textContent = S.reminders.filter(r => !r.done).length;
  }
  const modalList = $('#modal-reminders');
  if (modalList) modalList.replaceChildren(...reminderItems());
}

function addReminder(text) {
  text = text.trim();
  if (!text) return;
  S.reminders = [...S.reminders, { id: Date.now().toString(36), text, done: false }];
  save();
  renderReminders();
}

function initReminders() {
  $('#reminder-form').addEventListener('submit', e => {
    e.preventDefault();
    addReminder($('#reminder-input').value);
    $('#reminder-input').value = '';
  });
  $('#open-reminders').addEventListener('click', () => openRemindersModal());
}

function openRemindersModal() {
  if (!IS_SHELL) return toShell('openReminders');
  const input = h('input', { id: 'modal-reminder-input', placeholder: 'Add a reminder', maxlength: '140' });
  const form = h('form', { class: 'rem-add', autocomplete: 'off' }, input,
    h('button', { type: 'submit', 'aria-label': 'Add' }, svg('<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')));
  form.addEventListener('submit', e => { e.preventDefault(); addReminder(input.value); input.value = ''; });
  openModal('Reminders', [
    form,
    h('ul', { class: 'rem-list', id: 'modal-reminders' }),
    h('button', { class: 'button', style: 'margin-top:10px', text: 'Clear completed',
      onclick: () => { S.reminders = S.reminders.filter(r => !r.done); save(); renderReminders(); } }),
  ]);
  renderReminders();
  focusSoon('#modal-reminder-input');
}

/* ---------- Widgets: visibility & edit mode ---------- */

let editing = false;

function applyWidgetVisibility() {
  if (!IS_DESKTOP) return;
  $('#widget-panel').hidden = !S.showWidgets;
  placeWidgets();
  $('#widget-float').hidden = !S.showWidgets;
  for (const el of $$('[data-widget]')) el.hidden = S.hidden.includes(el.dataset.widget);

  $('#hidden-widgets').replaceChildren(...(editing ? S.hidden.filter(id => WIDGETS[id]).map(id =>
    h('button', { class: 'add-chip', text: '+ ' + WIDGETS[id], onclick: () => { S.hidden = S.hidden.filter(x => x !== id); save(); applyWidgetVisibility(); } })) : []));

  for (const badge of $$('.remove-badge')) badge.remove();
  if (editing) {
    for (const el of $$('[data-widget]')) {
      el.prepend(h('button', { class: 'remove-badge', 'aria-label': 'Remove widget', text: '−',
        onclick: () => { S.hidden = [...S.hidden, el.dataset.widget]; save(); applyWidgetVisibility(); } }));
    }
  }
  renderDesktopIcons();
  refreshLiquid();
}

function toggleEditing(on = !editing) {
  if (!IS_DESKTOP) return toDesktop('editWidgets', { on });
  editing = on;
  if (on && !S.showWidgets) { S.showWidgets = true; save(); }
  $('#widget-panel').classList.toggle('editing', editing);
  $('#edit-widgets span').textContent = editing ? 'Done' : 'Edit widgets';
  applyWidgetVisibility();
}

function setShowWidgets(on) {
  S.showWidgets = on;
  save();
  applyWidgetVisibility();
}

/* ---------- Desktop icons ---------- */

let desktopItems = [];
let deskEntries = []; // icons actually shown: items, or stacks when Stacks is on
let selection = new Set();
const iconSlots = new Map(); // item id → [column from the right, row]

async function loadDesktop() {
  if (!IS_DESKTOP) return;
  try { desktopItems = await call('desktopItems') || []; } catch { desktopItems = []; }
  const ids = new Set(desktopItems.map(i => i.id));
  selection = new Set([...selection].filter(id => ids.has(id)));
  renderDesktopIcons();
}

function iconGrid() {
  const size = S.iconSize;
  const cw = size + 44, ch = size + 46;
  const top = 42, right = 12;
  const bottom = S.dockSize + 34;
  const panel = $('#widget-panel');
  const left = S.showWidgets && !panel.hidden ? panel.getBoundingClientRect().right + 16 : 12;
  const rows = Math.max(1, Math.floor((innerHeight - top - bottom) / ch));
  const cols = Math.max(1, Math.floor((innerWidth - right - left) / cw));
  return { cw, ch, top, right, rows, cols };
}

function cellPosition(g, [col, row]) {
  return { x: innerWidth - g.right - (col + 1) * g.cw, y: g.top + row * g.ch };
}

/** Saved spots win; everything else fills free cells from the top-right, column by column. */
function layoutIcons(g) {
  iconSlots.clear();
  const taken = new Set();
  const key = (c, r) => c + ',' + r;
  for (const item of deskEntries) {
    const p = S.iconPos?.[item.id];
    if (p && p[0] < g.cols && p[1] < g.rows && !taken.has(key(p[0], p[1]))) {
      taken.add(key(p[0], p[1]));
      iconSlots.set(item.id, p);
    }
  }
  let c = 0, r = 0;
  for (const item of deskEntries) {
    if (iconSlots.has(item.id)) continue;
    while (taken.has(key(c, r)) && c < g.cols) { if (++r >= g.rows) { r = 0; c++; } }
    const slot = c < g.cols ? [c, r] : [g.cols - 1, g.rows - 1]; // screen full: stack in the last cell
    taken.add(key(slot[0], slot[1]));
    iconSlots.set(item.id, slot);
  }
}

function renderDesktopIcons() {
  if (!IS_DESKTOP) return;
  const layer = $('#desktop-icons');
  layer.hidden = !S.showIcons;
  if (!S.showIcons) return;
  deskEntries = desktopEntries();
  const g = iconGrid();
  layoutIcons(g);
  layer.replaceChildren(...deskEntries.map(item => {
    const { x, y } = cellPosition(g, iconSlots.get(item.id));
    const img = item.icon
      ? h('img', { src: item.icon, alt: '', draggable: 'false' })
      : item.isFolder ? svg(ICONS.folder) : letterIcon(item.name);
    const el = h('div', {
      class: 'desk-icon' + (selection.has(item.id) ? ' selected' : ''),
      style: `left:${x}px; top:${y}px; width:${g.cw}px`,
      title: item.name,
    }, h('div', { class: 'desk-img' }, img), h('div', { class: 'desk-label', text: item.name }));
    el.dataset.id = item.id;
    if (item.isStack) wireStackIcon(el, item, g); else wireDesktopIcon(el, item, g);
    return el;
  }));
}

function selectOnly(id) {
  selection = new Set(id ? [id] : []);
  for (const el of $$('.desk-icon')) el.classList.toggle('selected', selection.has(el.dataset.id));
}

function wireDesktopIcon(el, item, g) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.ctrlKey) {
      selection.has(item.id) ? selection.delete(item.id) : selection.add(item.id);
      el.classList.toggle('selected', selection.has(item.id));
      return;
    }
    if (!selection.has(item.id)) selectOnly(item.id);

    const startX = e.clientX, startY = e.clientY;
    let dragging = false;
    const move = ev => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < 5) return;
      dragging = true;
      el.classList.add('dragging');
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const up = ev => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (!dragging) return;
      const col = Math.min(g.cols - 1, Math.max(0, Math.floor((innerWidth - g.right - ev.clientX) / g.cw)));
      const row = Math.min(g.rows - 1, Math.max(0, Math.floor((ev.clientY - g.top) / g.ch)));
      moveIcon(item.id, [col, row]);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  el.addEventListener('dblclick', () => openDesktopItem(item.id));
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    if (!selection.has(item.id)) selectOnly(item.id);
    showMenu(e.clientX, e.clientY, [
      { label: 'Open', action: () => openDesktopItem(item.id) },
      { label: 'Show in File Explorer', action: () => call('desktopReveal', { path: item.id }).catch(err => toast(err.message)) },
      '-',
      { label: 'Rename', hint: 'F2', action: () => renameDesktopItem(item.id) },
      { label: 'Quick Look', hint: 'Space', action: () => toShell('quicklook', { path: item.id }) },
      '-',
      { label: 'Hide from Desktop', action: () => hideDesktopItem(item.id) },
    ]);
  });
}

/** Drops an icon on a cell; if another icon lives there, the two swap places. */
function moveIcon(id, slot) {
  const pos = { ...(S.iconPos || {}) };
  for (const [otherId, otherSlot] of iconSlots) pos[otherId] = otherSlot; // freeze the current layout
  const from = iconSlots.get(id);
  const occupant = [...iconSlots].find(([other, p]) => other !== id && p[0] === slot[0] && p[1] === slot[1]);
  if (occupant && from) pos[occupant[0]] = from;
  pos[id] = slot;
  S.iconPos = pos;
  save();
  renderDesktopIcons();
}

async function openDesktopItem(id) {
  try { await call('desktopOpen', { path: id }); } catch (err) { toast(err.message); }
}

function renameDesktopItem(id) {
  const el = $$('.desk-icon').find(x => x.dataset.id === id);
  const item = desktopItems.find(i => i.id === id);
  if (!el || !item) return;
  const label = el.querySelector('.desk-label');
  const input = h('input', { class: 'desk-rename', value: item.name, spellcheck: 'false' });
  label.replaceWith(input);
  input.addEventListener('pointerdown', e => e.stopPropagation());
  input.focus();
  // Select the name without its extension, like Explorer.
  const dot = item.isFolder ? -1 : item.name.lastIndexOf('.');
  input.setSelectionRange(0, dot > 0 ? dot : item.name.length);

  let done = false;
  const finish = async commit => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (commit && name && name !== item.name) {
      try {
        const newPath = await call('desktopRename', { path: id, name });
        if (S.iconPos?.[id]) { S.iconPos = { ...S.iconPos, [newPath]: S.iconPos[id] }; delete S.iconPos[id]; save(); }
        selection = new Set([newPath]);
      } catch (err) { toast(err.message); }
    }
    loadDesktop();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
    e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

async function newDesktopFolder() {
  try {
    const path = await call('desktopNewFolder');
    await loadDesktop();
    selectOnly(path);
    renameDesktopItem(path);
  } catch (err) { toast(err.message); }
}

function desktopMenu(x, y) {
  showMenu(x, y, [
    { label: 'New Folder', action: newDesktopFolder },
    '-',
    { label: 'Change Wallpaper…', action: chooseWallpaper },
    { label: 'Edit Widgets', action: () => toggleEditing(true) },
    '-',
    ...ICON_SIZES.map(([size, label]) => ({ label: `${label} Icons`, checked: S.iconSize === size, action: () => { S.iconSize = size; save(); applyScale(); renderDesktopIcons(); } })),
    { label: 'Clean Up', action: () => { S.iconPos = {}; save(); renderDesktopIcons(); } },
    (S.hiddenDesktop || []).length && { label: `Show Hidden Items (${S.hiddenDesktop.length})`, action: () => { S.hiddenDesktop = []; save(); renderDesktopIcons(); } },
    { label: S.useStacks ? 'Turn Off Stacks' : 'Use Stacks', action: () => { S.useStacks = !S.useStacks; save(); renderDesktopIcons(); } },
    '-',
    { label: 'Open Desktop Folder', action: () => openFolder(env.desktop) },
    { label: 'Display Settings…', action: () => openSettingsPage('display') },
    { label: 'Haven Settings…', action: () => openSettings() },
  ]);
}

function initDesktop() {
  // Clicking empty desktop clears the selection; right-clicking it opens the desktop menu.
  document.addEventListener('pointerdown', e => {
    if (e.button === 0 && !e.target.closest('.desk-icon, .widget-panel')) selectOnly(null);
  });
  document.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (e.target.closest('.widget, .desk-icon, input')) return;
    desktopMenu(e.clientX, e.clientY);
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const only = selection.size === 1 ? [...selection][0] : null;
    if (e.key === 'Enter') selection.forEach(openDesktopItem);
    else if (e.key === 'F2' && only) renameDesktopItem(only);
    else if (e.key === ' ' && only && !only.startsWith('stack:')) { e.preventDefault(); toShell('quicklook', { path: only }); }
    else if (e.key === 'Escape') { selectOnly(null); if (editing) toggleEditing(false); }
  });
  addEventListener('resize', () => { renderDesktopIcons(); refreshLiquid(); });
}

/* ---------- Modal, confirm & settings ---------- */

function openModal(title, content, cls = '') {
  closeOverlays();
  $('#modal-title').textContent = title;
  $('#modal-body').replaceChildren(...[content].flat().filter(Boolean));
  const modal = $('#modal .modal');
  modal.className = 'modal' + (cls ? ' ' + cls : '');
  modal.style.transform = '';
  $('#modal').hidden = false;
  syncShell();
}

function confirmDialog(title, text, confirmLabel) {
  return new Promise(resolve => {
    const finish = ok => { closeOverlays(); resolve(ok); };
    openModal(title, [
      h('p', { class: 'muted', style: 'margin:4px 0 0', text }),
      h('div', { class: 'confirm-actions' },
        h('button', { class: 'button', text: 'Cancel', onclick: () => finish(false) }),
        h('button', { class: 'button primary', id: 'confirm-ok', text: confirmLabel, onclick: () => finish(true) })),
    ]);
    focusSoon('#confirm-ok');
  });
}

async function systemAction(action) {
  const confirmations = {
    signout: ['Sign out?', 'Any unsaved work in open apps may be lost.', 'Sign Out'],
    restart: ['Restart your PC?', 'Any unsaved work in open apps may be lost.', 'Restart'],
    shutdown: ['Shut down your PC?', 'Any unsaved work in open apps may be lost.', 'Shut Down'],
  };
  if (confirmations[action] && !(await confirmDialog(...confirmations[action]))) return;
  try { await call('system', { action }); } catch (err) { toast(err.message); }
}


function segmented(options, value, onChange) {
  return h('div', { class: 'segmented' }, options.map(([v, label]) =>
    h('button', { class: String(v) === String(value) ? 'on' : '', text: label, onclick: () => onChange(v) })));
}


function setWallpaper(value) {
  S.wallpaper = value;
  save();
  applyWallpaper();
  rerenderSettings();
}

function setTheme(value) {
  S.theme = value;
  save();
  applyTheme();
  rerenderSettings();
}

function setSetting(key, value) {
  S[key] = value;
  save();
  applyScale();
  renderDock(true);
  rerenderSettings();
}

async function setTaskbarHidden(hidden) {
  S.hideTaskbar = hidden;
  save();
  try { await call('setTaskbarHidden', { hidden }); } catch (err) { toast(err.message); }
  rerenderSettings();
}


async function rescanApps() {
  toast('Rescanning…');
  await Promise.all([loadApps(true), loadGames()]);
  toast(`Found ${apps.length} apps and ${games.length} games.`);
}

async function chooseWallpaper() {
  try {
    const url = await call('pickWallpaper');
    if (url) setWallpaper({ url });
  } catch (err) { toast(err.message); }
}

/* ---------- Menus ---------- */

let menuOwner = null;
const remoteMenuActions = new Map();

function showMenu(x, y, items, owner = null) {
  // Menus always draw in the shell layer so they can appear over any window.
  if (!IS_SHELL) {
    remoteMenuActions.clear();
    const spec = [];
    items.forEach((it, i) => {
      if (!it) return;
      if (it === '-' || it.note) { spec.push(it); return; }
      const id = String(i);
      remoteMenuActions.set(id, it.action);
      spec.push({ id, label: it.label, hint: it.hint, checked: it.checked });
    });
    toShell('menu', { items: spec, x, y });
    return;
  }

  const menu = $('#context-menu');
  menu.replaceChildren();
  const checkable = items.some(i => i && typeof i === 'object' && 'checked' in i && i.checked !== undefined);
  for (const item of items) {
    if (!item) continue;
    if (item === '-') { if (menu.lastChild && menu.lastChild.tagName !== 'HR') menu.append(h('hr')); continue; }
    if (item.note) { menu.append(h('div', { class: 'menu-note', text: item.note })); continue; }
    const cls = [item.checked ? 'checked' : '', checkable ? 'checkable' : ''].join(' ').trim();
    menu.append(h('button', { class: cls || null, onclick: () => { hideMenu(); item.action(owner); } },
      h('span', { text: item.label }), item.hint && h('span', { class: 'hint', text: item.hint })));
  }
  if (menu.lastChild?.tagName === 'HR') menu.lastChild.remove();
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  menu.style.top = (y + r.height > innerHeight - 8 ? Math.max(8, y - r.height) : y) + 'px';
  menuOwner?.classList?.remove('open');
  menuOwner = owner;
  owner?.classList?.add('open');
  updateRegion();
}

function hideMenu() {
  if (!IS_SHELL) return;
  $('#context-menu').hidden = true;
  menuOwner?.classList?.remove('open');
  menuOwner = null;
  updateRegion();
}

function closeOverlays() {
  if (!IS_SHELL) return;
  hideMenu();
  for (const sel of FULLSCREEN_OVERLAYS) if (sel !== '#lock') $(sel).hidden = true;
  $('#launchpad').classList.remove('dragging-out');
  syncShell();
}

const isDark = () => document.documentElement.dataset.theme === 'dark';

const MENUS = {
  logo: () => [
    { label: 'About Haven', action: () => toast(`Haven ${env.version || ''}: a calmer desktop on top of Windows.`) },
    '-',
    { label: 'Start Menu', hint: 'Win', action: () => systemAction('start') },
    { label: 'Windows Settings…', action: () => openSettingsPage('windows') },
    { label: 'Task Manager', hint: 'Ctrl+Shift+Esc', action: () => systemAction('taskmgr') },
    '-',
    { label: 'Lock Screen', hint: 'Win+L', action: () => systemAction('lock') },
    { label: 'Sign Out…', action: () => systemAction('signout') },
    { label: 'Restart…', action: () => systemAction('restart') },
    { label: 'Shut Down…', action: () => systemAction('shutdown') },
    '-',
    { label: 'Exit Haven', hint: 'Ctrl+Alt+Q', action: () => call('quit') },
  ],
  app: () => {
    const w = activeWindow();
    if (!w) return [
      { label: 'About Haven', action: () => toast(`Haven ${env.version || ''}: a calmer desktop on top of Windows.`) },
      '-',
      { label: 'Settings…', action: () => openSettings() },
      '-',
      { label: 'Exit Haven', hint: 'Ctrl+Alt+Q', action: () => call('quit') },
    ];
    const name = activeAppName();
    return [
      { note: truncate(w.title, 50) },
      '-',
      { label: `Minimize ${name}`, action: () => call('minimize', { hwnd: w.hwnd }) },
      { label: 'Close Window', hint: 'Alt+F4', action: () => call('closeWindow', { hwnd: w.hwnd }) },
      '-',
      { label: 'Haven Settings…', action: () => openSettings() },
    ];
  },
  file: () => [
    { label: 'New File Explorer Window', action: () => openShell('explorer') },
    { label: 'New Folder on Desktop', action: () => toDesktop('newFolder') },
    '-',
    { label: 'Open Launchpad', action: () => openLaunchpad() },
    { label: 'Search…', hint: 'Alt+Space', action: () => openSpotlight() },
    '-',
    { label: 'Rescan Apps', action: rescanApps },
  ],
  view: () => [
    { label: 'Show Widgets', checked: S.showWidgets, action: () => setShowWidgets(!S.showWidgets) },
    { label: 'Edit Widgets', checked: false, action: () => toggleEditing(true) },
    '-',
    ...ICON_SIZES.map(([size, label]) => ({ label: `${label} Desktop Icons`, checked: S.iconSize === size, action: () => setSetting('iconSize', size) })),
    { label: 'Clean Up Desktop', checked: false, action: () => { S.iconPos = {}; save(); } },
    '-',
    { label: 'Dark Appearance', checked: isDark(), action: () => setTheme(isDark() ? 'light' : 'dark') },
    { label: 'Use Windows Wallpaper', checked: S.wallpaper === 'windows', action: () => { windowsWallpaperUrl = undefined; setWallpaper('windows'); } },
    { label: 'Change Wallpaper…', checked: false, action: chooseWallpaper },
  ],
  go: () => [
    env.desktop && { label: 'Desktop', action: () => openFolder(env.desktop) },
    env.documents && { label: 'Documents', action: () => openFolder(env.documents) },
    env.downloads && { label: 'Downloads', action: () => openFolder(env.downloads) },
    env.pictures && { label: 'Pictures', action: () => openFolder(env.pictures) },
    '-',
    { label: 'This PC', action: () => openShell('thispc') },
    { label: 'Recycle Bin', action: () => openShell('trash') },
  ],
  window: () => {
    const w = activeWindow();
    return [
      w && { label: 'Minimize', action: () => call('minimize', { hwnd: w.hwnd }) },
      w && '-',
      ...(windows.length
        ? windows.slice(0, 15).map(x => ({ label: truncate(x.title, 56), checked: x.hwnd === foreground, action: () => focusWindow(x) }))
        : [{ note: 'No open windows' }]),
    ];
  },
  control: () => [
    { label: 'Wi-Fi & Internet…', action: () => openSettingsPage('network') },
    { label: 'Bluetooth & Devices…', action: () => openSettingsPage('bluetooth') },
    { label: 'Sound…', action: () => openSettingsPage('sound') },
    { label: 'Display…', action: () => openSettingsPage('display') },
    { label: 'Notifications…', action: () => openSettingsPage('notifications') },
    '-',
    { label: 'Dark Appearance', checked: isDark(), action: () => setTheme(isDark() ? 'light' : 'dark') },
    { label: 'Show Widgets', checked: S.showWidgets, action: () => setShowWidgets(!S.showWidgets) },
    { label: 'Show Windows Taskbar', checked: !S.hideTaskbar, action: () => setTaskbarHidden(!S.hideTaskbar) },
    '-',
    { label: 'Haven Settings…', checked: false, action: () => openSettings() },
  ],
  account: () => [
    { note: account.displayName || env.user || '' },
    '-',
    { label: 'Edit Name…', action: () => openSettings() },
    { label: 'Lock Screen', action: () => systemAction('lock') },
    { label: 'Sign Out…', action: () => systemAction('signout') },
    '-',
    { label: 'Exit Haven', hint: 'Ctrl+Alt+Q', action: () => call('quit') },
  ],
};

function initMenubar() {
  const anchor = btn => { const r = btn.getBoundingClientRect(); return [r.left, r.bottom + 3]; };
  const menuButtons = [
    ['#logo-menu', 'logo'], ['[data-menu="app"]', 'app'], ['[data-menu="file"]', 'file'], ['[data-menu="view"]', 'view'],
    ['[data-menu="go"]', 'go'], ['[data-menu="window"]', 'window'], ['#account-button', 'account'],
  ].map(([sel, menu]) => [$(sel), menu]);

  for (const [btn, menu] of menuButtons) {
    btn.addEventListener('click', () => {
      if (menuOwner === btn) { hideMenu(); return; }
      const [x, y] = anchor(btn);
      showMenu(x, y, MENUS[menu](), btn);
    });
    // Moving across the bar while a menu is open switches menus, like a native menu bar.
    btn.addEventListener('mouseenter', () => {
      if (menuOwner && menuOwner !== btn && menuOwner.closest?.('.menubar')) {
        const [x, y] = anchor(btn);
        showMenu(x, y, MENUS[menu](), btn);
      }
    });
  }
  $('#search-button').addEventListener('click', () => openSpotlight());
  $('#control-button').addEventListener('click', () => toggleControlCenter());
  $('#wifi-status').addEventListener('click', () => toggleControlCenter());
  $('#volume-status').addEventListener('click', () => toggleControlCenter());
  $('#lang-button').addEventListener('click', () => systemAction('language'));
}

let toastTimer;
function toast(text) {
  if (!IS_SHELL) return toShell('toast', text);
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  updateRegion();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; updateRegion(); }, 4200);
}

function initShellEvents() {
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#context-menu') && !e.target.closest('.menubar button')) hideMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlays(); });
  $('#launchpad').addEventListener('mousedown', e => {
    if (e.target.id === 'launchpad' || e.target.classList.contains('launchpad-inner') || e.target.classList.contains('launchpad-scroll')) closeOverlays();
  });
  $('#launchpad-search').addEventListener('input', renderLaunchpad);
  $('#launchpad-search').addEventListener('keydown', e => { if (e.key === 'Enter') $('#launchpad-grid .tile')?.click(); });
  $('#modal-close').addEventListener('click', closeOverlays);
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeOverlays(); });
  addEventListener('resize', () => { updateRegion(); updateReserve(); });
  if (PART === 'shell') {
    // Nothing on the transparent layer should open a menu except the bar and the Dock.
    document.addEventListener('contextmenu', e => e.preventDefault());
  }
}

function initWidgetEvents() {
  $('#edit-widgets').addEventListener('click', () => toggleEditing());
  $('#batteries-refresh').addEventListener('click', () => refreshBatteries(true));
  $('#cal-prev').addEventListener('click', () => { calOffset--; renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { calOffset++; renderCalendar(); });
  $('.calendar-widget').addEventListener('dblclick', () => { calOffset = 0; renderCalendar(); });
}

/* ---------- Commands one layer can ask of the other ---------- */

const COMMANDS = {
  // handled by the shell layer
  openSettings: d => openSettings(d?.focus),
  openLaunchpad: () => openLaunchpad(),
  openSpotlight: d => openSpotlight(d),
  openReminders: () => openRemindersModal(),
  toast: text => toast(text),
  menu: (d, from) => showMenu(d.x, d.y, d.items.map(it => (it === '-' || it.note) ? it : {
    ...it, action: () => from === PART ? remoteMenuActions.get(it.id)?.() : call('send', { to: from, name: 'menuPick', data: { id: it.id } }),
  })),
  // handled by the desktop layer
  editWidgets: d => toggleEditing(d?.on ?? !editing),
  newFolder: () => newDesktopFolder(),
  menuPick: d => remoteMenuActions.get(d.id)?.(),
};

/* ---------- Boot ---------- */

function everyMinute(fn) {
  fn();
  setTimeout(() => { fn(); setInterval(fn, 60_000); }, 60_000 - (Date.now() % 60_000) + 50);
}

async function boot() {
  const [e, saved, acct] = await Promise.all([
    call('env').catch(() => ({})),
    call('getState').catch(() => null),
    call('account').catch(() => ({})),
  ]);
  env = e || {};
  account = acct || {};
  S = { ...DEFAULTS, ...(saved || {}) };
  synced = {};
  markSynced(saved || {});
  if (saved && !saved.stateVersion) {
    // First versions saved a gradient wallpaper and automatic theme by default; adopt the new defaults.
    S.theme = DEFAULTS.theme;
    S.wallpaper = DEFAULTS.wallpaper;
  }
  if ((S.stateVersion || 0) < 3) {
    // Widgets added in version 3 start hidden (except Notes and System) so the panel doesn't overflow.
    S.hidden = [...new Set([...(S.hidden || []), 'worldclock', 'photos', 'events'])];
  }
  if ((S.stateVersion || 0) < 4 && !(S.hideParts || []).length) S.hideParts = ['dock-minimized'];
  S.stateVersion = 4;

  applyTheme();
  applyWallpaper();
  applyScale();
  applyCustomization();
  initPcBattery();
  initSheen();

  if (IS_SHELL) {
    renderAccount();
    tickMenubar();
    setInterval(tickMenubar, 1000);
    initMenubar();
    initShellEvents();
    initDock();
    initDockReveal();
    initIsland();
    initSpotlight();
    renderDock(true);
    syncShell();
    loadGames();
    loadApps();
    pollWindows();
    if (PART === 'shell') pollMedia(); // for the now-playing pill
  }

  if (IS_DESKTOP) {
    everyMinute(renderCalendar);
    buildAnalogClock();
    tickClock();
    setInterval(tickClock, 1000);
    renderReminders();
    renderMedia();
    renderBatteries();
    initWidgetEvents();
    initMedia();
    initReminders();
    initDesktop();
    applyWidgetVisibility();
    loadDesktop();
    refreshBatteries();
    setInterval(refreshBatteries, 60_000);
    refreshWeather();
    pollMedia();
  }

  if (IS_SHELL) initShellFeatures();
  if (IS_DESKTOP) initDesktopFeatures();
}

// Wait for settings.js (loaded after this file) before starting.
addEventListener("DOMContentLoaded", boot);
