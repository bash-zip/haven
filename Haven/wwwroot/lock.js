'use strict';

/* =========================================================================
   Lock screen (Ctrl + L), Mac style: the wallpaper with the date and a large
   clock. Click or press any key to bring up your picture, your name and a
   password field. The password is stored only as a SHA-256 hash.

   This covers Haven and blocks the usual escape keys, but it is not Windows'
   secure sign-in: Ctrl+Alt+Del still works. Win + L is the secure lock.
   ========================================================================= */

const DEFAULT_LOCK_PASSWORD = 'root';
let lockIdleTimer;
let lockClockTimer;
let lockBusy = false;

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkLockPassword(pw) {
  const hash = await sha256(pw);
  return hash === (S.lockHash || await sha256(DEFAULT_LOCK_PASSWORD));
}

async function setLockPassword(pw) {
  S.lockHash = await sha256(pw);
  save();
}

function isLocked() { return IS_SHELL && !$('#lock').hidden; }

/* Extras under the clock: what's playing (with controls), battery, and waiting notifications. */
let lockExtrasKey = '';
function renderLockExtras() {
  const box = $('#lock-extras');
  if (!box) return;
  const m = S.lockMedia !== false ? media : null;
  const unread = S.lockNotifications !== false ? (typeof notifications !== 'undefined' ? notifications.filter(n => !n.read).length : 0) : 0;
  const bat = S.lockBattery !== false && typeof pcBattery !== 'undefined' && pcBattery ? pcBattery : null;
  const key = JSON.stringify([m?.title, m?.artist, m?.playing, m?.art, unread, bat?.level, bat?.charging]);
  if (key === lockExtrasKey) return;
  lockExtrasKey = key;
  const ctl = (action, icon) => h('button', { 'aria-label': action, onclick: async e => { e.stopPropagation(); await call('mediaControl', { action }); setTimeout(refreshMedia, 350); } }, svg(icon));
  box.replaceChildren(
    m && h('div', { class: 'lock-media', onmousedown: e => e.stopPropagation() },
      h('span', { class: 'lock-art', style: m.art ? `background-image:url("${m.art}")` : '' }, m.art ? null : svg(ICONS.music)),
      h('div', { class: 'lock-media-text' }, h('b', { text: m.title || 'Not playing' }), h('span', { text: m.artist || '' })),
      h('div', { class: 'lock-media-controls' },
        ctl('previous', '<svg viewBox="0 0 20 20"><path d="M5 4h2v12H5zM16 4v12L8 10z" fill="currentColor"/></svg>'),
        ctl('toggle', m.playing ? ICONS.pause : ICONS.play),
        ctl('next', '<svg viewBox="0 0 20 20"><path d="M13 4h2v12h-2zM4 4v12l8-6z" fill="currentColor"/></svg>'))),
    (bat || unread) && h('div', { class: 'lock-status' },
      bat && h('span', { text: `${bat.charging ? '⚡ ' : ''}${bat.level}%` }),
      unread && h('span', { text: `${unread} notification${unread === 1 ? '' : 's'}` })));
}

let helloReady = null;
async function prepareHello() {
  const btn = $('#lock-hello');
  if (!btn) return;
  if (helloReady === null) { try { helloReady = !!(await call('helloAvailable')); } catch { helloReady = false; } }
  btn.hidden = !(helloReady && S.lockHello !== false);
}

let helloTried = false;
async function unlockWithHello() {
  if (lockBusy) return;
  lockBusy = true;
  $('#lock-hint').textContent = '';
  let ok = false;
  try { ok = !!(await call('helloVerify')); } catch { ok = false; }
  lockBusy = false;
  if (ok) unlock();
  else { $('#lock-hint').textContent = 'Windows Hello didn’t recognise you. Use your password.'; focusSoon('#lock-input'); }
}

function tickLockClock() {
  renderLockExtras();
  const now = new Date();
  $('#lock-date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#lock-time').textContent = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !S.clock24 }).replace(/\s?[AP]M$/i, '');
}

function lockScreen() {
  if (!IS_SHELL || isLocked()) return;
  closeOverlays();
  const lock = $('#lock');
  lock.classList.remove('login', 'unlocking');
  // The account picture and name, like the Mac login window.
  const avatar = $('#lock-avatar');
  if (account.picture) { avatar.style.backgroundImage = `url("${account.picture}")`; avatar.textContent = ''; }
  else { avatar.style.backgroundImage = ''; avatar.textContent = (displayName() || '?').charAt(0).toUpperCase(); }
  $('#lock-name').textContent = (S.name || '').trim() || account.displayName || env.user || '';
  $('#lock-input').value = '';
  $('#lock-hint').textContent = '';
  lockExtrasKey = '';
  helloTried = false;
  prepareHello();
  tickLockClock();
  clearInterval(lockClockTimer);
  lockClockTimer = setInterval(tickLockClock, 1000);
  lock.hidden = false;
  call('setLocked', { on: true });
  syncShell();
  Sound.play('pop');
  // Optional: lock Windows at the same time (Haven's lock is waiting when you sign back in).
  if (S.lockWindowsToo) setTimeout(() => call('system', { action: 'lock' }), 400);
}

/** Click or key press: bring up the picture, name and password field. */
function showLockLogin() {
  const lock = $('#lock');
  if (!lock.classList.contains('login')) lock.classList.add('login');
  focusSoon('#lock-input');
  restartLockIdle();
  // Like Touch ID on a Mac: offer Windows Hello as soon as the login appears, once per lock.
  if (helloReady && S.lockHello !== false && S.lockHelloAuto !== false && !helloTried) { helloTried = true; setTimeout(unlockWithHello, 250); }
}

function restartLockIdle() {
  clearTimeout(lockIdleTimer);
  // After a little while with nothing typed, go back to just the clock.
  lockIdleTimer = setTimeout(() => {
    if (!isLocked() || $('#lock-input').value) return;
    $('#lock').classList.remove('login');
  }, 12000);
}

async function tryUnlock() {
  if (lockBusy) return;
  const input = $('#lock-input');
  if (!input.value) return;
  lockBusy = true;
  const ok = await checkLockPassword(input.value);
  lockBusy = false;
  if (!ok) {
    const form = $('#lock-form');
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    input.value = '';
    $('#lock-hint').textContent = 'Incorrect password';
    restartLockIdle();
    return;
  }
  unlock();
}

function unlock() {
  const lock = $('#lock');
  clearTimeout(lockIdleTimer);
  clearInterval(lockClockTimer);
  lock.classList.add('unlocking');
  call('setLocked', { on: false });
  setTimeout(() => {
    lock.hidden = true;
    lock.classList.remove('unlocking', 'login');
    $('#lock-input').value = '';
    syncShell();
  }, 380);
}

function initLock() {
  const lock = $('#lock');
  lock.addEventListener('mousedown', e => { if (!e.target.closest('#lock-form')) { e.preventDefault(); showLockLogin(); } });
  lock.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#lock-input').value = ''; lock.classList.remove('login'); e.preventDefault(); return; }
    if (!lock.classList.contains('login')) {
      showLockLogin();
      // The first key you press goes into the password field.
      if (e.key.length === 1) { $('#lock-input').value += e.key; e.preventDefault(); }
      return;
    }
    restartLockIdle();
  });
  $('#lock-form').addEventListener('submit', e => { e.preventDefault(); tryUnlock(); });
  $('#lock-hello')?.addEventListener('click', e => { e.stopPropagation(); unlockWithHello(); });
  $('#lock-hello')?.addEventListener('mousedown', e => e.stopPropagation());
  $('#lock-input').addEventListener('input', () => { $('#lock-hint').textContent = ''; restartLockIdle(); });
  $('#lock-form').addEventListener('animationend', () => $('#lock-form').classList.remove('shake'));
}

// Ctrl + L arrives from the host as a "lock" event.
{
  const baseEvent = onHostEvent;
  // eslint-disable-next-line no-global-assign
  onHostEvent = function (name, data) {
    if (name === 'lock') return lockScreen();
    return baseEvent(name, data);
  };
}

// Escape and "close everything" never dismiss the lock screen.
{
  const baseClose = closeOverlays;
  // eslint-disable-next-line no-global-assign
  closeOverlays = function () {
    if (isLocked()) { hideMenu(); return; }
    baseClose();
  };
}

// The menus offer Haven's lock, with Windows' secure lock alongside.
{
  const swap = items => items.map(i => i && i.label === 'Lock Screen'
    ? [{ label: 'Lock Screen', hint: 'Ctrl+L', action: () => lockScreen() }, { label: 'Lock Windows', hint: 'Win+L', action: () => call('system', { action: 'lock' }) }]
    : [i]).flat();
  const baseLogo = MENUS.logo, baseAccount = MENUS.account;
  MENUS.logo = () => swap(baseLogo());
  MENUS.account = () => swap(baseAccount());
}

addEventListener('DOMContentLoaded', () => {
  if (PART !== 'shell' && PART !== 'preview') return;
  initLock();
  // Optionally start locked (handy with "Start Haven at sign-in").
  setTimeout(() => { if (S.lockOnStart) lockScreen(); }, 600);
});
