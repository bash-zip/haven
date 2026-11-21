'use strict';

/* =========================================================================
   Deep Customization: a live preview of your look; a gallery of complete
   themes (Surprise me, Make a theme, copy and paste theme codes); window
   corners, borders, shadows and controls; open/close motion; title case;
   screen effects (dot grain, scanlines, HUD corners, LED spectrum);
   wallpaper transitions and a wallpaper switcher (Ctrl + Alt + W); a lock
   screen editor; and File Explorer icon styles.
   ========================================================================= */

const DEEP_DEFAULTS = {
  deepCorners: 'round', deepCornerSize: 14, deepControls: 'macos', deepControlsSide: 'left', deepDotUi: false, lockClockStyle: 'classic',
  deepBorder: 'hairline', deepBorderWidth: 1, deepSpin: false, deepShadow: 'soft', deepAppWindows: false,
  deepMotion: 'scale', deepTitles: 'normal', deepFont: 'system',
  fxGrain: false, fxScanlines: false, fxHud: false, fxLed: false,
  wallTransition: 'circle', explorerIcon: 'default', lockLayout: null,
};
for (const [k, v] of Object.entries(DEEP_DEFAULTS)) if (!(k in DEFAULTS)) DEFAULTS[k] = v;
for (const k of Object.keys(DEEP_DEFAULTS)) if (k !== 'lockLayout' && !LOOK_KEYS.includes(k)) LOOK_KEYS.push(k);
for (const [k, v] of Object.entries(DEEP_DEFAULTS)) if (S[k] === undefined) S[k] = structuredClone(v);

// More of Haven's wave wallpapers for the themes.
Object.assign(WAVE_PALETTES, {
  signal:    { label: 'Redline',    bg: ['#050505', '#141414'], waves: [['#1f1f1f', '#080808'], ['#3a0d0a', '#0c0c0c']] },
  paper:     { label: 'Notebook',     bg: ['#f3efe6', '#e2dccd'], waves: [['#ffffff', '#ece6d8'], ['#d8cfbd', '#f0ebe0']] },
  orbit:     { label: 'Teal Grid',     bg: ['#03141a', '#0b3b45'], waves: [['#0f5c66', '#042128'], ['#1fd1c1', '#0a4650']] },
  velvet:    { label: 'Lavender',    bg: ['#1c1630', '#4a3a7a'], waves: [['#8f7ad6', '#2f2556'], ['#d6b8f5', '#6a52b0']] },
  neon:      { label: 'Synthwave',      bg: ['#07061a', '#1d1450'], waves: [['#4b2fd6', '#110b38'], ['#ff4fd8', '#3a1ea6']] },
  fjord:     { label: 'Glacier',     bg: ['#1b2530', '#4f6475'], waves: [['#8fa7b8', '#2e3d4a'], ['#cfe0ea', '#6f8798']] },
  rosewood:  { label: 'Blush',  bg: ['#2a1a1e', '#6e4650'], waves: [['#b88792', '#4a2c34'], ['#ecc6cc', '#8c5d68']] },
  moss:      { label: 'Fern',      bg: ['#101a10', '#2f4a2c'], waves: [['#5f8752', '#1d2e1b'], ['#a9c98e', '#45683d']] },
  cobalt:    { label: 'Sapphire',    bg: ['#050b18', '#0e2350'], waves: [['#1c4ab5', '#071433'], ['#3aa0ff', '#123a8a']] },
  aubergine: { label: 'Plum', bg: ['#1a0a14', '#4d1530'], waves: [['#8a2448', '#2a0c1c'], ['#e0584a', '#6b1a35']] },
  harbor:    { label: 'Marina',    bg: ['#0a1422', '#1e3a5c'], waves: [['#3b6ea5', '#112640'], ['#9cc3e8', '#2c5888']] },
  sage:      { label: 'Lime',      bg: ['#1b2414', '#4f6b2c'], waves: [['#86b04a', '#2c3d17'], ['#d2ee8c', '#5e8a2c']] },
  abyss:     { label: 'Deep Sea',     bg: ['#000206', '#031030'], waves: [['#0b2a7a', '#01081c'], ['#2f6bff', '#06215e']] },
  tty:       { label: 'Terminal',       bg: ['#000000', '#020a04'], waves: [['#06200c', '#010402'], ['#13b84a', '#04300f']] },
});

const DEEP_THEMES = [
  { id: 'classic', name: 'Haven Classic', tag: 'Default', look: { theme: 'dark', accent: 'blue', wallpaper: 'midnight', deepCorners: 'round', deepCornerSize: 14, deepControls: 'macos', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'scale', deepFont: 'system', deepTitles: 'normal', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'signal', name: 'Redline', tag: 'Bold', look: { theme: 'black', accent: '#e5483a', wallpaper: 'signal', deepCorners: 'sharp', deepCornerSize: 2, deepControls: 'signal', deepBorder: 'hairline', deepShadow: 'none', deepMotion: 'signal', deepFont: 'mono', deepTitles: 'caps', fxGrain: true, fxHud: true, fxScanlines: false } },
  { id: 'paper', name: 'Notebook', tag: 'Light', look: { theme: 'light', accent: '#c0392b', wallpaper: 'paper', deepCorners: 'windows', deepCornerSize: 8, deepControls: 'mono', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'fade', deepFont: 'mono', deepTitles: 'normal', fxGrain: true, fxScanlines: false, fxHud: false } },
  { id: 'orbit', name: 'Teal Grid', tag: 'Focused', look: { theme: 'black', accent: '#1fd1c1', wallpaper: 'orbit', deepCorners: 'sharp', deepCornerSize: 4, deepControls: 'mono', deepBorder: 'glow', deepShadow: 'none', deepMotion: 'slide', deepFont: 'mono', deepTitles: 'normal', fxHud: false, fxScanlines: false, fxGrain: false } },
  { id: 'echo', name: 'Chameleon', tag: 'From your wallpaper', echo: true, look: { theme: 'glass', deepCorners: 'squircle', deepCornerSize: 18, deepControls: 'macos', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'genie', deepFont: 'system', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'velvet', name: 'Lavender', tag: 'Pastel', look: { theme: 'dark', accent: '#b89cf0', wallpaper: 'velvet', deepCorners: 'squircle', deepCornerSize: 20, deepControls: 'macos', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'popin', deepFont: 'rounded', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'neon', name: 'Synthwave', tag: 'Night', look: { theme: 'transparent', accent: '#ff4fd8', wallpaper: 'neon', deepCorners: 'round', deepCornerSize: 16, deepControls: 'macos', deepBorder: 'gradient', deepSpin: true, deepShadow: 'deep', deepMotion: 'zoom', deepFont: 'system', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'fjord', name: 'Glacier', tag: 'Cool', look: { theme: 'grey', accent: '#8fbcd4', wallpaper: 'fjord', deepCorners: 'round', deepCornerSize: 12, deepControls: 'mono', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'slide', deepFont: 'system', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'ember', name: 'Campfire', tag: 'Retro', look: { theme: 'burgundy', accent: 'orange', wallpaper: 'ember', deepCorners: 'bevel', deepCornerSize: 6, deepControls: 'mono', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'slide', deepFont: 'mono', deepTitles: 'normal', fxGrain: true, fxScanlines: false, fxHud: false } },
  { id: 'orchid', name: 'Bloom', tag: 'Dark', look: { theme: 'dark', accent: 'pink', wallpaper: 'orchid', deepCorners: 'round', deepCornerSize: 14, deepControls: 'macos', deepBorder: 'hairline', deepShadow: 'deep', deepMotion: 'scale', deepFont: 'system', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'rosewood', name: 'Blush', tag: 'Soft', look: { theme: 'dark', accent: '#e6a3b0', wallpaper: 'rosewood', deepCorners: 'squircle', deepCornerSize: 18, deepControls: 'macos', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'fade', deepFont: 'serif', fxScanlines: false, fxGrain: true, fxHud: false } },
  { id: 'moss', name: 'Fern', tag: 'Nature', look: { theme: 'dark', accent: 'moss', wallpaper: 'moss', deepCorners: 'round', deepCornerSize: 12, deepControls: 'macos', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'genie', deepFont: 'rounded', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'cobalt', name: 'Sapphire', tag: 'Minimal', look: { theme: 'black', accent: '#3aa0ff', wallpaper: 'cobalt', deepCorners: 'sharp', deepCornerSize: 0, deepControls: 'windows', deepControlsSide: 'right', deepBorder: 'none', deepShadow: 'deep', deepMotion: 'zoom', deepFont: 'system', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'aubergine', name: 'Plum', tag: 'Warm', look: { theme: 'burgundy', accent: '#e0584a', wallpaper: 'aubergine', deepCorners: 'round', deepCornerSize: 14, deepControls: 'macos', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'scale', deepFont: 'system', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'harbor', name: 'Marina', tag: 'Clean', look: { theme: 'navy', accent: '#6fa8e6', wallpaper: 'harbor', deepCorners: 'windows', deepCornerSize: 8, deepControls: 'windows', deepControlsSide: 'right', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'fade', deepFont: 'system', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'sage', name: 'Lime', tag: 'Fresh', look: { theme: 'dark', accent: '#9ccc4a', wallpaper: 'sage', deepCorners: 'squircle', deepCornerSize: 16, deepControls: 'macos', deepBorder: 'hairline', deepShadow: 'soft', deepMotion: 'popin', deepFont: 'rounded', fxScanlines: false, fxGrain: false, fxHud: false } },
  { id: 'abyss', name: 'Deep Sea', tag: 'Code', look: { theme: 'black', accent: '#2f6bff', wallpaper: 'abyss', deepCorners: 'notch', deepCornerSize: 8, deepControls: 'signal', deepBorder: 'glow', deepShadow: 'none', deepMotion: 'dots', deepFont: 'mono', deepTitles: 'caps', fxScanlines: true, fxHud: true, fxGrain: false } },
  { id: 'tty', name: 'Terminal', tag: 'Green screen', look: { theme: 'black', accent: '#22c55e', wallpaper: 'tty', deepCorners: 'sharp', deepCornerSize: 0, deepControls: 'mono', deepBorder: 'hairline', deepShadow: 'none', deepMotion: 'signal', deepFont: 'mono', deepTitles: 'caps', fxScanlines: true, fxGrain: true, fxHud: false } },
  { id: 'dot-matrix', name: 'Dot Matrix', tag: 'Nothing-inspired', look: { theme: 'black', accent: '#e5483a', wallpaper: 'signal', deepCorners: 'sharp', deepCornerSize: 2, deepControls: 'signal', deepBorder: 'hairline', deepShadow: 'none', deepMotion: 'dots', deepFont: 'mono', deepTitles: 'caps', deepDotUi: true, lockClockStyle: 'dots', desktopClockFace: 'dots', widgetDesign: 'dot', widgetDesignColor: 'white', fxGrain: false, fxScanlines: false, fxHud: false } },
  { id: 'red-dot', name: 'Red Dot', tag: 'Signal teaser', look: { theme: 'black', accent: '#e5483a', wallpaper: 'matrix', glass: false, glassStyle: 'frosted', iconStyle: 'dark', widgetStyle: 'solid', deepCorners: 'sharp', deepCornerSize: 0, deepControls: 'signal', deepBorder: 'hairline', deepShadow: 'none', deepMotion: 'dots', deepFont: 'mono', deepTitles: 'caps', deepDotUi: true, lockClockStyle: 'dots', desktopClockFace: 'dots', widgetDesign: 'dot', widgetDesignColor: 'white', fxGrain: false, fxScanlines: false, fxHud: false } },
];

/* ---------- Applying it ---------- */

const CORNER_SHAPES = { round: 'round', windows: 'round', squircle: 'squircle', sharp: 'round', bevel: 'bevel', notch: 'notch' };

function applyDeep() {
  const root = document.documentElement;
  const size = S.deepCorners === 'sharp' ? 0 : S.deepCorners === 'windows' ? 8 : Number(S.deepCornerSize ?? 14);
  root.style.setProperty('--corner', size + 'px');
  root.style.setProperty('--corner-shape', CORNER_SHAPES[S.deepCorners] || 'round');
  root.style.setProperty('--dc-bw', (S.deepBorderWidth ?? 1) + 'px');
  const d = root.dataset;
  // Each setting only takes over once you change it, so the default look stays exactly as it was.
  const set = (key, value, dflt) => { if (value == null || value === dflt) delete d[key]; else d[key] = value; };
  set('corners', S.deepCorners === 'round' && Number(S.deepCornerSize ?? 14) === 14 ? null : S.deepCorners, null);
  set('dcBorder', S.deepBorder === 'hairline' && Number(S.deepBorderWidth ?? 1) === 1 ? null : S.deepBorder, null);
  d.dcSpin = S.deepSpin ? '1' : '';
  set('dcShadow', S.deepShadow, 'soft');
  set('dcControls', S.deepControls, 'macos');
  set('dcSide', S.deepControls === 'windows' ? 'right' : S.deepControlsSide, 'left');
  set('motion', S.deepMotion, 'scale');
  set('titles', S.deepTitles, 'normal');
  set('dcFont', S.deepFont, 'system');
  d.fxGrain = S.fxGrain ? '1' : '';
  d.fxScan = S.fxScanlines ? '1' : '';
  d.fxHud = S.fxHud ? '1' : '';
  set('dotUi', S.deepDotUi ? '1' : '', '');
  document.documentElement.dataset.widgetDesign = ['classic', 'dot', 'mono', 'soft'].includes(S.widgetDesign) ? S.widgetDesign : 'classic';
  document.documentElement.style.setProperty('--widget-design-color', S.widgetDesignColor === 'custom' ? (S.widgetDesignCustomColor || '#ef4444') : S.widgetDesignColor === 'white' ? '#fff' : S.widgetDesignColor === 'text' ? 'var(--text)' : 'var(--accent)');
  document.querySelectorAll('[data-widget="clock"]').forEach(clock => {
    const face = ['analog', 'digital', 'dots'].includes(S.desktopClockFace) ? S.desktopClockFace : 'analog';
    clock.dataset.face = face;
    clock.dataset.align = ['left', 'center', 'right'].includes(S.desktopClockAlign) ? S.desktopClockAlign : 'center';
    clock.dataset.design = ['classic', 'dot', 'mono', 'soft'].includes(S.widgetDesign) ? S.widgetDesign : 'classic';
    clock.style.setProperty('--clock-size', `${Math.max(24, Math.min(90, Number(S.desktopClockSize) || 48))}px`);
    clock.style.setProperty('--clock-tracking', `${Math.max(0, Math.min(.2, Number(S.desktopClockTracking) || 0))}em`);
    clock.style.setProperty('--clock-color', S.desktopClockColor === 'white' ? '#fff' : S.desktopClockColor === 'text' ? 'var(--text)' : 'var(--accent)');
    const time = $('#clock-digital-time'), date = $('#clock-digital-date');
    if (time) {
      const now = new Date(), opts = { hour: '2-digit', minute: '2-digit', hour12: !S.desktopClock24 };
      if (S.desktopClockSeconds) opts.second = '2-digit';
      time.textContent = new Intl.DateTimeFormat(undefined, opts).format(now);
      if (date) date.textContent = S.desktopClockDate ? new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(now) : '';
    }
  });
  document.querySelectorAll('[data-widget="batteries"], [data-widget="media"]').forEach(widget => { widget.dataset.design = ['classic', 'dot', 'mono', 'soft'].includes(S.widgetDesign) ? S.widgetDesign : 'classic'; });
  const preview = $('.widget-style-preview');
  if (preview) preview.dataset.design = ['classic', 'dot', 'mono', 'soft'].includes(S.widgetDesign) ? S.widgetDesign : 'classic';
  set('lockClock', S.lockClockStyle, 'classic');
  document.documentElement.dataset.lockClock = S.lockLayout?.clockStyle || S.lockClockStyle || 'classic';
  refreshLiquid?.();
  updateLed();
  if (IS_SHELL && host) {
    const key = JSON.stringify([S.deepAppWindows, S.deepCorners, S.deepBorder, accentHex()]);
    if (key !== applyDeep.lastKey) {
      applyDeep.lastKey = key;
      const corners = !S.deepAppWindows ? 'default' : { sharp: 'sharp', bevel: 'small', notch: 'small', windows: 'default' }[S.deepCorners] || 'round';
      const border = !S.deepAppWindows ? 'default' : { none: 'none', glow: 'accent', gradient: 'accent' }[S.deepBorder] || 'hairline';
      call('setWindowStyle', { corners, border, accent: accentHex(), hairline: isDark() ? '#3a3a3e' : '#c8c8cc' }).catch(() => {});
    }
  }
}

{
  const baseTheme = applyTheme;
  // eslint-disable-next-line no-global-assign
  applyTheme = function () { baseTheme(); applyDeep(); };
}

/* ---------- LED spectrum under the menu bar (desktop layer) ---------- */

let ledViz = null;
function updateLed() {
  if (!IS_DESKTOP || typeof mountViz !== 'function') return;
  let c = $('#led-spectrum');
  if (!S.fxLed) { ledViz?.stop(); ledViz = null; c?.remove(); return; }
  if (!c) { c = h('canvas', { id: 'led-spectrum', class: 'led-spectrum' }); document.body.append(c); }
  if (!ledViz) ledViz = mountViz(c, { style: 'dots', color: 'ink', bands: 48 });
}

/* ---------- Wallpaper transitions ---------- */

let wallFrom = null; // where the change was clicked, from the shell

COMMANDS.wallFrom = d => { wallFrom = d; };

{
  const baseApply = applyWallpaper;
  // eslint-disable-next-line no-global-assign
  applyWallpaper = async function () {
    const old = getComputedStyle(document.documentElement).getPropertyValue('--wp');
    await baseApply();
    const now = getComputedStyle(document.documentElement).getPropertyValue('--wp');
    const kind = S.wallTransition || 'circle';
    if (!IS_DESKTOP || !old || old === now || kind === 'none' || !applyWallpaper.ready) { applyWallpaper.ready = true; return; }
    const wp = $('#wallpaper');
    if (!wp) return;
    const ghost = h('div', { class: 'wall-ghost t-' + kind, style: `background:${old}` });
    const x = wallFrom?.x ?? innerWidth / 2, y = wallFrom?.y ?? innerHeight / 2;
    ghost.style.setProperty('--wx', x + 'px');
    ghost.style.setProperty('--wy', y + 'px');
    wp.after(ghost);
    wallFrom = null;
    ghost.addEventListener('animationend', () => ghost.remove());
    setTimeout(() => ghost.remove(), 2000);
  };
}

// Remember where you clicked in the shell, so the new wallpaper spreads from there.
let lastClick = null;
addEventListener('pointerdown', e => { lastClick = { x: e.clientX, y: e.clientY }; }, true);
{
  const baseSet = setWallpaper;
  // eslint-disable-next-line no-global-assign
  setWallpaper = function (value) {
    if (IS_SHELL && lastClick) toDesktop('wallFrom', lastClick);
    return baseSet(value);
  };
}

/* ---------- Wallpaper switcher (Ctrl + Alt + W) ---------- */

function wallpaperChoices() {
  const list = Object.entries(WAVE_PALETTES).map(([id, p]) => ({ value: id, label: p.label, css: waveWallpaper(id) }));
  for (const url of S.myWallpapers || []) list.push({ value: { url }, label: 'Your picture', css: `url("${url}") center / cover` });
  list.unshift({ value: 'windows', label: 'Windows wallpaper', css: windowsWallpaperUrl ? `url("${windowsWallpaperUrl}") center / cover` : waveWallpaper('graphite') });
  return list;
}

let switcherIndex = 0;
function openWallpaperSwitcher() {
  if (!IS_SHELL) return toShell('openWallpaperSwitcher');
  closeOverlays();
  let el = $('#wall-switcher');
  if (!el) {
    el = h('div', { class: 'overlay wall-switcher', id: 'wall-switcher', tabindex: '-1', hidden: true });
    document.body.append(el);
    FULLSCREEN_OVERLAYS.push('#wall-switcher');
    KEYBOARD_OVERLAYS.push('#wall-switcher');
    el.addEventListener('mousedown', e => { if (e.target === el) closeOverlays(); });
    el.addEventListener('keydown', e => {
      const n = wallpaperChoices().length;
      if (e.key === 'ArrowRight') { switcherIndex = (switcherIndex + 1) % n; renderSwitcher2(); }
      else if (e.key === 'ArrowLeft') { switcherIndex = (switcherIndex - 1 + n) % n; renderSwitcher2(); }
      else if (e.key === 'Enter') pickSwitcher(switcherIndex);
      else if (e.key === 'Escape') closeOverlays();
      else return;
      e.preventDefault();
    });
  }
  const choices = wallpaperChoices();
  switcherIndex = Math.max(0, choices.findIndex(c => JSON.stringify(c.value) === JSON.stringify(S.wallpaper)));
  el.hidden = false;
  renderSwitcher2();
  syncShell();
  setTimeout(() => el.focus(), 30);
}

function renderSwitcher2() {
  const el = $('#wall-switcher');
  const choices = wallpaperChoices();
  el.replaceChildren(
    h('div', { class: 'ws-title', text: 'Wallpaper' }),
    h('div', { class: 'ws-track', style: `--i:${switcherIndex}` },
      ...choices.map((c, i) => h('button', { class: 'ws-card' + (i === switcherIndex ? ' on' : ''), style: `background:${c.css}`, onclick: e => { lastClick = { x: e.clientX, y: e.clientY }; pickSwitcher(i); }, onmouseenter: () => { if (switcherIndex !== i) { switcherIndex = i; renderSwitcher2(); } } },
        h('span', { text: c.label })))),
    h('div', { class: 'ws-hint', text: '← → to browse · Enter to use · Esc to close' }));
}

function pickSwitcher(i) {
  const c = wallpaperChoices()[i];
  if (!c) return;
  if (!lastClick) lastClick = { x: innerWidth / 2, y: innerHeight / 2 };
  setWallpaper(c.value);
  closeOverlays();
}

COMMANDS.openWallpaperSwitcher = () => openWallpaperSwitcher();
{
  const baseEvent = onHostEvent;
  // eslint-disable-next-line no-global-assign
  onHostEvent = function (name, data) {
    if (name === 'wallpaperSwitcher') return openWallpaperSwitcher();
    return baseEvent(name, data);
  };
}
ACTIONS.wallpapers = ['Wallpaper switcher', () => openWallpaperSwitcher()];

/* ---------- Echo: a theme from your wallpaper ---------- */

async function wallpaperColour() {
  // Sample the wallpaper's average and most vivid colour.
  const url = typeof S.wallpaper === 'object' ? S.wallpaper.url : S.wallpaper === 'windows' ? windowsWallpaperUrl : null;
  let rgb = null;
  if (url) {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
      await img.decode();
      const c = document.createElement('canvas'); c.width = 48; c.height = 27;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 48, 27);
      const px = g.getImageData(0, 0, 48, 27).data;
      let best = null, bestSat = -1;
      for (let i = 0; i < px.length; i += 4) {
        const [r, gg, b] = [px[i], px[i + 1], px[i + 2]];
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0;
        const score = sat * (mx / 255);
        if (score > bestSat) { bestSat = score; best = [r, gg, b]; }
      }
      rgb = best;
    } catch { rgb = null; }
  } else {
    const p = WAVE_PALETTES[WALLPAPER_ALIASES?.[S.wallpaper] || S.wallpaper];
    const hex = p?.waves?.[1]?.[0];
    if (hex) rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  }
  if (!rgb) return null;
  // Lift it so it reads as an accent.
  const mx = Math.max(...rgb) || 1, k = Math.min(1.6, 220 / mx);
  return '#' + rgb.map(v => Math.min(255, Math.round(v * k)).toString(16).padStart(2, '0')).join('');
}

/* ---------- Themes: apply, surprise, codes ---------- */

async function applyDeepTheme(t) {
  const look = structuredClone(t.look);
  if (t.echo) look.accent = (await wallpaperColour()) || S.accent;
  applyLook({ ...DEEP_DEFAULTS, lockLayout: undefined, ...look });
  applyDeep();
  replayPreview();
}

function surpriseMe() {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const base = pick(DEEP_THEMES.filter(t => !t.echo));
  const accents = Object.keys(ACCENTS);
  applyLook({
    ...DEEP_DEFAULTS, ...base.look,
    accent: Math.random() < 0.5 ? pick(accents) : base.look.accent,
    wallpaper: pick(Object.keys(WAVE_PALETTES)),
    deepCorners: pick(Object.keys(CORNER_SHAPES)), deepCornerSize: 4 + Math.floor(Math.random() * 18),
    deepControls: pick(['macos', 'windows', 'mono', 'signal']), deepBorder: pick(['hairline', 'none', 'glow', 'gradient']),
    deepMotion: pick(['genie', 'scale', 'popin', 'slide', 'zoom', 'fade', 'fold', 'signal', 'dots']),
    deepFont: pick(['system', 'mono', 'rounded', 'serif']),
  });
  replayPreview();
  toast('Surprise!');
}

function themeCode() {
  return 'HAVEN1:' + btoa(unescape(encodeURIComponent(JSON.stringify(currentLook()))));
}

function applyThemeCode(code) {
  try {
    const raw = code.trim().replace(/^HAVEN1:/, '');
    const look = JSON.parse(decodeURIComponent(escape(atob(raw))));
    if (typeof look !== 'object' || !look) throw new Error();
    // Only look settings, nothing else, can come in through a code.
    const clean = {};
    for (const k of LOOK_KEYS) if (k in look) clean[k] = look[k];
    applyLook(clean);
    replayPreview();
    toast('Theme applied');
  } catch { toast('That theme code isn’t valid.'); }
}

function resetDeep() {
  applyLook({ ...DEEP_DEFAULTS });
  replayPreview();
}

/* ---------- Preview ---------- */

function themeMini(t) {
  const p = WAVE_PALETTES[t.look.wallpaper] || null;
  const bg = t.echo ? 'var(--wp)' : p ? `linear-gradient(150deg, ${p.bg[0]}, ${p.waves[1][0]} 70%, ${p.bg[1]})` : 'var(--wp)';
  const accent = ACCENTS[t.look.accent]?.[1] || t.look.accent || 'var(--accent)';
  const surf = THEMES[t.look.theme]?.surface ? `rgb(${THEMES[t.look.theme].surface})` : 'rgb(30 30 33)';
  const light = THEMES[t.look.theme]?.mode === 'light';
  return h('div', { class: 'dt-mini', style: `background:${bg}` },
    h('i', { class: 'dt-dots', style: `--a:${accent}` }),
    h('div', { class: 'dt-win', style: `background:${surf}; border-radius:${t.look.deepCorners === 'sharp' ? 0 : Math.min(8, (t.look.deepCornerSize ?? 12) / 2)}px; ${light ? 'color:#222' : ''}` },
      h('i', { class: 'dt-line' }), h('i', { class: 'dt-btn', style: `background:linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 55%, #fff))` }), h('i', { class: 'dt-line short' })));
}

function bigPreview() {
  return h('div', { class: 'dc-preview' },
    h('div', { class: 'dc-wall' }),
    h('div', { class: 'dc-window dc-surface', id: 'dc-window' },
      h('div', { class: 'dc-titlebar' },
        h('span', { class: 'dc-lights' }, h('i', { class: 'c' }), h('i', { class: 'm' }), h('i', { class: 'x' })),
        h('b', { class: 'dc-title', text: 'File Explorer' })),
      h('div', { class: 'dc-body' },
        h('div', { class: 'dc-side' }, h('i', { class: 'on' }), h('i'), h('i')),
        h('div', { class: 'dc-tiles' }, h('i'), h('i', { class: 'on' }), h('i'), h('i')))),
    h('div', { class: 'dc-dock dc-surface' }, h('i', { class: 'icon' }), h('i'), h('i', { class: 'on' }), h('i'), h('i')));
}

function replayPreview() {
  const w = $('#dc-window');
  if (!w) return;
  w.classList.remove('dc-play');
  void w.offsetWidth;
  w.classList.add('dc-play');
}

function widgetDesignPreview() {
  const preview = h('div', { class: 'widget-style-preview', 'data-design': S.widgetDesign || 'classic' },
    h('div', { class: 'widget-style-preview-clock' },
      h('b', { text: '09:41' }), h('span', { text: 'MON · MAY 18' })),
    h('div', { class: 'widget-style-preview-row' },
      h('i', { class: 'widget-style-preview-ring' }), h('span', {}, h('b', { text: 'Headphones' }), h('small', { text: '86% · Charging' }))),
    h('div', { class: 'widget-style-preview-media' }, h('i'), h('span', {}, h('b', { text: 'Midnight City' }), h('small', { text: 'M83 · Hurry Up, We’re Dreaming' }))),
  );
  const old = $('.widget-style-preview');
  if (old) old.replaceWith(preview);
  return preview;
}

/* ---------- Lock screen editor ---------- */

const LOCK_WIDGETS = {
  media: 'Now Playing', battery: 'Battery', notifications: 'Notifications', events: 'Up Next', worldclock: 'World Clock', note: 'Notes', date: 'Date',
};

function defaultLockLayout() {
  return { clockFont: 'display', clockSize: 100, clockWeight: 600, clockColor: 'white', clockPos: 'top', clockStyle: 'classic', widgets: [{ type: 'media', col: 0, row: 0, size: 'w', style: 'glass' }, { type: 'battery', col: 2, row: 0, size: 's', style: 'glass' }] };
}

function openLockEditor() {
  const L = structuredClone(S.lockLayout || defaultLockLayout());
  const save2 = () => { setPref('lockLayout', structuredClone(L)); draw(); };
  const grid = h('div', { class: 'le-grid' });
  const draw = () => {
    const cells = [];
    const taken = new Set();
    for (const w of L.widgets) { taken.add(`${w.col},${w.row}`); if (w.size === 'w') taken.add(`${w.col + 1},${w.row}`); }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
      const w = L.widgets.find(x => x.col === col && x.row === row);
      if (w) {
        cells.push(h('button', { class: `le-cell le-w ${w.size} st-${w.style}`, style: `grid-column:${col + 1} / span ${w.size === 'w' ? 2 : 1}; grid-row:${row + 1}`,
          onclick: e => showMenu(e.clientX, e.clientY, [
            { label: w.size === 'w' ? 'Make Small' : 'Make Wide', action: () => { if (w.size === 's' && (col === 3 || taken.has(`${col + 1},${row}`))) { toast('No room to widen it here.'); return; } w.size = w.size === 'w' ? 's' : 'w'; save2(); } },
            ...['glass', 'solid', 'clear'].map(st => ({ label: `${st[0].toUpperCase() + st.slice(1)} style`, checked: w.style === st, action: () => { w.style = st; save2(); } })),
            '-', { label: 'Remove', action: () => { L.widgets = L.widgets.filter(x => x !== w); save2(); } },
          ]) }, h('b', { text: LOCK_WIDGETS[w.type] }), h('span', { text: w.size === 'w' ? 'Wide' : 'Small' })));
      } else if (!taken.has(`${col},${row}`)) {
        cells.push(h('button', { class: 'le-cell le-empty', style: `grid-column:${col + 1}; grid-row:${row + 1}`, text: '+',
          onclick: e => showMenu(e.clientX, e.clientY, Object.entries(LOCK_WIDGETS).map(([type, label]) => ({ label, action: () => { L.widgets.push({ type, col, row, size: 's', style: 'glass' }); save2(); } }))) }));
      }
    }
    grid.replaceChildren(...cells);
  };
  draw();
  const seg = (label, opts, key) => row(label, null, segmented(opts, L[key], v => { L[key] = v; save2(); }));
  openModal('Lock Screen Editor', [
    h('p', { class: 'muted', style: 'margin:0 0 10px', text: 'Click an empty spot to add a widget; click a widget to resize, restyle or remove it. Changes show the next time you lock (Ctrl + L).' }),
    grid,
    h('div', { class: 'sw-section', text: 'Clock' }),
    group(
      seg('Font', [['display', 'Display'], ['rounded', 'Rounded'], ['mono', 'Mono'], ['serif', 'Serif'], ['thin', 'Thin']], 'clockFont'),
      seg('Size', [[70, 'Small'], [100, 'Medium'], [135, 'Large']], 'clockSize'),
      seg('Colour', [['white', 'White'], ['accent', 'Accent'], ['soft', 'Soft']], 'clockColor'),
      seg('Clock face', [['classic', 'Classic'], ['dots', 'Dot matrix'], ['mono', 'Mono'], ['soft', 'Soft']], 'clockStyle'),
      seg('Position', [['top', 'Top'], ['center', 'Centre']], 'clockPos')),
    h('div', { class: 'confirm-actions' },
      button('Reset Layout', () => { Object.assign(L, defaultLockLayout()); save2(); }),
      button('Preview', () => { closeOverlays(); lockScreen(); }),
      button('Done', () => closeOverlays(), true)),
  ], 'lock-editor');
}

// The lock screen draws the custom layout when there is one.
{
  const baseExtras = renderLockExtras;
  // eslint-disable-next-line no-global-assign
  renderLockExtras = function () {
    const L = S.lockLayout;
    const lock = $('#lock');
    lock.dataset.clockFont = L?.clockFont || '';
    lock.dataset.clockColor = L?.clockColor || '';
    lock.dataset.clockPos = L?.clockPos || '';
    lock.style.setProperty('--clock-scale', String((L?.clockSize || 100) / 100));
    lock.dataset.clockStyle = L?.clockStyle || S.lockClockStyle || 'classic';
    if (!L) return baseExtras();
    const box = $('#lock-extras');
    const key = JSON.stringify([L, media?.title, media?.playing, typeof pcBattery !== 'undefined' && pcBattery?.level, notifications.length, new Date().getMinutes()]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const body = w => {
      switch (w.type) {
        case 'media': return media ? [h('span', { class: 'lock-art', style: media.art ? `background-image:url("${media.art}")` : '' }), h('div', { class: 'lock-media-text' }, h('b', { text: media.title || '' }), h('span', { text: media.artist || '' })),
          h('div', { class: 'lock-media-controls' }, ...[['previous', '⏮'], ['toggle', media.playing ? '⏸' : '▶'], ['next', '⏭']].map(([a, g]) => h('button', { text: g, onclick: e => { e.stopPropagation(); call('mediaControl', { action: a }).then(() => setTimeout(refreshMedia, 350)); } })))]
          : [h('span', { class: 'muted', text: 'Nothing playing' })];
        case 'battery': return typeof pcBattery !== 'undefined' && pcBattery ? [h('b', { class: 'lw-big', text: pcBattery.level + '%' }), h('span', { text: pcBattery.charging ? 'Charging' : 'Battery' })] : [h('span', { text: 'No battery' })];
        case 'notifications': return [h('b', { class: 'lw-big', text: String(notifications.filter(n => !n.read).length) }), h('span', { text: 'Notifications' })];
        case 'events': return [h('b', { text: 'Up Next' }), h('span', { text: lockEventText || 'No more events today' })];
        case 'worldclock': { const [city, tz] = (S.worldClocks || [])[0] || ['London', 'Europe/London']; let t = ''; try { t = new Date().toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: !S.clock24 }); } catch { t = '—'; } return [h('b', { class: 'lw-big', text: t }), h('span', { text: city })]; }
        case 'note': return [h('span', { class: 'lw-note', text: truncate((S.notes || 'No notes').trim(), 120) })];
        default: return [h('b', { class: 'lw-big', text: new Date().getDate() }), h('span', { text: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short' }) })];
      }
    };
    box.replaceChildren(h('div', { class: 'lock-grid' }, ...L.widgets.map(w => h('div', { class: `lock-w ${w.size} st-${w.style} lw-${w.type}`, style: `grid-column:${w.col + 1} / span ${w.size === 'w' ? 2 : 1}; grid-row:${w.row + 1}`, onmousedown: e => e.stopPropagation() }, ...body(w)))));
  };
}

let lockEventText = '';
async function loadLockEvent() {
  try {
    const ev = await call('events') || [];
    const next = ev.find(e => new Date(e.start) > Date.now());
    lockEventText = next ? `${next.title} · ${new Date(next.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
  } catch { lockEventText = ''; }
}

/* ---------- File Explorer icon ---------- */

const EXPLORER_ICONS = {
  classic: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset="1" stop-color="#f3a712"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="#1f6fe0"/><path d="M12 20h14l4 4h22v24a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="url(#a)"/><path d="M12 28h40v20a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="#ffe08a"/></svg>`,
  h: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111"/><path d="M18 16h6v13h14V16h6v32h-6V35H24v13h-6z" fill="#f2f2f2"/><circle cx="50" cy="46" r="4" fill="#e5483a"/></svg>`,
  doth: () => {
    const on = ['1000001', '1000001', '1000001', '1111111', '1000001', '1000001', '1000001'];
    let dots = '';
    on.forEach((r, y) => [...r].forEach((c, x) => { dots += `<circle cx="${14 + x * 5.6}" cy="${14 + y * 5.6}" r="${c === '1' ? 2.1 : 0.8}" fill="${c === '1' ? '#f2f2f2' : '#3a3a3a'}"/>`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0b0b"/>${dots}<circle cx="52" cy="50" r="3" fill="#e5483a"/></svg>`;
  },
  mono: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a5a5e"/><stop offset="1" stop-color="#1e1e20"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#a)"/><path d="M14 22h13l4 4h19v20a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#e8e8ea"/><path d="M14 29h36v17a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#bdbdc2"/></svg>`,
  theme: () => { const a = accentHex(); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${a}"/><path d="M14 22h13l4 4h19v20a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#fff" opacity=".95"/><path d="M14 29h36v17a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#fff" opacity=".75"/></svg>`; },
  glass: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#a)" stroke="#fff" stroke-opacity=".5"/><path d="M14 22h13l4 4h19v20a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#fff" opacity=".7"/></svg>`,
};

function explorerApp() { return apps.find(a => /^file explorer$/i.test(a.name)) || apps.find(a => /explorer/i.test(a.name)); }

async function setExplorerIcon(kind) {
  const app = explorerApp();
  if (!app) { toast('File Explorer isn’t in your app list.'); return; }
  const overrides = { ...(S.iconOverrides || {}) };
  if (kind === 'default') delete overrides['app:' + app.id];
  else if (kind === 'custom') {
    const url = await call('pickImage').catch(() => null);
    if (!url) return;
    overrides['app:' + app.id] = url;
  } else overrides['app:' + app.id] = 'data:image/svg+xml;utf8,' + encodeURIComponent(EXPLORER_ICONS[kind]());
  S.explorerIcon = kind;
  setPref('iconOverrides', overrides);
}

/* ---------- The page ---------- */

addSettingsPage({ id: 'deep', label: 'Style Studio', icon: 'deep', color: '#141414', keys: 'deep customization themes corners border shadow window controls motion genie animation scanlines grain hud led spectrum wallpaper transition switcher lock screen editor explorer icon theme code surprise' }, 'customize');
NAV_ICONS.deep = '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.5 1.5M13.8 13.8l1.5 1.5M4.7 15.3l1.5-1.5M13.8 6.2l1.5-1.5"/></g><circle cx="15.5" cy="15.5" r="2.6" fill="#e5483a"/></svg>';

// Themes now live on Deep Customization, not on Appearance.
{
  const appearance = PAGES.appearance;
  PAGES.appearance = () => appearance().filter((el, i, all) => {
    // Drop the themes section that looks.js put at the top (its section, cards, buttons and note).
    const firstOwn = all.findIndex(x => x?.textContent === 'Theme');
    return firstOwn < 0 || i >= firstOwn;
  });
}

PAGES.deep = () => {
  const current = DEEP_THEMES.find(t => !t.echo && Object.entries(t.look).every(([k, v]) => JSON.stringify(S[k]) === JSON.stringify(v)));
  const saved = S.savedLooks || [];
  const themeCard = t => {
    const on = current === t;
    return h('button', { class: 'dt-card' + (on ? ' on' : ''), onclick: () => applyDeepTheme(t) }, themeMini(t), h('b', { text: t.name }), h('span', { text: t.tag }));
  };
  const savedCard = s2 => {
    const el = h('button', { class: 'dt-card', onclick: () => { applyLook(s2.look); replayPreview(); } },
      themeMini({ look: s2.look }), h('b', { text: s2.name }), h('span', { text: 'Yours' }));
    el.addEventListener('contextmenu', e => { e.preventDefault(); showMenu(e.clientX, e.clientY, [
      { label: 'Share as File…', action: () => call('exportTheme', { name: s2.name, look: s2.look }) },
      { label: 'Copy Theme Code', action: () => { const prev = currentLook(); applyLook(s2.look); navigator.clipboard?.writeText(themeCode()); applyLook(prev); toast('Theme code copied'); } },
      { label: 'Delete', action: () => setPref('savedLooks', saved.filter(x => x !== s2)) }]); });
    return el;
  };
  const makeTheme = () => promptText('Name your theme', 'My Theme', name => setPref('savedLooks', [...saved, { id: Date.now().toString(36), name, look: currentLook() }]));
  const motion = [['genie', 'Genie'], ['scale', 'Scale'], ['popin', 'Pop-in'], ['slide', 'Slide'], ['zoom', 'Zoom'], ['fade', 'Fade'], ['fold', 'Fold'], ['signal', 'Signal'], ['dots', 'Dots'], ['none', 'None']];
  const ctlCard = (id, label, glyph) => h('button', { class: 'dc-pick' + ((S.deepControls || 'macos') === id ? ' on' : ''), onclick: () => setPref('deepControls', id) }, h('span', { class: 'dc-glyph ctl-' + id }, ...glyph), h('span', { text: label }));
  const motionCard = ([id, label]) => h('button', { class: 'dc-pick motion-pick' + ((S.deepMotion || 'scale') === id ? ' on' : ''), onclick: () => { setPref('deepMotion', id); replayPreview(); } }, h('span', { class: 'mp-glyph mp-' + id }, h('i')), h('span', { text: label }));
  const iconCard = (id, label) => h('button', { class: 'dc-pick icon-pick' + ((S.explorerIcon || 'default') === id ? ' on' : ''), onclick: () => setExplorerIcon(id) },
    id === 'custom' ? h('span', { class: 'ip-plus', text: '+' }) : id === 'default' ? h('span', { class: 'ip-plus', text: '↺' }) : h('img', { src: 'data:image/svg+xml;utf8,' + encodeURIComponent(EXPLORER_ICONS[id]()), alt: '' }), h('span', { text: label }));

  const hero = h('div', { class: 'dc-hero' },
    bigPreview(),
    h('div', { class: 'dc-hero-text' },
      h('div', { class: 'dc-kicker' }, h('i', { class: 'tty-dot' }), document.createTextNode(' STYLE STUDIO')),
      h('div', { class: 'dc-name', text: current?.name || 'Your look' }),
      h('div', { class: 'muted', text: current ? `${current.tag}. Change anything below and it becomes yours.` : 'Every setting below, together.' }),
      h('div', { class: 'dc-actions' },
        button('Replay', replayPreview), button('Surprise me', surpriseMe, true), button('Make a theme', makeTheme),
        button('Copy theme code', () => navigator.clipboard?.writeText(themeCode()).then(() => toast('Theme code copied'))),
        button('Paste code', () => promptText('Paste a theme code', '', applyThemeCode)),
        button('Reset', resetDeep))));
  setTimeout(replayPreview, 50);

  return [
    hero,
    section('Themes'),
    h('div', { class: 'dt-grid' }, ...DEEP_THEMES.map(themeCard), ...saved.map(savedCard),
      h('button', { class: 'dt-card dt-make', onclick: makeTheme }, h('div', { class: 'dt-mini dt-plus', text: '+' }), h('b', { text: 'Make a theme' }), h('span', { text: 'Your colours' }))),
    note('A theme sets everything below at once. Change anything afterwards and it becomes yours. Right-click your own themes to share them.'),

    section('Windows'),
    group(
      row('Corners', 'Widgets, menus, search, Quick Controls, the Dock and Haven’s windows. Windows matches Windows 11; Sharp is a true 90°.',
        segmented([['round', 'Round'], ['windows', 'Windows'], ['squircle', 'Squircle'], ['sharp', 'Sharp'], ['bevel', 'Bevel'], ['notch', 'Notch']], S.deepCorners, v => setPref('deepCorners', v))),
      !['sharp', 'windows'].includes(S.deepCorners) && row('Corner size', null, (() => {
        const r = slider(0, 28, 1, S.deepCornerSize, v => { S.deepCornerSize = v; applyDeep(); lbl.textContent = v + 'px'; }, v => setPref('deepCornerSize', v));
        const lbl = h('span', { class: 'muted', text: S.deepCornerSize + 'px' });
        return h('span', { class: 'range-row' }, r, lbl);
      })()),
      row('Window controls', 'Close, minimize and zoom in Haven’s own windows, like System Settings.'),
      h('div', { class: 'sw-pad dc-picks' },
        ctlCard('macos', 'Traffic lights', [h('i', { class: 'r' }), h('i', { class: 'y' }), h('i', { class: 'g' })]),
        ctlCard('windows', 'Windows', [h('b', { text: '–' }), h('b', { text: '□' }), h('b', { text: '×' })]),
        ctlCard('mono', 'Mono', [h('i'), h('i'), h('i')]),
        ctlCard('signal', 'Signal', [h('i', { class: 'r' }), h('i', { class: 'o' }), h('i', { class: 'o' })])),
      row('Controls side', 'Windows-style controls always sit on the right.', segmented([['left', 'Left'], ['right', 'Right']], S.deepControls === 'windows' ? 'right' : S.deepControlsSide, v => setPref('deepControlsSide', v))),
      row('Border', null, segmented([['hairline', 'Hairline'], ['none', 'None'], ['glow', 'Glow'], ['gradient', 'Gradient']], S.deepBorder, v => setPref('deepBorder', v))),
      row('Border width', null, segmented([[1, '1px'], [2, '2px'], [3, '3px']], Number(S.deepBorderWidth) || 1, v => setPref('deepBorderWidth', v))),
      row('Spin the border', 'The gradient border keeps turning.', toggle(!!S.deepSpin, v => setPref('deepSpin', v))),
      row('Shadow', null, segmented([['soft', 'Soft'], ['deep', 'Deep'], ['none', 'None']], S.deepShadow, v => setPref('deepShadow', v))),
      row('Apply to app windows', 'Give your other apps’ windows the same corners and border colour too (Windows 11). Undone when you turn this off or exit Haven.', toggle(!!S.deepAppWindows, v => setPref('deepAppWindows', v)))),

    section('Motion'),
    group(
      row('Open and close', 'How Haven’s windows and panels appear: Settings, search, App Library, Quick Controls, stacks. (App windows shrinking into the Dock is in Desktop & Dock.)'),
      h('div', { class: 'sw-pad dc-picks motion-picks' }, ...motion.map(motionCard)),
      row('Titles', 'Caps sets window and widget titles in capitals.', segmented([['normal', 'Normal'], ['caps', 'Caps']], S.deepTitles, v => setPref('deepTitles', v))),
      row('Type', null, segmented([['system', 'System'], ['rounded', 'Rounded'], ['mono', 'Mono'], ['serif', 'Serif']], S.deepFont, v => setPref('deepFont', v)))),

    section('Screen effects'),
    group(
      row('Dot-matrix interface', 'An optional Nothing-inspired dotted treatment for Haven panels, widgets and controls. The standard Haven interface stays unchanged unless you turn this on.', toggle(!!S.deepDotUi, v => setPref('deepDotUi', v))),
      row('Dot grain', 'A fine dot texture over the desktop and Haven’s panels.', toggle(!!S.fxGrain, v => setPref('fxGrain', v))),
      row('Scanlines', 'CRT lines, for the Terminal and Deep Sea themes.', toggle(!!S.fxScanlines, v => setPref('fxScanlines', v))),
      row('HUD corners', 'Corner brackets on widgets and Haven’s windows.', toggle(!!S.fxHud, v => setPref('fxHud', v))),
      row('LED spectrum', 'Dot-matrix bars that move with whatever is playing. They hang under the menu bar, clear of the Dock.', toggle(!!S.fxLed, v => setPref('fxLed', v)))),

    section('Desktop clock & widget design'),
    group(
      row('Clock face', 'The default remains Haven’s analogue clock. Choose a digital face or a dotted matrix display for this look.', segmented([['analog', 'Analogue'], ['digital', 'Digital'], ['dots', 'Dot matrix']], S.desktopClockFace || 'analog', v => setPref('desktopClockFace', v))),
      row('Time display', 'Choose 12- or 24-hour time.', segmented([[false, '12-hour'], [true, '24-hour']], !!S.desktopClock24, v => { setPref('desktopClock24', v); tickClock(); })),
      row('Show seconds', 'Include seconds in digital and dot-matrix faces.', toggle(!!S.desktopClockSeconds, v => { setPref('desktopClockSeconds', v); tickClock(); })),
      row('Date', 'Show the weekday and date under digital clock faces.', toggle(!!S.desktopClockDate, v => { setPref('desktopClockDate', v); tickClock(); })),
      row('Alignment', null, segmented([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], S.desktopClockAlign || 'center', v => setPref('desktopClockAlign', v))),
      row('Clock size', 'Adjust the digital digits.', slider(24, 90, 1, S.desktopClockSize || 48, v => { const el = $('[data-widget="clock"]'); el?.style.setProperty('--clock-size', `${v}px`); }, v => setPref('desktopClockSize', v))),
      row('Dot spacing', 'Tune spacing for the dot-matrix face.', slider(0, 20, 1, Math.round((S.desktopClockTracking || .08) * 100), v => { const el = $('[data-widget="clock"]'); el?.style.setProperty('--clock-tracking', `${v / 100}em`); }, v => setPref('desktopClockTracking', v / 100))),
      row('Clock color', null, segmented([['accent', 'Accent'], ['white', 'White'], ['text', 'Text']], S.desktopClockColor || 'accent', v => setPref('desktopClockColor', v))),
      row('Widget design', 'Applies a coordinated style to the desktop clock, batteries and Now Playing widget. Preview changes live; the original style is the default.', segmented([['classic', 'Classic'], ['dot', 'Dot matrix'], ['mono', 'Mono'], ['soft', 'Soft']], S.widgetDesign || 'classic', v => setPref('widgetDesign', v)),
        segmented([['accent', 'Accent'], ['white', 'White'], ['text', 'Text'], ['custom', 'Custom']], S.widgetDesignColor || 'accent', v => setPref('widgetDesignColor', v)),
        (() => { const color = h('input', { type: 'color', class: 'widget-design-color-custom', value: S.widgetDesignCustomColor || '#ef4444', title: 'Custom widget design color', 'aria-label': 'Custom widget design color' }); color.addEventListener('input', () => { S.widgetDesignCustomColor = color.value; S.widgetDesignColor = 'custom'; applyTheme(); applyDeep(); save(); const preview = $('.widget-style-preview'); if (preview) preview.dataset.design = S.widgetDesign || 'classic'; }); return color; })()),
      widgetDesignPreview(),
      row('Save as a theme', 'Capture these settings with the rest of your current look.', button('Make a theme', () => promptText('Name your theme', 'My Widget Theme', name => setPref('savedLooks', [...(S.savedLooks || []), { id: Date.now().toString(36), name, look: currentLook() }]))))),

    section('Wallpaper'),
    group(
      row('Wallpaper transition', 'Plays whenever your wallpaper changes, from where you clicked.', segmented([['circle', 'Circle'], ['wipe', 'Wipe'], ['dots', 'Dots'], ['fade', 'Fade'], ['none', 'None']], S.wallTransition, v => setPref('wallTransition', v))),
      row('Wallpaper switcher', 'Browse wallpapers on a carousel and switch with a transition.', button('Open switcher', () => { closeOverlays(); setTimeout(openWallpaperSwitcher, 50); }), h('kbd', { text: 'Ctrl + Alt + W' }))),

    section('Lock screen'),
    group(row('Lock screen editor', 'Place widgets on a grid, change their size and style, and restyle the big clock.', button('Edit lock screen', openLockEditor))),

    section('File Explorer icon'),
    h('div', { class: 'dc-picks icon-picks' },
      iconCard('default', 'Default'), iconCard('classic', 'Classic'), iconCard('h', 'H.'), iconCard('doth', 'Dot H'), iconCard('mono', 'Mono'),
      iconCard('theme', 'Theme'), iconCard('glass', 'Glass'), iconCard('custom', 'Your image')),
    note('Shown in the Dock and App Library. Your image stays on this PC.'),
  ];
};

addEventListener('DOMContentLoaded', () => {
  applyDeep();
  if (IS_SHELL) { loadLockEvent(); setInterval(loadLockEvent, 5 * 60000); }
});

{
  const baseRemote = onRemoteState;
  // eslint-disable-next-line no-global-assign
  onRemoteState = function (next) { baseRemote(next); applyDeep(); };
}
