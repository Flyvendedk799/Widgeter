'use strict';
// IPC bridge + shared state for the dashboard.
const { ipcRenderer } = require('electron');

// Every main-process handler replies { ok, data } or { ok:false, error }.
async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) {
    const err = new Error(res.error || 'Something went wrong');
    err.details = res.details;
    throw err;
  }
  return res.data;
}

const store = {
  state: null,          // result of dash:state
  listeners: new Set(),
  logs: new Map()       // widget id -> entries pushed since the drawer opened
};

async function refresh() {
  store.state = await call('dash:state');
  applyTheme();
  for (const fn of store.listeners) fn(store.state);
  return store.state;
}

function subscribe(fn) {
  store.listeners.add(fn);
  return () => store.listeners.delete(fn);
}

function applyTheme() {
  const s = store.state && store.state.settings;
  if (!s) return;
  let theme = s.theme;
  if (theme === 'system') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  const root = document.documentElement.style;
  if (/^#[0-9a-f]{6}$/i.test(s.accent)) {
    const n = parseInt(s.accent.slice(1), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    root.setProperty('--accent', s.accent);
    root.setProperty('--accent-soft', 'color-mix(in srgb, ' + s.accent + ' 14%, transparent)');
    root.setProperty('--accent-ink', lum > 0.55 ? '#101420' : '#ffffff');
  } else {
    for (const k of ['--accent', '--accent-soft', '--accent-ink']) root.removeProperty(k);
  }
}

let refreshTimer = null;
ipcRenderer.on('dash:changed', () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 60);
});

const bus = new EventTarget();
for (const channel of ['dash:health', 'dash:log', 'dash:display', 'dash:updater', 'dash:navigate']) {
  ipcRenderer.on(channel, (event, payload) => bus.dispatchEvent(new CustomEvent(channel, { detail: payload })));
}
const on = (channel, fn) => bus.addEventListener(channel, (e) => fn(e.detail));

module.exports = { call, store, refresh, subscribe, on, ipcRenderer };
