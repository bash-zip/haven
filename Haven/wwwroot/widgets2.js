'use strict';

/* =========================================================================
   More widgets (Visualizer, Stocks, Activity graph, Battery history,
   Countdown, Space note, Haven terminal) and the Widget Gallery.
   ========================================================================= */

Object.assign(WIDGETS, {
  audiodeck: 'SIGNAL Audio Deck', signal: 'SIGNAL / 01', cava: 'cava Visualizer', visualizer: 'Visualizer', timer: 'Timer', stocks: 'Stocks', cpugraph: 'Activity',
  batteryhistory: 'Battery History', countdown: 'Countdown', spacenote: 'Space Note',
});

const WIDGET_INFO = {
  network: ['Network', 'Wi-Fi name, signal and connection status', '📶'],
  clipboard: ['Clipboard', 'Recent clipboard items — click one to copy it again', '📋'],
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
  audiodeck: ['SIGNAL Audio Deck', 'A multi-view, customizable audio instrument panel with live track and spectrum views.', '◉'],
  stocks: ['Stocks', 'Prices and today’s change for your symbols.', '📈'],
  cpugraph: ['Activity', 'A live graph of CPU and memory use.', '📉'],
  batteryhistory: ['Battery History', 'Your battery level over the last 24 hours.', '🔌'],
  signal: ['SIGNAL / 01', 'Audio-reactive dot-matrix instrument: FACE, PULSE, RIPPLE, TORUS, CLOCK and TICKER.', '◉'],
  cava: ['cava', 'A local, dot-matrix spectrum visualizer with no recording or microphone access.', '▥'],
  timer: ['Timer', 'A countdown, stopwatch and Pomodoro cycle in one widget.', '⏱'],
  countdown: ['Countdown', 'Days until something you’re looking forward to.', '⏳'],
  spacenote: ['Space Note', 'A different note on each desktop space.', '🗒'],
};

const NEW_WIDGETS = ['audiodeck', 'visualizer', 'stocks', 'cpugraph', 'batteryhistory', 'countdown', 'spacenote', 'signal', 'cava', 'timer'];

/** Shared per-widget settings schema. Values live under S.widgetOpts[id]. */
const WIDGET_OPTIONS = {
  clock: [
    { key: 'face', label: 'Clock face', type: 'select', options: [['analog','Analog'],['digital','Digital'],['dots','Dot matrix'],['flip','Flip'],['city','City'],['grid','World Grid']], value: 'analog' },
    { key: 'seconds', label: 'Show seconds', type: 'toggle', value: true },
    { key: '24h', label: '24-hour time', type: 'toggle', value: false },
    { key: 'cityIndex', label: 'City (City face)', type: 'select', options: [[0,'First world clock'],[1,'Second'],[2,'Third'],[3,'Fourth']], value: 0 },
  ],
  weather: [{ key: 'detail', label: 'Forecast detail', type: 'select', options: [['compact','Compact'],['full','Full forecast']], value: 'full' }],
  media: [{ key: 'art', label: 'Show album artwork', type: 'toggle', value: true }],
  visualizer: [{ key: 'style', label: 'Visualizer style', type: 'select', options: [['bars','Bars'],['mirror','Mirror'],['dots','Dots (cava)'],['radial','Radial'],['blob','Blob'],['line','Wave']], value: 'bars' }],
  stocks: [{ key: 'compact', label: 'Compact rows', type: 'toggle', value: false }],
  signal: [{ key: 'mode', label: 'Display mode', type: 'select', options: [['face','FACE'],['pulse','PULSE'],['ripple','RIPPLE'],['torus','TORUS'],['scope','SCOPE'],['seq','SEQ'],['clock','CLOCK'],['ticker','TICKER']], value: 'face' },
    { key: 'tape', label: 'Tape-deck surround', type: 'toggle', value: false },
    { key: 'color', label: 'Signal colour', type: 'select', options: [['accent','Accent (theme)'],['red','#ef5144'],['white','#f2f0e9'],['amber','#ffb547'],['green','#80df90']], value: 'accent' },
    { key: 'seqBpm', label: 'Sequencer tempo', type: 'select', options: [['90','90'],['110','110'],['120','120'],['140','140'],['160','160']], value: '120' },
    { key: 'seqSound', label: 'Sequencer sound', type: 'toggle', value: false }],
  cava: [{ key: 'style', label: 'Bar style', type: 'select', options: [['bars','Bars'],['mirror','Mirror'],['dots','Dots'],['radial','Radial']], value: 'dots' }],
};

function widgetOption(id, key) {
  const def = WIDGET_OPTIONS[id]?.find(x => x.key === key);
  return S.widgetOpts?.[id]?.[key] ?? def?.value;
}

function openWidgetOptions(id) {
  const defs = WIDGET_OPTIONS[id];
  if (!defs?.length) return;
  const controls = defs.map(def => {
    const current = widgetOption(id, def.key);
    const change = value => {
      S.widgetOpts = { ...(S.widgetOpts || {}), [id]: { ...(S.widgetOpts?.[id] || {}), [def.key]: value } };
      save();
      call('patchState', { set: { widgetOpts: S.widgetOpts }, del: [] }).catch(() => {});
      if (id === 'signal') renderSignal();
      if (id === 'cava') renderCava();
      if (id === 'clock') tickClock();
      if (id === 'visualizer') syncVizWidget();
      refreshSettingsPage?.();
      openWidgetOptions(id); // re-render so the active choice highlights
    };
    if (def.type === 'toggle') return row(def.label, def.hint, toggle(!!current, change));
    // Colour options become swatch chips.
    if (def.options?.length && def.options.every(([, v]) => /^#/.test(v))) {
      return row(def.label, def.hint, h('div', { class: 'wo-swatches' }, ...def.options.map(([v, label]) =>
        h('button', { class: 'wo-swatch' + (String(current) === v ? ' on' : ''), title: label, 'aria-label': label, style: `--sw:${v}`, onclick: () => change(v) }))));
    }
    // Short lists become segmented controls; long ones stay a dropdown.
    if (def.options?.length <= 5) {
      return row(def.label, def.hint, segmented(def.options.map(([v, label]) => [String(v), label]), String(current), v => {
        change(def.options.find(([o]) => String(o) === String(v))?.[0] ?? v);
      }));
    }
    const select = h('select', { class: 'field' }, def.options.map(([v, label]) => h('option', { value: v, text: label })));
    select.value = String(current); // set after the options exist, or it snaps back to the first one
    select.addEventListener('change', () => change(def.options.find(([o]) => String(o) === select.value)?.[0] ?? select.value));
    return row(def.label, def.hint, select);
  });
  openModal(`${WIDGETS[id] || 'Widget'} Options`, controls);
}

/* ---------- New widgets start hidden: add them from the gallery ---------- */

function migrateNewWidgets() {
  const known = new Set(S.knownWidgets || []);
  const fresh = NEW_WIDGETS.filter(id => !known.has(id));
  if (!fresh.length) return;
  S.hidden = [...new Set([...(S.hidden || []), ...fresh])];
  S.knownWidgets = [...known, ...fresh];
  if (hadSavedState) save();
  applyWidgetVisibility();
}

/* ---------- Extra right-click items per widget ---------- */

const WIDGET_MENU_EXTRA = {
  visualizer: () => [
    ...VIZ_STYLES.map(([id, label]) => ({ label, checked: (S.vizWidgetStyle || 'bars') === id, action: () => { S.vizWidgetStyle = id; save(); syncVizWidget(); } })),
    '-',
    ...VIZ_COLORS.map(([id, label]) => ({ label: label + ' colour', checked: (S.vizWidgetColor || 'accent') === id, action: () => { S.vizWidgetColor = id; save(); syncVizWidget(); } })),
  ],
  audiodeck: () => [
    ...AUDIO_DECK_VIEWS.map(([id, label]) => ({ label: `View: ${label}`, checked: (S.audioDeckView || 'spectrum') === id, action: () => setAudioDeckView(id) })),
    '-',
    ...AUDIO_DECK_STYLES.map(([id, label]) => ({ label: `Style: ${label}`, checked: (S.audioDeckStyle || 'signal') === id, action: () => { S.audioDeckStyle = id; save(); renderAudioDeck(); } })),
    { label: 'Customize Audio Deck…', action: openAudioDeckSettings },
  ],
  stocks: () => [{ label: 'Edit Symbols…', action: () => promptText('Stock symbols (comma separated)', (S.stockSymbols || DEFAULT_STOCKS).join(', '), v => { S.stockSymbols = v.split(/[\s,]+/).filter(Boolean).slice(0, 6); save(); loadStocks(); }) }],
  countdown: () => [{ label: 'Edit Countdown…', action: editCountdown }],
  timer: () => [
    ...[['pomodoro', 'Pomodoro'], ['timer', 'Countdown'], ['stopwatch', 'Stopwatch']].map(([id, label]) => ({ label: `Mode: ${label}`, checked: timerState().mode === id, action: () => { timerState().mode = id; timerState().running = false; timerState().elapsed = 0; timerState().breakLeft = 0; save(); renderTimer(); } })),
    '-',
    ...[[5, '5 min'], [10, '10 min'], [25, '25 min'], [50, '50 min']].map(([m, label]) => ({ label: `Set ${label}`, action: () => { timerState().minutes = m; if (timerState().mode === 'timer') { timerState().running = false; } save(); renderTimer(); } })),
  ],
};

/* ---------- SIGNAL-style audio instrument deck ---------- */
const AUDIO_DECK_VIEWS = [['spectrum', 'Spectrum'], ['waveform', 'Waveform'], ['track', 'Now Playing'], ['radial', 'Radial']];
const AUDIO_DECK_STYLES = [['signal', 'Signal'], ['mono', 'Monochrome'], ['sunset', 'Sunset'], ['ocean', 'Ocean']];
let audioDeckViz = null;

function setAudioDeckView(view) {
  S.audioDeckView = view; save(); renderAudioDeck();
}

function renderAudioDeck() {
  const el = $('[data-widget="audiodeck"]');
  if (!el || el.hidden || !S.showWidgets) { audioDeckViz?.stop(); audioDeckViz = null; return; }
  const view = AUDIO_DECK_VIEWS.some(([id]) => id === S.audioDeckView) ? S.audioDeckView : 'spectrum';
  const style = AUDIO_DECK_STYLES.some(([id]) => id === S.audioDeckStyle) ? S.audioDeckStyle : 'signal';
  const m = media;
  const tabs = $('#audio-deck-tabs');
  tabs.replaceChildren(...AUDIO_DECK_VIEWS.map(([id, label]) => h('button', { class: 'audio-deck-tab' + (view === id ? ' on' : ''), text: label, onclick: e => { e.stopPropagation(); setAudioDeckView(id); } })));
  const stage = $('#audio-deck-stage');
  stage.className = `audio-deck-stage style-${style} view-${view}`;
  stage.replaceChildren();
  audioDeckViz?.stop(); audioDeckViz = null;
  const track = $('#audio-deck-track');
  track.textContent = m?.title ? `${m.title}${m.artist ? ' / ' + m.artist : ''}` : 'NO SIGNAL · PLAY AUDIO ON ANY APP';
  $('#audio-deck-clock').textContent = m?.duration ? `${clockTime(m.position || 0)} / ${clockTime(m.duration)}` : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#audio-deck-meta').textContent = m?.playing ? 'SIGNAL LOCKED' : 'STANDBY';
  if (view === 'track') {
    stage.append(h('div', { class: 'audio-track-art', style: m?.art ? `background-image:url("${m.art}")` : '' }, m?.art ? null : svg(ICONS.music)),
      h('div', { class: 'audio-track-info' }, h('small', { text: sourceName(m?.app) || 'INPUT' }), h('b', { text: m?.title || 'Awaiting audio input' }), h('span', { text: S.audioDeckMetadata === false ? 'METADATA HIDDEN' : m?.artist || 'SIGNAL audio monitor' })),
      h('div', { class: 'audio-track-controls' }, ...[['previous', '|◀'], ['toggle', m?.playing ? 'Ⅱ' : '▶'], ['next', '▶|']].map(([action, label]) => h('button', { text: label, onclick: async e => { e.stopPropagation(); await call('mediaControl', { action }); setTimeout(() => { refreshMedia(); renderAudioDeck(); }, 250); } }))));
    if (m?.duration) stage.append(h('div', { class: 'audio-track-progress' }, h('i', { style: `width:${Math.max(0, Math.min(100, (m.position || 0) / m.duration * 100))}%` })));
  } else {
    const canvas = h('canvas', { class: 'audio-deck-canvas' }); stage.append(canvas);
    const vizStyle = view === 'waveform' ? 'wave' : view === 'radial' ? 'radial' : (S.audioDeckVizStyle || 'bars');
    const color = style === 'mono' ? 'white' : style === 'sunset' ? 'sunset' : style === 'ocean' ? 'ocean' : 'accent';
    audioDeckViz = mountViz(canvas, { style: vizStyle, color, bands: 48 });
  }
}

function openAudioDeckSettings() {
  openModal('Customize SIGNAL Audio Deck', [
    row('Default view', 'Choose the dashboard shown when the deck opens.', segmented(AUDIO_DECK_VIEWS, S.audioDeckView || 'spectrum', setAudioDeckView)),
    row('Visual style', 'Change the deck’s colour treatment.', segmented(AUDIO_DECK_STYLES, S.audioDeckStyle || 'signal', v => { S.audioDeckStyle = v; save(); renderAudioDeck(); })),
    row('Spectrum renderer', 'Select the visual form used by Spectrum view.', segmented(VIZ_STYLES.slice(0, 5), S.audioDeckVizStyle || 'bars', v => { S.audioDeckVizStyle = v; save(); renderAudioDeck(); })),
    row('Track metadata', null, toggle(S.audioDeckMetadata !== false, v => { S.audioDeckMetadata = v; save(); renderAudioDeck(); })),
  ]);
}

/* ---------- Visualizer widget ---------- */

let vizWidget = null;
function syncVizWidget() {
  if (!IS_DESKTOP) return;
  const el = $('[data-widget="visualizer"]');
  const visible = el && !el.hidden && S.showWidgets;
  const style = S.vizWidgetStyle || 'bars', color = S.vizWidgetColor || 'accent';
  if (visible && !vizWidget) vizWidget = mountViz($('#viz-canvas'), { style: widgetOption('visualizer', 'style') || style, color, bands: style === 'dots' ? 40 : 36 });
  else if (!visible && vizWidget) { vizWidget.stop(); vizWidget = null; }
  vizWidget?.set({ style: widgetOption('visualizer', 'style') || style, color, bands: style === 'dots' ? 40 : style === 'radial' || style === 'blob' ? 48 : 36 });
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

/* ---------- Custom widgets (user-created) ---------- */

function customWidgetTitle(id) {
  const c = (S.customWidgets || []).find(w => w.id === id);
  return c ? c.title : id;
}

function renderCustomWidget(el) {
  const id = el.dataset.widget;
  const c = (S.customWidgets || []).find(w => w.id === id);
  if (!c) return;
  el.replaceChildren(
    h('div', { class: 'cw-header' },
      h('b', { text: c.title }),
      h('span', { class: 'cw-type', text: c.type })),
    h('div', { class: 'cw-body' },
      c.type === 'url' && c.content
        ? h('iframe', { class: 'cw-frame', src: c.content, sandbox: 'allow-same-origin allow-scripts allow-popups' })
        : c.type === 'color' && c.content
        ? h('div', { class: 'cw-color', style: `background:${c.content}` })
        : h('div', { class: 'cw-text', text: c.content || '' })));
}

function openCustomWidgetEditor(editId = null) {
  const existing = editId ? (S.customWidgets || []).find(w => w.id === editId) : null;
  const idInput = h('input', { class: 'field', value: existing?.id || '', placeholder: 'widget-id', maxlength: '40' });
  const titleInput = h('input', { class: 'field', value: existing?.title || '', placeholder: 'Widget title', maxlength: '40' });
  const typeSelect = h('select', { class: 'field' },
    h('option', { value: 'text', selected: !existing || existing.type === 'text' }, 'Text'),
    h('option', { value: 'url', selected: existing && existing.type === 'url' }, 'Website / URL'),
    h('option', { value: 'color', selected: existing && existing.type === 'color' }, 'Color swatch'));
  const contentInput = h('textarea', { class: 'field', rows: 3, placeholder: existing?.type === 'url' ? 'https://example.com' : existing?.type === 'color' ? '#ff0000' : 'Your widget content…', value: existing?.content || '' });
  const save2 = () => {
    const id = idInput.value.trim() || 'custom-' + Date.now().toString(36);
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/i.test(id) || Object.hasOwn(WIDGETS, id) && id !== editId) { toast('Choose an unused widget ID using letters, numbers and hyphens.'); return; }
    const title = titleInput.value.trim() || 'Custom Widget';
    const type = typeSelect.value;
    let content = contentInput.value.trim();
    if (type === 'url') {
      try { const url = new URL(content); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); content = url.href; }
      catch { toast('Enter a valid http or https URL.'); return; }
    }
    if (type === 'color' && !CSS.supports('color', content)) { toast('Enter a valid CSS color.'); return; }
    const list = [...(S.customWidgets || [])].filter(w => w.id !== id && w.id !== editId);
    list.push({ id, title, type, content });
    S.customWidgets = list;
    save();
    // Register the widget id so it appears in right-click menus etc.
    if (!WIDGETS[id]) WIDGETS[id] = title;
    if (!WIDGET_INFO[id]) WIDGET_INFO[id] = [title, 'Your custom widget', '▫️'];
    // Create the DOM element if it doesn't exist
    const selectorId = CSS.escape(id);
    if (!$(`[data-widget="${selectorId}"]`)) {
      const grid = $('#widget-grid');
      const el = h('div', { class: 'widget', 'data-widget': id });
      renderCustomWidget(el);
      grid.append(el);
      placeWidgets();
    } else renderCustomWidget($(`[data-widget="${selectorId}"]`));
    if (editId && editId !== id) {
      const old = [...document.querySelectorAll('[data-widget]')].find(el => el.dataset.widget === editId);
      old?.remove();
      WIDGETS[editId] && delete WIDGETS[editId];
      S.widgetPos && delete S.widgetPos[editId];
      S.hidden = (S.hidden || []).filter(x => x !== editId);
    }
    placeWidgets();
    refreshSettingsPage();
    closeOverlays();
    toast('Custom widget saved.');
  };
  const isEdit = !!editId;
  openModal(editId ? 'Edit Custom Widget' : 'Create Custom Widget', [
    row('Widget ID', 'A short id used internally (letters, numbers, hyphens).', idInput),
    row('Title', 'Shown in the widget header.', titleInput),
    row('Type', null, typeSelect),
    row('Content', 'Text, a website URL, or a hex colour.', contentInput),
    h('div', { class: 'confirm-actions' },
      button('Cancel', closeOverlays),
      button(isEdit ? 'Save' : 'Create', save2, true))
  ]);
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
  const customCards = (S.customWidgets || []).map(c => {
    const shown = !(S.hidden || []).includes(c.id);
    return h('div', { class: 'wg-card' + (shown ? ' on' : '') },
      h('div', { class: 'wg-glyph', text: '▫️' }),
      h('div', { class: 'wg-text' }, h('b', { text: c.title }), h('span', { class: 'muted', text: 'Custom · ' + c.type })),
      button(shown ? 'Remove' : 'Add', () => {
        const hidden = new Set(S.hidden || []);
        shown ? hidden.add(c.id) : hidden.delete(c.id);
        S.hidden = [...hidden];
        if (!S.showWidgets) S.showWidgets = true;
        if (!WIDGETS[c.id]) WIDGETS[c.id] = c.title;
        save();
        openWidgetGallery();
      }, !shown),
      button('Edit', () => openCustomWidgetEditor(c.id), true));
  });
  openModal('Widget Gallery', [
    h('p', { class: 'muted', style: 'margin:0 0 10px', text: 'Add widgets to your desktop. Drag them anywhere, resize from the corner, and right-click for options.' }),
    h('div', { class: 'wg-grid' }, ids.filter(id => NEW_WIDGETS.includes(id)).map(card)),
    h('div', { class: 'sw-section', text: 'Classics' }),
    h('div', { class: 'wg-grid' }, ids.filter(id => !NEW_WIDGETS.includes(id) && !S.customWidgets?.some(w => w.id === id)).map(card)),
    (S.customWidgets || []).length && h('div', { class: 'sw-section', text: 'Your Custom Widgets' }),
    (S.customWidgets || []).length && h('div', { class: 'wg-grid' }, customCards),
    h('div', { class: 'sw-section', text: 'Create' }),
    button('+ Create Custom Widget', () => { closeOverlays(); setTimeout(() => openCustomWidgetEditor(), 100); }, true)
  ], 'widget-gallery');
}

COMMANDS.openWidgetGallery = () => openWidgetGallery();
COMMANDS.widgetOptions = d => openWidgetOptions(d.id);
COMMANDS.widgetOpacity = d => {
  const id = d.id, cur = Math.round((S.widgetOpacity?.[id] ?? 1) * 100);
  openModal(`${WIDGETS[id] || 'Widget'} Opacity`, [row('Opacity', 'How translucent this widget is on the desktop.', slider(30, 100, 1, cur,
    v => { const el = $(`[data-widget="${id}"]`); if (el) el.style.opacity = v / 100; },
    v => { S.widgetOpacity = { ...(S.widgetOpacity || {}), [id]: v / 100 }; save(); call('patchState', { set: { widgetOpacity: S.widgetOpacity }, del: [] }).catch(() => {}); closeOverlays(); }))]);
};

// Arrange mode gets a gallery button.
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
    renderAudioDeck();
    renderTimer();
    loadStocks();
    renderCountdown();
    renderBatteryHistory();
  };
}

{
  const widgetsPage = PAGES.widgets;
  PAGES.widgets = () => [group(row('Widget Gallery', 'Browse every widget, including the SIGNAL Audio Deck, Visualizer, Stocks, Activity and the Haven terminal.', button('Open Gallery…', () => openWidgetGallery(), true))), ...widgetsPage()];
}

/* ---------- Timer / Stopwatch / Pomodoro widget ---------- */

function timerState() {
  return S.timerState || (S.timerState = { mode: 'pomodoro', minutes: 25, running: false, endsAt: 0, elapsed: 0, breakLeft: 0 });
}

function renderTimer() {
  const el = $('[data-widget="timer"]');
  if (!el || el.hidden || !S.showWidgets) return;
  const t = timerState();
  const stateLabel = $('#timer-state'), display = $('#timer-display'), controls = $('#timer-controls');
  if (!display) return;
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let secs;
  if (t.mode === 'stopwatch') secs = t.elapsed + (t.running ? (Date.now() - t.endsAt) / 1000 : 0);
  else if (t.running) secs = Math.max(0, (t.endsAt - Date.now()) / 1000);
  else secs = t.mode === 'timer' ? t.minutes * 60 : (t.elapsed || 0);
  display.textContent = fmt(Math.floor(secs));
  display.classList.toggle('running', !!t.running);
  display.classList.toggle('break', t.mode === 'pomodoro' && t.breakLeft > 0);
  stateLabel.textContent = t.mode === 'pomodoro' ? (t.breakLeft > 0 ? 'BREAK' : 'FOCUS') : t.mode === 'stopwatch' ? 'STOPWATCH' : 'COUNTDOWN';
  controls.replaceChildren(
    ...[['start', t.running ? 'Pause' : 'Start', () => {
      if (t.running) { t.elapsed = (t.mode === 'stopwatch' ? t.elapsed + (Date.now() - t.endsAt) / 1000 : Math.max(0, (t.endsAt - Date.now()) / 1000)); t.running = false; }
      else { t.endsAt = Date.now() + (t.mode === 'stopwatch' ? 0 : secs * 1000); t.running = true; }
      save(); renderTimer();
    }],
     ['reset', 'Reset', () => { t.running = false; t.elapsed = 0; t.breakLeft = 0; save(); renderTimer(); }]].map(([k, label, fn]) =>
      h('button', { text: label, onclick: e => { e.stopPropagation(); fn(); } })));
  // Pomodoro completion: focus → break, break → focus, with a chime and a toast.
  if (t.mode === 'pomodoro' && t.running && secs <= 0) {
    t.running = false; t.elapsed = 0;
    const wasBreak = t.breakLeft > 0;
    t.breakLeft = wasBreak ? 0 : 5 * 60;
    Sound.play('switch');
    toast(wasBreak ? 'Break over — back to focus.' : 'Focus done. Take a 5 minute break.');
    if (t.breakLeft > 0) { t.endsAt = Date.now() + t.breakLeft * 1000; t.running = true; }
    save();
  }
}

setInterval(() => { if (typeof renderTimer === 'function') renderTimer(); }, 500);

/* ---------- Start ---------- */

addEventListener('DOMContentLoaded', () => {
  if (!IS_DESKTOP) return;
  setTimeout(() => {
    migrateNewWidgets();
    syncVizWidget();
    renderAudioDeck();
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
  onRemoteState = function (next) { baseRemote(next); if (IS_DESKTOP) { syncVizWidget(); renderAudioDeck(); renderCountdown(); renderTimer(); } };
}
