'use strict';

/* =========================================================================
   More widgets (Visualizer, Stocks, Activity graph, Battery history,
   Countdown, Space note, Haven terminal) and the Widget Gallery.
   ========================================================================= */

Object.assign(WIDGETS, {
  visualizer: 'Visualizer', tty: 'Haven Terminal', stocks: 'Stocks', cpugraph: 'Activity',
  batteryhistory: 'Battery History', countdown: 'Countdown', spacenote: 'Space Note',
});

const WIDGET_INFO = {
  batteries: ['Batteries', 'This PC and connected devices.', '🔋'],
  clock: ['Clock', 'An analogue clock.', '🕐'],
  calendar: ['Calendar', 'This month at a glance.', '📅'],
  weather: ['Weather', 'Conditions and forecast for your city.', '🌦'],
  reminders: ['Reminders', 'A quick to-do list.', '☑️'],
  media: ['Now Playing', 'What’s playing, with controls.', '🎵'],
  notes: ['Notes', 'A sticky note on your desktop.', '📝'],
  system: ['System', 'CPU, memory and disk rings.', '🖥'],
  worldclock: ['World Clock', 'Times around the world.', '🌍'],
  photos: ['Photos', 'A slideshow from your Pictures folder.', '🖼'],
  events: ['Up Next', 'Your next calendar events.', '🗓'],
  visualizer: ['Visualizer', 'Live bars, waves or a blob that move to whatever is playing.', '📊'],
  tty: ['Haven Terminal', 'A retro terminal: system info, a dot visualizer, Game of Life, a spinning orb and Matrix rain.', '⌨️'],
  stocks: ['Stocks', 'Prices and today’s change for your symbols.', '📈'],
  cpugraph: ['Activity', 'A live graph of CPU and memory use.', '📉'],
  batteryhistory: ['Battery History', 'Your battery level over the last 24 hours.', '🔌'],
  countdown: ['Countdown', 'Days until something you’re looking forward to.', '⏳'],
  spacenote: ['Space Note', 'A different note on each desktop space.', '🗒'],
};

const NEW_WIDGETS = ['visualizer', 'tty', 'stocks', 'cpugraph', 'batteryhistory', 'countdown', 'spacenote'];

/* ---------- New widgets start hidden: add them from the gallery ---------- */

function migrateNewWidgets() {
  const known = new Set(S.knownWidgets || []);
  const fresh = NEW_WIDGETS.filter(id => !known.has(id));
  if (!fresh.length) return;
  S.hidden = [...new Set([...(S.hidden || []), ...fresh])];
  S.knownWidgets = [...known, ...fresh];
  save();
  applyWidgetVisibility();
}

/* ---------- Extra right-click items per widget ---------- */

const WIDGET_MENU_EXTRA = {
  visualizer: () => [
    ...VIZ_STYLES.map(([id, label]) => ({ label, checked: (S.vizWidgetStyle || 'bars') === id, action: () => { S.vizWidgetStyle = id; save(); syncVizWidget(); } })),
    '-',
    ...VIZ_COLORS.map(([id, label]) => ({ label: label + ' colour', checked: (S.vizWidgetColor || 'accent') === id, action: () => { S.vizWidgetColor = id; save(); syncVizWidget(); } })),
  ],
  stocks: () => [{ label: 'Edit Symbols…', action: () => promptText('Stock symbols (comma separated)', (S.stockSymbols || DEFAULT_STOCKS).join(', '), v => { S.stockSymbols = v.split(/[\s,]+/).filter(Boolean).slice(0, 6); save(); loadStocks(); }) }],
  countdown: () => [{ label: 'Edit Countdown…', action: editCountdown }],
};

/* ---------- Visualizer widget ---------- */

let vizWidget = null;
function syncVizWidget() {
  if (!IS_DESKTOP) return;
  const el = $('[data-widget="visualizer"]');
  const visible = el && !el.hidden && S.showWidgets;
  const style = S.vizWidgetStyle || 'bars', color = S.vizWidgetColor || 'accent';
  if (visible && !vizWidget) vizWidget = mountViz($('#viz-canvas'), { style, color, bands: style === 'dots' ? 40 : 36 });
  else if (!visible && vizWidget) { vizWidget.stop(); vizWidget = null; }
  vizWidget?.set({ style, color, bands: style === 'dots' ? 40 : style === 'radial' || style === 'blob' ? 48 : 36 });
  const label = $('#viz-label');
  if (label) label.textContent = (VIZ_STYLES.find(s => s[0] === style) || [])[1] || '';
}

/* ---------- Stocks ---------- */

const DEFAULT_STOCKS = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];

async function loadStocks() {
  const el = $('[data-widget="stocks"]');
  if (!el || el.hidden || !S.showWidgets) return;
  let quotes = [];
  try { quotes = await call('stocks', { symbols: S.stockSymbols || DEFAULT_STOCKS }) || []; } catch { quotes = []; }
  if (!host) quotes = (S.stockSymbols || DEFAULT_STOCKS).map((s, i) => ({ symbol: s, name: s, price: 100 + i * 37.5, changePercent: [1.2, -0.4, 2.8, -1.9][i % 4], spark: Array.from({ length: 26 }, (_, k) => 100 + Math.sin(k / 3 + i) * 3 + k * 0.1) }));
  $('#stock-list').replaceChildren(...(quotes.length ? quotes.slice(0, 4).map(q => {
    const up = q.changePercent >= 0;
    return h('div', { class: 'stock-row' },
      h('div', { class: 'stock-name' }, h('b', { text: q.symbol }), h('small', { class: 'muted', text: truncate(q.name || '', 18) })),
      sparkline(q.spark || [], up ? '#30b158' : '#e5484d'),
      h('div', { class: 'stock-price' }, h('b', { text: q.price.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) }),
        h('span', { class: 'stock-chip ' + (up ? 'up' : 'down'), text: `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` })));
  }) : [h('div', { class: 'muted', style: 'padding:12px 0;font-size:12px', text: 'Quotes couldn’t be loaded. Right-click to edit your symbols.' })]));
  $('#stock-updated').textContent = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function sparkline(values, color) {
  const el = s('svg', { viewBox: '0 0 60 22', class: 'sparkline', preserveAspectRatio: 'none' });
  if (values.length > 1) {
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1) * 60).toFixed(1)},${(20 - (v - min) / span * 18).toFixed(1)}`).join('');
    el.append(s('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  }
  return el;
}

/* ---------- Activity graph (CPU & memory) ---------- */

const cpuHistory = [], memHistory = [];
async function pollActivity() {
  const el = $('[data-widget="cpugraph"]');
  if (el && !el.hidden && S.showWidgets) {
    try {
      const st = await call('stats');
      if (st) {
        cpuHistory.push(st.cpu); memHistory.push(st.memory);
        if (cpuHistory.length > 60) { cpuHistory.shift(); memHistory.shift(); }
        $('#cpu-now').textContent = `CPU ${Math.round(st.cpu)}% · Mem ${Math.round(st.memory)}%`;
        drawGraph($('#cpu-canvas'), [[cpuHistory, 'accent'], [memHistory, '#f5a524']], 100, 60);
      }
    } catch { /* ignore */ }
  }
  setTimeout(pollActivity, 2000);
}

function drawGraph(canvas, series, max, slots) {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgb(128 128 128 / .18)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, H * i / 4); ctx.lineTo(W, H * i / 4); ctx.stroke(); }
  for (const [values, colorKey] of series) {
    if (values.length < 2) continue;
    const color = colorKey === 'accent' ? vizColor('accent', 0) : colorKey;
    const x = i => W - (values.length - 1 - i) * (W / (slots - 1)), y = v => H - 2 - (v / max) * (H - 4);
    ctx.beginPath();
    values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.strokeStyle = color; ctx.lineWidth = 2 * dpr; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineTo(x(values.length - 1), H); ctx.lineTo(x(0), H); ctx.closePath();
    ctx.globalAlpha = 0.14; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
  }
}

/* ---------- Battery history ---------- */

function batteryLog() {
  try { return JSON.parse(localStorage.getItem('haven-battery-log') || '[]'); } catch { return []; }
}

function recordBattery() {
  if (typeof pcBattery === 'undefined' || !pcBattery) return;
  const log = batteryLog().filter(([t]) => Date.now() - t < 86400000);
  const last = log[log.length - 1];
  if (!last || Date.now() - last[0] > 4 * 60000 || last[1] !== pcBattery.level) log.push([Date.now(), pcBattery.level, pcBattery.charging ? 1 : 0]);
  try { localStorage.setItem('haven-battery-log', JSON.stringify(log.slice(-400))); } catch { /* storage unavailable */ }
}

function renderBatteryHistory() {
  const el = $('[data-widget="batteryhistory"]');
  if (!el || el.hidden || !S.showWidgets) return;
  recordBattery();
  const log = batteryLog();
  const now = Date.now();
  const canvas = $('#bat-canvas');
  const has = typeof pcBattery !== 'undefined' && pcBattery;
  $('#bat-now').textContent = has ? `${pcBattery.level}%${pcBattery.charging ? ' · charging' : ''}` : 'No battery';
  if (!canvas) return;
  const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const bw = W / 48;
  for (let i = 0; i < 48; i++) {
    const from = now - (48 - i) * 1800000, to = from + 1800000;
    const pts = log.filter(([t]) => t >= from && t < to);
    if (!pts.length) { ctx.fillStyle = 'rgb(128 128 128 / .12)'; ctx.fillRect(i * bw + 1, H - 3, bw - 2, 3); continue; }
    const lvl = pts.reduce((a, p) => a + p[1], 0) / pts.length, charging = pts.some(p => p[2]);
    const hh = Math.max(3, lvl / 100 * (H - 2));
    ctx.fillStyle = charging ? '#30b158' : lvl < 20 ? '#e5484d' : vizColor('accent', 0);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(i * bw + 1, H - hh, bw - 2, hh, 2) : ctx.rect(i * bw + 1, H - hh, bw - 2, hh); ctx.fill();
  }
  $('#bat-legend').textContent = log.length ? 'Last 24 hours · green while charging' : 'Collecting… check back in a while';
}

/* ---------- Countdown ---------- */

function editCountdown() {
  const c = S.countdown || {};
  promptText('What are you counting down to?', c.title || 'Holiday', title => {
    promptText('When? (YYYY-MM-DD)', c.date || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), date => {
      if (Number.isNaN(Date.parse(date))) { toast('That date isn’t valid.'); return; }
      S.countdown = { title, date };
      save();
      renderCountdown();
    });
  });
}

function renderCountdown() {
  const body = $('#countdown-body');
  if (!body) return;
  const c = S.countdown;
  if (!c) {
    $('#countdown-title').textContent = 'Countdown';
    body.replaceChildren(h('button', { class: 'button', text: 'Set a countdown…', onclick: editCountdown }));
    return;
  }
  $('#countdown-title').textContent = c.title;
  const ms = new Date(c.date + 'T00:00:00') - Date.now();
  const days = Math.ceil(ms / 86400000);
  body.replaceChildren(
    h('div', { class: 'countdown-num', text: days > 0 ? String(days) : days === 0 ? 'Today' : String(-days) }),
    h('div', { class: 'muted', text: days > 1 ? 'days to go' : days === 1 ? 'day to go' : days === 0 ? '🎉' : `day${days === -1 ? '' : 's'} ago` }),
    h('div', { class: 'countdown-date muted', text: new Date(c.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) }));
}

/* ---------- Space note ---------- */

let spaceId = null;
async function syncSpaceNote() {
  const el = $('[data-widget="spacenote"]');
  if (el && !el.hidden && S.showWidgets) {
    let sp = null;
    try { sp = await call('currentSpace'); } catch { sp = null; }
    if (!host) sp = { id: 'preview', name: 'Desktop 1' };
    if (sp && sp.id !== spaceId) {
      spaceId = sp.id;
      $('#spacenote-title').textContent = sp.name || 'Space note';
      const input = $('#spacenote-input');
      if (document.activeElement !== input) input.value = (S.spaceNotes || {})[spaceId] || '';
    }
  }
  setTimeout(syncSpaceNote, 2500);
}

/* ---------- Widget Gallery (shell) ---------- */

function openWidgetGallery() {
  if (!IS_SHELL) return toShell('openWidgetGallery');
  const card = id => {
    const [name, desc, glyph] = WIDGET_INFO[id] || [WIDGETS[id] || id, '', '▫️'];
    const shown = !(S.hidden || []).includes(id);
    return h('div', { class: 'wg-card' + (shown ? ' on' : '') },
      h('div', { class: 'wg-glyph', text: glyph }),
      h('div', { class: 'wg-text' }, h('b', { text: name }), h('span', { class: 'muted', text: desc })),
      button(shown ? 'Remove' : 'Add', () => {
        const hidden = new Set(S.hidden || []);
        shown ? hidden.add(id) : hidden.delete(id);
        S.hidden = [...hidden];
        if (!S.showWidgets) S.showWidgets = true;
        save();
        openWidgetGallery();
      }, !shown));
  };
  const ids = Object.keys(WIDGETS);
  openModal('Widget Gallery', [
    h('p', { class: 'muted', style: 'margin:0 0 10px', text: 'Add widgets to your desktop. Drag them anywhere, resize from the corner, and right-click for options.' }),
    h('div', { class: 'wg-grid' }, ids.filter(id => NEW_WIDGETS.includes(id)).map(card)),
    h('div', { class: 'sw-section', text: 'Classics' }),
    h('div', { class: 'wg-grid' }, ids.filter(id => !NEW_WIDGETS.includes(id)).map(card)),
  ], 'widget-gallery');
}

COMMANDS.openWidgetGallery = () => openWidgetGallery();

// "Edit widgets" mode gets a gallery button.
{
  const baseVisibility = applyWidgetVisibility;
  // eslint-disable-next-line no-global-assign
  applyWidgetVisibility = function () {
    baseVisibility();
    if (!IS_DESKTOP) return;
    const row = $('#hidden-widgets');
    if (editing && row && !row.querySelector('.gallery-chip'))
      row.prepend(h('button', { class: 'add-chip gallery-chip', text: '＋ Widget Gallery…', onclick: () => openWidgetGallery() }));
    syncVizWidget();
    loadStocks();
    renderCountdown();
    renderBatteryHistory();
  };
}

{
  const widgetsPage = PAGES.widgets;
  PAGES.widgets = () => [group(row('Widget Gallery', 'Browse every widget, including the Visualizer, Stocks, Activity and the Haven terminal.', button('Open Gallery…', () => openWidgetGallery(), true))), ...widgetsPage()];
}

/* ---------- Start ---------- */

addEventListener('DOMContentLoaded', () => {
  if (!IS_DESKTOP) return;
  setTimeout(() => {
    migrateNewWidgets();
    syncVizWidget();
    loadStocks();
    renderCountdown();
    renderBatteryHistory();
    pollActivity();
    syncSpaceNote();
  }, 700);
  setInterval(loadStocks, 5 * 60000);
  setInterval(renderBatteryHistory, 60000);
  setInterval(renderCountdown, 10 * 60000);
  $('#spacenote-input')?.addEventListener('input', e => {
    if (!spaceId) return;
    S.spaceNotes = { ...(S.spaceNotes || {}), [spaceId]: e.target.value };
    save();
  });
});

{
  const baseRemote = onRemoteState;
  // eslint-disable-next-line no-global-assign
  onRemoteState = function (next) { baseRemote(next); if (IS_DESKTOP) { syncVizWidget(); renderCountdown(); } };
}
