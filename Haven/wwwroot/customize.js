'use strict';

/* =========================================================================
   Customization: replace any system icon (PNG, SVG, JPEG, ICO, WebP, GIF),
   rename Dock items, hide any part of the menu bar, Dock or desktop, hide
   individual desktop icons, and add your own CSS for everything else.
   ========================================================================= */

/** Every part of the visible system that can be hidden, with the CSS that hides it. */
const PARTS = {
  // Menu bar
  'menubar': ['Entire menu bar', '.menubar'],
  'menubar-logo': ['Windows logo menu', '#logo-menu'],
  'menubar-app': ['Active app name', '[data-menu="app"]'],
  'menubar-menus': ['File, View, Go, Window menus', '[data-menu="file"], [data-menu="view"], [data-menu="go"], [data-menu="window"]'],
  'menubar-wifi': ['Wi-Fi icon', '#wifi-status'],
  'menubar-volume': ['Volume icon', '#volume-status'],
  'menubar-battery': ['Battery', '#battery'],
  'menubar-search': ['Search icon', '#search-button'],
  'menubar-control': ['Quick Controls icon', '#control-button'],
  'menubar-language': ['Keyboard language', '#lang-button'],
  'menubar-avatar': ['Account picture', '#avatar'],
  'menubar-name': ['Account name', '#account-name'],
  'menubar-clock': ['Clock', '#menubar-clock'],
  // Dock
  'dock': ['Entire Dock', '.dock-wrap, .dock-reveal'],
  'dock-launchpad': ['App Library', '.dock-item[data-tile="launchpad"]'],
  'dock-settings': ['Haven Settings', '.dock-item[data-tile="settings"]'],
  'dock-downloads': ['Downloads', '.dock-item[data-tile="downloads"]'],
  'dock-trash': ['Recycle Bin', '.dock-item[data-tile="trash"]'],
  'dock-running': ['Open apps that aren’t kept in the Dock', '.dock-item[data-kind="running"]'],
  'dock-minimized': ['Minimized windows (shown separately)', '.dock-item[data-kind="minimized"]'],
  'dock-separators': ['Dividers', '.dock-sep'],
  'dock-dots': ['Dots under open apps', '.dock-item::after'],
  'dock-labels': ['Names when hovering', '.dock-item .label'],
  // Desktop
  'desktop-icon-labels': ['Desktop icon names', '.desk-label'],
  'desktop-widgets-header': ['“Widgets” title and Edit button', '.panel-head'],
  'widget-headers': ['Widget titles', '.widget .w-head'],
};

const SYSTEM_TILES = { launchpad: 'App Library', settings: 'Haven Settings', downloads: 'Downloads', trash: 'Recycle Bin' };

function isPartHidden(id) { return (S.hideParts || []).includes(id); }

function setPartHidden(id, hidden) {
  const set = new Set(S.hideParts || []);
  hidden ? set.add(id) : set.delete(id);
  S.hideParts = [...set];
  save();
  applyCustomization();
  renderDock(true);
}

function styleTag(id) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('style'); el.id = id; document.head.append(el); }
  return el;
}

/** Applies hidden parts, the custom logo, and custom CSS. Runs in both layers. */
function applyCustomization() {
  document.documentElement.dataset.dockSkin = S.dockSkin || 'glass';
  document.documentElement.dataset.dockShape = S.dockShape || 'rounded';
  styleTag('haven-hidden-parts').textContent = (S.hideParts || [])
    .filter(id => PARTS[id]).map(id => `${PARTS[id][1]} { display: none !important; }`).join('\n');
  styleTag('haven-custom-css').textContent = S.customCss || '';

  if (IS_SHELL) {
    applyBarLayout();
    const logo = $('#logo-menu');
    const url = S.iconOverrides?.logo;
    const current = logo.querySelector('img')?.getAttribute('src');
    if (url && current !== url) logo.replaceChildren(h('img', { class: 'custom-logo', src: url, alt: '' }));
    else if (!url && current) logo.replaceChildren(svg('<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M1 1h6.6v6.6H1zM8.4 1H15v6.6H8.4zM1 8.4h6.6V15H1zM8.4 8.4H15V15H8.4z"/></svg>'));
    requestAnimationFrame(() => { updateRegion(); updateReserve(); updateGlass(); });
  }
}

/** The custom icon for a key ("launchpad", "app:<id>", "logo"...), if one is set. */
function customIcon(key) { return S.iconOverrides?.[key] || null; }

async function chooseIcon(key) {
  try {
    const url = await call('pickImage');
    if (!url) return;
    S.iconOverrides = { ...(S.iconOverrides || {}), [key]: url };
    save();
    applyCustomization();
    renderDock(true);
    if (!$('#launchpad').hidden) renderLaunchpad();
    refreshSettingsPage();
  } catch (err) { toast(err.message); }
}

function resetIcon(key) {
  const next = { ...(S.iconOverrides || {}) };
  delete next[key];
  S.iconOverrides = next;
  save();
  applyCustomization();
  renderDock(true);
  if (!$('#launchpad').hidden) renderLaunchpad();
  refreshSettingsPage();
}

/** Menu items to change or reset an icon. */
function iconMenuItems(key) {
  return [
    { label: 'Change Icon…', action: () => chooseIcon(key) },
    customIcon(key) && { label: 'Reset Icon', action: () => resetIcon(key) },
  ];
}

function tileLabel(name) { return (S.labels?.[name] || '').trim() || SYSTEM_TILES[name]; }

/* ---------- Desktop: hiding individual icons ---------- */

function hideDesktopItem(id) {
  S.hiddenDesktop = [...new Set([...(S.hiddenDesktop || []), id])];
  save();
  renderDesktopIcons();
}

function unhideDesktopItem(id) {
  S.hiddenDesktop = (S.hiddenDesktop || []).filter(x => x !== id);
  save();
  if (IS_DESKTOP) renderDesktopIcons();
  refreshSettingsPage();
}

/* ---------- Start-up ---------- */

addEventListener('DOMContentLoaded', () => {
  if (!IS_SHELL) return;
  // Right-click the logo to give it your own picture.
  $('#logo-menu').addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY, iconMenuItems('logo'), $('#logo-menu'));
  });
});
