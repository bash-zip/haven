'use strict';

/* =========================================================================
   Looks: complete themes (presets, your own, shared as files), Focus modes
   (Work / Personal / Gaming with their own wallpaper, Dock and notification
   rules) and backing up or moving your whole setup.
   ========================================================================= */

// Two more of Haven's wave wallpapers, for the Sunset Hills and Violet Bay looks.
Object.assign(WAVE_PALETTES, {
  sonoma:   { label: 'Sunset Hills',   bg: ['#1d1442', '#e9845c'], waves: [['#f2a65e', '#9b3f6e'], ['#ffd59a', '#df6a52']] },
  monterey: { label: 'Violet Bay', bg: ['#14164d', '#5a3fd0'], waves: [['#b459d6', '#3524a0'], ['#ff8db9', '#7046e0']] },
});

/** Everything that makes up how Haven looks (not your apps, widgets or data). */
const LOOK_KEYS = ['theme', 'accent', 'wallpaper', 'wallpaperFit', 'wallpaperX', 'wallpaperY', 'dynamicWallpaper', 'glass', 'glassStyle', 'refraction', 'glassTint',
  'customSurface', 'iconStyle', 'widgetStyle', 'widgetTint', 'widgetSize', 'islandPos', 'liveWallpaper', 'desktopClockFace', 'desktopClock24', 'desktopClockSeconds', 'desktopClockDate', 'desktopClockAlign', 'desktopClockSize', 'desktopClockColor', 'desktopClockTracking', 'widgetDesign', 'widgetDesignColor', 'widgetDesignCustomColor', 'dockSize', 'magnify', 'iconOverrides', 'customCss', 'island', 'visualizer',
  'deepDotUi', 'lockClockStyle', 'lockLayout', 'deepFont', 'deepTitles', 'deepCorners', 'deepCornerSize', 'deepControls', 'deepControlsSide', 'deepBorder', 'deepBorderWidth', 'deepShadow', 'deepMotion', 'fxGrain', 'fxScanlines', 'fxHud', 'fxLed', 'audioDeckView', 'audioDeckStyle', 'audioDeckVizStyle', 'audioDeckMetadata', 'controlCenterDensity', 'controlCenterShape', 'controlCenterAccent', 'controlCenterGlow', 'controlCenterScale'];

const PRESET_LOOKS = [
  { id: 'sonoma', name: 'Sunset Hills', look: { theme: 'glass', accent: 'orange', wallpaper: 'sonoma', glass: true, glassStyle: 'liquid', refraction: 60, glassTint: 0.35, iconStyle: 'default', widgetStyle: 'glass' } },
  { id: 'monterey', name: 'Violet Bay', look: { theme: 'dark', accent: 'purple', wallpaper: 'monterey', glass: true, glassStyle: 'liquid', refraction: 55, glassTint: 0.45, iconStyle: 'default', widgetStyle: 'glass' } },
  { id: 'graphite', name: 'Graphite', look: { theme: 'black', accent: 'slate', wallpaper: 'graphite', glass: true, glassStyle: 'frosted', refraction: 30, glassTint: 0.6, iconStyle: 'dark', widgetStyle: 'glass' } },
  { id: 'red-dot', name: 'Red Dot', look: { theme: 'black', accent: '#e5483a', wallpaper: 'matrix', glass: false, glassStyle: 'frosted', iconStyle: 'dark', widgetStyle: 'solid', deepDotUi: true, lockClockStyle: 'dots', desktopClockFace: 'dots', deepCorners: 'sharp', deepCornerSize: 0, deepControls: 'signal', deepBorder: 'hairline', deepShadow: 'none', deepMotion: 'dots', deepFont: 'mono', deepTitles: 'caps', widgetDesign: 'dot', widgetDesignColor: 'white' } },
  { id: 'dune', name: 'Dune', look: { theme: 'sand', accent: 'champagne', wallpaper: 'dune', glass: true, glassStyle: 'liquid', refraction: 45, glassTint: 0.5, iconStyle: 'default', widgetStyle: 'glass' } },
  { id: 'ember', name: 'Ember', look: { theme: 'burgundy', accent: 'burgundy', wallpaper: 'ember', glass: true, glassStyle: 'liquid', refraction: 60, glassTint: 0.5, iconStyle: 'default', widgetStyle: 'glass' } },
];

function currentLook() {
  const look = {};
  for (const k of LOOK_KEYS) if (S[k] !== undefined) look[k] = structuredClone(S[k]);
  return look;
}

function applyLook(look) {
  for (const k of LOOK_KEYS) if (look[k] !== undefined) S[k] = structuredClone(look[k]);
  save();
  applyTheme();
  applyDeep?.();
  applyCustomization?.();
  applyWallpaper();
  applyScale();
  renderDock(true);
  refreshSettingsPage();
}

function lookPreview(look) {
  const wall = typeof look.wallpaper === 'object' && look.wallpaper?.url ? `url("${look.wallpaper.url}") center / cover`
    : waveWallpaper(look.wallpaper) || waveWallpaper('graphite');
  const accent = ACCENTS[look.accent]?.[1] || look.accent || '#3b82f6';
  return h('div', { class: 'look-prev', style: `background:${wall}` },
    h('div', { class: 'look-bar' }), h('div', { class: 'look-dock' }, h('i', { style: `background:${accent}` }), h('i'), h('i')));
}

function lookMatches(look) {
  return Object.keys(look).every(k => JSON.stringify(look[k]) === JSON.stringify(S[k]));
}

function themesSection() {
  const saved = S.savedLooks || [];
  const card = (item, own) => {
    const el = pickCard(item.name, lookPreview(item.look), lookMatches(item.look), () => applyLook(item.look));
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: 'Apply', action: () => applyLook(item.look) },
        { label: 'Share as File…', action: () => call('exportTheme', { name: item.name, look: item.look }).then(p => p && toast('Theme saved')) },
        own && { label: 'Update to Current Look', action: () => { item.look = currentLook(); setPref('savedLooks', [...saved]); } },
        own && { label: 'Rename…', action: () => promptText('Rename theme', item.name, v => { item.name = v; setPref('savedLooks', [...saved]); }) },
        own && '-',
        own && { label: 'Delete', action: () => setPref('savedLooks', saved.filter(x => x !== item)) },
      ]);
    });
    return el;
  };
  return [
    section('Themes'),
    group(h('div', { class: 'sw-pad' }, h('div', { class: 'card-grid' },
      ...PRESET_LOOKS.map(p => card(p, false)), ...saved.map(p => card(p, true))))),
    group(
      row('Save the current look', 'Wallpaper, theme, accent, glass, icon style, widgets and custom icons, as one theme you can switch back to.',
        button('Save as Theme…', () => promptText('Name this theme', 'My Theme', name => setPref('savedLooks', [...saved, { id: Date.now().toString(36), name, look: currentLook() }])), true)),
      row('Add a theme from a file', 'Themes others shared with you (.haventheme).', button('Add Theme…', async () => {
        const t = await call('importTheme').catch(err => { toast(err.message); return null; });
        if (!t?.look) return;
        setPref('savedLooks', [...saved, { id: Date.now().toString(36), name: t.name || 'Shared Theme', look: t.look }]);
        applyLook(t.look);
      }))),
    note('Right-click a theme to share it as a file, rename or delete it.'),
  ];
}

/** A tiny text prompt in Haven's own style. */
function promptText(title, value, onDone) {
  const input = h('input', { class: 'field', value });
  const done = () => { const v = input.value.trim(); if (v) onDone(v); hideMenu(); dlg.remove(); };
  const dlg = h('div', { class: 'mini-prompt' },
    h('b', { text: title }), input,
    h('div', { class: 'mini-prompt-actions' }, button('Cancel', () => dlg.remove()), button('OK', done, true)));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { e.stopPropagation(); dlg.remove(); } });
  ($('#modal .modal') || document.body).append(dlg);
  setTimeout(() => { input.focus(); input.select(); }, 30);
}

{
  const appearance = PAGES.appearance;
  PAGES.appearance = () => [...themesSection(), ...appearance()];
}

/* ---------- Focus modes ---------- */

const FOCUS_ICONS = {
  work: '<svg viewBox="0 0 20 20"><rect x="3" y="6" width="14" height="10" rx="2" fill="currentColor"/><path d="M7.5 6V4.5h5V6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  personal: '<svg viewBox="0 0 20 20"><circle cx="10" cy="7" r="3.2" fill="currentColor"/><path d="M3.5 17c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5z" fill="currentColor"/></svg>',
  gaming: '<svg viewBox="0 0 20 20"><path d="M5.5 6h9a3.5 3.5 0 0 1 3.4 4.3l-.8 3.6a2 2 0 0 1-3.5.8L12.4 13H7.6l-1.2 1.7a2 2 0 0 1-3.5-.8l-.8-3.6A3.5 3.5 0 0 1 5.5 6z" fill="currentColor"/><path d="M6 8.5v2.5M4.8 9.8h2.5" stroke="#000" stroke-width="1.2" opacity=".5"/></svg>',
  moon: '<svg viewBox="0 0 20 20"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" fill="currentColor"/></svg>',
};

const DEFAULT_FOCUS = [
  { id: 'work', name: 'Work', icon: 'work', color: '#3b82f6', dnd: true, widgets: true, wallpaper: null, dock: null },
  { id: 'personal', name: 'Personal', icon: 'personal', color: '#8b5cf6', dnd: false, widgets: true, wallpaper: null, dock: null },
  { id: 'gaming', name: 'Gaming', icon: 'gaming', color: '#30b158', dnd: true, widgets: false, wallpaper: null, dock: null },
];

const focusModes = () => S.focusModes || DEFAULT_FOCUS;
const activeFocus = () => focusModes().find(f => f.id === S.activeFocus) || null;

function setFocus(id) {
  const modes = focusModes();
  const next = modes.find(f => f.id === id) || null;
  // Remember how things were before any focus, so turning focus off puts them back.
  if (!S.activeFocus && next) S.focusBase = { wallpaper: structuredClone(S.wallpaper), dock: S.dock ? [...S.dock] : null, dnd: S.dnd, showWidgets: S.showWidgets };
  const base = S.focusBase || {};
  const src = next || base;
  S.activeFocus = next ? next.id : null;
  S.wallpaper = structuredClone((next ? next.wallpaper : null) ?? base.wallpaper ?? S.wallpaper);
  S.dock = (next ? next.dock : null) ?? base.dock ?? S.dock;
  S.dnd = next ? !!next.dnd : !!base.dnd;
  S.showWidgets = next ? next.widgets !== false : base.showWidgets !== false;
  if (!next) S.focusBase = null;
  void src;
  save();
  applyWallpaper();
  renderDock(true);
  renderFocusIndicator();
  refreshSettingsPage();
  if (!$('#control-center').hidden) renderControlCenter();
  Sound.play('pop');
}

function renderFocusIndicator() {
  if (!IS_SHELL) return;
  let el = $('#focus-indicator');
  if (!el) {
    el = h('button', { class: 'status focus-indicator', id: 'focus-indicator', onclick: e => focusMenu(e.currentTarget) });
    $('#menubar-clock')?.before(el);
  }
  const f = activeFocus();
  el.hidden = !f;
  if (f) { el.replaceChildren(svg(FOCUS_ICONS[f.icon] || FOCUS_ICONS.moon)); el.title = `${f.name} Focus`; el.style.color = f.color; }
}

function focusMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  showMenu(r.left, r.bottom + 3, [
    ...focusModes().map(f => ({ label: f.name, checked: S.activeFocus === f.id, action: () => setFocus(S.activeFocus === f.id ? null : f.id) })),
    '-',
    { label: 'Turn Off Focus', action: () => setFocus(null) },
    { label: 'Focus Settings…', action: () => openSettings('focus') },
  ], anchor);
}

// Control Center gets a Focus tile.
{
  const baseRender = renderControlCenter;
  // eslint-disable-next-line no-global-assign
  renderControlCenter = function () {
    baseRender();
    const tiles = $('#cc-panel .cc-tiles');
    if (!tiles || tiles.querySelector('.cc-focus')) return;
    const f = activeFocus();
    const tile = ccTile('Focus', f ? f.name : 'Off', !!f, FOCUS_ICONS[f?.icon] || FOCUS_ICONS.moon, e => focusMenu(e.currentTarget));
    tile.classList.add('cc-focus');
    tiles.append(tile);
  };
}

ACTIONS.focus = ['Focus: next mode', () => {
  const modes = focusModes();
  const i = modes.findIndex(f => f.id === S.activeFocus);
  setFocus(i + 1 < modes.length ? modes[i + 1].id : null);
}];

addSettingsPage({ id: 'focus', label: 'Focus', icon: 'moon', color: '#5e5ce6', keys: 'focus work personal gaming mode do not disturb dnd wallpaper dock' }, 'menubar');
NAV_ICONS.moon = FOCUS_ICONS.moon;

PAGES.focus = () => {
  const modes = focusModes();
  const update = (f, patch) => { Object.assign(f, patch); setPref('focusModes', [...modes]); if (S.activeFocus === f.id) setFocus(f.id); };
  return [
    note('A Focus changes Haven to suit what you’re doing: its own wallpaper and Dock, notifications silenced, widgets shown or hidden. Switch from Quick Controls or the menu bar.'),
    ...modes.flatMap(f => [
      section(f.name),
      group(
        row(S.activeFocus === f.id ? 'On now' : 'Off', null, button(S.activeFocus === f.id ? 'Turn Off' : 'Turn On', () => setFocus(S.activeFocus === f.id ? null : f.id), S.activeFocus !== f.id)),
        row('Silence notifications', 'Turns on Do Not Disturb while this Focus is on.', toggle(!!f.dnd, v => update(f, { dnd: v }))),
        row('Show widgets', null, toggle(f.widgets !== false, v => update(f, { widgets: v }))),
        row('Wallpaper', f.wallpaper ? 'Its own wallpaper.' : 'Keeps your usual wallpaper.',
          button('Use Current', () => update(f, { wallpaper: structuredClone(S.wallpaper) })), f.wallpaper && button('Clear', () => update(f, { wallpaper: null }))),
        row('Dock', f.dock ? `${f.dock.length} apps of its own.` : 'Keeps your usual Dock.',
          button('Use Current', () => update(f, { dock: S.dock ? [...S.dock] : null })), f.dock && button('Clear', () => update(f, { dock: null }))),
        row('Name', null, (() => { const i = h('input', { class: 'field', value: f.name, style: 'width:160px' }); i.addEventListener('change', () => update(f, { name: i.value.trim() || f.name })); return i; })()),
        modes.length > 1 && row('', null, button('Delete Focus', () => { if (S.activeFocus === f.id) setFocus(null); setPref('focusModes', modes.filter(x => x !== f)); }))),
    ]),
    group(row('New Focus', null, button('Add Focus…', () => promptText('Name this Focus', 'Reading', name =>
      setPref('focusModes', [...modes, { id: Date.now().toString(36), name, icon: 'moon', color: '#5e5ce6', dnd: true, widgets: true, wallpaper: null, dock: null }])), true))),
  ];
};

/* ---------- Back up and move your setup ---------- */

{
  const general = PAGES.general;
  PAGES.general = () => {
    const items = general();
    const at = items.findIndex(x => x?.textContent === 'Exit');
    const backup = [
      section('Back up & move'),
      group(
        row('Export your setup', 'Wallpaper, Dock, widgets, icons, themes, Focus modes and every setting, with their pictures, in one .havensetup file.',
          button('Export…', async () => { const p = await call('exportSetup').catch(err => { toast(err.message); return null; }); if (p) toast('Setup exported'); }, true)),
        row('Import a setup', 'Replaces your current setup with the one in the file (handy on a new PC).',
          button('Import…', async () => {
            const state = await call('importSetup').catch(err => { toast(err.message); return null; });
            if (!state) return;
            const keep = { lockHash: S.lockHash };
            S = { ...DEFAULTS, ...state, ...(state.lockHash ? {} : keep) };
            save();
            onRemoteState(S);
            renderFocusIndicator();
            toast('Setup imported');
          }))),
    ];
    if (at < 0) return [...items, ...backup];
    return [...items.slice(0, at), ...backup, ...items.slice(at)];
  };
}

addEventListener('DOMContentLoaded', () => { if (IS_SHELL) setTimeout(renderFocusIndicator, 300); });
