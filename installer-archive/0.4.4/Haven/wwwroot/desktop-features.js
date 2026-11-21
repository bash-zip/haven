'use strict';

/* =========================================================================
   Desktop-layer features: Stacks, the Notes / System / World Clock / Photos /
   Up Next widgets, and a wallpaper that follows the time of day.
   ========================================================================= */

/* ---------- Stacks ---------- */

const KINDS = [
  ['images', 'Images', /\.(jpe?g|png|gif|webp|bmp|heic|svg|tiff?|ico)$/i],
  ['pdfs', 'PDFs', /\.pdf$/i],
  ['documents', 'Documents', /\.(docx?|odt|rtf|txt|md|pages)$/i],
  ['spreadsheets', 'Spreadsheets', /\.(xlsx?|ods|csv|numbers)$/i],
  ['presentations', 'Presentations', /\.(pptx?|odp|key)$/i],
  ['movies', 'Movies', /\.(mp4|mov|mkv|avi|webm|wmv)$/i],
  ['music', 'Music', /\.(mp3|wav|flac|m4a|aac|ogg)$/i],
  ['archives', 'Archives', /\.(zip|rar|7z|tar|gz|iso)$/i],
  ['apps', 'Apps', /\.(lnk|url|exe|msi|appref-ms)$/i],
];

function kindOf(item) {
  if (item.isFolder) return null; // folders stay as they are
  for (const [id, , re] of KINDS) if (re.test(item.id)) return id;
  return 'other';
}

/** What the desktop shows: every item, or with Stacks on, files grouped by kind (folders stay separate). */
function desktopEntries() {
  const hidden = new Set(S.hiddenDesktop || []);
  const visible = desktopItems.filter(i => !hidden.has(i.id));
  if (!S.useStacks) return visible;
  const groups = new Map();
  const loose = [];
  for (const item of visible) {
    const kind = kindOf(item);
    if (!kind) { loose.push(item); continue; }
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(item);
  }
  const stacks = [...groups].map(([kind, items]) => {
    const label = KINDS.find(k => k[0] === kind)?.[1] || 'Other';
    return items.length === 1 ? items[0] : { id: 'stack:' + kind, name: `${label} (${items.length})`, isStack: true, items, icon: items.find(i => i.icon)?.icon };
  });
  return [...stacks, ...loose];
}

function wireStackIcon(el, stack, g) {
  el.classList.add('stack');
  // A few cards fanned out behind the stack's icon.
  const img = el.querySelector('.desk-img');
  stack.items.slice(1, 3).forEach((it, i) => {
    const card = h('div', { class: 'stack-card', style: `transform: rotate(${i ? 8 : -7}deg)` }, it.icon ? h('img', { src: it.icon, alt: '' }) : null);
    img.prepend(card);
  });
  el.addEventListener('pointerdown', e => { if (e.button === 0) { e.stopPropagation(); selectOnly(stack.id); } });
  el.addEventListener('click', () => openStack(stack, el));
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    showMenu(e.clientX, e.clientY, [
      { label: 'Open Stack', action: () => openStack(stack, el) },
      { label: 'Turn Off Stacks', action: () => { S.useStacks = false; save(); renderDesktopIcons(); } },
    ]);
  });
}

function openStack(stack, anchor) {
  const pop = $('#desk-stack');
  const r = anchor.getBoundingClientRect();
  pop.replaceChildren(
    h('div', { class: 'stack-head' }, h('b', { text: stack.name }), h('button', { class: 'link', text: 'Close', onclick: () => { pop.hidden = true; } })),
    h('div', { class: 'stack-grid' }, stack.items.map(item => {
      const btn = h('button', { class: 'stack-item', title: item.name },
        item.icon ? h('img', { src: item.icon, alt: '' }) : letterIcon(item.name), h('span', { text: item.name }));
      btn.addEventListener('click', () => { pop.hidden = true; openDesktopItem(item.id); });
      btn.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showMenu(e.clientX, e.clientY, [
          { label: 'Open', action: () => openDesktopItem(item.id) },
          { label: 'Quick Look', action: () => toShell('quicklook', { path: item.id }) },
          { label: 'Show in File Explorer', action: () => call('desktopReveal', { path: item.id }) },
        ]);
      });
      return btn;
    })));
  pop.hidden = false;
  const w = Math.min(420, innerWidth - 24);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
  pop.style.top = Math.min(innerHeight - pop.offsetHeight - 80, r.bottom + 6) + 'px';
}

/* ---------- Notes ---------- */

let notesTimer;

function initNotes() {
  const input = $('#notes-input');
  input.value = S.notes || '';
  input.addEventListener('input', () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => { S.notes = input.value; save(); }, 400);
  });
}

/* ---------- System ---------- */

function ring(label, value, detail) {
  const r = 22, c = 2 * Math.PI * r;
  const color = value >= 90 ? 'var(--low)' : value >= 70 ? '#f5a524' : 'var(--accent)';
  const gauge = s('svg', { viewBox: '0 0 56 56', class: 'sys-gauge' });
  gauge.append(
    s('circle', { cx: 28, cy: 28, r, fill: 'none', stroke: 'var(--separator)', 'stroke-width': 5 }),
    s('circle', { cx: 28, cy: 28, r, fill: 'none', stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': `${c * value / 100} ${c}`, transform: 'rotate(-90 28 28)' }));
  return h('div', { class: 'sys-ring' }, h('div', { class: 'sys-ring-g' }, gauge, h('b', { text: Math.round(value) + '%' })),
    h('span', { text: label }), h('small', { class: 'muted', text: detail }));
}

async function pollSystem() {
  const widget = $('[data-widget="system"]');
  if (!widget.hidden && S.showWidgets) {
    try {
      const st = await call('stats');
      if (st) {
        $('#sys-rings').replaceChildren(
          ring('CPU', st.cpu, ''),
          ring('Memory', st.memory, `${st.memoryTotalGb} GB`),
          ring('Disk', st.diskUsed, `${st.diskFreeGb} GB free`));
        $('#sys-uptime').textContent = `up ${st.uptimeHours < 24 ? st.uptimeHours.toFixed(1) + ' h' : (st.uptimeHours / 24).toFixed(1) + ' d'}`;
      }
    } catch { /* ignore */ }
  }
  setTimeout(pollSystem, 3000);
}

/* ---------- World Clock ---------- */

function renderWorldClock() {
  const now = new Date();
  $('#world-list').replaceChildren(...(S.worldClocks || []).slice(0, 4).map(([city, tz]) => {
    let time = '', day = '';
    try {
      time = now.toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: !S.clock24 });
      const there = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      const diff = Math.round((there - new Date(now.toLocaleString('en-US'))) / 3600000);
      const dayDiff = there.getDate() - now.getDate();
      day = `${dayDiff > 0 ? 'Tomorrow' : dayDiff < 0 ? 'Yesterday' : 'Today'}, ${diff >= 0 ? '+' : ''}${diff} h`;
    } catch { time = '—'; }
    return h('div', { class: 'world-row' }, h('div', {}, h('b', { text: city }), h('small', { class: 'muted', text: day })), h('span', { class: 'world-time', text: time }));
  }));
}

/* ---------- Photos ---------- */

let photos = [];
let photoIndex = 0;

async function loadPhotos() {
  if ($('[data-widget="photos"]').hidden) { setTimeout(loadPhotos, 10000); return; }
  try { photos = (await call('recentFiles', { folder: 'pictures', count: 24, images: true }) || []).filter(p => p.icon); } catch { photos = []; }
  showPhoto();
}

function showPhoto() {
  const frame = $('#photo-frame');
  if (!photos.length) return;
  const p = photos[photoIndex % photos.length];
  const img = h('div', { class: 'photo', style: `background-image:url("${p.icon}")`, title: p.name });
  img.addEventListener('dblclick', () => call('openPath', { path: p.path }));
  frame.append(img);
  requestAnimationFrame(() => img.classList.add('in'));
  // Remove the previous photo once the new one has faded in.
  setTimeout(() => { while (frame.children.length > 1) frame.firstChild.remove(); }, 900);
  photoIndex++;
  setTimeout(showPhoto, 9000);
}

/* ---------- Up Next (calendar) ---------- */

async function loadEvents() {
  const list = $('#event-list');
  if (!$('[data-widget="events"]').hidden) {
    try {
      const res = await call('events');
      if (!res?.available) list.replaceChildren(h('li', { class: 'muted', text: 'Windows didn’t share your calendar with Haven. Add an account in the Windows Calendar or Outlook app.' }));
      else if (!res.events.length) list.replaceChildren(h('li', { class: 'muted', text: 'Nothing scheduled in the next few days.' }));
      else list.replaceChildren(...res.events.map(ev => {
        const start = new Date(ev.start);
        const today = new Date().toDateString() === start.toDateString();
        const when = ev.allDay ? (today ? 'Today · All day' : start.toLocaleDateString(undefined, { weekday: 'short' }) + ' · All day')
          : (today ? '' : start.toLocaleDateString(undefined, { weekday: 'short' }) + ' ') + start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !S.clock24 });
        return h('li', {}, h('i', { class: 'event-dot' }), h('div', {}, h('b', { text: ev.title || 'Untitled' }), h('small', { class: 'muted', text: [when, ev.location].filter(Boolean).join(' · ') })));
      }));
    } catch { /* ignore */ }
  }
  setTimeout(loadEvents, 5 * 60_000);
}

/* ---------- Wallpaper that follows the time of day ---------- */

function applyDaylight() {
  const el = $('#wallpaper');
  if (!S.dynamicWallpaper) { el.style.filter = ''; return; }
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  // Bright and neutral at midday, warm at sunrise and sunset, deep and cool at night.
  const keys = [[0, 0.55, -10], [5, 0.6, -6], [7, 0.9, 12], [12, 1.04, 0], [17, 0.95, 10], [19.5, 0.75, 16], [22, 0.6, -8], [24, 0.55, -10]];
  let a = keys[0], b = keys[1];
  for (let i = 0; i < keys.length - 1; i++) if (hour >= keys[i][0] && hour <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
  const t = (hour - a[0]) / Math.max(0.01, b[0] - a[0]);
  const bright = a[1] + (b[1] - a[1]) * t, warm = a[2] + (b[2] - a[2]) * t;
  el.style.filter = `brightness(${bright.toFixed(3)}) sepia(${Math.max(0, warm) / 100}) hue-rotate(${Math.min(0, warm)}deg) saturate(${(0.9 + bright * 0.15).toFixed(2)})`;
}

/* ---------- Start-up ---------- */

function initDesktopFeatures() {
  initNotes();
  pollSystem();
  renderWorldClock();
  setInterval(renderWorldClock, 30_000);
  loadPhotos();
  loadEvents();
  applyDaylight();
  setInterval(applyDaylight, 5 * 60_000);
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#desk-stack, .desk-icon.stack')) $('#desk-stack').hidden = true; });
}

// Settings changes from the shell layer arrive as a new state; refresh what depends on it.
{
  const baseRemote = onRemoteState;
  // eslint-disable-next-line no-global-assign
  onRemoteState = function (next) {
    baseRemote(next);
    if (!IS_DESKTOP) return;
    applyDaylight();
    renderWorldClock();
    const input = $('#notes-input');
    if (document.activeElement !== input && input.value !== (S.notes || '')) input.value = S.notes || '';
  };
}

/* ---------- Widgets you can put anywhere ----------
   Drag a widget out of the panel and drop it anywhere on the desktop; drop it back on the panel
   to return it (or to reorder the panel). In Edit Widgets mode you can drag straight away;
   otherwise press and hold a widget for a moment, then drag. */

const HOLD_MS = 320;
let widgetDefaultOrder = null;

function widgetSize(el) {
  const panelGrid = $('#widget-grid');
  const col = (panelGrid.clientWidth - 14) / 2 || 178;
  if (el.dataset.widget === 'tty') return Math.max(480, col * 2 + 14); // the terminal needs room for its text
  return el.classList.contains('wide') ? col * 2 + 14 : col;
}

const SCALE_MIN = 0.6, SCALE_MAX = 2.2;
const widgetScale = id => Math.min(SCALE_MAX, Math.max(SCALE_MIN, S.widgetScale?.[id] || 1));
const widgetDimensions = id => ({ width: Math.max(.6, Math.min(3, Number(S.widgetSize?.[id]?.[0]) || widgetScale(id))), height: Math.max(.6, Math.min(3, Number(S.widgetSize?.[id]?.[1]) || widgetScale(id))) });

/** Floating widgets are scaled with CSS transform, so their visual origin stays their top-left corner. */
function setWidgetScaleTransform(el, sx, sy) {
  el.style.transformOrigin = 'top left';
  el.style.transform = `scale(${sx}, ${sy})`;
}

/** Places a floating widget at an on-screen position. */
function setWidgetXY(el, x, y) {
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

/** A grip in the bottom-right corner of every widget, for resizing. */
function ensureResizeHandle(el) {
  if (el.querySelector(':scope > .widget-resize')) return;
  el.append(h('div', { class: 'widget-resize', title: 'Drag to resize', 'aria-hidden': 'true' }));
}

/** Puts every widget where it belongs: floating at its saved spot, or in the panel in saved order. */
function placeWidgets() {
  if (!IS_DESKTOP) return;
  const grid = $('#widget-grid');
  let layer = $('#widget-float');
  if (!layer) { layer = h('div', { class: 'widget-float', id: 'widget-float' }); $('#widget-panel').after(layer); }
  const all = $$('[data-widget]');
  if (!widgetDefaultOrder) widgetDefaultOrder = all.map(el => el.dataset.widget);
  const order = [...(S.widgetOrder || []), ...widgetDefaultOrder].filter((id, i, a) => a.indexOf(id) === i);

  for (const id of order) {
    const el = all.find(x => x.dataset.widget === id);
    if (!el) continue;
    const pos = S.widgetPos?.[id];
    if (pos) {
      if (el.parentElement !== layer) layer.append(el);
      el.classList.add('floating');
      const w = widgetSize(el), { width: zx, height: zy } = widgetDimensions(id);
      el.style.width = w + 'px';
      setWidgetScaleTransform(el, zx, zy);
      const x = Math.max(4, Math.min(innerWidth - w * zx - 4, pos[0] * innerWidth));
      const y = Math.max(34, Math.min(innerHeight - el.offsetHeight * zy - 60, pos[1] * innerHeight));
      setWidgetXY(el, x, y);
    } else {
      grid.append(el); // re-appending in order also sorts the panel
      el.classList.remove('floating');
      el.style.left = el.style.top = el.style.width = '';
      el.style.transform = '';
    }
    ensureResizeHandle(el);
  }
}

function initWidgetDragging() {
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest?.('[data-widget]');
    if (!el || e.button !== 0) return;
    if (e.target.closest('.widget-resize')) return startResize(el, e);
    if (e.target.closest('button, input, textarea, select, a, .remove-badge')) return;

    const startX = e.clientX, startY = e.clientY;
    let dragging = false, armed = editing, holdTimer = null;
    let dx = 0, dy = 0;

    if (!armed) holdTimer = setTimeout(() => { armed = true; el.classList.add('lifted'); }, HOLD_MS);

    const begin = ev => {
      dragging = true;
      const r = el.getBoundingClientRect();
      dx = startX - r.left;
      dy = startY - r.top;
      // Lift it out of the panel into the floating layer, exactly where it is now.
      const layer = $('#widget-float');
      if (el.parentElement !== layer) {
        el.style.width = r.width + 'px';
        layer.append(el);
      }
      el.classList.add('floating', 'dragging');
      setWidgetXY(el, r.left, r.top);
      $('#widget-panel').classList.add('drop-zone');
    };

    const move = ev => {
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!armed) { if (moved > 6) cleanup(); return; } // a normal click or scroll, not a move
      if (!dragging && moved > 3) begin(ev);
      if (!dragging) return;
      setWidgetXY(el, ev.clientX - dx, ev.clientY - dy);
      const overPanel = pointInPanel(ev.clientX, ev.clientY);
      $('#widget-panel').classList.toggle('drop-hover', overPanel);
    };

    const up = ev => {
      if (dragging) drop(el, ev.clientX, ev.clientY, ev.clientX - dx, ev.clientY - dy);
      cleanup();
    };

    function cleanup() {
      clearTimeout(holdTimer);
      el.classList.remove('lifted', 'dragging');
      $('#widget-panel').classList.remove('drop-zone', 'drop-hover');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });

  // Right-click a widget for its options.
  document.addEventListener('contextmenu', e => {
    const el = e.target.closest?.('[data-widget]');
    if (!el || e.target.closest('input, textarea')) return;
    e.preventDefault();
    e.stopPropagation();
    const id = el.dataset.widget;
    showMenu(e.clientX, e.clientY, [
      { label: editing ? 'Done arranging widgets' : 'Edit Widgets', action: () => toggleEditing(!editing) },
      '-',
      ...[['Compact', .8], ['Balanced', 1], ['Large', 1.3], ['XL', 1.7]].map(([label, z]) => ({
        label, checked: !!S.widgetPos?.[id] && Math.abs(widgetScale(id) - z) < 0.01, action: () => setWidgetScale(el, z),
      })),
      { label: 'Resize freely…', action: () => openWidgetSizeEditor(el) },
      '-',
      S.widgetPos?.[id] && { label: 'Put Back in the Panel', action: () => setWidgetPos(id, null) },
      Object.keys(S.widgetPos || {}).length > 1 && { label: 'Put All Widgets Back', action: () => { S.widgetPos = {}; save(); placeWidgets(); refreshLiquid(); renderDesktopIcons(); } },
      ...(typeof WIDGET_MENU_EXTRA !== 'undefined' && WIDGET_MENU_EXTRA[id] ? ['-', ...WIDGET_MENU_EXTRA[id]()] : []),
      '-',
      { label: `Remove ${WIDGETS[id] || 'Widget'}`, action: () => { S.hidden = [...S.hidden, id]; save(); applyWidgetVisibility(); } },
    ]);
  }, true);
}

/** Floats the widget where it is (the panel is a fixed grid), then applies a size. */
function floatInPlace(el) {
  const id = el.dataset.widget;
  if (S.widgetPos?.[id]) return;
  const r = el.getBoundingClientRect();
  S.widgetPos = { ...(S.widgetPos || {}), [id]: [r.left / innerWidth, r.top / innerHeight] };
}

function setWidgetScale(el, z) {
  const id = el.dataset.widget;
  floatInPlace(el);
  S.widgetScale = { ...(S.widgetScale || {}), [id]: Math.round(z * 100) / 100 };
  const sizes = { ...(S.widgetSize || {}) }; delete sizes[id]; S.widgetSize = sizes;
  save();
  placeWidgets();
  refreshLiquid();
  renderDesktopIcons();
}

function setWidgetDimensions(el, width, height) {
  const id = el.dataset.widget;
  floatInPlace(el);
  S.widgetSize = { ...(S.widgetSize || {}), [id]: [Math.max(.6, Math.min(3, width)), Math.max(.6, Math.min(3, height))] };
  S.widgetScale = { ...(S.widgetScale || {}) };
  delete S.widgetScale[id];
  save(); placeWidgets(); refreshLiquid(); renderDesktopIcons();
}

function openWidgetSizeEditor(el) {
  const id = el.dataset.widget, dims = widgetDimensions(id);
  const width = slider(60, 300, 1, Math.round(dims.width * 100), v => { setWidgetScaleTransform(el, v / 100, dims.height); }, v => setWidgetDimensions(el, v / 100, dims.height));
  const height = slider(60, 300, 1, Math.round(dims.height * 100), v => { setWidgetScaleTransform(el, dims.width, v / 100); }, v => setWidgetDimensions(el, dims.width, v / 100));
  openModal(`Resize ${WIDGETS[id] || 'Widget'}`, [row('Width', 'Set the horizontal scale independently.', width), row('Height', 'Set the vertical scale independently.', height), button('Reset proportions', () => { const avg = (dims.width + dims.height) / 2; setWidgetScale(el, avg); closeOverlays(); })]);
}

/** Drag the corner grip: the widget grows or shrinks evenly, so clocks and calendars keep their shape. */
function startResize(el, e) {
  e.preventDefault();
  e.stopPropagation();
  const id = el.dataset.widget;
  if (!S.widgetPos?.[id]) { floatInPlace(el); placeWidgets(); }
  const r = el.getBoundingClientRect();
  const d0 = widgetDimensions(id), sx = e.clientX, sy = e.clientY;
  let zx = d0.width, zy = d0.height;
  el.classList.add('resizing');
  const move = ev => {
    zx = Math.min(3, Math.max(.6, d0.width * ((r.width + ev.clientX - sx) / r.width)));
    zy = Math.min(3, Math.max(.6, d0.height * ((r.height + ev.clientY - sy) / r.height)));
    setWidgetScaleTransform(el, zx, zy);
    setWidgetXY(el, r.left, r.top); // keep the top-left corner where it is
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    el.classList.remove('resizing');
    setWidgetDimensions(el, zx, zy);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function pointInPanel(x, y) {
  const panel = $('#widget-panel');
  if (panel.hidden || !S.showWidgets) return false;
  const r = panel.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= Math.max(r.bottom, r.top + 120);
}

function drop(el, px, py, left, top) {
  const id = el.dataset.widget;
  if (pointInPanel(px, py)) {
    // Back into the panel, before whichever widget it was dropped on.
    const target = $$('#widget-grid > [data-widget]').find(w => {
      const r = w.getBoundingClientRect();
      return py < r.bottom && (py < r.top + r.height / 2 || px < r.left + r.width / 2);
    });
    const order = (S.widgetOrder || widgetDefaultOrder).filter(x => x !== id);
    const at = target ? order.indexOf(target.dataset.widget) : order.length;
    order.splice(at < 0 ? order.length : at, 0, id);
    S.widgetOrder = order;
    setWidgetPos(id, null);
  } else {
    const snap = v => Math.round(v / 4) * 4; // a gentle grid keeps edges tidy
    setWidgetPos(id, [snap(left) / innerWidth, snap(top) / innerHeight]);
  }
}

function setWidgetPos(id, pos) {
  const next = { ...(S.widgetPos || {}) };
  if (pos) next[id] = pos; else { delete next[id]; const sc = { ...(S.widgetScale || {}) }; delete sc[id]; S.widgetScale = sc; }
  S.widgetPos = next;
  save();
  placeWidgets();
  refreshLiquid();
  renderDesktopIcons();
}

addEventListener('DOMContentLoaded', () => {
  if (!IS_DESKTOP) return;
  initWidgetDragging();
  addEventListener('resize', placeWidgets);
});
