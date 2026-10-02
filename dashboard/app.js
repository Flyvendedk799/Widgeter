'use strict';
const { webUtils } = require('electron');
const { h, icon, toast } = require('./ui');
const { call, store, refresh, subscribe, on } = require('./api');
const widgetsView = require('./views/widgets');
const discoverView = require('./views/discover');
const creatorView = require('./views/creator');
const layoutsView = require('./views/layouts');
const settingsView = require('./views/settings');
const firstRun = require('./views/firstrun');
const { openDrawer, closeDrawer } = require('./views/drawer');

const VIEWS = [
  { id: 'widgets', label: 'My Widgets', icon: 'widgets' },
  { id: 'discover', label: 'Discover', icon: 'discover' },
  { id: 'creator', label: 'Creator', icon: 'creator' },
  { id: 'layouts', label: 'Layouts', icon: 'layouts' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

const main = document.getElementById('main');
let current = 'widgets';
let firstRunShown = false;

const actions = {
  go: (view) => go(view),
  edit: async (id) => {
    try { await creatorView.openWidget(id); closeDrawer(); go('creator'); } catch (e) { toast(e.message, 'bad'); }
  },
  publish: (w) => { closeDrawer(); discoverView.openPublish(w, actions); }
};

function renderNav() {
  const nav = document.getElementById('nav');
  nav.textContent = '';
  for (const v of VIEWS) {
    const badge = v.id === 'widgets' ? h('span', { class: 'nav-badge', id: 'nav-badge-widgets', hidden: true }) : null;
    nav.appendChild(h('button', { class: 'nav-item' + (v.id === current ? ' active' : ''), onclick: () => go(v.id) }, icon(v.icon), h('span', {}, v.label), badge));
  }
  const updates = widgetsView.getUpdates();
  const badge = document.getElementById('nav-badge-widgets');
  if (badge && updates.length) { badge.textContent = updates.length; badge.hidden = false; }
}

function renderChrome() {
  const s = store.state;
  document.getElementById('version-label').textContent = 'v' + s.version;
  const chip = document.getElementById('account-chip');
  chip.textContent = '';
  chip.onclick = () => (s.account ? go('settings') : discoverView.openAccount());
  chip.append(h('span', { class: 'avatar' }, s.account ? s.account.username[0].toUpperCase() : '?'), h('span', {}, s.account ? s.account.username : 'Sign in'));
  const pill = document.getElementById('update-pill');
  const up = s.updater || {};
  pill.hidden = !(up.state === 'ready' || up.state === 'downloading');
  pill.textContent = up.state === 'ready' ? 'Update ' + up.version + ' ready. Restart.' : 'Downloading update ' + (up.percent || 0) + '%';
  pill.onclick = () => (up.state === 'ready' ? call('updater:install') : go('settings'));
}

function renderView() {
  if (current !== 'creator') creatorView.leave();
  if (current === 'widgets') widgetsView.render(main, actions);
  else if (current === 'discover') discoverView.render(main, actions);
  else if (current === 'creator') creatorView.render(main, actions);
  else if (current === 'layouts') layoutsView.render(main);
  else if (current === 'settings') settingsView.render(main);
  renderNav();
}

function go(view) {
  if (view !== current) closeDrawer();
  current = view;
  renderView();
  main.scrollTop = 0;
}

// While the user is typing in a form, don't rebuild the view under them.
function safeToRerender() {
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && main.contains(el)) return false;
  return !document.querySelector('.CodeMirror-focused') && !document.getElementById('drawer-root').firstChild;
}

subscribe(() => {
  renderChrome();
  if (current === 'widgets' && safeToRerender()) widgetsView.render(main, actions);
  else if (current === 'settings' && safeToRerender()) settingsView.render(main);
  else renderNav();
  if (store.state.firstRun && !firstRunShown) { firstRunShown = true; firstRun.show(); }
});

on('dash:health', () => { /* full refresh follows via dash:changed */ });
on('dash:updater', (status) => { if (store.state) { store.state.updater = status; renderChrome(); } });
on('dash:navigate', async (target) => {
  if (!target) return;
  go(target.view || 'widgets');
  if (target.logs) { await refresh(); openDrawer(target.logs, 'Logs', actions); }
});

// ---- drag & drop install ----------------------------------------------------------
const overlay = document.getElementById('drop-overlay');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; overlay.hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  const paths = [...e.dataTransfer.files].map((f) => (webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(f) : f.path)).filter(Boolean);
  if (!paths.length) return;
  try { widgetsView.reportInstall(await call('install:paths', paths)); } catch (err) { toast(err.message, 'bad'); }
});

// ---- boot ---------------------------------------------------------------------------
(async function boot() {
  renderNav();
  try {
    await refresh();
  } catch (e) {
    main.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'Could not start the dashboard'), e.message));
    return;
  }
  renderChrome();
  renderView();
  widgetsView.checkUpdates().then(() => { renderNav(); if (current === 'widgets' && safeToRerender()) widgetsView.render(main, actions); });
  if (store.state.firstRun && !firstRunShown) { firstRunShown = true; firstRun.show(); }
})();
