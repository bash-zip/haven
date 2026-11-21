/* Haven Setup UI — page state machine. Talks to the C# host through
   window.chrome.webview postMessage (same pattern as Haven itself). */

'use strict';

const $ = s => document.querySelector(s);
const send = m => window.chrome.webview.postMessage(m);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PHASES = [
  'Closing running copies',
  'Copying files',
  'Creating shortcuts',
  'Registering Haven',
  'Start at sign-in',
  'Launching Haven',
];

const S = {
  page: 0,                       // 0 welcome · 1 location · 2 options · 3 installing · 4 finish
  dir: null,
  free: '',
  autostart: true,
  desktopShortcut: false,
  launchAfter: true,
  version: '',
  installing: false,
  installed: false,
  busy: false,                   // waiting on a dir check
  err: null,
  pct: 0, status: '', file: '', phase: -1,
};

// ---------- tiny dom helpers ----------

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const rose = cls => `<img class="rose ${cls || ''}" src="rose.png" alt="" draggable="false">`;
const checkSvg = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6.2l2.8 2.8L10 3.4" stroke="#7ed492" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function driveIcon() {
  return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="6.5" width="13" height="5" rx="1.5" stroke="currentColor"/><circle cx="12" cy="9" r="0.9" fill="currentColor"/><path d="M3 6.5l1.6-3.2A1.5 1.5 0 016 2.5h4a1.5 1.5 0 011.4.8L13 6.5" stroke="currentColor"/></svg>';
}

// ---------- pages ----------

const PAGES = [
  {
    nav: { back: null, next: 'Continue' },
    render() {
      return h(`
        <div class="page enter" style="align-items:center">
          ${rose()}
          <h1>Welcome to Haven</h1>
          <p class="tagline">A <b>calm, customizable desktop</b> for Windows: a menu bar, a Dock,
          widgets and more, on top of the Windows you already have.</p>
          <div class="chips">
            <span class="chip">Menu bar</span><span class="chip">Dock</span>
            <span class="chip">Widgets</span><span class="chip">Themes</span>
          </div>
          <p class="foot-note">Installs for your account only — no admin rights needed.<br>
          Uninstall any time from Settings → Apps.</p>
        </div>`);
    },
  },
  {
    nav: { back: true, next: 'Continue' },
    render() {
      const page = h(`
        <div class="page enter" style="align-items:center">
          <h2>Where should Haven live?</h2>
          <p class="tagline" style="margin-top:10px">Pick the install folder. If Haven is already installed there,
          this updates it in place and keeps all your settings.</p>
          <div class="form">
            <span class="label">Install location</span>
            <div class="row">
              <input class="path" id="dir" spellcheck="false" placeholder="Choose a folder…">
              <button class="btn ghost" id="browse">Browse…</button>
            </div>
            <div class="hint" id="dirHint">${driveIcon()}<span>About 500 MB of free space is needed.</span></div>
          </div>
        </div>`);
      const input = page.querySelector('#dir');
      const hint = page.querySelector('#dirHint');
      const browse = page.querySelector('#browse');
      input.value = S.dir || '';
      setHint(S.free, S.err);
      input.addEventListener('input', () => { S.err = null; setHint(S.free, null); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
      browse.addEventListener('click', () => { if (!S.busy) send({ cmd: 'browse' }); });
      function setHint(free, err) {
        hint.classList.toggle('error', !!err);
        hint.innerHTML = err
          ? `<span>${esc(err)}</span>`
          : `${driveIcon()}<span>${free ? esc(free) : 'About 500 MB of free space is needed.'}</span>`;
      }
      page._setHint = setHint;
      page._input = input;
      return page;
    },
    async onNext() {
      if (S.busy) return false;
      S.busy = true;
      S.err = null;
      const page = $('#stage .page');
      page._setHint('', null);
      page.querySelector('#next')?.setAttribute('disabled', '');
      send({ cmd: 'check', dir: page._input.value });
      return false; // the reply advances us
    },
  },
  {
    nav: { back: true, next: 'Install Haven' },
    render() {
      const mk = (key, t, s, on) => `
        <button class="opt ${S[key] ? 'on' : ''}" id="${key}" role="switch" aria-checked="${S[key]}">
          <span class="txt"><span class="t">${t}</span><span class="s" style="display:block">${s}</span></span>
          <span class="sw"></span>
        </button>`;
      const page = h(`
        <div class="page enter" style="align-items:center">
          <h2>Set things up your way</h2>
          <div class="opts">
            ${mk('autostart', 'Start Haven when I sign in', 'Your desktop comes up with Windows, ready and waiting.', true)}
            ${mk('desktopShortcut', 'Put a shortcut on my desktop', '', true)}
            ${mk('launchAfter', 'Launch Haven when setup closes', '', true)}
          </div>
          <p class="foot-note">You can change all of these later inside Haven's own settings.</p>
        </div>`);
      page.querySelectorAll('.opt').forEach(el => {
        el.addEventListener('click', () => {
          const key = el.id;
          S[key] = !S[key];
          el.classList.toggle('on', S[key]);
          el.setAttribute('aria-checked', String(!!S[key]));
        });
      });
      return page;
    },
    onNext() {
      send({ cmd: 'install', dir: S.dir, autostart: S.autostart, desktopShortcut: S.desktopShortcut, launch: S.launchAfter });
      S.page = 3; S.installing = true; render();
      return false;
    },
  },
  {
    nav: null,
    render() {
      const page = h(`
        <div class="page enter" style="align-items:center">
          <h2>Installing Haven</h2>
          <div class="prog-wrap">
            <div class="pct-row">
              <span class="pct" id="pct">0<small>%</small></span>
              <span class="phase-name" id="status">Getting ready…</span>
            </div>
            <div class="bar"><div class="bar-fill" id="fill"></div></div>
            <div class="file" id="file"></div>
            <div class="phase-list" id="plist">
              ${PHASES.map((p, i) => `
                <div class="phase" id="ph${i}"><span class="dot">${checkSvg}</span><span>${p}</span></div>`).join('')}
            </div>
          </div>
        </div>`);
      return page;
    },
  },
  {
    nav: null,
    render() {
      const page = h(`
        <div class="page enter" style="align-items:center">
          <div class="badge-wrap">
            ${rose('small')}
            <span class="badge"><svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7.2l3 3L11.5 4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </div>
          <h2>Haven is installed</h2>
          <div class="path-chip" title="${esc(S.dir)}">${esc(S.dir)}</div>
          <p class="tagline" style="margin-top:18px">Your taskbar and every Windows setting go back exactly how they were
          if you ever uninstall. The rose in the corner of your screen is your reminder: <b>calm is a feature</b>.</p>
          <button class="btn primary big" id="finish" style="margin-top:30px">Close</button>
        </div>`);
      page.querySelector('#finish').addEventListener('click', tryClose);
      return page;
    },
  },
];

// ---------- rendering & chrome ----------

function render() {
  const stage = $('#stage');
  stage.innerHTML = '';
  stage.appendChild(PAGES[S.page].render());
  if (S.page === 3) applyProgress(); // progress nodes exist only after append

  const page = PAGES[S.page];
  const back = $('#back'), next = $('#next'), steps = $('#steps');
  if (!page.nav) { back.style.display = 'none'; next.style.display = 'none'; }
  else {
    back.style.display = page.nav.back ? '' : 'none';
    next.style.display = '';
    next.textContent = page.nav.next;
  }
  next.setAttribute('disabled', '');
  if (S.page === 0) next.removeAttribute('disabled');
  if (S.page === 1 && !S.busy && S.dir && !S.err) next.removeAttribute('disabled');
  if (S.page === 2) next.removeAttribute('disabled');

  steps.innerHTML = PAGES.map((_, i) =>
    `<span class="d ${i === S.page ? 'active' : i < S.page ? 'done' : ''}"></span>`).join('');
  $('#meta').textContent = `Haven Setup · v${S.version || ''}`;
}

$('#back').addEventListener('click', () => { if (S.page > 0 && !S.installing) { S.page--; render(); } });
$('#next').addEventListener('click', primary);
$('#close').addEventListener('click', tryClose);

function primary() {
  if (S.installing) return;
  const page = PAGES[S.page];
  if (S.page === 4) return;
  if (page.onNext) { Promise.resolve(page.onNext()).then(ok => { if (ok) { S.page++; render(); } }); }
  else { S.page++; render(); }
}

function tryClose() {
  if (S.installing) {
    const b = $('#close');
    b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
    toast('Installing — hold on just a moment.');
    return;
  }
  send({ cmd: 'close' });
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- installing progress ----------

function applyProgress() {
  if (S.page !== 3) return;
  $('#pct').innerHTML = `${Math.round(S.pct)}<small>%</small>`;
  $('#fill').style.width = `${S.pct}%`;
  $('#status').textContent = S.status || '';
  $('#file').textContent = S.file || '';
  PHASES.forEach((_, i) => {
    const el = $('#ph' + i);
    if (!el) return;
    el.classList.toggle('done', i < S.phase || S.installed);
    el.classList.toggle('active', i === S.phase && !S.installed);
  });
}

// ---------- bridge ----------

window.chrome?.webview?.addEventListener('message', e => {
  const m = e.data || {};
  switch (m.type) {
    case 'state':
      S.version = m.version || '';
      if (!S.dir) S.dir = m.dir;
      S.free = m.free || '';
      if (S.page === 1) { const p = $('#stage .page'); p?._setHint?.(S.free, null); }
      render();
      break;

    case 'picked':
      S.busy = false;
      if (m.path) {
        const input = $('#dir');
        if (input) {
          input.value = m.path;
          input.dispatchEvent(new Event('input'));
          input.focus();
        }
      }
      break;

    case 'dirInfo': {
      const input = $('#dir');
      if (m.ok) {
        S.dir = m.dir; S.free = m.free; S.err = null; S.busy = false;
        if (S.page === 1) { S.page = 2; render(); }
      } else {
        S.err = m.err || 'That folder can\'t be used.'; S.busy = false;
        $('#stage .page')?._setHint?.('', S.err);
        input?.focus();
      }
      break;
    }

    case 'progress':
      S.pct = m.pct; S.status = m.status; S.file = m.file; S.phase = m.phase;
      applyProgress();
      break;

    case 'done':
      S.installing = false; S.installed = true; S.pct = 100; S.phase = 6;
      if (S.page === 3) { S.page = 4; render(); }
      break;

    case 'error':
      S.installing = false;
      toast(`Setup failed: ${m.message || 'unknown error'}`, 12000);
      S.page = 1; S.err = null; render();
      break;

    case 'deny':
      tryClose();
      break;
  }
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') tryClose();
  if (e.key === 'Enter') { if (S.page === 4) tryClose(); else primary(); e.preventDefault(); }
});

// test hooks: let an automated check exercise pages/progress without installing
window.__testProgress = (pct, status, file, phase) => {
  S.pct = pct; S.status = status; S.file = file; S.phase = phase; applyProgress();
};
window.__testGoto = i => { if (!S.installing) { S.page = i; render(); } };

send({ cmd: 'init' });
render();
