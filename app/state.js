'use strict';
// Persistent app state (state.json): per-widget display settings and config,
// plus app-wide settings. Writes are debounced and flushed on quit.
const fs = require('fs');
const { migrateDisplay } = require('../engine/resize-math');
const { STATE_FILE } = require('./paths');

const DEFAULT_REGISTRY_URL = 'https://widgetapi.mast3kmedia.dk';

const DEFAULT_SETTINGS = {
  theme: 'dark',            // dark | light | system
  accent: 'auto',            // auto = the theme's own accent, or a #rrggbb colour
  snap: true,
  grid: 0,                  // px, 0 = off
  registryUrl: DEFAULT_REGISTRY_URL,
  anthropicKey: '',
  checkUpdates: true
};

let appState = null;
let timer = null;

function load() {
  if (appState) return appState;
  try {
    if (fs.existsSync(STATE_FILE)) appState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch (e) {
    console.error('Error reading state:', e);
    try { fs.copyFileSync(STATE_FILE, STATE_FILE + '.corrupt-' + Date.now()); } catch (err) { /* best effort */ }
  }
  if (!appState || typeof appState !== 'object') appState = {};
  appState.widgets = appState.widgets || {};
  appState.runOnBoot = !!appState.runOnBoot;
  appState.settings = Object.assign({}, DEFAULT_SETTINGS, appState.settings || {});
  appState.account = appState.account || null;
  return appState;
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!appState) return;
  try {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(appState, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error('Error writing state:', e);
  }
}

function save() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

function freshWidgetState() {
  return migrateDisplay({
    enabled: true,
    autoResize: false,
    opacity: 1,
    clickThrough: false,
    minWidth: 160,
    maxWidth: 800,
    minHeight: 80,
    maxHeight: 900,
    _displayMigrated: true,
    config: {}
  });
}

function getWidgetState(widgetId) {
  const state = load();
  if (!state.widgets[widgetId]) {
    state.widgets[widgetId] = freshWidgetState();
    save();
  }
  const s = state.widgets[widgetId];
  const migrated = s._displayMigrated === true;
  migrateDisplay(s);
  if (!migrated) save();
  return s;
}

function hasWidgetState(widgetId) {
  return !!load().widgets[widgetId];
}

function updateWidgetState(widgetId, updates) {
  const s = getWidgetState(widgetId);
  Object.assign(s, updates);
  if (updates.config) s.config = updates.config;
  migrateDisplay(s);
  save();
  return s;
}

function removeWidgetState(widgetId) {
  const state = load();
  if (state.widgets[widgetId]) {
    delete state.widgets[widgetId];
    save();
  }
}

function renameWidgetState(from, to) {
  const state = load();
  if (state.widgets[from] && !state.widgets[to]) {
    state.widgets[to] = state.widgets[from];
    delete state.widgets[from];
    save();
  }
}

function getSettings() {
  return load().settings;
}

function updateSettings(patch) {
  const s = load().settings;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (patch[key] !== undefined) s[key] = patch[key];
  }
  save();
  return s;
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_REGISTRY_URL,
  getState: load,
  saveState: save,
  flushState: flush,
  getWidgetState,
  hasWidgetState,
  updateWidgetState,
  removeWidgetState,
  renameWidgetState,
  getSettings,
  updateSettings
};
