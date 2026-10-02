'use strict';
// Widget runtime: what is installed, which windows are open, and their health.
const { BrowserWindow, Menu, screen, nativeTheme } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const P = require('./paths');
const S = require('./state');
const { clampSize, decideSmartSize } = require('../engine/resize-math');
const { snapBounds } = require('../engine/snap');
const { findFreeSpot } = require('../engine/placement');
const { configDefaults, missingRequired, coerceConfigValue, slugify } = require('../engine/manifest');
const format = require('../engine/widget-format');

const { composePage, themeAttrs: buildThemeAttrs, displayModePayload } = require('../engine/compose');

const PREVIEW_ID = '__preview__';
const MAX_LOGS = 200;
const CRASH_WINDOW_MS = 5 * 60 * 1000;
const MAX_CRASHES = 5;

// id -> { win, logs, status, lastError, crashes, watcher, hash, manifest, filePath, reloadTimer }
const runtime = new Map();
const suppressResize = new Set();
const suppressTimers = {};
let widgetsHidden = false;
let paused = false;
let hooks = { changed() {}, health() {}, log() {}, display() {}, openDashboard() {}, openLogs() {} };

const isPreview = (id) => id === PREVIEW_ID;
const previewState = () => ({ enabled: true, autoResize: false, opacity: 1, clickThrough: false, minWidth: 160, maxWidth: 800, minHeight: 80, maxHeight: 900, config: {} });
const stateFor = (id) => (isPreview(id) ? previewState() : S.getWidgetState(id));
const patchState = (id, patch) => (isPreview(id) ? previewState() : S.updateWidgetState(id, patch));

function init(h) {
  hooks = Object.assign(hooks, h);
}

function rt(id) {
  let r = runtime.get(id);
  if (!r) {
    r = { win: null, logs: [], status: 'stopped', lastError: null, crashes: [], watcher: null, hash: null, manifest: null, filePath: null, reloadTimer: null };
    runtime.set(id, r);
  }
  return r;
}

function activeWindows() {
  const out = [];
  for (const [id, r] of runtime) {
    if (!isPreview(id) && r.win && !r.win.isDestroyed()) out.push([id, r.win]);
  }
  return out;
}

function getWindow(id) {
  const r = runtime.get(id);
  return r && r.win && !r.win.isDestroyed() ? r.win : null;
}

function idFromWebContents(webContents) {
  for (const [id, r] of runtime) {
    if (r.win && !r.win.isDestroyed() && r.win.webContents === webContents) return id;
  }
  return null;
}

// ---- logs & health -----------------------------------------------------------

function addLog(id, level, message, extra) {
  const r = rt(id);
  const entry = { t: Date.now(), level, message: String(message).slice(0, 2000), extra: extra ? String(extra).slice(0, 4000) : undefined };
  r.logs.push(entry);
  if (r.logs.length > MAX_LOGS) r.logs.splice(0, r.logs.length - MAX_LOGS);
  if (level === 'error' && r.status !== 'crashed' && r.status !== 'failed') {
    r.status = 'error';
    r.lastError = entry.message;
    hooks.health(id);
  }
  hooks.log(id, entry);
}

function getLogs(id) {
  return rt(id).logs.slice();
}

function clearLogs(id) {
  const r = rt(id);
  r.logs = [];
  if (r.status === 'error') { r.status = r.win ? 'ok' : 'stopped'; r.lastError = null; }
  hooks.health(id);
}

function healthOf(id, entry) {
  const r = runtime.get(id);
  const st = S.hasWidgetState(id) ? S.getWidgetState(id) : null;
  let status = 'stopped';
  if (st && st.enabled === false) status = 'disabled';
  else if (r) status = r.status;
  const needs = entry && entry.manifest && st ? missingRequired(entry.manifest, st.config) : [];
  return { status, lastError: r ? r.lastError : null, needsSetup: needs.length > 0, missing: needs, logCount: r ? r.logs.length : 0 };
}

// ---- catalog -----------------------------------------------------------------

function catalog() {
  return format.listWidgets(P.WIDGETS_DIR).map((item) => {
    const loaded = format.loadWidget(item.path);
    return Object.assign({ id: item.id, kind: item.kind, path: item.path }, loaded);
  });
}

function entryById(id) {
  const full = path.join(P.WIDGETS_DIR, path.basename(String(id || '')));
  if (!fs.existsSync(full)) return null;
  const loaded = format.loadWidget(full);
  return Object.assign({ id: path.basename(full), kind: format.isFolderWidget(full) ? 'folder' : 'file', path: full }, loaded);
}

function thumbPath(id) {
  return path.join(P.THUMBS_DIR, id.replace(/[^a-z0-9._-]/gi, '_') + '.png');
}

function thumbUrl(id) {
  const file = thumbPath(id);
  try {
    const stat = fs.statSync(file);
    return 'file:///' + file.replace(/\\/g, '/') + '?v=' + Math.round(stat.mtimeMs);
  } catch (e) {
    return null;
  }
}

function summary(entry) {
  const st = S.getWidgetState(entry.id);
  const m = entry.manifest || {};
  return {
    id: entry.id,
    kind: entry.kind,
    valid: entry.ok,
    errors: entry.errors,
    warnings: entry.warnings,
    name: m.name || entry.id,
    slug: m.id || null,
    version: m.version || null,
    author: m.author || '',
    description: m.description || '',
    category: m.category || 'other',
    tags: m.tags || [],
    icon: m.icon || '',
    config: m.config || [],
    configValues: Object.assign(configDefaults(m), st.config || {}),
    rawConfig: st.config || {},
    setupHtml: m.setupHtml || null,
    setupJs: m.setupJs || null,
    enabled: st.enabled !== false,
    sticky: st.sticky !== undefined ? st.sticky : !!m.alwaysOnTop,
    autoResize: !!st.autoResize,
    opacity: st.opacity,
    clickThrough: !!st.clickThrough,
    minWidth: st.minWidth,
    maxWidth: st.maxWidth,
    minHeight: st.minHeight,
    maxHeight: st.maxHeight,
    source: st.source || null,
    running: !!getWindow(entry.id),
    thumbnail: thumbUrl(entry.id),
    health: healthOf(entry.id, entry)
  };
}

function listSummaries() {
  return catalog().map(summary);
}

// ---- page composition --------------------------------------------------------

function effectiveTheme() {
  const t = S.getSettings().theme;
  if (t === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return t === 'light' ? 'light' : 'dark';
}

function themeAttrs() {
  const settings = S.getSettings();
  return buildThemeAttrs(effectiveTheme(), settings.accent);
}

// ---- windows -----------------------------------------------------------------

function resizeWidgetWindow(id, win, bounds) {
  suppressResize.add(id);
  clearTimeout(suppressTimers[id]);
  win.setBounds(bounds);
  suppressTimers[id] = setTimeout(() => suppressResize.delete(id), 180);
}

function pushResizeMode(id) {
  const win = getWindow(id);
  if (win) win.webContents.send('widgeter:resize-mode', displayModePayload(stateFor(id)));
}

function closeWidgetWindow(id) {
  const r = runtime.get(id);
  if (!r) return;
  clearTimeout(r.reloadTimer);
  if (r.watcher) {
    try { r.watcher.close(); } catch (e) { /* already closed */ }
    r.watcher = null;
  }
  if (r.win && !r.win.isDestroyed()) {
    r.win.removeAllListeners('closed');
    r.win.close();
  }
  r.win = null;
  r.status = 'stopped';
}

function occupiedBounds(exceptId) {
  return activeWindows().filter(([id]) => id !== exceptId).map(([, w]) => w.getBounds());
}

function visibleOnSomeDisplay(x, y) {
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds;
    return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
  });
}

function startPosition(id, m, st, width, height) {
  let x = st.x !== undefined ? st.x : m.x;
  let y = st.y !== undefined ? st.y : m.y;
  if (x !== undefined && y !== undefined && visibleOnSomeDisplay(x, y)) return { x, y };
  const area = screen.getPrimaryDisplay().workArea;
  const spot = findFreeSpot({ width, height }, area, occupiedBounds(id));
  return spot;
}

function launch(id, manifest, filePath, options = {}) {
  closeWidgetWindow(id);
  const r = rt(id);
  r.manifest = manifest;
  r.filePath = filePath;
  r.status = 'loading';
  r.lastError = null;
  if (options.clearLogs !== false) r.logs = [];

  const st = stateFor(id);
  const width = st.width !== undefined ? st.width : manifest.width;
  const height = st.height !== undefined ? st.height : manifest.height;
  const pos = startPosition(id, manifest, st, width, height);
  const sticky = st.sticky !== undefined ? st.sticky : manifest.alwaysOnTop;

  const win = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    frame: false,
    transparent: manifest.transparent,
    backgroundColor: manifest.backgroundColor,
    alwaysOnTop: !!sticky,
    skipTaskbar: true,
    resizable: true,
    hasShadow: !manifest.transparent,
    roundedCorners: !manifest.transparent,
    opacity: st.opacity,
    show: !widgetsHidden,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      preload: path.join(P.ROOT, 'preload.js')
    }
  });
  r.win = win;
  if (st.clickThrough) win.setIgnoreMouseEvents(true);

  const htmlPath = path.join(P.RUNTIME_DIR, id.replace(/[^a-z0-9._-]/gi, '_') + '.html');
  fs.writeFileSync(htmlPath, composePage(id, manifest, st, themeAttrs()), 'utf8');

  // Showing a new window emits resize. Ignore that so it does not turn Smart resize off.
  suppressResize.add(id);
  const wc = win.webContents;
  wc.once('did-finish-load', () => {
    clearTimeout(suppressTimers[id]);
    suppressTimers[id] = setTimeout(() => suppressResize.delete(id), 400);
    if (r.status === 'loading') r.status = 'ok';
    hooks.health(id);
    if (paused) wc.send('widgeter:paused', true);
    if (!isPreview(id)) {
      // Widgets fetch data after load, so grab the preview image once they have had time to fill in.
      for (const delay of [4000, 15000]) setTimeout(() => { if (getWindow(id) === win) captureThumbnail(id).catch(() => {}); }, delay);
    }
  });
  wc.on('did-fail-load', (event, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    addLog(id, 'error', 'Failed to load widget: ' + desc + ' (' + code + ')');
  });
  wc.on('render-process-gone', (event, details) => handleCrash(id, details.reason));
  wc.on('unresponsive', () => addLog(id, 'warn', 'Widget is not responding'));
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(htmlPath);

  if (!isPreview(id)) attachWindowEvents(id, win);

  win.on('closed', () => {
    if (runtime.get(id) && runtime.get(id).win === win) {
      runtime.get(id).win = null;
      if (runtime.get(id).status !== 'crashed' && runtime.get(id).status !== 'failed') runtime.get(id).status = 'stopped';
    }
    hooks.changed();
  });

  win.webContents.on('context-menu', () => showContextMenu(id, win));
  if (filePath && !isPreview(id)) watch(id, filePath);
  hooks.changed();
  return win;
}

function attachWindowEvents(id, win) {
  win.on('moved', () => {
    if (win.isDestroyed()) return;
    const settings = S.getSettings();
    let b = win.getBounds();
    if (settings.snap || settings.grid) {
      const display = screen.getDisplayMatching(b);
      const snapped = snapBounds(b, display.workArea, occupiedBounds(id), {
        threshold: settings.snap ? 12 : 0,
        grid: settings.grid
      });
      if (snapped.x !== b.x || snapped.y !== b.y) {
        win.setPosition(snapped.x, snapped.y);
        b = win.getBounds();
      }
    }
    S.updateWidgetState(id, { x: b.x, y: b.y });
  });

  win.on('resized', () => {
    if (win.isDestroyed()) return;
    const [nw, nh] = win.getSize();
    if (suppressResize.has(id)) {
      S.updateWidgetState(id, { width: nw, height: nh });
      return;
    }
    S.updateWidgetState(id, { width: nw, height: nh, autoResize: false });
    pushResizeMode(id);
    hooks.display(id);
  });
}

function handleCrash(id, reason) {
  const r = rt(id);
  if (reason === 'clean-exit') return;
  const now = Date.now();
  r.crashes = r.crashes.filter((t) => now - t < CRASH_WINDOW_MS);
  r.crashes.push(now);
  addLog(id, 'error', 'Widget process ended unexpectedly (' + reason + ')');
  if (r.crashes.length > MAX_CRASHES) {
    r.status = 'failed';
    r.lastError = 'Crashed ' + r.crashes.length + ' times in 5 minutes. Fix the widget, then reload it.';
    addLog(id, 'error', r.lastError);
    hooks.health(id);
    return;
  }
  r.status = 'crashed';
  hooks.health(id);
  const delay = Math.min(30000, 1000 * 2 ** (r.crashes.length - 1));
  clearTimeout(r.reloadTimer);
  r.reloadTimer = setTimeout(() => {
    const entry = isPreview(id) ? null : entryById(id);
    if (entry && entry.ok && stateFor(id).enabled !== false) launch(id, entry.manifest, entry.path, { clearLogs: false });
  }, delay);
}

function watch(id, filePath) {
  const r = rt(id);
  try {
    const target = format.watchTargets(filePath);
    r.watcher = fs.watch(target.path, { recursive: target.recursive }, () => scheduleReload(id));
    r.watcher.on('error', () => {});
  } catch (e) {
    console.error('Watch failed', e);
  }
}

function scheduleReload(id) {
  const r = rt(id);
  clearTimeout(r.reloadTimer);
  r.reloadTimer = setTimeout(() => {
    const entry = entryById(id);
    if (entry) load(id, { entry });
  }, 280);
}

function manifestHash(manifest) {
  return crypto.createHash('md5').update(JSON.stringify(manifest)).digest('hex');
}

// Starts (or restarts) a widget from disk. Skips the work when nothing changed.
function load(id, options = {}) {
  try {
    const st = S.getWidgetState(id);
    if (st.enabled === false) return false;
    const entry = options.entry || entryById(id);
    if (!entry) return false;
    const r = rt(id);
    if (!entry.ok) {
      r.status = 'error';
      r.lastError = entry.errors.join('; ');
      addLog(id, 'error', 'Widget is invalid: ' + entry.errors.join('; '));
      closeWidgetWindow(id);
      r.status = 'error';
      hooks.changed();
      return false;
    }
    const hash = manifestHash(entry.manifest);
    if (!options.force && r.hash === hash && getWindow(id)) return false;
    r.hash = hash;
    launch(id, entry.manifest, entry.path);
    return true;
  } catch (e) {
    console.error('Failed to load widget ' + id, e);
    addLog(id, 'error', 'Failed to load: ' + e.message);
    return false;
  }
}

function loadAll() {
  for (const item of format.listWidgets(P.WIDGETS_DIR)) load(item.id);
}

// Picks up widgets copied into the widgets folder by hand (or by an AI agent) while the app runs,
// and closes windows whose files were deleted.
function watchWidgetsDir() {
  let timer = null;
  const sync = () => {
    const present = new Set(format.listWidgets(P.WIDGETS_DIR).map((i) => i.id));
    for (const id of present) {
      const enabled = !S.hasWidgetState(id) || S.getWidgetState(id).enabled !== false;
      if (enabled && !getWindow(id)) load(id);
    }
    for (const [id, r] of runtime) {
      if (!isPreview(id) && r.win && !present.has(id)) stop(id);
    }
    hooks.changed();
  };
  try {
    const watcher = fs.watch(P.WIDGETS_DIR, () => { clearTimeout(timer); timer = setTimeout(sync, 500); });
    watcher.on('error', () => {});
    return watcher;
  } catch (e) {
    console.error('Could not watch the widgets folder', e);
    return null;
  }
}

function stop(id) {
  closeWidgetWindow(id);
  hooks.changed();
}

function setEnabled(id, enabled) {
  S.updateWidgetState(id, { enabled });
  if (enabled) load(id, { force: true });
  else stop(id);
}

// ---- thumbnails --------------------------------------------------------------

async function captureThumbnail(id) {
  const win = getWindow(id);
  if (!win || widgetsHidden) return null;
  const image = await win.webContents.capturePage();
  if (image.isEmpty()) return null;
  const size = image.getSize();
  const scaled = size.width > 520 ? image.resize({ width: 520, quality: 'good' }) : image;
  const png = scaled.toPNG();
  fs.writeFileSync(thumbPath(id), png);
  hooks.changed();
  return png;
}

// ---- visibility & pause --------------------------------------------------------

function setPaused(next) {
  paused = !!next;
  for (const [, win] of activeWindows()) win.webContents.send('widgeter:paused', paused || widgetsHidden);
}

function setHidden(hidden) {
  widgetsHidden = !!hidden;
  for (const [id, win] of activeWindows()) {
    if (widgetsHidden) win.hide();
    else {
      win.show();
      if (S.getWidgetState(id).clickThrough) win.setIgnoreMouseEvents(true);
    }
    win.webContents.send('widgeter:paused', paused || widgetsHidden);
  }
}

const isHidden = () => widgetsHidden;

function applyTheme() {
  const t = themeAttrs();
  for (const [id, r] of runtime) {
    if (r.win && !r.win.isDestroyed()) r.win.webContents.send('widgeter:theme', t);
  }
}

// ---- state mutations used by the UI ------------------------------------------

function setOpacity(id, opacity) {
  const st = S.updateWidgetState(id, { opacity });
  const win = getWindow(id);
  if (win) win.setOpacity(st.opacity);
  hooks.display(id);
}

function setClickThrough(id, value) {
  S.updateWidgetState(id, { clickThrough: !!value });
  const win = getWindow(id);
  if (win) win.setIgnoreMouseEvents(!!value);
  hooks.display(id);
  hooks.changed();
}

function clearAllClickThrough() {
  for (const [id] of activeWindows()) {
    if (S.getWidgetState(id).clickThrough) setClickThrough(id, false);
  }
}

function applyDisplaySettings(id, settings) {
  const patch = {};
  if (settings.opacity !== undefined) patch.opacity = Number(settings.opacity);
  if (settings.autoResize !== undefined) patch.autoResize = !!settings.autoResize;
  if (settings.clickThrough !== undefined) patch.clickThrough = !!settings.clickThrough;
  for (const key of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) {
    if (settings[key] !== undefined) patch[key] = settings[key];
  }
  const st = S.updateWidgetState(id, patch);
  const win = getWindow(id);
  if (win) {
    win.setOpacity(st.opacity);
    win.setIgnoreMouseEvents(!!st.clickThrough);
    pushResizeMode(id);
  }
  hooks.display(id);
  hooks.changed();
}

function setSticky(id, sticky) {
  S.updateWidgetState(id, { sticky: !!sticky });
  const win = getWindow(id);
  if (win) win.setAlwaysOnTop(!!sticky);
}

function configValue(id, key) {
  const entry = runtime.get(id);
  const st = stateFor(id);
  if (st.config && st.config[key] !== undefined) return st.config[key];
  const defaults = configDefaults(entry && entry.manifest);
  return defaults[key];
}

function allConfig(id) {
  const r = runtime.get(id);
  return Object.assign(configDefaults(r && r.manifest), stateFor(id).config || {});
}

// Saves values from a schema-driven form (coerced to each field's type) and reloads.
function saveConfigForm(id, values) {
  const entry = entryById(id);
  const schema = (entry && entry.manifest && entry.manifest.config) || [];
  const next = Object.assign({}, S.getWidgetState(id).config || {});
  for (const field of schema) {
    if (values[field.key] !== undefined) next[field.key] = coerceConfigValue(field, values[field.key]);
  }
  S.updateWidgetState(id, { config: next });
  if (getWindow(id)) load(id, { force: true });
  hooks.changed();
}

// ---- smart resize ipc ----------------------------------------------------------

function handleAutoResize(webContents, payload) {
  const id = idFromWebContents(webContents);
  if (!id) return;
  const st = stateFor(id);
  if (!st.autoResize) return;
  const win = getWindow(id);
  if (!win) return;
  const bounds = win.getBounds();
  const decided = decideSmartSize(bounds, { width: payload.width, height: payload.height });
  const next = clampSize(decided.width, decided.height, st);
  if (next.width === bounds.width && next.height === bounds.height) return;
  resizeWidgetWindow(id, win, { x: bounds.x, y: bounds.y, width: next.width, height: next.height });
  patchState(id, { width: next.width, height: next.height, autoResize: true });
}

function handleUserResize(webContents, payload) {
  const id = idFromWebContents(webContents);
  if (!id) return;
  const win = getWindow(id);
  if (!win) return;
  const st = stateFor(id);
  const bounds = win.getBounds();
  const smart = !!st.autoResize;
  const next = smart ? clampSize(payload.width, bounds.height, st) : clampSize(payload.width, payload.height, st);
  if (next.width !== bounds.width || next.height !== bounds.height) {
    resizeWidgetWindow(id, win, { x: bounds.x, y: bounds.y, width: next.width, height: next.height });
  }
  patchState(id, { width: next.width, height: next.height, autoResize: smart });
  if (payload.done) hooks.display(id);
}

// ---- context menu --------------------------------------------------------------

function showContextMenu(id, win) {
  const st = S.getWidgetState(id);
  if (st.clickThrough) return;
  Menu.buildFromTemplate([
    { label: 'Reload Widget', click: () => load(id, { force: true }) },
    { label: 'Show Logs', click: () => hooks.openLogs(id) },
    { type: 'separator' },
    {
      label: 'Smart resize', type: 'checkbox', checked: !!st.autoResize,
      click: (item) => { S.updateWidgetState(id, { autoResize: item.checked }); pushResizeMode(id); hooks.display(id); }
    },
    {
      label: 'Opacity',
      submenu: [1, 0.75, 0.5, 0.25].map((value) => ({
        label: Math.round(value * 100) + '%', type: 'radio', checked: Math.abs(st.opacity - value) < 0.02,
        click: () => setOpacity(id, value)
      }))
    },
    { label: st.clickThrough ? 'Disable Click-Through' : 'Enable Click-Through', click: () => setClickThrough(id, !st.clickThrough) },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => hooks.openDashboard() },
    { label: 'Close Widget', click: () => setEnabled(id, false) }
  ]).popup({ window: win });
}

// ---- install / uninstall -------------------------------------------------------

function safeFolderName(slug) {
  return slugify(slug) || 'widget';
}

function backupPath(p, tag) {
  try {
    const dest = path.join(P.BACKUP_DIR, tag + '-' + Date.now() + '-' + path.basename(p));
    fs.cpSync(p, dest, { recursive: true });
    return dest;
  } catch (e) {
    return null;
  }
}

// Installs a package object (the .widget JSON shape) as a folder widget.
// Returns { id, replaced }.
function installPackage(pkg, source) {
  const { validateManifest } = require('../engine/manifest');
  const result = validateManifest(pkg);
  if (!result.ok) {
    const err = new Error(result.errors.join('; '));
    err.details = result.errors;
    throw err;
  }
  const id = safeFolderName(result.manifest.id);
  const dest = path.join(P.WIDGETS_DIR, id);
  const replaced = fs.existsSync(dest);
  if (replaced) backupPath(dest, 'replaced');
  const toWrite = Object.assign({}, pkg, { id: result.manifest.id, version: result.manifest.version });
  format.unpackWidget(toWrite, dest);
  S.getWidgetState(id);
  const patch = { enabled: true };
  if (source) patch.source = source;
  S.updateWidgetState(id, patch);
  // Reload also when nothing visible changed; the settings schema may have.
  load(id, { force: true });
  hooks.changed();
  return { id, replaced };
}

// Installs from a file or folder on disk (drag and drop, "Load widget").
function installFromPath(p) {
  const loaded = format.loadWidget(p);
  if (!loaded.ok) {
    const err = new Error(loaded.errors.join('; '));
    err.details = loaded.errors;
    throw err;
  }
  const pkg = format.packWidget(p);
  if (!pkg.id) pkg.id = loaded.manifest.id;
  if (!pkg.version) pkg.version = loaded.manifest.version;
  return installPackage(pkg, { type: 'local' });
}

function uninstall(id) {
  const base = path.basename(String(id));
  closeWidgetWindow(base);
  const full = path.join(P.WIDGETS_DIR, base);
  if (fs.existsSync(full)) {
    backupPath(full, 'deleted');
    fs.rmSync(full, { recursive: true, force: true });
  }
  S.removeWidgetState(base);
  runtime.delete(base);
  try { fs.unlinkSync(thumbPath(base)); } catch (e) { /* none */ }
  hooks.changed();
}

// Folder-based save from the creator. `draft` = { id?, manifest fields, html, css, js }.
function saveDraft(draft) {
  const { validateManifest } = require('../engine/manifest');
  const result = validateManifest(draft);
  if (!result.ok) {
    const err = new Error(result.errors.join('; '));
    err.details = result.errors;
    throw err;
  }
  const m = result.manifest;
  const pkg = Object.assign({}, draft, { id: m.id, version: m.version });
  delete pkg.widgetId;
  let targetId = draft.widgetId || null;
  if (targetId && /\.widget$/i.test(targetId)) {
    // Editing a legacy single-file widget: keep it a single file so state and sources stay put.
    format.writeFileAtomic(path.join(P.WIDGETS_DIR, path.basename(targetId)), JSON.stringify(pkg, null, 2));
  } else {
    targetId = targetId || safeFolderName(m.id);
    format.unpackWidget(pkg, path.join(P.WIDGETS_DIR, targetId));
  }
  S.updateWidgetState(targetId, { enabled: true });
  load(targetId, { force: true });
  hooks.changed();
  return { id: targetId, warnings: result.warnings };
}

// ---- preview (creator) ---------------------------------------------------------

function openPreview(draft) {
  const { validateManifest } = require('../engine/manifest');
  const result = validateManifest(draft);
  if (!result.manifest) return { ok: false, errors: result.errors };
  const manifest = result.manifest;
  const r = rt(PREVIEW_ID);
  const existing = getWindow(PREVIEW_ID);
  if (existing) {
    // Rebuild the page in place so the preview keeps its position while typing.
    const bounds = existing.getBounds();
    manifest.x = bounds.x;
    manifest.y = bounds.y;
  } else {
    r.logs = [];
  }
  launch(PREVIEW_ID, manifest, null, { clearLogs: false });
  return { ok: result.ok, errors: result.errors, warnings: result.warnings };
}

function closePreview() {
  closeWidgetWindow(PREVIEW_ID);
}

module.exports = {
  PREVIEW_ID,
  init,
  catalog,
  entryById,
  summary,
  listSummaries,
  load,
  loadAll,
  watchWidgetsDir,
  stop,
  setEnabled,
  getWindow,
  activeWindows,
  idFromWebContents,
  addLog,
  getLogs,
  clearLogs,
  healthOf,
  captureThumbnail,
  thumbPath,
  thumbUrl,
  setPaused,
  setHidden,
  isHidden,
  applyTheme,
  setOpacity,
  setClickThrough,
  clearAllClickThrough,
  applyDisplaySettings,
  setSticky,
  configValue,
  allConfig,
  saveConfigForm,
  handleAutoResize,
  handleUserResize,
  installPackage,
  installFromPath,
  uninstall,
  saveDraft,
  openPreview,
  closePreview,
  pushResizeMode,
  resizeWidgetWindow,
  stateFor
};
