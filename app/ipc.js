'use strict';
// IPC surface. Two audiences:
//   widgets    widgeter:* channels, called through preload.js (window.widgeter)
//   dashboard  dash:* / creator:* / gallery:* / market:* ... via invoke, each reply { ok, data | error }
const { app, ipcMain, dialog, shell, net, Notification, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const P = require('./paths');
const S = require('./state');
const W = require('./widgets');
const gallery = require('./gallery');
const layouts = require('./layouts');
const registry = require('./registry-client');
const updater = require('./updater');
const ai = require('./ai');
const format = require('../engine/widget-format');
const { createFetchCache } = require('../engine/net-cache');
const { validateManifest } = require('../engine/manifest');

const fetchCache = createFetchCache((url, opts) => net.fetch(url, opts));

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { ok: true, data: await fn(...args, event) };
    } catch (e) {
      return { ok: false, error: e.message || String(e), details: e.details };
    }
  });
}

function dashboardState(ctx) {
  const state = S.getState();
  const settings = Object.assign({}, state.settings);
  const keySet = !!settings.anthropicKey;
  delete settings.anthropicKey;
  const widgets = W.listSummaries();
  // Someone who already has widgets does not need the first-run picker.
  if (!state.firstRunDone && widgets.length) { state.firstRunDone = true; S.saveState(); }
  return {
    widgets,
    settings: Object.assign(settings, { anthropicKeySet: keySet }),
    account: registry.account(),
    launchOnBoot: !!state.runOnBoot,
    shortcuts: ctx.shortcutState,
    version: app.getVersion(),
    packaged: app.isPackaged,
    updater: updater.getStatus(),
    firstRun: !state.firstRunDone,
    displays: layouts.listDisplays(),
    widgetsDir: P.WIDGETS_DIR,
    hidden: W.isHidden()
  };
}

function safeExternal(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch (e) {
    return null;
  }
}

function register(ctx) {
  // ---- widgets -> main ---------------------------------------------------------
  ipcMain.handle('widgeter:getConfig', (event, key) => {
    const id = W.idFromWebContents(event.sender);
    return id ? W.configValue(id, key) : null;
  });
  ipcMain.handle('widgeter:getAllConfig', (event) => {
    const id = W.idFromWebContents(event.sender);
    return id ? W.allConfig(id) : {};
  });
  ipcMain.handle('widgeter:setConfig', (event, key, value) => {
    const id = W.idFromWebContents(event.sender);
    if (!id || id === W.PREVIEW_ID) return false;
    const st = S.getWidgetState(id);
    st.config = st.config || {};
    st.config[key] = value;
    S.saveState();
    ctx.changed();
    return true;
  });
  ipcMain.handle('widgeter:fetch', async (event, url, opts) => {
    const safe = safeExternal(url);
    if (!safe) return { error: 'Only http and https URLs can be fetched.' };
    try {
      return await fetchCache.fetch(safe, opts || {});
    } catch (e) {
      return { error: 'Request failed: ' + (e.cause && e.cause.code ? e.cause.code : e.message) };
    }
  });
  ipcMain.on('widgeter:notify', (event, { title, body }) => {
    if (Notification.isSupported()) new Notification({ title: title || 'Widgeter', body: body || '' }).show();
  });
  ipcMain.on('widgeter:open-external', (event, url) => {
    const safe = safeExternal(url);
    if (safe) shell.openExternal(safe);
  });
  ipcMain.on('widgeter:data-dir', (event) => {
    const id = W.idFromWebContents(event.sender) || 'unknown';
    const dir = path.join(P.DATA_DIR, id.replace(/[^a-z0-9._-]/gi, '_'));
    fs.mkdirSync(dir, { recursive: true });
    event.returnValue = dir;
  });
  ipcMain.on('widgeter:log', (event, entry) => {
    const id = W.idFromWebContents(event.sender);
    if (id && !/Electron Security Warning/.test(String(entry.message))) W.addLog(id, ['error', 'warn', 'info'].includes(entry.level) ? entry.level : 'info', entry.message, entry.extra);
  });
  ipcMain.on('widgeter:auto-resize', (event, payload) => W.handleAutoResize(event.sender, payload));
  ipcMain.on('widgeter:user-resize', (event, payload) => W.handleUserResize(event.sender, payload));

  // Setup panels written for older widgets save config through this channel.
  ipcMain.on('update-widget-config', (event, widgetId, config) => {
    S.updateWidgetState(widgetId, { config });
    if (W.getWindow(widgetId)) W.load(widgetId, { force: true });
    ctx.changed();
  });

  // ---- dashboard ---------------------------------------------------------------
  handle('dash:state', () => dashboardState(ctx));

  handle('widget:toggle', (id, enabled) => { W.setEnabled(id, !!enabled); });
  handle('widget:remove', (id) => { W.uninstall(id); });
  handle('widget:reload', (id) => { W.load(id, { force: true }); });
  handle('widget:set-config', (id, values) => { W.saveConfigForm(id, values || {}); });
  handle('widget:set-display', (id, patch) => { W.applyDisplaySettings(id, patch || {}); });
  handle('widget:set-sticky', (id, sticky) => { W.setSticky(id, sticky); ctx.changed(); });
  handle('widget:logs', (id) => W.getLogs(id));
  handle('widget:logs-clear', (id) => { W.clearLogs(id); });
  handle('widget:screenshot', async (id) => { await W.captureThumbnail(id); });

  handle('install:paths', (paths) => {
    const results = [];
    for (const p of paths || []) {
      try { results.push(Object.assign({ path: p }, W.installFromPath(p))); } catch (e) { results.push({ path: p, error: e.message, details: e.details }); }
    }
    return results;
  });
  handle('install:pick', async (_arg, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Load a widget',
      filters: [{ name: 'Widgeter widget', extensions: ['widget', 'json'] }],
      properties: ['openFile', 'multiSelections']
    });
    if (canceled) return [];
    return filePaths.map((p) => {
      try { return Object.assign({ path: p }, W.installFromPath(p)); } catch (e) { return { path: p, error: e.message, details: e.details }; }
    });
  });

  // ---- gallery / first run -----------------------------------------------------
  handle('gallery:list', () => gallery.list());
  handle('gallery:install', (slug) => gallery.install(slug));
  handle('firstrun:install', (slugs) => {
    const results = gallery.installMany(slugs || []);
    S.getState().firstRunDone = true;
    S.saveState();
    ctx.changed();
    return results;
  });
  handle('firstrun:skip', () => { S.getState().firstRunDone = true; S.saveState(); });

  // ---- marketplace -------------------------------------------------------------
  handle('market:list', (params) => registry.list(params));
  handle('market:detail', (slug) => registry.detail(slug));
  handle('market:install', (slug, version) => registry.install(slug, version));
  handle('market:login', (u, p) => registry.login(u, p));
  handle('market:register', (u, p) => registry.register(u, p));
  handle('market:logout', () => registry.logout());
  handle('market:mine', () => registry.mine());
  handle('market:rate', (slug, rating, review) => registry.rate(slug, rating, review));
  handle('market:publish', async (id, meta) => {
    meta = meta || {};
    if (meta.bump) bumpVersion(id);
    return registry.publish(id, meta);
  });
  handle('updates:check', () => registry.checkUpdates());
  handle('updates:apply', async (update) => { await registry.applyUpdate(update); });

  // ---- creator -----------------------------------------------------------------
  handle('creator:read', (id) => {
    const entry = W.entryById(id);
    if (!entry) throw new Error('Widget file not found');
    const draft = format.packWidget(entry.path);
    return { widgetId: entry.id, kind: entry.kind, draft };
  });
  handle('creator:validate', (draft) => {
    const r = validateManifest(draft);
    return { ok: r.ok, errors: r.errors, warnings: r.warnings };
  });
  handle('creator:save', (draft) => W.saveDraft(draft));
  handle('creator:preview', (draft) => W.openPreview(draft));
  handle('creator:preview-close', () => { W.closePreview(); });
  handle('creator:export', async (id, event) => {
    const entry = W.entryById(id);
    if (!entry) throw new Error('Widget not found');
    const pkg = format.packWidget(entry.path);
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export widget',
      defaultPath: (entry.manifest.id || 'widget') + '.widget',
      filters: [{ name: 'Widgeter widget', extensions: ['widget'] }]
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2));
    return filePath;
  });
  handle('ai:generate', (prompt, current) => ai.generate(prompt, current));

  // ---- layouts -----------------------------------------------------------------
  handle('layout:list', () => ({ saved: layouts.getData().saved, displays: layouts.listDisplays(), active: W.activeWindows().map(([id]) => id) }));
  handle('layout:apply-template', (positions, displayId) => {
    const display = require('electron').screen.getAllDisplays().find((d) => d.id === displayId);
    return layouts.applyPositions(positions, display);
  });
  handle('layout:save', (name, kind) => { layouts.save(name, kind); ctx.changed(); });
  handle('layout:delete', (index) => { layouts.remove(index); ctx.changed(); });
  handle('layout:activate', (index) => { const r = layouts.activate(index); ctx.changed(); return r; });

  // ---- settings & app ----------------------------------------------------------
  handle('settings:update', (patch) => {
    const before = S.getSettings();
    const themeChanged = (patch.theme !== undefined && patch.theme !== before.theme) || (patch.accent !== undefined && patch.accent !== before.accent);
    if (patch.anthropicKey === '__keep__') delete patch.anthropicKey;
    S.updateSettings(patch);
    if (themeChanged) W.applyTheme();
    ctx.changed();
  });
  handle('settings:launch-on-boot', (launch) => {
    S.getState().runOnBoot = !!launch;
    S.saveState();
    app.setLoginItemSettings({ openAtLogin: !!launch, path: app.getPath('exe'), args: ['--hidden'] });
    ctx.changed();
  });
  handle('app:restart', () => { S.flushState(); app.relaunch(); app.exit(0); });
  handle('app:open-widgets-folder', () => shell.openPath(P.WIDGETS_DIR));
  handle('app:open-external', (url) => { const safe = safeExternal(url); if (safe) shell.openExternal(safe); });
  handle('app:set-hidden', (hidden) => { ctx.setHidden(!!hidden); });
  handle('updater:check', () => { updater.check(); });
  handle('updater:install', () => { updater.installNow(); });
}

// Bumps the patch version in the widget on disk so it can be published again.
function bumpVersion(id) {
  const entry = W.entryById(id);
  if (!entry || !entry.manifest) throw new Error('Widget not found');
  const parts = entry.manifest.version.split('.').map(Number);
  parts[2] += 1;
  const next = parts.join('.');
  const file = entry.kind === 'folder' ? path.join(entry.path, format.MANIFEST_FILE) : entry.path;
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.version = next;
  if (!json.id) json.id = entry.manifest.id;
  format.writeFileAtomic(file, JSON.stringify(json, null, 2) + '\n');
  return next;
}

module.exports = { register, dashboardState };
