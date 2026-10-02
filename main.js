// Widgets deliberately run with Node integration; the dev-time CSP warning is noise in their logs.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const { app, BrowserWindow, Tray, Menu, shell, globalShortcut, powerMonitor, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

const P = require('./app/paths');
const S = require('./app/state');
const W = require('./app/widgets');
const gallery = require('./app/gallery');
const layouts = require('./app/layouts');
const updater = require('./app/updater');
const ipc = require('./app/ipc');

let tray = null;
let dashboardWindow = null;
const shortcutState = { boss: false, clickThrough: false };

// ---- dashboard window ------------------------------------------------------------

function dashboardAlive() {
  return dashboardWindow && !dashboardWindow.isDestroyed();
}

function sendDashboard(channel, payload) {
  if (dashboardAlive()) dashboardWindow.webContents.send(channel, payload);
}

function openDashboard(view) {
  if (dashboardAlive()) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.show();
    dashboardWindow.focus();
    if (view) sendDashboard('dash:navigate', view);
    return;
  }
  dashboardWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: 'Widgeter',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#11111b' : '#f4f5f9',
    icon: fs.existsSync(P.ICON_FILE) ? P.ICON_FILE : undefined,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  dashboardWindow.removeMenu();
  dashboardWindow.loadFile(path.join(P.DASHBOARD_DIR, 'index.html'));
  if (view) dashboardWindow.webContents.once('did-finish-load', () => sendDashboard('dash:navigate', view));
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
}

// ---- change notifications ----------------------------------------------------------

let changeTimer = null;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    sendDashboard('dash:changed');
    updateTrayMenu();
  }, 80);
}

function setHidden(hidden) {
  W.setHidden(hidden);
  updateTrayMenu();
  sendDashboard('dash:changed');
}

const ctx = { shortcutState, changed, setHidden };

W.init({
  changed,
  health: (id) => sendDashboard('dash:health', { id, health: W.healthOf(id, W.entryById(id)) }),
  log: (id, entry) => sendDashboard('dash:log', { id, entry }),
  display: (id) => {
    const s = S.getWidgetState(id);
    sendDashboard('dash:display', { id, autoResize: !!s.autoResize, opacity: s.opacity, clickThrough: !!s.clickThrough, minWidth: s.minWidth, maxWidth: s.maxWidth, minHeight: s.minHeight, maxHeight: s.maxHeight });
  },
  openDashboard: () => openDashboard(),
  openLogs: (id) => openDashboard({ view: 'widgets', logs: id })
});

// ---- tray ------------------------------------------------------------------------

function updateTrayMenu() {
  if (!tray) return;
  const profiles = layouts.getData().saved.map((entry, index) => ({ entry, index }));
  const template = [
    { label: 'Widgeter', enabled: false },
    { type: 'separator' },
    { label: 'Dashboard', click: () => openDashboard() },
    { label: 'Add Widgets…', click: () => openDashboard({ view: 'discover' }) },
    { label: 'Open Widgets Folder', click: () => shell.openPath(P.WIDGETS_DIR) },
    { label: W.isHidden() ? 'Show Widgets' : 'Hide Widgets', click: () => setHidden(!W.isHidden()) },
    { label: 'Exit Click-Through', click: () => W.clearAllClickThrough() }
  ];

  if (profiles.length) {
    template.push({
      label: 'Profiles & Layouts',
      submenu: profiles.map(({ entry, index }) => ({
        label: (entry.kind === 'profile' ? '● ' : '▦ ') + entry.name,
        click: () => { try { layouts.activate(index); changed(); } catch (e) { /* layout may be gone */ } }
      }))
    });
  }

  template.push({ type: 'separator' }, { label: 'Active Widgets', enabled: false });
  const active = W.activeWindows();
  for (const [id] of active) {
    const entry = W.entryById(id);
    const st = S.getWidgetState(id);
    template.push({
      label: (entry && entry.manifest && entry.manifest.name) || id,
      submenu: [
        { label: 'Reload', click: () => W.load(id, { force: true }) },
        { label: st.clickThrough ? 'Disable Click-Through' : 'Enable Click-Through', click: () => W.setClickThrough(id, !st.clickThrough) },
        { label: st.autoResize ? 'Use Fixed Size' : 'Use Smart Resize', click: () => { W.applyDisplaySettings(id, { autoResize: !st.autoResize }); } },
        { type: 'separator' },
        { label: 'Close Widget', click: () => W.setEnabled(id, false) }
      ]
    });
  }
  if (!active.length) template.push({ label: '(None)', enabled: false });
  template.push({ type: 'separator' }, { label: 'Exit', click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function trayIcon() {
  const iconPath = path.join(path.dirname(P.ICON_FILE), 'tray.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  if (fs.existsSync(P.ICON_FILE)) return nativeImage.createFromPath(P.ICON_FILE).resize({ width: 16, height: 16 });
  return nativeImage.createEmpty();
}

// ---- startup ---------------------------------------------------------------------

function installFromArgv(argv) {
  for (const arg of argv || []) {
    if (/\.widget$/i.test(arg) && fs.existsSync(arg)) {
      try { W.installFromPath(arg); } catch (e) { console.error('Could not install ' + arg + ': ' + e.message); }
    }
  }
}

const startHidden = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  ipc.register(ctx);

  app.on('second-instance', (event, commandLine) => {
    installFromArgv(commandLine);
    openDashboard();
  });

  app.whenReady().then(() => {
    tray = new Tray(trayIcon());
    tray.setToolTip('Widgeter');
    tray.on('click', () => openDashboard());

    shortcutState.boss = globalShortcut.register('CommandOrControl+Shift+W', () => setHidden(!W.isHidden()));
    shortcutState.clickThrough = globalShortcut.register('CommandOrControl+Shift+X', () => W.clearAllClickThrough());

    // Stop polling while the PC is asleep or locked.
    for (const ev of ['suspend', 'lock-screen']) powerMonitor.on(ev, () => W.setPaused(true));
    for (const ev of ['resume', 'unlock-screen']) powerMonitor.on(ev, () => W.setPaused(false));
    nativeTheme.on('updated', () => { if (S.getSettings().theme === 'system') W.applyTheme(); });

    updater.init((status) => sendDashboard('dash:updater', status));

    try { gallery.migrateLegacy(); } catch (e) { console.error('Legacy migration failed:', e); }
    W.loadAll();
    W.watchWidgetsDir();
    installFromArgv(process.argv);
    updateTrayMenu();

    if (!startHidden) openDashboard();
  });

  app.on('before-quit', () => S.flushState());
  app.on('will-quit', () => globalShortcut.unregisterAll());
  // Tray app: closing the dashboard does not quit.
  app.on('window-all-closed', () => {});
}
