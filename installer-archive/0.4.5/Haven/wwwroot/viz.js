'use strict';

/* =========================================================================
   Audio visualizers. The host listens to what the PC is playing and sends
   64 frequency bands + a short waveform ~30×/s while anything subscribes.
   Places: a Visualizer widget, the terminal widget's "cava" tab, live bars
   in the Now Playing pill, an ambient band across the desktop, and a
   visualizer screen saver. Styles: bars, mirror, dots, wave, radial, blob, line.
   ========================================================================= */

const VIZ_STYLES = [['bars', 'Bars'], ['mirror', 'Mirror'], ['dots', 'Dots (cava)'], ['wave', 'Waveform'], ['radial', 'Radial'], ['blob', 'Blob'], ['line', 'Spectrum']];
const VIZ_COLORS = [['accent', 'Accent'], ['white', 'White'], ['ink', 'Paper & Ink'], ['sunset', 'Sunset'], ['ocean', 'Ocean'], ['rainbow', 'Rainbow'], ['neon', 'Neon']];

const Viz = (() => {
  const subs = new Set();
  let last = { b: new Array(64).fill(0), w: new Array(96).fill(0), beat: false };
  let fake = null;

  function setOn(on) {
    if (host) { call('audioViz', { on }).catch(() => {}); return; }
    // Browser preview: make up some music so the visualizers can be seen.
    clearInterval(fake);
    if (!on) return;
    let t = 0;
    fake = setInterval(() => {
      t += 0.033;
      const kick = Math.max(0, Math.sin(t * Math.PI * 2 * 2)) ** 8;
      const b = Array.from({ length: 64 }, (_, i) => Math.round(Math.max(0, Math.min(100,
        (70 - i * 0.8) * (0.55 + 0.45 * Math.sin(t * 3 + i * 0.35)) + kick * (i < 10 ? 40 : 8) + Math.random() * 12))));
      const w = Array.from({ length: 96 }, (_, i) => Math.round(Math.sin(i * 0.4 + t * 9) * 60 * (0.4 + kick)));
      deliver({ b, w, beat: kick > 0.7 });
    }, 33);
  }

  function deliver(frame) { last = frame; for (const fn of subs) fn(frame); }

  return {
    get last() { return last; },
    on(fn) { subs.add(fn); if (subs.size === 1) setOn(true); },
    off(fn) { if (!subs.delete(fn)) return; if (subs.size === 0) { setOn(false); deliver({ b: new Array(64).fill(0), w: new Array(96).fill(0), beat: false }); } },
    deliver,
  };
})();

// Frames arrive as host events.
{
  const baseEvent = onHostEvent;
  // eslint-disable-next-line no-global-assign
  onHostEvent = function (name, data) {
    if (name === 'audio') return Viz.deliver(data);
    return baseEvent(name, data);
  };
}

/* ---------- Colours ---------- */

function vizColor(scheme, t, alpha = 1) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3b82f6';
  switch (scheme) {
    case 'white': return `rgb(255 255 255 / ${alpha})`;
    case 'ink': return `rgb(240 240 240 / ${alpha})`;
    case 'sunset': return `hsl(${(330 + t * 70) % 360} 85% ${55 + t * 10}% / ${alpha})`;
    case 'ocean': return `hsl(${190 + t * 50} 80% ${45 + t * 20}% / ${alpha})`;
    case 'rainbow': return `hsl(${t * 300} 85% 60% / ${alpha})`;
    case 'neon': return `hsl(${280 + t * 80} 100% 62% / ${alpha})`;
    default: return alpha === 1 ? accent : `color-mix(in srgb, ${accent} ${Math.round(alpha * 100)}%, transparent)`;
  }
}

/* ---------- Drawing ---------- */

/** Draws one frame. `v` is the smoothed band list (0–1), `w` the waveform (−1…1). */
function drawViz(ctx, W, H, v, w, style, scheme, peaks) {
  ctx.clearRect(0, 0, W, H);
  const n = v.length;
  const col = i => vizColor(scheme, i / Math.max(1, n - 1));
  ctx.lineCap = 'round';
  switch (style) {
    case 'mirror': {
      const bw = W / n;
      for (let i = 0; i < n; i++) {
        const hh = Math.max(1.5, v[i] * H * 0.48);
        ctx.fillStyle = col(i);
        roundRect(ctx, i * bw + bw * 0.18, H / 2 - hh, bw * 0.64, hh * 2, bw * 0.32);
      }
      break;
    }
    case 'dots': {
      // Cava-style dot matrix: lit dots white, the loudest column's peak red.
      const cols = Math.min(n, Math.max(16, Math.floor(W / 12)));
      const rows = Math.max(6, Math.floor(H / 12));
      const cw = W / cols, rh = H / rows, r = Math.min(cw, rh) * 0.32;
      let loud = 0;
      for (let c = 0; c < cols; c++) if (v[Math.floor(c * n / cols)] > v[Math.floor(loud * n / cols)]) loud = c;
      for (let c = 0; c < cols; c++) {
        const val = v[Math.floor(c * n / cols)];
        const lit = Math.round(val * rows);
        const pk = Math.round((peaks?.[Math.floor(c * n / cols)] ?? val) * rows);
        for (let rr = 0; rr < rows; rr++) {
          const y = H - (rr + 0.5) * rh, x = (c + 0.5) * cw;
          const on = rr < lit, isPeak = rr === Math.max(lit, pk) - 1 && c === loud && lit > 1;
          ctx.fillStyle = isPeak ? '#e5483a' : on ? (scheme === 'ink' ? `rgb(255 255 255 / ${0.55 + 0.45 * (rr / rows)})` : col(c)) : 'rgb(255 255 255 / .07)';
          ctx.beginPath(); ctx.arc(x, y, on || isPeak ? r : r * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'wave': {
      ctx.lineWidth = Math.max(1.5, H / 60);
      ctx.strokeStyle = col(n / 2);
      ctx.shadowColor = col(n / 2);
      ctx.shadowBlur = 8;
      ctx.beginPath();
      w.forEach((s, i) => { const x = i / (w.length - 1) * W, y = H / 2 + s * H * 0.42; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }
    case 'radial': {
      const cx = W / 2, cy = H / 2, base = Math.min(W, H) * 0.22, len = Math.min(W, H) * 0.26;
      ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * base) / (n * 2) * 0.6);
      for (let i = 0; i < n * 2; i++) {
        const k = i < n ? i : n * 2 - 1 - i;
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, l = 2 + v[k] * len;
        ctx.strokeStyle = col(k);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * base, cy + Math.sin(a) * base); ctx.lineTo(cx + Math.cos(a) * (base + l), cy + Math.sin(a) * (base + l)); ctx.stroke();
      }
      ctx.fillStyle = 'rgb(255 255 255 / .06)';
      ctx.beginPath(); ctx.arc(cx, cy, base * 0.92, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'blob': {
      const cx = W / 2, cy = H / 2, base = Math.min(W, H) * 0.24;
      const pts = [];
      const m = 32;
      for (let i = 0; i < m; i++) {
        const k = Math.floor((i < m / 2 ? i : m - 1 - i) * (n / (m / 2)) * 0.6);
        const a = (i / m) * Math.PI * 2, r = base + v[Math.min(n - 1, k)] * base * 0.9;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      const g = ctx.createRadialGradient(cx, cy, base * 0.2, cx, cy, base * 2);
      g.addColorStop(0, vizColor(scheme, 0.2, 0.95)); g.addColorStop(1, vizColor(scheme, 0.9, 0.35));
      ctx.fillStyle = g;
      smoothClosed(ctx, pts);
      ctx.fill();
      break;
    }
    case 'line': {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, vizColor(scheme, 0, 0.9)); g.addColorStop(1, vizColor(scheme, 1, 0.9));
      ctx.beginPath(); ctx.moveTo(0, H);
      const pts = v.map((val, i) => [i / (n - 1) * W, H - 2 - val * (H - 6)]);
      ctx.lineTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      ctx.lineTo(W, pts[pts.length - 1][1]); ctx.lineTo(W, H); ctx.closePath();
      const fill = ctx.createLinearGradient(0, 0, 0, H);
      fill.addColorStop(0, vizColor(scheme, 0.5, 0.55)); fill.addColorStop(1, vizColor(scheme, 0.5, 0));
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.stroke();
      break;
    }
    default: { // bars
      const bw = W / n;
      for (let i = 0; i < n; i++) {
        const hh = Math.max(2, v[i] * (H - 4));
        ctx.fillStyle = col(i);
        roundRect(ctx, i * bw + bw * 0.16, H - hh, bw * 0.68, hh, Math.min(bw * 0.34, 4));
        if (peaks) { ctx.fillStyle = 'rgb(255 255 255 / .55)'; ctx.fillRect(i * bw + bw * 0.16, H - 3 - peaks[i] * (H - 4), bw * 0.68, 2); }
      }
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)) : ctx.rect(x, y, w, h);
  ctx.fill();
}

function smoothClosed(ctx, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
    if (i === 0) ctx.moveTo(p1[0], p1[1]);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  ctx.closePath();
}

/* ---------- Live canvases ---------- */

const vizViews = new Set();
let vizRaf = 0;

/** Turns a canvas into a live visualizer. Returns a handle with stop() and set({style, color, bands}). */
function mountViz(canvas, opts = {}) {
  const view = { canvas, style: opts.style || 'bars', color: opts.color || 'accent', bands: opts.bands || 48, v: [], peaks: [], target: [], w: [] };
  const onFrame = f => {
    const n = view.bands;
    view.target = Array.from({ length: n }, (_, i) => {
      const a = Math.floor(i * 64 / n), b = Math.max(a + 1, Math.floor((i + 1) * 64 / n));
      let m = 0; for (let k = a; k < b; k++) m = Math.max(m, f.b[k] || 0);
      return Math.min(1, (m / 100) * (S.vizGain || 1));
    });
    view.w = f.w.map(x => x / 100);
    view.beat = f.beat;
  };
  view.onFrame = onFrame;
  Viz.on(onFrame);
  vizViews.add(view);
  if (!vizRaf) vizRaf = requestAnimationFrame(vizLoop);
  view.stop = () => { Viz.off(onFrame); vizViews.delete(view); };
  view.set = o => Object.assign(view, o);
  return view;
}

function vizLoop() {
  vizRaf = 0;
  if (!vizViews.size) return;
  for (const view of vizViews) {
    const c = view.canvas;
    if (!c.isConnected) { view.stop(); continue; }
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const dpr = devicePixelRatio || 1;
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const n = view.bands;
    if (view.v.length !== n) { view.v = new Array(n).fill(0); view.peaks = new Array(n).fill(0); }
    for (let i = 0; i < n; i++) {
      const t = view.target[i] || 0;
      view.v[i] += (t - view.v[i]) * (t > view.v[i] ? 0.55 : 0.18); // rise fast, fall soft (at 60fps)
      view.peaks[i] = Math.max(view.peaks[i] - 0.006, view.v[i]);
    }
    drawViz(c.getContext('2d'), W, H, view.v, view.w.length ? view.w : new Array(96).fill(0), view.style, view.color, view.peaks);
  }
  vizRaf = requestAnimationFrame(vizLoop);
}

/* ---------- The Now Playing pill: live bars ---------- */

let islandViz = null;
function updateIslandViz() {
  if (!IS_SHELL) return;
  const eq = $('#island .island-eq');
  if (!eq) return;
  const want = S.vizIsland !== false && !$('#island').hidden && media?.playing;
  if (want && !islandViz) {
    const c = h('canvas', { class: 'island-viz' });
    eq.replaceChildren(c);
    eq.classList.add('live');
    islandViz = mountViz(c, { style: 'mirror', color: 'white', bands: 6 });
  } else if (!want && islandViz) {
    islandViz.stop();
    islandViz = null;
    eq.classList.remove('live');
    eq.replaceChildren(h('i'), h('i'), h('i'), h('i'));
  }
}

{
  const baseRender = renderMedia;
  // eslint-disable-next-line no-global-assign
  renderMedia = function () { baseRender(); updateIslandViz(); };
}

/* ---------- Ambient band across the desktop ---------- */

let ambientViz = null;
function updateAmbientViz() {
  if (!IS_DESKTOP) return;
  let c = $('#ambient-viz');
  const mode = S.vizDesktop || 'off';
  if (mode === 'off') { ambientViz?.stop(); ambientViz = null; c?.remove(); return; }
  if (!c) { c = h('canvas', { id: 'ambient-viz', class: 'ambient-viz' }); document.body.prepend(c); }
  c.className = 'ambient-viz ' + mode;
  const opts = { style: S.vizDesktopStyle || 'line', color: S.vizDesktopColor || 'accent', bands: 64 };
  if (!ambientViz) ambientViz = mountViz(c, opts); else ambientViz.set(opts);
}

/* ---------- Visualizer screen saver ---------- */

let saverViz = null;
{
  const baseStart = startSaver, baseEnd = endSaver;
  // eslint-disable-next-line no-global-assign
  startSaver = function () {
    baseStart();
    if ((S.saverStyle || 'drift') !== 'visualizer') return;
    let c = $('#saver-viz');
    if (!c) { c = h('canvas', { id: 'saver-viz', class: 'saver-viz' }); $('#saver').append(c); }
    saverViz = mountViz(c, { style: S.vizSaverStyle || 'radial', color: S.vizSaverColor || 'rainbow', bands: 64 });
  };
  // eslint-disable-next-line no-global-assign
  endSaver = function () {
    baseEnd();
    if ($('#saver').hidden) { saverViz?.stop(); saverViz = null; $('#saver-viz')?.remove(); }
  };
}

/* ---------- Settings ---------- */

addSettingsPage({ id: 'visualizers', label: 'Visualizers', icon: 'viz', color: '#e5483a', keys: 'audio visualizer music bars wave cava spectrum equalizer screen saver' }, 'sounds');
NAV_ICONS.viz = '<svg viewBox="0 0 20 20"><g fill="currentColor"><rect x="2.5" y="8" width="2.4" height="6" rx="1.2"/><rect x="6.3" y="5" width="2.4" height="12" rx="1.2"/><rect x="10.1" y="3" width="2.4" height="14" rx="1.2"/><rect x="13.9" y="7" width="2.4" height="8" rx="1.2"/></g></svg>';

function vizPreview(style, color) {
  const c = h('canvas', { class: 'viz-prev' });
  const view = mountViz(c, { style, color, bands: 24 });
  // Stop when Settings redraws (the canvas leaves the page).
  return [c, view];
}

PAGES.visualizers = () => {
  const [prev] = vizPreview(S.vizDesktopStyle || 'line', S.vizDesktopColor || 'accent');
  return [
    note('Haven listens to whatever your PC is playing (nothing is recorded or saved) and animates it. Visualizers only run while one is on screen.'),
    group(h('div', { class: 'sw-pad viz-prev-wrap' }, prev)),
    section('Across the desktop'),
    group(
      row('Show on the desktop', 'Behind your windows, above the wallpaper.', segmented([['off', 'Off'], ['bottom', 'Along the bottom'], ['center', 'Centre']], S.vizDesktop || 'off', v => setPref('vizDesktop', v))),
      row('Style', null, segmented(VIZ_STYLES, S.vizDesktopStyle || 'line', v => setPref('vizDesktopStyle', v))),
      row('Colour', null, segmented(VIZ_COLORS, S.vizDesktopColor || 'accent', v => setPref('vizDesktopColor', v)))),
    section('Everywhere else'),
    group(
      row('Live bars in the Now Playing pill', null, toggle(S.vizIsland !== false, v => { setPref('vizIsland', v); updateIslandViz(); })),
      row('Screen saver', 'Show a visualizer instead of the drifting wallpaper.', segmented([['drift', 'Wallpaper'], ['visualizer', 'Visualizer']], S.saverStyle || 'drift', v => setPref('saverStyle', v))),
      row('Screen saver style', null, segmented(VIZ_STYLES, S.vizSaverStyle || 'radial', v => setPref('vizSaverStyle', v))),
      row('Sensitivity', 'Make quiet music move more.', segmented([[0.8, 'Low'], [1, 'Normal'], [1.35, 'High'], [1.8, 'Max']], Number(S.vizGain) || 1, v => setPref('vizGain', v)))),
    note('Add the Visualizer widget (or the Haven terminal widget and its “cava” tab) from Edit Widgets on the desktop.'),
  ];
};

addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { updateAmbientViz(); updateIslandViz(); }, 500);
});

{
  const baseSet = setPref;
  // eslint-disable-next-line no-global-assign
  setPref = function (key, value) { baseSet(key, value); if (String(key).startsWith('viz')) { updateAmbientViz(); updateIslandViz(); } };
}

// Desktop settings changes arrive as state from the other layer.
{
  const baseRemote = onRemoteState;
  // eslint-disable-next-line no-global-assign
  onRemoteState = function (next) { baseRemote(next); updateAmbientViz(); updateIslandViz(); };
}
