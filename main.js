const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { clampSize, decideSmartSize, migrateDisplay } = require('./engine/resize-math');

let tray = null;
let dashboardWindow = null;
let activeWidgets = {};
let widgetsHidden = false;
const widgetNames = {};
const widgetFileCache = {};
const reloadTimers = {};
const suppressResize = new Set();
const suppressTimers = {};

const shortcutState = { boss: false, clickThrough: false };

const WIDGETS_DIR = path.join(app.getPath('userData'), 'widgets');
const STATE_FILE = path.join(app.getPath('userData'), 'state.json');
const LAYOUTS_FILE = path.join(app.getPath('userData'), 'layouts.json');
const RUNTIME_DIR = path.join(app.getPath('userData'), 'runtime');
const SMART_RESIZE_CLIENT = fs.readFileSync(path.join(__dirname, 'engine', 'smart-resize-client.js'), 'utf8');

if (!fs.existsSync(WIDGETS_DIR)) {
  fs.mkdirSync(WIDGETS_DIR, { recursive: true });
}

let appState = null;
let saveStateTimeout = null;

function getState() {
  if (!appState) {
    if (fs.existsSync(STATE_FILE)) {
      try {
        appState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      } catch (e) {
        console.error('Error reading state:', e);
      }
    }
    if (!appState) {
      appState = { widgets: {}, runOnBoot: false };
    }
  }
  return appState;
}

function saveState() {
  if (saveStateTimeout) clearTimeout(saveStateTimeout);
  saveStateTimeout = setTimeout(() => {
    flushState();
  }, 400);
}

function flushState() {
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
    saveStateTimeout = null;
  }
  if (!appState) return;
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(appState, null, 2));
  } catch (e) {
    console.error('Error writing state:', e);
  }
}

function freshWidgetState() {
  return migrateDisplay({
    enabled: true,
    x: undefined,
    y: undefined,
    width: undefined,
    height: undefined,
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
  const state = getState();
  if (!state.widgets[widgetId]) {
    state.widgets[widgetId] = freshWidgetState();
    saveState();
  }
  const before = state.widgets[widgetId]._displayMigrated === true;
  migrateDisplay(state.widgets[widgetId]);
  if (!before) saveState();
  return state.widgets[widgetId];
}

function updateWidgetState(widgetId, updates) {
  const wState = getWidgetState(widgetId);
  Object.assign(wState, updates);
  if (updates.config) wState.config = updates.config;
  migrateDisplay(wState);
  saveState();
  return wState;
}

function displaySnapshot(widgetId) {
  const s = getWidgetState(widgetId);
  return {
    widgetId,
    autoResize: !!s.autoResize,
    opacity: s.opacity,
    clickThrough: !!s.clickThrough,
    minWidth: s.minWidth,
    maxWidth: s.maxWidth,
    minHeight: s.minHeight,
    maxHeight: s.maxHeight
  };
}

function displayModePayload(wState) {
  return {
    enabled: !!wState.autoResize,
    minWidth: wState.minWidth,
    maxWidth: wState.maxWidth,
    minHeight: wState.minHeight,
    maxHeight: wState.maxHeight
  };
}

function notifyDisplay(widgetId) {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  dashboardWindow.webContents.send('widget-display-updated', displaySnapshot(widgetId));
}

function pushResizeMode(widgetId) {
  const win = activeWidgets[widgetId];
  const wState = getWidgetState(widgetId);
  if (win && !win.isDestroyed()) {
    win.webContents.send('widgeter:resize-mode', displayModePayload(wState));
  }
}

function resizeWidgetWindow(widgetId, win, bounds) {
  suppressResize.add(widgetId);
  clearTimeout(suppressTimers[widgetId]);
  win.setBounds(bounds);
  suppressTimers[widgetId] = setTimeout(() => suppressResize.delete(widgetId), 180);
}

function closeWidgetWindow(widgetId) {
  const existing = activeWidgets[widgetId];
  if (!existing) return;
  if (existing.watcher) {
    try { existing.watcher.close(); } catch (e) {}
    existing.watcher = null;
  }
  existing.removeAllListeners('closed');
  existing.close();
  delete activeWidgets[widgetId];
}

function layoutWorkArea() {
  const counts = new Map();
  for (const win of Object.values(activeWidgets)) {
    if (!win || win.isDestroyed()) continue;
    const display = screen.getDisplayMatching(win.getBounds());
    const key = String(display.id);
    const entry = counts.get(key) || { n: 0, area: display.workArea };
    entry.n += 1;
    counts.set(key, entry);
  }
  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n) best = entry;
  }
  return best ? best.area : screen.getPrimaryDisplay().workArea;
}

function openDashboard() {
  if (dashboardWindow) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 780,
    minHeight: 540,
    title: 'Widgeter Dashboard',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  dashboardWindow.loadFile('dashboard.html');
  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

function sendDashboardData() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;

  const state = getState();
  const widgetsList = [];

  if (fs.existsSync(WIDGETS_DIR)) {
    const files = fs.readdirSync(WIDGETS_DIR).filter(f => f.endsWith('.widget'));
    for (const file of files) {
      const wState = getWidgetState(file);
      let name = file;
      let defaultSticky = false;
      let setupHtml = null;
      let setupJs = null;
      try {
        const conf = JSON.parse(fs.readFileSync(path.join(WIDGETS_DIR, file), 'utf-8'));
        if (conf.name) name = conf.name;
        if (conf.alwaysOnTop) defaultSticky = true;
        setupHtml = conf.setupHtml || null;
        setupJs = conf.setupJs || null;
        widgetNames[file] = conf.name || file;
      } catch (e) {}

      widgetsList.push({
        id: file,
        name: name,
        enabled: wState.enabled !== false,
        sticky: wState.sticky !== undefined ? wState.sticky : defaultSticky,
        config: wState.config || {},
        setupHtml: setupHtml,
        setupJs: setupJs,
        autoResize: !!wState.autoResize,
        opacity: wState.opacity,
        clickThrough: !!wState.clickThrough,
        minWidth: wState.minWidth,
        maxWidth: wState.maxWidth,
        minHeight: wState.minHeight,
        maxHeight: wState.maxHeight
      });
    }
  }

  dashboardWindow.webContents.send('dashboard-data', {
    widgets: widgetsList,
    launchOnBoot: !!state.runOnBoot,
    shortcuts: shortcutState
  });
}

async function pickWidgetFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Load a widget',
    filters: [{ name: 'Widgeter widget', extensions: ['widget', 'json'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (canceled) return;
  for (const filePath of filePaths) {
    try {
      installWidgetFromPath(filePath);
    } catch (e) {
      dialog.showErrorBox('Installation Error', e.message);
    }
  }
}

function installWidgetFromPath(filePath) {
  let fileName = path.basename(filePath);
  if (!/\.widget$/i.test(fileName)) {
    fileName = fileName.replace(/\.json$/i, '') + '.widget';
  }
  const destPath = path.join(WIDGETS_DIR, fileName);
  if (path.resolve(filePath) !== path.resolve(destPath)) {
    fs.copyFileSync(filePath, destPath);
  }
  updateWidgetState(fileName, { enabled: true });
  loadWidgetFile(destPath, { force: true });
  updateTrayMenu();
  sendDashboardData();
}

ipcMain.on('request-dashboard-data', sendDashboardData);

ipcMain.on('toggle-widget', (event, widgetId, enabled) => {
  updateWidgetState(widgetId, { enabled });
  if (enabled) {
    loadWidgetFile(path.join(WIDGETS_DIR, widgetId), { force: true });
  } else if (activeWidgets[widgetId]) {
    activeWidgets[widgetId].close();
  }
  sendDashboardData();
});

ipcMain.on('set-widget-sticky', (event, widgetId, sticky) => {
  updateWidgetState(widgetId, { sticky });
  if (activeWidgets[widgetId] && !activeWidgets[widgetId].isDestroyed()) {
    activeWidgets[widgetId].setAlwaysOnTop(!!sticky);
  }
  sendDashboardData();
});

ipcMain.on('update-widget-config', (event, widgetId, config) => {
  updateWidgetState(widgetId, { config });
  if (activeWidgets[widgetId]) {
    loadWidgetFile(path.join(WIDGETS_DIR, widgetId), { force: true });
  }
  sendDashboardData();
});

ipcMain.on('install-widget', (event, filePath) => {
  try {
    installWidgetFromPath(filePath);
  } catch (e) {
    dialog.showErrorBox('Installation Error', e.message);
  }
});

ipcMain.on('pick-widget-file', () => {
  pickWidgetFile();
});

ipcMain.on('install-widget-content', (event, { name, content }) => {
  try {
    JSON.parse(content);
    const fileName = String(name || 'widget').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.widget';
    const destPath = path.join(WIDGETS_DIR, fileName);
    fs.writeFileSync(destPath, content);
    updateWidgetState(fileName, { enabled: true });
    loadWidgetFile(destPath, { force: true });
    sendDashboardData();
  } catch (e) {
    dialog.showErrorBox('Installation Error', e.message);
  }
});

ipcMain.handle('read-widget-file', (event, widgetId) => {
  const destPath = path.join(WIDGETS_DIR, path.basename(String(widgetId || '')));
  if (!destPath.endsWith('.widget') || !fs.existsSync(destPath)) {
    throw new Error('Widget file not found');
  }
  return fs.readFileSync(destPath, 'utf8');
});

ipcMain.on('save-widget-file', (event, payload) => {
  try {
    const parsed = JSON.parse(payload.content);
    const requested = payload.id
      ? path.basename(String(payload.id))
      : (String(parsed.name || 'custom_widget').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.widget');
    if (!requested.endsWith('.widget')) {
      throw new Error('Widget file must use the .widget extension');
    }
    const destPath = path.join(WIDGETS_DIR, requested);
    fs.writeFileSync(destPath, JSON.stringify(parsed, null, 2));
    widgetFileCache[requested] = fs.readFileSync(destPath, 'utf8');
    updateWidgetState(requested, { enabled: true });
    loadWidgetFile(destPath, { force: true });
    sendDashboardData();
    event.sender.send('widget-saved', { id: requested, name: parsed.name || requested });
  } catch (e) {
    event.sender.send('widget-save-error', e.message);
  }
});

ipcMain.on('delete-widget', (event, widgetId) => {
  try {
    if (activeWidgets[widgetId]) {
      activeWidgets[widgetId].removeAllListeners('closed');
      if (activeWidgets[widgetId].watcher) {
        try { activeWidgets[widgetId].watcher.close(); } catch (e) {}
      }
      activeWidgets[widgetId].close();
      delete activeWidgets[widgetId];
    }

    const widgetPath = path.join(WIDGETS_DIR, path.basename(widgetId));
    if (fs.existsSync(widgetPath)) fs.unlinkSync(widgetPath);

    const state = getState();
    if (state.widgets[widgetId]) {
      delete state.widgets[widgetId];
      saveState();
    }
    delete widgetNames[widgetId];
    delete widgetFileCache[widgetId];

    updateTrayMenu();
    sendDashboardData();
  } catch (e) {
    dialog.showErrorBox('Delete Error', e.message);
  }
});

ipcMain.on('set-launch-on-boot', (event, launch) => {
  const state = getState();
  state.runOnBoot = !!launch;
  saveState();
  app.setLoginItemSettings({
    openAtLogin: !!launch,
    path: app.getPath('exe'),
    args: ['--hidden']
  });
  sendDashboardData();
});

ipcMain.on('restart-app', () => {
  flushState();
  app.relaunch();
  app.exit(0);
});

ipcMain.on('open-widgets-folder', () => {
  shell.openPath(WIDGETS_DIR);
});

ipcMain.on('apply-display-settings', (event, widgetId, settings) => {
  const patch = {};
  if (settings.opacity !== undefined) patch.opacity = Number(settings.opacity);
  if (settings.autoResize !== undefined) patch.autoResize = !!settings.autoResize;
  if (settings.clickThrough !== undefined) patch.clickThrough = !!settings.clickThrough;
  for (const key of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) {
    if (settings[key] !== undefined) patch[key] = settings[key];
  }
  const wState = updateWidgetState(widgetId, patch);
  const win = activeWidgets[widgetId];
  if (win && !win.isDestroyed()) {
    win.setOpacity(wState.opacity);
    win.setIgnoreMouseEvents(!!wState.clickThrough);
    pushResizeMode(widgetId);
  }
  updateTrayMenu();
  notifyDisplay(widgetId);
});

function getLayouts() {
  if (fs.existsSync(LAYOUTS_FILE)) {
    try { return JSON.parse(fs.readFileSync(LAYOUTS_FILE, 'utf-8')); } catch (e) {}
  }
  return { saved: [] };
}

function saveLayouts(data) {
  fs.writeFileSync(LAYOUTS_FILE, JSON.stringify(data, null, 2));
}

ipcMain.handle('get-layouts', () => getLayouts());

ipcMain.handle('get-active-widget-ids', () => Object.keys(activeWidgets));

ipcMain.on('apply-layout', (event, positions) => {
  const area = layoutWorkArea();
  let applied = 0;
  const skipped = [];
  for (const pos of positions || []) {
    const win = activeWidgets[pos.widgetId];
    if (!win || win.isDestroyed()) {
      skipped.push(pos.widgetId);
      continue;
    }
    const xPct = Number(pos.x);
    const yPct = Number(pos.y);
    const wPct = Number(pos.width);
    const hPct = Number(pos.height);
    if (![xPct, yPct, wPct, hPct].every(Number.isFinite)) {
      skipped.push(pos.widgetId);
      continue;
    }
    const x = Math.round(area.x + (xPct / 100) * area.width);
    const y = Math.round(area.y + (yPct / 100) * area.height);
    const w = Math.max(1, Math.round((wPct / 100) * area.width));
    const h = Math.max(1, Math.round((hPct / 100) * area.height));
    resizeWidgetWindow(pos.widgetId, win, { x, y, width: w, height: h });
    updateWidgetState(pos.widgetId, { x, y, width: w, height: h, autoResize: false });
    pushResizeMode(pos.widgetId);
    notifyDisplay(pos.widgetId);
    applied += 1;
  }
  event.sender.send('layout-applied', { applied, skipped });
});

ipcMain.on('save-custom-layout', (event, name) => {
  const layoutData = getLayouts();
  const positions = [];
  const area = layoutWorkArea();

  for (const [id, win] of Object.entries(activeWidgets)) {
    if (!win || win.isDestroyed()) continue;
    const bounds = win.getBounds();
    positions.push({
      widgetId: id,
      x: Math.round(((bounds.x - area.x) / area.width) * 1000) / 10,
      y: Math.round(((bounds.y - area.y) / area.height) * 1000) / 10,
      width: Math.round((bounds.width / area.width) * 1000) / 10,
      height: Math.round((bounds.height / area.height) * 1000) / 10
    });
  }

  if (positions.length === 0) {
    event.sender.send('layout-save-error', 'Open at least one widget before saving a layout.');
    return;
  }

  layoutData.saved.push({ name, positions, createdAt: new Date().toISOString() });
  saveLayouts(layoutData);
  event.sender.send('layout-saved', name);
});

ipcMain.on('delete-custom-layout', (event, index) => {
  const layoutData = getLayouts();
  if (index >= 0 && index < layoutData.saved.length) {
    layoutData.saved.splice(index, 1);
    saveLayouts(layoutData);
  }
  event.sender.send('layouts-changed');
});

function scheduleReload(filePath) {
  clearTimeout(reloadTimers[filePath]);
  reloadTimers[filePath] = setTimeout(() => {
    if (fs.existsSync(filePath)) loadWidgetFile(filePath);
  }, 280);
}

function loadWidgetFile(filePath, options = {}) {
  try {
    const widgetId = path.basename(filePath);
    const wState = getWidgetState(widgetId);
    if (!wState.enabled) return;

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const unchanged = widgetFileCache[widgetId] === fileContent
      && activeWidgets[widgetId]
      && !activeWidgets[widgetId].isDestroyed();
    if (!options.force && unchanged) return;
    widgetFileCache[widgetId] = fileContent;

    const widgetConfig = JSON.parse(fileContent);
    launchWidget(widgetId, widgetConfig, filePath);
  } catch (error) {
    console.error(`Failed to load widget at ${filePath}:`, error);
  }
}

function setWidgetOpacity(widgetId, opacity) {
  const wState = updateWidgetState(widgetId, { opacity });
  const win = activeWidgets[widgetId];
  if (win && !win.isDestroyed()) win.setOpacity(wState.opacity);
  notifyDisplay(widgetId);
}

function setWidgetClickThrough(widgetId, clickThrough) {
  updateWidgetState(widgetId, { clickThrough: !!clickThrough });
  const win = activeWidgets[widgetId];
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!clickThrough);
  updateTrayMenu();
  notifyDisplay(widgetId);
}

function setWidgetsHidden(hidden) {
  widgetsHidden = !!hidden;
  for (const [id, win] of Object.entries(activeWidgets)) {
    if (!win || win.isDestroyed()) continue;
    if (widgetsHidden) {
      win.hide();
    } else {
      win.show();
      if (getWidgetState(id).clickThrough) win.setIgnoreMouseEvents(true);
    }
  }
  updateTrayMenu();
}

function clearClickThrough() {
  for (const id of Object.keys(activeWidgets)) {
    if (getWidgetState(id).clickThrough) setWidgetClickThrough(id, false);
  }
}

function launchWidget(widgetId, config, filePath = null) {
  closeWidgetWindow(widgetId);

  const wState = getWidgetState(widgetId);
  const {
    name = 'Untitled Widget',
    width = 300,
    height = 300,
    html = '',
    css = '',
    js = '',
    alwaysOnTop = false,
    draggable_body = true,
    transparent = true,
    backgroundColor = '#00000000'
  } = config;

  widgetNames[widgetId] = name;

  let finalX = wState.x !== undefined ? wState.x : config.x;
  let finalY = wState.y !== undefined ? wState.y : config.y;
  const finalWidth = wState.width !== undefined ? wState.width : width;
  const finalHeight = wState.height !== undefined ? wState.height : height;
  const displays = screen.getAllDisplays();

  if (finalX !== undefined && finalY !== undefined) {
    let isVisible = false;
    for (const display of displays) {
      const bounds = display.bounds;
      if (finalX >= bounds.x && finalX < bounds.x + bounds.width && finalY >= bounds.y && finalY < bounds.y + bounds.height) {
        isVisible = true;
        break;
      }
    }
    if (!isVisible) {
      const primary = screen.getPrimaryDisplay().workArea;
      finalX = Math.round(primary.x + (primary.width / 2) - (finalWidth / 2));
      finalY = Math.round(primary.y + (primary.height / 2) - (finalHeight / 2));
    }
  }

  const finalAlwaysOnTop = wState.sticky !== undefined ? wState.sticky : alwaysOnTop;
  const safeTitle = String(name).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  const dragRule = draggable_body ? '-webkit-app-region: drag;' : '';

  const win = new BrowserWindow({
    width: finalWidth,
    height: finalHeight,
    x: finalX,
    y: finalY,
    frame: false,
    transparent: transparent,
    backgroundColor: backgroundColor,
    alwaysOnTop: finalAlwaysOnTop,
    skipTaskbar: true,
    resizable: true,
    hasShadow: !transparent,
    roundedCorners: !transparent,
    opacity: wState.opacity,
    show: !widgetsHidden,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (wState.clickThrough) win.setIgnoreMouseEvents(true);

  const fullHtml = [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>',
    safeTitle,
    '</title><style>',
    'body{margin:0;overflow:auto;', dragRule, '}',
    'body::-webkit-scrollbar{width:6px;height:6px;}',
    'body::-webkit-scrollbar-thumb{background-color:rgba(166,173,200,0.3);border-radius:4px;}',
    'body::-webkit-scrollbar-track{background:transparent;}',
    'button,a,input,textarea,select,.no-drag{-webkit-app-region:no-drag;}',
    css,
    'html.widgeter-smart body{overflow-x:hidden !important;overflow-y:auto !important;}',
    '#widgeter-resize-grip{position:fixed;right:1px;bottom:1px;width:16px;height:16px;cursor:nwse-resize;z-index:2147483646;-webkit-app-region:no-drag;',
    'background:linear-gradient(135deg,transparent 0 50%,rgba(205,214,244,0.92) 50% 100%);}',
    '</style></head><body>',
    html,
    '<script>',
    String(js).replace(/<\/script/gi, '<\\/script'),
    '</script><script>window.__widgeterDisplay=',
    JSON.stringify(displayModePayload(wState)),
    ';</script><script>',
    SMART_RESIZE_CLIENT,
    '</script></body></html>'
  ].join('');

  if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const htmlPath = path.join(RUNTIME_DIR, widgetId.replace(/[^a-z0-9._-]/gi, '_') + '.html');
  fs.writeFileSync(htmlPath, fullHtml, 'utf8');
  // Showing a new window emits resize. Ignore that so it does not turn Smart resize off.
  suppressResize.add(widgetId);
  win.webContents.once('did-finish-load', () => {
    clearTimeout(suppressTimers[widgetId]);
    suppressTimers[widgetId] = setTimeout(() => suppressResize.delete(widgetId), 400);
  });
  win.loadFile(htmlPath);

  win.on('moved', () => {
    if (win.isDestroyed()) return;
    const [nx, ny] = win.getPosition();
    updateWidgetState(widgetId, { x: nx, y: ny });
  });

  win.on('resized', () => {
    if (win.isDestroyed()) return;
    const [nw, nh] = win.getSize();
    if (suppressResize.has(widgetId)) {
      updateWidgetState(widgetId, { width: nw, height: nh });
      return;
    }
    updateWidgetState(widgetId, { width: nw, height: nh, autoResize: false });
    pushResizeMode(widgetId);
    notifyDisplay(widgetId);
  });

  win.on('closed', () => {
    if (win.watcher) {
      try { win.watcher.close(); } catch (e) {}
    }
    if (activeWidgets[widgetId] === win) delete activeWidgets[widgetId];
    updateTrayMenu();
  });

  win.webContents.on('context-menu', () => {
    if (getWidgetState(widgetId).clickThrough) return;
    const current = getWidgetState(widgetId);
    const menu = Menu.buildFromTemplate([
      { label: 'Reload Widget', click: () => loadWidgetFile(filePath || path.join(WIDGETS_DIR, widgetId), { force: true }) },
      { type: 'separator' },
      {
        label: 'Smart resize',
        type: 'checkbox',
        checked: !!current.autoResize,
        click: (item) => {
          updateWidgetState(widgetId, { autoResize: item.checked });
          pushResizeMode(widgetId);
          notifyDisplay(widgetId);
        }
      },
      {
        label: 'Opacity',
        submenu: [1, 0.75, 0.5, 0.25].map((value) => ({
          label: Math.round(value * 100) + '%',
          type: 'radio',
          checked: Math.abs(current.opacity - value) < 0.02,
          click: () => setWidgetOpacity(widgetId, value)
        }))
      },
      {
        label: current.clickThrough ? 'Disable Click-Through' : 'Enable Click-Through',
        click: () => setWidgetClickThrough(widgetId, !current.clickThrough)
      },
      { type: 'separator' },
      { label: 'Open Dashboard', click: () => openDashboard() },
      {
        label: 'Close Widget',
        click: () => {
          updateWidgetState(widgetId, { enabled: false });
          win.close();
          sendDashboardData();
        }
      }
    ]);
    menu.popup();
  });

  if (filePath && fs.existsSync(filePath)) {
    try {
      win.watcher = fs.watch(filePath, () => scheduleReload(filePath));
    } catch (e) {
      console.error('Watch failed', e);
    }
  }

  activeWidgets[widgetId] = win;
  updateTrayMenu();
}

function getWidgetIdFromWebContents(webContents) {
  for (const [id, win] of Object.entries(activeWidgets)) {
    if (win.webContents === webContents) return id;
  }
  return null;
}

ipcMain.handle('widgeter:getConfig', (event, key) => {
  const widgetId = getWidgetIdFromWebContents(event.sender);
  if (!widgetId) return null;
  const state = getWidgetState(widgetId);
  return state.config ? state.config[key] : undefined;
});

ipcMain.handle('widgeter:setConfig', (event, key, value) => {
  const widgetId = getWidgetIdFromWebContents(event.sender);
  if (!widgetId) return false;
  const state = getWidgetState(widgetId);
  if (!state.config) state.config = {};
  state.config[key] = value;
  saveState();
  sendDashboardData();
  return true;
});

ipcMain.on('widgeter:auto-resize', (event, payload) => {
  const widgetId = getWidgetIdFromWebContents(event.sender);
  if (!widgetId) return;
  const wState = getWidgetState(widgetId);
  if (!wState.autoResize) return;
  const win = activeWidgets[widgetId];
  if (!win || win.isDestroyed()) return;

  const bounds = win.getBounds();
  const decided = decideSmartSize(bounds, { width: payload.width, height: payload.height });
  const next = clampSize(decided.width, decided.height, wState);
  if (next.width === bounds.width && next.height === bounds.height) return;

  resizeWidgetWindow(widgetId, win, { x: bounds.x, y: bounds.y, width: next.width, height: next.height });
  updateWidgetState(widgetId, { width: next.width, height: next.height, autoResize: true });
});

ipcMain.on('widgeter:user-resize', (event, payload) => {
  const widgetId = getWidgetIdFromWebContents(event.sender);
  if (!widgetId) return;
  const win = activeWidgets[widgetId];
  if (!win || win.isDestroyed()) return;

  const wState = getWidgetState(widgetId);
  const bounds = win.getBounds();
  const smart = !!wState.autoResize;
  const next = smart
    ? clampSize(payload.width, bounds.height, wState)
    : clampSize(payload.width, payload.height, wState);

  if (next.width !== bounds.width || next.height !== bounds.height) {
    resizeWidgetWindow(widgetId, win, { x: bounds.x, y: bounds.y, width: next.width, height: next.height });
  }
  updateWidgetState(widgetId, { width: next.width, height: next.height, autoResize: smart });
  if (payload.done) notifyDisplay(widgetId);
});

function updateTrayMenu() {
  if (!tray) return;

  const menuTemplate = [
    { label: 'Widgeter', enabled: false },
    { type: 'separator' },
    { label: 'Dashboard', click: () => openDashboard() },
    { label: 'Load Widget…', click: () => { pickWidgetFile(); } },
    { label: 'Open Widgets Folder', click: () => shell.openPath(WIDGETS_DIR) },
    {
      label: widgetsHidden ? 'Show Widgets' : 'Hide Widgets',
      click: () => setWidgetsHidden(!widgetsHidden)
    },
    { label: 'Exit Click-Through', click: () => clearClickThrough() },
    { type: 'separator' },
    { label: 'Active Widgets', enabled: false }
  ];

  for (const [id, win] of Object.entries(activeWidgets)) {
    const wState = getWidgetState(id);
    menuTemplate.push({
      label: widgetNames[id] || id,
      submenu: [
        {
          label: wState.clickThrough ? 'Disable Click-Through' : 'Enable Click-Through',
          click: () => setWidgetClickThrough(id, !wState.clickThrough)
        },
        {
          label: wState.autoResize ? 'Use Fixed Size' : 'Use Smart Resize',
          click: () => {
            updateWidgetState(id, { autoResize: !wState.autoResize });
            pushResizeMode(id);
            notifyDisplay(id);
          }
        },
        { type: 'separator' },
        {
          label: 'Close Widget',
          click: () => {
            updateWidgetState(id, { enabled: false });
            if (win && !win.isDestroyed()) win.close();
            sendDashboardData();
          }
        }
      ]
    });
  }

  if (Object.keys(activeWidgets).length === 0) {
    menuTemplate.push({ label: '(None)', enabled: false });
  }

  menuTemplate.push({ type: 'separator' });
  menuTemplate.push({ label: 'Exit', click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

function loadAllSavedWidgets() {
  fs.readdir(WIDGETS_DIR, (err, files) => {
    if (err) return;
    files.filter(f => f.endsWith('.widget')).forEach(file => {
      loadWidgetFile(path.join(WIDGETS_DIR, file));
    });
  });
}

function installWidgetsFromArgv(argv) {
  for (const arg of argv || []) {
    if (/\.widget$/i.test(arg) && fs.existsSync(arg)) {
      try { installWidgetFromPath(arg); } catch (e) { console.error(e); }
    }
  }
}

const isHidden = process.argv.includes('--hidden');
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    installWidgetsFromArgv(commandLine);
    if (dashboardWindow) {
      if (dashboardWindow.isMinimized()) dashboardWindow.restore();
      dashboardWindow.focus();
    } else {
      openDashboard();
    }
  });

  app.whenReady().then(() => {
    const { nativeImage } = require('electron');
    const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA6SURBVDhPY3iPz/6fAR0wMRAGMII1MoymGwZ4zP2Pz3yQgYmBjoYhAwOMpmsGeMz9j898kIH///8HAJ06ChD6U38mAAAAAElFTkSuQmCC';
    tray = new Tray(nativeImage.createFromDataURL('data:image/png;base64,' + iconBase64));
    tray.setToolTip('Widgeter');
    tray.on('click', () => openDashboard());
    updateTrayMenu();

    shortcutState.boss = globalShortcut.register('CommandOrControl+Shift+W', () => {
      setWidgetsHidden(!widgetsHidden);
    });
    shortcutState.clickThrough = globalShortcut.register('CommandOrControl+Shift+X', () => {
      clearClickThrough();
    });

    const sampleWidgetPath = path.join(WIDGETS_DIR, 'service-health.widget');
    if (!fs.existsSync(sampleWidgetPath)) {
      const sampleWidget = {
        name: 'Service Health Monitor',
        width: 320,
        height: 260,
        draggable_body: true,
        html: "<div class='container'><h2><span class='status-dot'></span>Service Health</h2><div id='services'></div><div class='controls'><button class='no-drag' onclick='refreshAll()'>Refresh Now</button></div></div>",
        css: "body { margin: 0; padding: 15px; font-family: 'Segoe UI', system-ui, sans-serif; background: rgba(15, 15, 20, 0.95); color: #e0e0e0; border-radius: 12px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0,0,0,0.5); } h2 { margin: 0 0 15px 0; font-size: 16px; font-weight: 600; display: flex; align-items: center; color: #fff; } .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #00ffcc; margin-right: 10px; box-shadow: 0 0 8px #00ffcc; } .service-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); } .service-row:last-child { border-bottom: none; } .service-name { font-size: 14px; } .service-status { font-size: 12px; padding: 3px 8px; border-radius: 4px; font-weight: bold; } .status-up { background: rgba(0, 255, 100, 0.2); color: #00ff64; } .status-down { background: rgba(255, 50, 50, 0.2); color: #ff3232; } .status-checking { background: rgba(255, 200, 50, 0.2); color: #ffc832; } .controls { margin-top: 15px; text-align: center; } button { background: #333; color: #fff; border: 1px solid #555; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: background 0.2s; } button:hover { background: #444; }",
        js: "const https = require('https'); const services = [ { name: 'GitHub API', url: 'https://api.github.com' }, { name: 'Cloudflare', url: 'https://1.1.1.1' }, { name: 'Google DNS', url: 'https://8.8.8.8' } ]; function checkService(service, elId) { const el = document.getElementById(elId); el.className = 'service-status status-checking'; el.innerText = 'Checking...'; const req = https.get(service.url, { headers: { 'User-Agent': 'Widgeter-Health-Check' }, timeout: 5000 }, (res) => { if (res.statusCode >= 200 && res.statusCode < 400) { el.className = 'service-status status-up'; el.innerText = 'Online'; } else { el.className = 'service-status status-down'; el.innerText = `Error ${res.statusCode}`; } }).on('error', (e) => { el.className = 'service-status status-down'; el.innerText = 'Offline'; }); req.setTimeout(5000, () => { req.destroy(); el.className = 'service-status status-down'; el.innerText = 'Timeout'; }); } window.refreshAll = function() { const container = document.getElementById('services'); container.innerHTML = ''; services.forEach((srv, index) => { const row = document.createElement('div'); row.className = 'service-row'; row.innerHTML = `<span class='service-name'>${srv.name}</span><span id='srv-${index}' class='service-status status-checking'>Wait...</span>`; container.appendChild(row); checkService(srv, `srv-${index}`); }); }; refreshAll(); setInterval(refreshAll, 60000);"
      };
      fs.writeFileSync(sampleWidgetPath, JSON.stringify(sampleWidget, null, 2));
    }

    loadAllSavedWidgets();
    installWidgetsFromArgv(process.argv);

    if (!isHidden) openDashboard();
  });

  app.on('before-quit', () => {
    flushState();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // Tray app: closing the dashboard does not quit.
  });
}
