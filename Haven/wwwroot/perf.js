'use strict';

/* =========================================================================
   Speed: while an app fills the screen, the layer behind it is invisible,
   so it stops animating, stops listening to audio and skips its polling.
   Background tabs (the page hidden for any other reason) do the same.
   ========================================================================= */

let pageCovered = false;
let coveredRaw = false;   // what the host reports (a maximized or fullscreen app in front)
let batteryCalm = false;  // "pause everything on battery" is active
const QUIET_WHEN_COVERED = new Set(['stats', 'recentFiles', 'currentSpace', 'stocks', 'events', 'batteries']);

/** "Calm by design": pause the desktop when covered (unless the user lets maximized apps
    stay live) and optionally whenever the PC runs on battery. */
function updateCalm() {
  const on = coveredRaw || batteryCalm;
  if (on === pageCovered) return;
  pageCovered = on;
  document.documentElement.classList.toggle('covered', on);
  // Audio capture only runs while someone is actually watching a visualizer.
  if (typeof vizViews !== 'undefined' && vizViews.size && host) call('audioViz', { on: !on }).catch(() => {});
  // Live wallpaper rests with everything else.
  for (const v of document.querySelectorAll('video.live-wallpaper')) on ? v.pause() : v.play().catch(() => {});
  if (!on) {
    if (typeof vizRaf !== 'undefined' && !vizRaf && vizViews.size) vizRaf = requestAnimationFrame(vizLoop);
    if (typeof syncTty === 'function') syncTty();
  }
}

function setCovered(data) {
  coveredRaw = typeof data === 'object' && data ? !!data.covered : !!data;
  const full = typeof data === 'object' && data ? !!data.full : false;
  // "Desktop only" calm: a merely maximized app doesn't pause the desktop if the user said so.
  updateCalm();
  window.__coveredFull = full;
}

/** Battery calm is evaluated by the batteries poll. */
function setBatteryCalm(on) {
  batteryCalm = !!on && S.calmBattery === true;
  updateCalm();
}

{
  const baseEvent = onHostEvent;
  // eslint-disable-next-line no-global-assign
  onHostEvent = function (name, data) {
    if (name === 'covered') return setCovered(data);
    return baseEvent(name, data);
  };
}

// Covered: skip the background polling (widgets refresh as soon as they're visible again).
{
  const baseCall = call;
  // eslint-disable-next-line no-global-assign
  call = function (type, args) {
    if (pageCovered && QUIET_WHEN_COVERED.has(type)) return Promise.resolve(null);
    return baseCall(type, args);
  };
}

// Animation loops pause while covered.
{
  const baseViz = vizLoop;
  // eslint-disable-next-line no-global-assign
  vizLoop = function () { if (pageCovered) { vizRaf = 0; return; } baseViz(); };
  const baseTty = ttyLoop;
  // eslint-disable-next-line no-global-assign
  ttyLoop = function () { if (pageCovered) { TTY.raf = 0; return; } baseTty(); };
}

document.addEventListener('visibilitychange', () => { if (!host) setCovered(document.hidden); });

/* CSS animations (clock hands, sheen, spinning borders) also stop while covered: see .covered in deep.css. */

/* ---------- Errors go to Haven's log (Settings → About → Diagnostic report) ---------- */

{
  let sent = 0;
  const report = (message) => {
    if (!host || sent++ > 30) return; // a broken loop shouldn't flood the log
    call('logError', { message: String(message).slice(0, 2000) }).catch(() => {});
  };
  addEventListener('error', e => report(`${e.message} at ${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}${e.error?.stack ? ' | ' + e.error.stack : ''}`));
  addEventListener('unhandledrejection', e => report('Unhandled promise: ' + (e.reason?.stack || e.reason)));
}

{
  const aboutPage = PAGES.about;
  PAGES.about = () => [
    ...aboutPage(),
    section('Problems & feedback'),
    group(
      row('Copy diagnostic report', 'Version, Windows, displays, the system check and recent errors, ready to paste into a bug report. No files or personal settings.',
        button('Copy Report', async () => {
          try { const text = await call('diagnosticReport'); await navigator.clipboard.writeText(text); toast('Diagnostic report copied'); }
          catch (err) { toast(err.message); }
        }, true)),
      row('Open the log folder', null, button('Open Logs', () => call('openLogs')))),
  ];
}
