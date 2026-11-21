'use strict';

/* =========================================================================
   Haven extras: clipboard history, Ask Claude, the system check, and the
   Settings pages for them. Uses the helpers and state from app.js/settings.js.
   ========================================================================= */

const EXTRA_ICONS = {
  clipboard: '<svg viewBox="0 0 20 20"><rect x="4" y="3.5" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="2" width="6" height="3.2" rx="1" fill="currentColor"/><path d="M7 9h6M7 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 20 20"><path d="M10 2.5l1.6 4.9 4.9 1.6-4.9 1.6L10 15.5l-1.6-4.9L3.5 9l4.9-1.6z" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.6 10.2l2.3 2.3 4.6-4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin: '<svg viewBox="0 0 20 20"><path d="M12.5 2.5l5 5-2.2.6-3 3 .3 3.4-1.6 1.6-3.2-3.2L4 16.6 3.4 16l3.7-3.8L3.9 9l1.6-1.6 3.4.3 3-3z" fill="currentColor"/></svg>',
};

/* ---------- Clipboard history ---------- */

let clipItems = [];

async function loadClipItems() {
  if (!IS_SHELL) return;
  try { clipItems = await call('clipHistory') || []; } catch { clipItems = []; }
  if (!$('#spotlight').hidden && (spotlightMode === 'clipboard' || $('#spotlight-input').value.trim().length >= 2)) renderSpotlight();
}

function clipAge(time) {
  const s = (Date.now() - new Date(time).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function clipEntries(q, limit) {
  if (S.clipboardHistory === false) return [];
  const hits = clipItems.filter(c => !q || c.text.toLowerCase().includes(q) || (c.app || '').toLowerCase().includes(q));
  return hits.slice(0, limit).map(c => {
    const firstLine = c.kind === 'files'
      ? c.text.split('\n').map(p => p.split('\\').pop()).join(', ')
      : c.text.replace(/\s+/g, ' ').trim();
    return {
      kind: 'clip', id: c.id,
      name: truncate(firstLine, 110),
      detail: [c.pinned && 'Pinned', c.kind === 'files' ? 'Files' : null, c.app, clipAge(c.time)].filter(Boolean).join(' · '),
      hint: spotlightMode === 'clipboard' ? '' : 'Enter to paste',
      iconEl: () => c.image ? h('img', { class: 'app-icon clip-thumb', src: c.image, alt: '' })
        : h('span', { class: 'sl-glyph' + (c.pinned ? ' pinned' : '') }, svg(c.pinned ? EXTRA_ICONS.pin : EXTRA_ICONS.clipboard)),
      menu: () => [
        { label: 'Paste', action: () => { closeOverlays(); call('clipPaste', { id: c.id, paste: true }); } },
        { label: 'Copy', action: () => call('clipPaste', { id: c.id, paste: false }).then(() => toast('Copied')) },
        { label: c.pinned ? 'Unpin' : 'Pin', action: () => call('clipPin', { id: c.id, pinned: !c.pinned }) },
        { label: 'Delete', action: () => call('clipDelete', { id: c.id }) },
        '-',
        { label: 'Clear History (Keep Pinned)', action: () => call('clipClear', { pinned: false }) },
      ],
    };
  });
}

/* ---------- Ask Claude ---------- */

let claudeAsk = null; // { id, question, text, done, error }

function askEntry(query) {
  return {
    kind: 'ask', query, name: `Ask Claude “${truncate(query, 60)}”`,
    detail: claudeKnownKey === false ? 'Add your Anthropic API key in Settings → Claude' : 'A short answer, right here',
    hint: 'Enter',
    iconEl: () => h('span', { class: 'sl-glyph claude-glyph' }, svg(EXTRA_ICONS.spark)),
  };
}

let claudeKnownKey = null;
async function refreshClaudeStatus() {
  try { claudeKnownKey = !!(await call('claudeStatus'))?.hasKey; } catch { claudeKnownKey = null; }
}

function askClaude(question) {
  if (!question) return;
  const id = Math.random().toString(36).slice(2);
  claudeAsk = { id, question, text: '', done: false, error: null };
  call('askClaude', { id, question }).catch(err => { claudeAsk.error = err.message; claudeAsk.done = true; renderClaudeAnswer(); });
  renderClaudeAnswer();
}

function onClaudeEvent({ id, text, done, error }) {
  if (!claudeAsk || claudeAsk.id !== id) return;
  if (text) claudeAsk.text += text;
  if (done) { claudeAsk.done = true; claudeAsk.error = error || null; }
  renderClaudeAnswer();
}

function renderClaudeAnswer() {
  const box = $('#spotlight-answer');
  if (!box || !claudeAsk) return;
  box.hidden = false;
  const a = claudeAsk;
  const body = h('div', { class: 'sa-body' + (a.done ? '' : ' streaming') });
  if (a.error) body.append(h('div', { class: 'sa-error', text: a.error }));
  else body.textContent = a.text || '';
  if (!a.done && !a.text) body.append(h('span', { class: 'sa-dots' }, h('i'), h('i'), h('i')));
  box.replaceChildren(
    h('div', { class: 'sa-head' },
      h('span', { class: 'sl-glyph claude-glyph' }, svg(EXTRA_ICONS.spark)),
      h('span', { class: 'sa-q', text: a.question }),
      a.done
        ? h('span', { class: 'sa-actions' },
          a.text && button('Copy', () => navigator.clipboard?.writeText(a.text).then(() => toast('Copied'))),
          a.error?.includes('Settings') && button('Open Settings', () => { closeOverlays(); openSettings('claude'); }, true))
        : button('Stop', () => { call('cancelClaude'); }),
    ),
    body);
  body.scrollTop = body.scrollHeight;
}

/* ---------- System check ---------- */

let systemCheck = null; // null | 'running' | results[]

async function runSystemCheck() {
  systemCheck = 'running';
  refreshSettingsPage();
  try { systemCheck = await call('systemCheck') || []; } catch (err) { systemCheck = [{ area: 'Haven', name: 'System check', ok: false, detail: err.message }]; }
  refreshSettingsPage();
}

function systemCheckView() {
  const out = [section('System check')];
  if (systemCheck === null) {
    out.push(group(row('Check this PC', 'Tests the parts only real hardware can show: the taskbar, shortcuts, touchpad gestures, screen capture, live previews, Spaces, the tray and more.',
      button('Run Check', runSystemCheck, true))));
    return out;
  }
  if (systemCheck === 'running') { out.push(group(row('Checking…', 'This takes a second.'))); return out; }
  const bad = systemCheck.filter(r => r.ok === false).length;
  out.push(group(row(bad ? `${bad} thing${bad === 1 ? '' : 's'} need${bad === 1 ? 's' : ''} attention` : 'Everything checks out',
    `${systemCheck.filter(r => r.ok === true).length} passed · ${bad} problem${bad === 1 ? '' : 's'} · ${systemCheck.filter(r => r.ok == null).length} for information`,
    button('Run Again', runSystemCheck))));
  const areas = [...new Set(systemCheck.map(r => r.area))];
  for (const area of areas) {
    out.push(group(systemCheck.filter(r => r.area === area).map(r =>
      h('div', { class: 'sw-row check-row' },
        h('span', { class: 'check-dot ' + (r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'info'), text: r.ok === true ? '✓' : r.ok === false ? '!' : 'i' }),
        h('div', { class: 'sw-row-text' },
          h('div', { class: 'sw-row-title', text: `${area} · ${r.name}` }),
          h('div', { class: 'sw-row-desc', text: r.detail }),
          r.fix && h('div', { class: 'sw-row-desc check-fix', text: r.fix }))))));
  }
  return out;
}

/* ---------- Settings pages ---------- */

function addSettingsPage(entry, beforeId) {
  if (SETTINGS_NAV.some(n => n.id === entry.id)) return;
  const at = SETTINGS_NAV.findIndex(n => n.id === beforeId);
  SETTINGS_NAV.splice(at < 0 ? SETTINGS_NAV.length : at, 0, entry);
}

addSettingsPage({ id: 'clipboard', label: 'Clipboard', icon: 'clipboard', color: '#5b8def', keys: 'clipboard history copy paste snippets win v pinned' }, 'language');
Object.assign(NAV_ICONS, { spark: EXTRA_ICONS.spark, clipboard: EXTRA_ICONS.clipboard, check: EXTRA_ICONS.check });

PAGES.claude = () => {
  const input = h('input', { class: 'field', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false' });
  const status = h('span', { class: 'muted' });
  const saveKey = async () => {
    const r = await call('setClaudeKey', { key: input.value }).catch(e => ({ error: e.message }));
    claudeKnownKey = !!r?.hasKey;
    input.value = '';
    status.textContent = r?.error || (claudeKnownKey ? 'Saved.' : 'Removed.');
    refreshSettingsPage();
  };
  return [
    note('Type a question in search (Alt + Space or Win + S) and choose “Ask Claude” for a short answer right under the search field.'),
    section('Ask Claude in search'),
    group(row('Show “Ask Claude” in search results', null, toggle(S.claudeEnabled !== false, v => setPref('claudeEnabled', v)))),
    section('Anthropic API key'),
    group(
      row(claudeKnownKey ? 'A key is saved' : 'No key saved', 'Stored encrypted for your Windows account, never in Haven’s settings. Questions go straight from this PC to Anthropic, using Claude Opus 5.5.'),
      row('API key', null, input, button('Save', saveKey, true), claudeKnownKey && button('Remove', () => { input.value = ''; saveKey(); })),
      h('div', { class: 'sw-row' }, status)),
    note('Get a key at console.anthropic.com. Usage is billed to your Anthropic account.'),
  ];
};

PAGES.clipboard = () => [
  note('Everything you copy is kept here, searchable with Win + V or from search. Apps that mark copies as private, like password managers, are skipped.'),
  section('Clipboard history'),
  group(
    row('Remember what I copy', 'Text, pictures and files. Stays on this PC.', toggle(S.clipboardHistory !== false, v => { setPref('clipboardHistory', v); call('setClipboardHistory', { on: v }); })),
    row('Open clipboard history', null, h('kbd', { text: 'Win + V' }), button('Open', () => { closeOverlays(); openSpotlight('clipboard'); })),
    row('Clear history', 'Pinned items and snippets are kept.', button('Clear', () => call('clipClear', { pinned: false }).then(() => toast('Clipboard history cleared'))))),
  section('Snippets'),
  group(
    ...clipItems.filter(c => c.pinned).slice(0, 30).map(c => row(truncate(c.text.replace(/\s+/g, ' '), 70), c.app === 'Snippet' ? 'Snippet' : 'Pinned', button('Remove', () => call('clipDelete', { id: c.id }).then(loadClipItems).then(refreshSettingsPage)))),
    (() => {
      const box = h('textarea', { class: 'field', rows: 2, placeholder: 'Text you paste often: an address, a signature, a reply…' });
      return row('New snippet', null, box, button('Add', () => { if (box.value.trim()) call('clipSnippet', { text: box.value }).then(loadClipItems).then(refreshSettingsPage); }, true));
    })()),
];

{
  const aboutPage = PAGES.about;
  PAGES.about = () => [...aboutPage(), ...systemCheckView()];
}

/* ---------- Wiring ---------- */

addEventListener('DOMContentLoaded', () => {
  if (!IS_SHELL) return;
  refreshClaudeStatus();
  loadClipItems();
});
