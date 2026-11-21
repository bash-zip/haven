'use strict';

/* SIGNAL/01 and the standalone cava-style dot matrix audio widgets. */
const SIGNAL_MODES = [['face', 'FACE'], ['pulse', 'PULSE'], ['ripple', 'RIPPLE'], ['torus', 'TORUS'], ['scope', 'SCOPE'], ['seq', 'SEQ'], ['clock', 'CLOCK'], ['ticker', 'TICKER']];
let seqStep = 0, seqTimer = 0, seqAudio = null, seqGeomLast = null;
const SIGNAL_COLORS = { red: '#ef5144', white: '#f2f0e9', amber: '#ffb547', green: '#80df90' };
let signalRaf = 0, cavaRaf = 0, signalFrame = { b: Array(64).fill(0), w: Array(96).fill(0), beat: false };
let signalMode = 'face', signalColor = 'red';
function signalAudioFrame(frame) { signalFrame = frame; }

function signalVisible(id) {
  const el = $(`[data-widget="${id}"]`);
  return !!el && !el.hidden && S.showWidgets && !document.hidden && !document.documentElement.classList.contains('covered');
}
function signalOptions() {
  signalMode = widgetOption('signal', 'mode') || 'face';
  signalColor = widgetOption('signal', 'color') || 'accent';
  $('[data-widget="signal"]')?.classList.toggle('tape-surround', !!widgetOption('signal', 'tape'));
}
function renderSignal() {
  const el = $('[data-widget="signal"]');
  if (!el) return;
  signalOptions();
  $('#signal-status').textContent = media?.playing ? 'SIGNAL LOCKED' : 'STANDBY';
  $('#signal-track').textContent = media?.title ? `${media.title}${media.artist ? ' / ' + media.artist : ''}` : 'NO SIGNAL · PLAY AUDIO ON ANY APP';
  const tabs = $('#signal-tabs');
  tabs.replaceChildren(...SIGNAL_MODES.map(([id, label]) => h('button', { class: 'signal-tab' + (signalMode === id ? ' on' : ''), text: label, onclick: e => {
    e.stopPropagation(); S.widgetOpts = { ...(S.widgetOpts || {}), signal: { ...(S.widgetOpts?.signal || {}), mode: id } }; save(); renderSignal();
  } })));
  seqStartStop();
  if (signalVisible('signal') && !signalRaf) { Viz.on(signalAudioFrame); signalRaf = requestAnimationFrame(drawSignal); }
  else if (!signalVisible('signal') && signalRaf) { Viz.off(signalAudioFrame); cancelAnimationFrame(signalRaf); signalRaf = 0; }
}

function drawSignal() {
  signalRaf = 0;
  if (!signalVisible('signal')) { Viz.off(signalAudioFrame); return; }
  signalFrame = Viz.last;
  const canvas = $('#signal-canvas'), rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) { signalRaf = requestAnimationFrame(drawSignal); return; }
  const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
  const color = signalColor === 'accent' ? (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ef5144') : SIGNAL_COLORS[signalColor], mode = signalMode, b = signalFrame.b?.length ? signalFrame.b : Array(64).fill(0);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = signalFrame.beat ? 10 : 4;
  if (mode === 'clock') {
    const now = new Date(); ctx.font = `500 ${Math.min(64, rect.height * .55)}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }), rect.width / 2, rect.height / 2);
  } else if (mode === 'ticker') {
    ctx.font = '12px ui-monospace,monospace'; ctx.textBaseline = 'middle';
    const text = `${media?.title || 'NO SIGNAL'}  ·  ${media?.artist || 'AWAITING AUDIO'}  ·  SIGNAL / 01  ·  `;
    const tw = ctx.measureText(text).width, x = rect.width - (Date.now() / 35 % (tw + rect.width));
    ctx.fillText(text, x, rect.height / 2); ctx.fillText(text, x + tw, rect.height / 2);
  } else if (mode === 'face' || mode === 'pulse' || mode === 'ripple' || mode === 'torus') {
    const cx = rect.width / 2, cy = rect.height / 2, radius = Math.min(rect.width, rect.height) * .39;
    if (mode === 'face') {
      const beat = signalFrame.beat ? 1.14 : 1, blink = Math.sin(Date.now() / 2600) > .995;
      for (const side of [-1, 1]) {
        const ex = cx + side * radius * .46, ey = cy;
        for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
          const rr = Math.hypot(x, y); if (rr > 7 || ((x + y) % 2 !== 0)) continue;
          const bright = (1 - rr / 9) * (0.35 + (b[Math.floor((rr * 5 + 4) % b.length)] || 0) / 150);
          ctx.globalAlpha = blink && Math.abs(y) < 2 ? .12 : Math.min(1, bright * beat);
          ctx.beginPath(); ctx.arc(ex + x * 1.7, ey + y * 1.7, 1.05, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    } else {
      const dots = 56;
      for (let i = 0; i < dots; i++) {
        const t = i / dots * Math.PI * 2, band = b[Math.floor(i / dots * b.length)] || 0, amp = band / 100;
        let r = radius;
        if (mode === 'pulse') r += amp * 34 + Math.sin(t * 5 + Date.now() / 500) * 3;
        if (mode === 'ripple') r += Math.sin(t * 8 - Date.now() / 220 + amp * 3) * (5 + amp * 15);
        if (mode === 'torus') r += Math.sin(t * 3 + Date.now() / 700) * 11 + amp * 13;
        const x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r;
        ctx.globalAlpha = .35 + amp * .65; ctx.beginPath(); ctx.arc(x, y, 1.2 + amp * 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (mode === 'torus') {
        ctx.beginPath(); ctx.ellipse(cx, cy, radius * .42, radius * .22, Math.sin(Date.now() / 1700) * .35, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }
  if (mode === 'scope') drawScope(ctx, rect, signalFrame.w || []);
  if (mode === 'seq') drawSeq(ctx, rect);
  signalRaf = requestAnimationFrame(drawSignal);
}

/** SCOPE: a phosphor lasso traced from the live waveform. */
function drawScope(ctx, rect, w) {
  const cx = rect.width / 2, cy = rect.height / 2, base = Math.min(rect.width, rect.height) * .32;
  const n = w.length;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i % n) / n * Math.PI * 2, amp = (w[i % n] || 0) / 128;
    const r = base * (1 + amp * .55);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  // phosphor sweep dot
  const t = Date.now() / 700, a = t % (Math.PI * 2), amp = (w[Math.floor(t / .7) % n] || 0) / 128;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(a) * base * (1 + amp * .55), cy + Math.sin(a) * base * (1 + amp * .55), 2.2, 0, Math.PI * 2);
  ctx.fill();
}

/** SEQ: a playable 16-step, 4-row dot sequencer locked to the tempo. */
function seqPattern() {
  const p = S.widgetOpts?.signal?.pattern;
  return Array.isArray(p) && p.length === 64 ? p : (() => { const d = Array(64).fill(0); [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56].forEach(i => d[i] = 1); return d; })();
}
function seqGeom(rect) {
  const cols = 16, rows = 4, cell = Math.min(rect.width / (cols + 1), rect.height / (rows + 2));
  return { cols, rows, cell, x0: (rect.width - cols * cell) / 2, y0: (rect.height - rows * cell) / 2 };
}
function drawSeq(ctx, rect) {
  const { cols, rows, cell, x0, y0 } = seqGeom(rect);
  seqGeomLast = { cols, rows, cell, x0, y0 };
  const pattern = seqPattern();
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ef5144';
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const on = pattern[r * cols + c], head = c === seqStep % cols;
    ctx.globalAlpha = head ? 1 : .75;
    ctx.fillStyle = on ? ink : 'rgb(255 255 255 / .13)';
    if (head && !on) ctx.fillStyle = 'rgb(255 255 255 / .45)';
    const cx = x0 + c * cell + cell / 2, cy = y0 + r * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, (on ? cell * .28 : cell * .16) * (head && on ? 1.15 : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function seqBlip(freq, vol) {
  try {
    const o = seqAudio.createOscillator(), g = seqAudio.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, seqAudio.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, seqAudio.currentTime + .18);
    o.connect(g).connect(seqAudio.destination);
    o.start(); o.stop(seqAudio.currentTime + .2);
  } catch { /* no audio ctx */ }
}
function seqStartStop() {
  clearInterval(seqTimer);
  seqTimer = 0;
  if (signalMode !== 'seq' || !signalVisible('signal')) return;
  const bpm = Number(widgetOption('signal', 'seqBpm')) || 120;
  seqTimer = setInterval(() => {
    seqStep = (seqStep + 1) % 16;
    if (widgetOption('signal', 'seqSound')) {
      if (!seqAudio) seqAudio = new AudioContext();
      if (seqAudio.state === 'suspended') seqAudio.resume().catch(() => {});
      const pattern = seqPattern();
      for (let r = 0; r < 4; r++) if (pattern[r * 16 + seqStep]) seqBlip(220 * Math.pow(2, (3 - r) / 2), r === 0 ? .12 : .07);
    }
  }, Math.max(60, 60000 / bpm / 4));
}
// Click a dot to toggle its step (hit-tested against the grid drawn last frame).
document.addEventListener('pointerdown', e => {
  if (signalMode !== 'seq' || !seqGeomLast) return;
  const canvas = document.getElementById('signal-canvas');
  if (!canvas || !e.target.closest('.signal-stage')) return;
  const rect = canvas.getBoundingClientRect(), { cols, rows, cell, x0, y0 } = seqGeomLast;
  const c = Math.floor((e.clientX - rect.left - x0) / cell), r = Math.floor((e.clientY - rect.top - y0) / cell);
  if (c < 0 || c >= cols || r < 0 || r >= rows) return;
  const pattern = seqPattern();
  pattern[r * cols + c] = pattern[r * cols + c] ? 0 : 1;
  S.widgetOpts = { ...(S.widgetOpts || {}), signal: { ...(S.widgetOpts?.signal || {}), pattern } };
  save();
});

let cavaSubscribed = false;
function renderCava() {
  if (signalVisible('cava') && !cavaRaf) { if (!cavaSubscribed) { Viz.on(signalAudioFrame); cavaSubscribed = true; } cavaRaf = requestAnimationFrame(drawCava); }
  else if (!signalVisible('cava') && cavaRaf) { if (cavaSubscribed) { Viz.off(signalAudioFrame); cavaSubscribed = false; } cancelAnimationFrame(cavaRaf); cavaRaf = 0; }
}
function drawCava() {
  cavaRaf = 0;
  if (!signalVisible('cava')) { if (cavaSubscribed) Viz.off(signalAudioFrame); cavaSubscribed = false; return; }
  const canvas = $('#cava-canvas'), rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) { cavaRaf = requestAnimationFrame(drawCava); return; }
  const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
  const bands = Viz.last.b || [], cols = Math.min(64, Math.floor(rect.width / 8)), rows = Math.max(4, Math.floor(rect.height / 8)), gap = 3, cell = (rect.width - cols * gap) / cols;
  for (let i = 0; i < cols; i++) {
    const amp = Math.max(0, Math.min(1, (bands[Math.floor(i / cols * bands.length)] || 0) / 100));
    const lit = Math.round(amp * rows), x = i * (cell + gap);
    for (let j = 0; j < rows; j++) {
      const on = j >= rows - lit; ctx.fillStyle = on ? (on && i === Math.floor(cols / 2) ? '#ef5144' : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) : 'rgb(255 255 255 / .07)';
      ctx.fillRect(x, rect.height - (j + 1) * (rect.height / rows), cell, Math.max(2, rect.height / rows - 3));
    }
  }
  cavaRaf = requestAnimationFrame(drawCava);
}

addEventListener('DOMContentLoaded', () => {
  for (const btn of $$('.signal-controls [data-media]')) btn.addEventListener('click', async e => {
    e.stopPropagation(); const action = btn.dataset.media; await call('mediaControl', { action }); setTimeout(() => { refreshMedia(); renderSignal(); }, 250);
  });
});

addEventListener('DOMContentLoaded', () => {
  if (!IS_DESKTOP) return;
  for (const id of ['signal', 'cava']) ensureResizeHandle($(`[data-widget="${id}"]`));
  renderSignal(); renderCava();
  setInterval(() => { if (signalVisible('signal')) renderSignal(); if (signalVisible('cava') && !cavaRaf) renderCava(); }, 1000);
});
