'use strict';

/* =========================================================================
   Haven Terminal widget ("haven-tty"): paper & ink, one red dot. Five
   workspaces, switched with 1–5 or [ and ]:
     1 fetch  system info with a dot-matrix logo and clock
     2 cava   a dot-matrix audio visualizer (↑/↓ gain, m mirror)
     3 life   Game of Life; red cells were born on a beat (space, r, c, click)
     4 orb    a spinning point sphere with a ring (drag or arrows to spin)
     5 rain   Matrix rain; follow the red one (space or click to burst)
   ========================================================================= */

const TTY_TABS = ['fetch', 'cava', 'life', 'orb', 'rain'];
const TTY = {
  tab: 0, started: Date.now(), raf: 0, stats: null, viz: null, frame: null,
  gain: 1.2, mirror: false,
  life: null, lifeGen: 0, lifeRun: true, lifeTimer: 0, lifeBeat: false,
  yaw: 155, pitch: -20, spin: 0.35, drag: null,
  rain: [], rainBurst: 0,
};
const INK = '#ececec', DIM = '#5b5b5b', FAINT = '#2a2a2a', RED = '#e5483a';

function ttyEl() { return $('[data-widget="tty"]'); }

function buildTty() {
  const el = ttyEl();
  if (!el || el.querySelector('.tty-screen')) return;
  el.append(
    h('div', { class: 'tty-top' },
      h('span', { class: 'tty-lights' }, h('i', { class: 'r' }), h('i'), h('i')),
      h('span', { class: 'tty-title', id: 'tty-title' }),
      h('span', { class: 'tty-size', id: 'tty-size' })),
    h('div', { class: 'tty-frame' },
      h('div', { class: 'tty-frame-head' }, h('span', { id: 'tty-name' }), h('span', { id: 'tty-count' })),
      h('div', { class: 'tty-sub', id: 'tty-sub' }),
      h('canvas', { class: 'tty-screen', id: 'tty-canvas' })),
    h('div', { class: 'tty-prompt' }, h('span', { class: 'tty-cmd', id: 'tty-cmd' }), h('span', { class: 'tty-hint', id: 'tty-hint' })),
    h('div', { class: 'tty-status' },
      h('span', { class: 'tty-tabs', id: 'tty-tabs' }),
      h('span', { class: 'tty-now', id: 'tty-now' })));
  const canvas = $('#tty-canvas');
  canvas.addEventListener('pointerdown', ttyPointer);
  el.addEventListener('keydown', ttyKey);
  el.addEventListener('pointerdown', e => { if (!e.target.closest('.widget-resize')) el.focus({ preventScroll: true }); });
  renderTtyChrome();
}

function setTtyTab(i) {
  TTY.tab = (i + TTY_TABS.length) % TTY_TABS.length;
  // Only the cava and life tabs need live audio.
  const wantViz = TTY_TABS[TTY.tab] === 'cava' || TTY_TABS[TTY.tab] === 'life';
  if (wantViz && !TTY.viz) { TTY.viz = f => { TTY.frame = f; if (f.beat) TTY.lifeBeat = true; }; Viz.on(TTY.viz); }
  if (!wantViz && TTY.viz) { Viz.off(TTY.viz); TTY.viz = null; }
  renderTtyChrome();
}

function renderTtyChrome() {
  const name = TTY_TABS[TTY.tab];
  const cmd = { fetch: 'fastfetch --logo haven', cava: 'cava -p ~/.config/cava/dots', life: 'life --beat', orb: 'orb --points 420 --spin', rain: 'cmatrix -b -C white' }[name];
  const hint = { fetch: '1-5 or [ ] switch workspace', cava: 'up/down gain · m mirror', life: 'space · r · c · click', orb: 'arrows or drag to spin', rain: 'space or click: more rain' }[name];
  const user = (env.user || 'user').toLowerCase();
  $('#tty-title').textContent = `${user}@haven: ~ — ${name}`;
  $('#tty-name').replaceChildren(h('i', { class: 'tty-dot' }), document.createTextNode(' ' + name));
  $('#tty-count').textContent = `${TTY.tab + 1}/5`;
  $('#tty-cmd').replaceChildren(h('span', { class: 'muted-ink', text: '~/.config ' }), h('span', { class: 'tty-red', text: '> ' }), document.createTextNode(cmd));
  $('#tty-hint').textContent = hint;
  $('#tty-tabs').replaceChildren(...TTY_TABS.map((t, i) => h('button', { class: 'tty-tab' + (i === TTY.tab ? ' on' : ''), text: `${i + 1} ${t}`, onclick: e => { e.stopPropagation(); setTtyTab(i); } })));
}

function ttyUptime() {
  const s = Math.floor((Date.now() - TTY.started) / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
}

function ttyKey(e) {
  if (e.target.closest('input, textarea')) return;
  const name = TTY_TABS[TTY.tab];
  if (/^[1-5]$/.test(e.key)) setTtyTab(Number(e.key) - 1);
  else if (e.key === '[') setTtyTab(TTY.tab - 1);
  else if (e.key === ']') setTtyTab(TTY.tab + 1);
  else if (name === 'cava' && e.key === 'ArrowUp') TTY.gain = Math.min(3, TTY.gain + 0.1);
  else if (name === 'cava' && e.key === 'ArrowDown') TTY.gain = Math.max(0.3, TTY.gain - 0.1);
  else if (name === 'cava' && e.key === 'm') TTY.mirror = !TTY.mirror;
  else if (name === 'life' && e.key === ' ') TTY.lifeRun = !TTY.lifeRun;
  else if (name === 'life' && e.key === 'r') TTY.life = null;
  else if (name === 'life' && e.key === 'c') { TTY.life?.cells.fill(0); TTY.lifeGen = 0; }
  else if (name === 'orb' && e.key.startsWith('Arrow')) {
    if (e.key === 'ArrowLeft') TTY.yaw -= 8; if (e.key === 'ArrowRight') TTY.yaw += 8;
    if (e.key === 'ArrowUp') TTY.pitch -= 6; if (e.key === 'ArrowDown') TTY.pitch += 6;
  } else if (name === 'rain' && e.key === ' ') TTY.rainBurst = 30;
  else return;
  e.preventDefault();
  e.stopPropagation();
}

function ttyPointer(e) {
  const name = TTY_TABS[TTY.tab];
  const c = e.currentTarget, r = c.getBoundingClientRect();
  if (name === 'cava') TTY.mirror = !TTY.mirror;
  if (name === 'rain') TTY.rainBurst = 30;
  if (name === 'life' && TTY.life) {
    const L = TTY.life, x = Math.floor((e.clientX - r.left) / r.width * L.w), y = Math.floor((e.clientY - r.top) / r.height * L.h);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = ((y + dy + L.h) % L.h) * L.w + ((x + dx + L.w) % L.w);
      L.cells[i] = 1; L.red[i] = 1;
    }
  }
  if (name === 'orb') {
    e.stopPropagation();
    TTY.drag = { x: e.clientX, y: e.clientY, yaw: TTY.yaw, pitch: TTY.pitch };
    const move = ev => { TTY.yaw = TTY.drag.yaw + (ev.clientX - TTY.drag.x) * 0.6; TTY.pitch = Math.max(-80, Math.min(80, TTY.drag.pitch - (ev.clientY - TTY.drag.y) * 0.5)); };
    const up = () => { TTY.drag = null; removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
}

/* ---------- Drawing ---------- */

function ttyLoop() {
  TTY.raf = 0;
  const el = ttyEl();
  if (!el || el.hidden || !S.showWidgets) return;
  const c = $('#tty-canvas');
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; TTY.life = null; TTY.rain = []; }
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const name = TTY_TABS[TTY.tab];
  ({ fetch: drawFetch, cava: drawCava, life: drawLife, orb: drawOrb, rain: drawRain })[name](ctx, W, H, dpr);
  $('#tty-size').textContent = `zsh · ${Math.round(r.width)}x${Math.round(r.height)}`;
  const playing = media?.title ? `> ${media.title}${media.artist ? ' - ' + media.artist : ''}` : '> nothing playing';
  const prog = media?.playing ? '●' + '·'.repeat(7) : '·'.repeat(8);
  $('#tty-now').textContent = `${truncate(playing, 34)}  ${prog}  up ${ttyUptime()}`;
  TTY.raf = requestAnimationFrame(ttyLoop);
}

function dot(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

/* 3×5 dot font for the clock. */
const DOT_DIGITS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', ':': '000010000010000',
};

function drawFetch(ctx, W, H, dpr) {
  $('#tty-sub').textContent = `logo haven · ${navigator.hardwareConcurrency || '?'} threads · session ${ttyUptime()}`;
  const s = Math.min(W, H) / 22;
  // Logo: a dot-matrix window (2×2 panes), one pane red.
  const ox = W * 0.06, oy = H * 0.18, cell = s * 0.95;
  for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 11; gx++) {
    const pane = gy < 3 ? (gx < 5 ? 0 : gx > 5 ? 1 : -1) : gy > 3 ? (gx < 5 ? 2 : gx > 5 ? 3 : -1) : -1;
    const on = pane >= 0;
    dot(ctx, ox + gx * cell, oy + gy * cell, on ? cell * 0.36 : cell * 0.12, on ? (pane === 3 ? RED : INK) : FAINT);
  }
  // Clock in dots.
  const t = ttyUptime();
  let cx = ox, cy = oy + 9 * cell;
  const d = cell * 0.62;
  for (const ch of t) {
    const map = DOT_DIGITS[ch];
    for (let i = 0; i < 15; i++) dot(ctx, cx + (i % 3) * d, cy + Math.floor(i / 3) * d, map[i] === '1' ? d * 0.34 : d * 0.1, map[i] === '1' ? INK : FAINT);
    cx += (ch === ':' ? 3 : 4) * d;
  }
  // Info.
  const st = TTY.stats;
  const user = (env.user || 'user').toLowerCase();
  const lines = [
    [null, `${user}@haven`],
    [null, '-'.repeat(user.length + 6)],
    ['OS', `Windows · Haven ${env.version || ''}`.trim()],
    ['Host', 'haven desktop'],
    ['Uptime', st ? `${st.uptimeHours < 24 ? st.uptimeHours.toFixed(1) + ' h' : (st.uptimeHours / 24).toFixed(1) + ' d'}` : '…'],
    ['Shell', 'haven (webview2)'],
    ['WM', S.stageManager ? 'haven (stage manager)' : 'haven (floating)'],
    ['Theme', `${S.theme} · ${S.accent}`],
    ['Terminal', 'haven-tty'],
    ['CPU', st ? `${Math.round(st.cpu)}%` : '…'],
    ['Memory', st ? `${Math.round(st.memory)}% of ${st.memoryTotalGb} GB` : '…'],
    ['Media', media?.title ? `> ${media.title}${media.artist ? ' - ' + media.artist : ''}` : 'n/a'],
    ['Battery', typeof pcBattery !== 'undefined' && pcBattery ? `${pcBattery.level}%${pcBattery.charging ? ' (charging)' : ''}` : 'n/a'],
  ];
  const fx = W * 0.44, lh = Math.min(H / (lines.length + 3), 15 * dpr);
  ctx.font = `${Math.round(lh * 0.72)}px ui-monospace, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  let y = H / 2 - (lines.length + 1) * lh / 2;
  for (const [k, v] of lines) {
    if (k) { ctx.fillStyle = RED; ctx.fillText(k, fx, y); }
    ctx.fillStyle = k ? INK : (v.startsWith('-') ? DIM : INK);
    ctx.fillText(truncate(v, 34), k ? fx + lh * 5.2 : fx, y);
    y += lh;
  }
  const sw = lh * 0.9;
  ['#111', '#242424', '#3a3a3a', '#555', '#7a7a7a', '#a0a0a0', '#c8c8c8', '#efefef', RED].forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(fx + i * (sw + 2), y + lh * 0.2, sw, sw); });
}

function drawCava(ctx, W, H) {
  const f = TTY.frame || Viz.last;
  const cols = Math.max(16, Math.floor(W / 16)), rows = Math.max(8, Math.floor(H / 16));
  const cw = W / cols, rh = H / rows, r = Math.min(cw, rh) * 0.34;
  const vals = Array.from({ length: cols }, (_, c) => {
    const k = Math.floor(c * 64 / cols);
    return Math.min(1, (f.b[k] || 0) / 100 * TTY.gain);
  });
  TTY.cavaV = TTY.cavaV?.length === cols ? TTY.cavaV : new Array(cols).fill(0);
  TTY.cavaP = TTY.cavaP?.length === cols ? TTY.cavaP : new Array(cols).fill(0);
  let loud = 0;
  for (let c = 0; c < cols; c++) {
    TTY.cavaV[c] += (vals[c] - TTY.cavaV[c]) * (vals[c] > TTY.cavaV[c] ? 0.5 : 0.15);
    TTY.cavaP[c] = Math.max(TTY.cavaP[c] - 0.008, TTY.cavaV[c]);
    if (TTY.cavaV[c] > TTY.cavaV[loud]) loud = c;
  }
  for (let c = 0; c < cols; c++) {
    const lit = Math.round(TTY.cavaV[c] * rows), peak = Math.round(TTY.cavaP[c] * rows);
    for (let k = 0; k < rows; k++) {
      const x = (c + 0.5) * cw;
      const y = TTY.mirror ? H / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * rh * 0.5 : H - (k + 0.5) * rh;
      const level = TTY.mirror ? Math.ceil(k / 2) : k;
      const on = level < (TTY.mirror ? lit / 2 : lit);
      const isPeak = c === loud && level === Math.max(0, (TTY.mirror ? Math.round(peak / 2) : peak) - 1) && lit > 1;
      dot(ctx, x, y, on || isPeak ? r : r * 0.35, isPeak ? RED : on ? `rgb(236 236 236 / ${0.45 + 0.55 * level / rows})` : FAINT);
    }
  }
  $('#tty-sub').textContent = `bars ${cols} · gain ${TTY.gain.toFixed(1)}x · ${TTY.mirror ? 'mirror' : 'linear'} · ${host ? 'live' : 'demo'}`;
}

function drawLife(ctx, W, H) {
  const size = 11;
  if (!TTY.life) {
    const w = Math.max(10, Math.floor(W / size)), h2 = Math.max(6, Math.floor(H / size));
    TTY.life = { w, h: h2, cells: new Uint8Array(w * h2).map(() => Math.random() < 0.22 ? 1 : 0), red: new Float32Array(w * h2) };
    TTY.lifeGen = 0;
  }
  const L = TTY.life;
  const now = performance.now();
  if (TTY.lifeRun && now - TTY.lifeTimer > 140) {
    TTY.lifeTimer = now;
    const next = new Uint8Array(L.cells.length);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += L.cells[((y + dy + L.h) % L.h) * L.w + ((x + dx + L.w) % L.w)];
      const i = y * L.w + x, alive = L.cells[i];
      next[i] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
      if (!alive && next[i] && TTY.lifeBeat) L.red[i] = 1;
    }
    L.cells = next;
    TTY.lifeBeat = false;
    TTY.lifeGen++;
    // Keep it alive: a quiet board gets a few new seeds.
    if (L.cells.reduce((a, b) => a + b, 0) < L.cells.length * 0.03) for (let k = 0; k < 20; k++) L.cells[Math.floor(Math.random() * L.cells.length)] = 1;
  }
  const cw = W / L.w, ch = H / L.h, r = Math.min(cw, ch) * 0.38;
  let pop = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const i = y * L.w + x;
    const alive = L.cells[i];
    pop += alive;
    if (L.red[i] > 0) L.red[i] = Math.max(0, L.red[i] - 0.01);
    dot(ctx, (x + 0.5) * cw, (y + 0.5) * ch, alive ? r : r * 0.3, alive ? (L.red[i] > 0.2 ? RED : INK) : FAINT);
  }
  $('#tty-sub').textContent = `gen ${TTY.lifeGen} · pop ${pop} · ${TTY.lifeRun ? 'running' : 'paused'} · red cells: born on a beat`;
}

let orbPts = null;
function drawOrb(ctx, W, H) {
  if (!orbPts) {
    orbPts = [];
    const n = 420, g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), t = g * i; orbPts.push([Math.cos(t) * rr, y, Math.sin(t) * rr]); }
  }
  if (!TTY.drag) TTY.yaw += TTY.spin;
  const bass = ((Viz.last?.b?.slice(0, 6).reduce((a, b) => a + b, 0) || 0) / 600);
  const R = Math.min(W, H) * (0.36 + bass * 0.05), cx = W / 2, cy = H / 2;
  const ya = TTY.yaw * Math.PI / 180, pa = TTY.pitch * Math.PI / 180;
  const rot = ([x, y, z]) => {
    const x1 = x * Math.cos(ya) + z * Math.sin(ya), z1 = -x * Math.sin(ya) + z * Math.cos(ya);
    const y2 = y * Math.cos(pa) - z1 * Math.sin(pa), z2 = y * Math.sin(pa) + z1 * Math.cos(pa);
    return [x1, y2, z2];
  };
  // The ring.
  ctx.fillStyle = DIM;
  for (let i = 0; i < 160; i++) {
    const a = i / 160 * Math.PI * 2;
    const [x, y, z] = rot([Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55]);
    dot(ctx, cx + x * R, cy + y * R, Math.max(0.6, (z + 1.6) * 0.5), z > 0 ? '#9a9a9a' : '#3d3d3d');
  }
  for (const p of orbPts) {
    const [x, y, z] = rot(p);
    dot(ctx, cx + x * R, cy + y * R, 0.6 + (z + 1) * 1.1, `rgb(236 236 236 / ${0.15 + (z + 1) * 0.42})`);
  }
  const [mx, my] = rot([1.55, 0, 0]);
  dot(ctx, cx + mx * R, cy + my * R, 3.2, RED);
  $('#tty-sub').textContent = `pts ${orbPts.length} · yaw ${Math.round(((TTY.yaw % 360) + 360) % 360)}° · pitch ${Math.round(TTY.pitch)}°`;
}

function drawRain(ctx, W, H, dpr) {
  const fs = 11 * dpr, cols = Math.floor(W / (fs * 1.1));
  const glyphs = '01$>L{}RF=<#*+';
  if (!TTY.rain.length || TTY.rainBurst) {
    const add = TTY.rain.length ? 12 : 45;
    for (let i = 0; i < add; i++) TTY.rain.push({ x: Math.floor(Math.random() * cols), y: -Math.random() * H, v: (1.2 + Math.random() * 2.2) * dpr, len: 6 + Math.floor(Math.random() * 14), red: false });
    if (!TTY.rain.some(s => s.red)) TTY.rain[Math.floor(Math.random() * TTY.rain.length)].red = true;
    TTY.rainBurst = 0;
  }
  ctx.font = `${Math.round(fs)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  for (const s of TTY.rain) {
    s.y += s.v;
    for (let k = 0; k < s.len; k++) {
      const y = s.y - k * fs;
      if (y < 0 || y > H) continue;
      const x = (s.x + 0.5) * fs * 1.1;
      if (k === 0) { ctx.fillStyle = s.red ? RED : INK; ctx.fillText(glyphs[(Math.floor(s.y / fs) + s.x) % glyphs.length], x, y); }
      else dot(ctx, x, y - fs * 0.3, 1.1 * dpr, s.red ? `rgb(229 72 58 / ${1 - k / s.len})` : `rgb(200 200 200 / ${0.7 * (1 - k / s.len)})`);
    }
    if (s.y - s.len * fs > H) { s.y = -Math.random() * H * 0.3; s.x = Math.floor(Math.random() * cols); }
  }
  if (TTY.rain.length > 90) TTY.rain.splice(0, TTY.rain.length - 90);
  ctx.textAlign = 'start';
  $('#tty-sub').textContent = `streams ${TTY.rain.length} · speed 1.1x · spot the red stream`;
}

/* ---------- Lifecycle ---------- */

async function pollTtyStats() {
  const el = ttyEl();
  if (el && !el.hidden && S.showWidgets) { try { TTY.stats = await call('stats'); } catch { /* ignore */ } }
  setTimeout(pollTtyStats, 4000);
}

function syncTty() {
  if (!IS_DESKTOP) return;
  const el = ttyEl();
  if (!el) return;
  buildTty();
  const visible = !el.hidden && S.showWidgets;
  if (visible) { setTtyTab(TTY.tab); if (!TTY.raf) TTY.raf = requestAnimationFrame(ttyLoop); }
  else if (TTY.viz) { Viz.off(TTY.viz); TTY.viz = null; }
}

{
  const baseVisibility = applyWidgetVisibility;
  // eslint-disable-next-line no-global-assign
  applyWidgetVisibility = function () { baseVisibility(); syncTty(); };
}

addEventListener('DOMContentLoaded', () => {
  if (!IS_DESKTOP) return;
  setTimeout(() => { syncTty(); pollTtyStats(); }, 800);
});
