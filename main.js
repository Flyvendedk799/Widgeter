const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;
let dashboardWindow = null;
let activeWidgets = {}; // map of widgetId -> BrowserWindow

const WIDGETS_DIR = path.join(app.getPath('userData'), 'widgets');
const STATE_FILE = path.join(app.getPath('userData'), 'state.json');

// Ensure widgets directory exists
if (!fs.existsSync(WIDGETS_DIR)) {
  fs.mkdirSync(WIDGETS_DIR, { recursive: true });
}

// State Management
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
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  saveStateTimeout = setTimeout(() => {
    fs.writeFileSync(STATE_FILE, JSON.stringify(appState, null, 2));
    saveStateTimeout = null;
  }, 500); // 500ms debounce
}

function getWidgetState(widgetId) {
  const state = getState();
  if (!state.widgets[widgetId]) {
    state.widgets[widgetId] = { enabled: true, x: undefined, y: undefined, width: undefined, height: undefined, autoResize: true, opacity: 1.0, clickThrough: false, config: {} };
    saveState();
  }
  return state.widgets[widgetId];
}

function updateWidgetState(widgetId, updates) {
  const state = getState();
  if (!state.widgets[widgetId]) {
    state.widgets[widgetId] = { enabled: true, x: undefined, y: undefined, width: undefined, height: undefined, autoResize: true, opacity: 1.0, clickThrough: false, config: {} };
  }
  state.widgets[widgetId] = { ...state.widgets[widgetId], ...updates };
  saveState();
}

// Dashboard Window
function openDashboard() {
  if (dashboardWindow) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 850,
    height: 600,
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
  if (!dashboardWindow) return;
  
  const state = getState();
  const widgetsList = [];
  
  if (fs.existsSync(WIDGETS_DIR)) {
    const files = fs.readdirSync(WIDGETS_DIR).filter(f => f.endsWith('.widget'));
    for (const file of files) {
      const wState = state.widgets[file] || { enabled: true, config: {} };
      let name = file;
      let defaultSticky = false;
      let setupHtml = null;
      let setupJs = null;
      try {
        const conf = JSON.parse(fs.readFileSync(path.join(WIDGETS_DIR, file), 'utf-8'));
        if (conf.name) name = conf.name;
        if (conf.alwaysOnTop) defaultSticky = true;
        setupHtml = conf.setupHtml;
        setupJs = conf.setupJs;
      } catch(e) {}
      
      widgetsList.push({
        id: file,
        name: name,
        enabled: wState.enabled,
        sticky: wState.sticky !== undefined ? wState.sticky : defaultSticky,
        config: wState.config,
        setupHtml: setupHtml,
        setupJs: setupJs
      });
    }
  }
  
  dashboardWindow.webContents.send('dashboard-data', {
    widgets: widgetsList,
    launchOnBoot: state.runOnBoot
  });
}

ipcMain.on('request-dashboard-data', sendDashboardData);

ipcMain.on('toggle-widget', (event, widgetId, enabled) => {
  updateWidgetState(widgetId, { enabled });
  if (enabled) {
    loadWidgetFile(path.join(WIDGETS_DIR, widgetId));
  } else {
    if (activeWidgets[widgetId]) {
      activeWidgets[widgetId].close();
    }
  }
  sendDashboardData();
});

ipcMain.on('set-widget-sticky', (event, widgetId, sticky) => {
  updateWidgetState(widgetId, { sticky });
  if (activeWidgets[widgetId]) {
    activeWidgets[widgetId].setAlwaysOnTop(sticky);
  }
  sendDashboardData();
});

ipcMain.on('update-widget-config', (event, widgetId, config) => {
  updateWidgetState(widgetId, { config });
  
  // Reload the widget if running so it gets new config
  if (activeWidgets[widgetId]) {
      loadWidgetFile(path.join(WIDGETS_DIR, widgetId));
  }
  sendDashboardData();
});

ipcMain.on('install-widget', (event, filePath) => {
  try {
    const fileName = path.basename(filePath);
    const destPath = path.join(WIDGETS_DIR, fileName);
    if (filePath !== destPath) {
      fs.copyFileSync(filePath, destPath);
    }
    updateWidgetState(fileName, { enabled: true });
    loadWidgetFile(destPath);
    sendDashboardData();
  } catch (e) {
    dialog.showErrorBox('Installation Error', e.message);
  }
});

ipcMain.on('install-widget-content', (event, { name, content }) => {
  try {
    const fileName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.widget';
    const destPath = path.join(WIDGETS_DIR, fileName);
    fs.writeFileSync(destPath, content);
    updateWidgetState(fileName, { enabled: true });
    loadWidgetFile(destPath);
    sendDashboardData();
  } catch (e) {
    dialog.showErrorBox('Installation Error', e.message);
  }
});

ipcMain.on('delete-widget', (event, widgetId) => {
  try {
    if (activeWidgets[widgetId]) {
      activeWidgets[widgetId].removeAllListeners('closed');
      activeWidgets[widgetId].close();
      delete activeWidgets[widgetId];
    }
    
    const widgetPath = path.join(WIDGETS_DIR, widgetId);
    if (fs.existsSync(widgetPath)) {
      fs.unlinkSync(widgetPath);
    }
    
    const state = getState();
    if (state.widgets[widgetId]) {
      delete state.widgets[widgetId];
      saveState();
    }
    
    updateTrayMenu();
    sendDashboardData();
  } catch (e) {
    dialog.showErrorBox('Delete Error', e.message);
  }
});

ipcMain.on('set-launch-on-boot', (event, launch) => {
  const state = getState();
  state.runOnBoot = launch;
  saveState();
  
  app.setLoginItemSettings({
    openAtLogin: launch,
    path: app.getPath('exe'),
    args: ['--hidden']
  });
  
  sendDashboardData();
});


// Widget Loading and Lifecycle
function loadWidgetFile(filePath) {
  try {
    const widgetId = path.basename(filePath);
    const wState = getWidgetState(widgetId);
    
    if (!wState.enabled) return; // Don't load if disabled

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const widgetConfig = JSON.parse(fileContent);
    launchWidget(widgetId, widgetConfig, filePath);
  } catch (error) {
    console.error(`Failed to load widget at ${filePath}:`, error);
  }
}

function setWidgetOpacity(widgetId, opacity) {
  updateWidgetState(widgetId, { opacity });
  if (activeWidgets[widgetId]) {
    activeWidgets[widgetId].setOpacity(opacity);
  }
}

function setWidgetClickThrough(widgetId, clickThrough) {
  updateWidgetState(widgetId, { clickThrough });
  if (activeWidgets[widgetId]) {
    activeWidgets[widgetId].setIgnoreMouseEvents(clickThrough);
  }
  updateTrayMenu(); // Update tray to show disabled state
}

function launchWidget(widgetId, config, filePath = null) {
  if (activeWidgets[widgetId]) {
    activeWidgets[widgetId].removeAllListeners('closed'); // prevent tray update conflict temporarily
    activeWidgets[widgetId].close();
  }

  const wState = getWidgetState(widgetId);

  const {
    name = "Untitled Widget",
    width = 300,
    height = 300,
    html = "",
    css = "",
    js = "",
    alwaysOnTop = false,
    draggable_body = true,
    transparent = true,
    backgroundColor = '#00000000'
  } = config;

  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  
  // Use saved coordinates/size if they exist
  let finalX = wState.x !== undefined ? wState.x : config.x;
  let finalY = wState.y !== undefined ? wState.y : config.y;
  const finalWidth = wState.width !== undefined ? wState.width : width;
  const finalHeight = wState.height !== undefined ? wState.height : height;
  
  // Off-screen protection
  if (finalX !== undefined && finalY !== undefined) {
      let isVisible = false;
      for (const display of displays) {
          const { x, y, width: dw, height: dh } = display.bounds;
          if (finalX >= x && finalX < x + dw && finalY >= y && finalY < y + dh) {
              isVisible = true;
              break;
          }
      }
      if (!isVisible) {
          // Reset to primary display center
          const primary = screen.getPrimaryDisplay().workArea;
          finalX = primary.x + (primary.width / 2) - (finalWidth / 2);
          finalY = primary.y + (primary.height / 2) - (finalHeight / 2);
      }
  }

  const finalAlwaysOnTop = wState.sticky !== undefined ? wState.sticky : alwaysOnTop;
  const finalOpacity = wState.opacity !== undefined ? wState.opacity : 1.0;
  const finalClickThrough = wState.clickThrough !== undefined ? wState.clickThrough : false;

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
    opacity: finalOpacity,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Node integration kept as before
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  if (finalClickThrough) {
    win.setIgnoreMouseEvents(true);
  }

  // Construct the HTML document
  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${name}</title>
      <style>
        body {
          margin: 0;
          overflow: hidden;
          ${draggable_body ? '-webkit-app-region: drag;' : ''}
        }
        button, a, input, textarea, select, .no-drag {
          -webkit-app-region: no-drag;
        }
        ${css}
      </style>
    </head>
    <body>
      ${html}
      <script>
        ${js}
      </script>
    </body>
    </html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

  // Position and Size tracking
  win.on('moved', () => {
    const [nx, ny] = win.getPosition();
    updateWidgetState(widgetId, { x: nx, y: ny });
  });

  win.on('resized', () => {
    const [nw, nh] = win.getSize();
    updateWidgetState(widgetId, { width: nw, height: nh, autoResize: false });
  });

  win.on('closed', () => {
    delete activeWidgets[widgetId];
    if (win.watcher) win.watcher.close();
    updateTrayMenu();
  });
  
  // Context Menu for QoL
  win.webContents.on('context-menu', (e, params) => {
      // Do not show menu if in click-through mode (though events are ignored anyway)
      if (getWidgetState(widgetId).clickThrough) return;
      
      const menuTemplate = [
          { label: 'Reload Widget', click: () => loadWidgetFile(filePath || path.join(WIDGETS_DIR, widgetId)) },
          { type: 'separator' },
          { label: 'Reset to Auto-Size', click: () => {
              updateWidgetState(widgetId, { autoResize: true, width: undefined, height: undefined });
              loadWidgetFile(filePath || path.join(WIDGETS_DIR, widgetId));
          }},
          { type: 'separator' },
          { label: 'Opacity', submenu: [
              { label: '100%', click: () => setWidgetOpacity(widgetId, 1.0) },
              { label: '75%', click: () => setWidgetOpacity(widgetId, 0.75) },
              { label: '50%', click: () => setWidgetOpacity(widgetId, 0.5) },
              { label: '25%', click: () => setWidgetOpacity(widgetId, 0.25) }
          ]},
          { label: 'Enable Click-Through Mode', click: () => setWidgetClickThrough(widgetId, true) },
          { type: 'separator' },
          { label: 'Open Dashboard', click: () => openDashboard() },
          { label: 'Close Widget', click: () => {
              updateWidgetState(widgetId, { enabled: false });
              win.close();
              sendDashboardData();
          }}
      ];
      const menu = Menu.buildFromTemplate(menuTemplate);
      menu.popup();
  });

  // Optional: Auto-reload if file changes
  if (filePath && fs.existsSync(filePath)) {
    win.watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        setTimeout(() => {
          if (!win.isDestroyed()) {
             loadWidgetFile(filePath);
          }
        }, 500); // debounce
      }
    });
  }

  activeWidgets[widgetId] = win;
  updateTrayMenu();
}


// Preload Widget API Handlers
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
  const state = getState();
  if (!state.widgets[widgetId]) state.widgets[widgetId] = { enabled: true, config: {} };
  if (!state.widgets[widgetId].config) state.widgets[widgetId].config = {};
  state.widgets[widgetId].config[key] = value;
  saveState();
  
  sendDashboardData(); // Update dashboard if open
  return true;
});

// Auto-resize IPC
ipcMain.on('widgeter:auto-resize', (event, { width, height }) => {
    const widgetId = getWidgetIdFromWebContents(event.sender);
    if (!widgetId) return;
    
    const wState = getWidgetState(widgetId);
    // Only auto-resize if the user hasn't manually overridden the size
    if (wState.autoResize !== false) {
        const win = activeWidgets[widgetId];
        if (win && !win.isDestroyed()) {
            const bounds = win.getBounds();
            // Optional limits for auto-size
            const newWidth = Math.min(Math.max(Math.ceil(width), 100), 1000);
            const newHeight = Math.min(Math.max(Math.ceil(height), 100), 1200);
            if (bounds.width !== newWidth || bounds.height !== newHeight) {
                win.setBounds({ x: bounds.x, y: bounds.y, width: newWidth, height: newHeight });
            }
        }
    }
});


// System Tray
function updateTrayMenu() {
  if (!tray) return;

  const menuTemplate = [
    { label: 'Widgeter Engine', enabled: false },
    { type: 'separator' },
    { label: 'Dashboard', click: () => openDashboard() },
    { label: 'Open Widgets Folder', click: () => shell.openPath(WIDGETS_DIR) },
    { type: 'separator' },
    { label: 'Active Widgets', enabled: false }
  ];

  for (const [id, win] of Object.entries(activeWidgets)) {
    const wState = getWidgetState(id);
    menuTemplate.push({
      label: id,
      submenu: [
          { label: wState.clickThrough ? 'Disable Click-Through' : 'Enable Click-Through', click: () => setWidgetClickThrough(id, !wState.clickThrough) },
          { label: 'Reset Size', click: () => { updateWidgetState(id, { autoResize: true, width: undefined, height: undefined }); loadWidgetFile(path.join(WIDGETS_DIR, id)); } },
          { type: 'separator' },
          { label: 'Close Widget', click: () => {
              updateWidgetState(id, { enabled: false });
              if (win && !win.isDestroyed()) win.close();
              sendDashboardData();
          }}
      ]
    });
  }

  if (Object.keys(activeWidgets).length === 0) {
    menuTemplate.push({ label: '(None)', enabled: false });
  }

  menuTemplate.push({ type: 'separator' });
  menuTemplate.push({ label: 'Exit', click: () => app.quit() });

  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

function loadAllSavedWidgets() {
  fs.readdir(WIDGETS_DIR, (err, files) => {
    if (err) return;
    files.filter(f => f.endsWith('.widget')).forEach(file => {
      loadWidgetFile(path.join(WIDGETS_DIR, file));
    });
  });
}

// App lifecycle
const isHidden = process.argv.includes('--hidden');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (dashboardWindow) {
      if (dashboardWindow.isMinimized()) dashboardWindow.restore();
      dashboardWindow.focus();
    } else {
      openDashboard();
    }
  });

  app.whenReady().then(() => {
    const { nativeImage } = require('electron');
    const iconBase64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA6SURBVDhPY3iPz/6fAR0wMRAGMII1MoymGwZ4zP2Pz3yQgYmBjoYhAwOMpmsGeMz9j898kIH///8HAJ06ChD6U38mAAAAAElFTkSuQmCC"; // simple 16x16 red square
    tray = new Tray(nativeImage.createFromDataURL('data:image/png;base64,' + iconBase64));
    tray.setToolTip('Widgeter Engine');
    tray.on('click', () => {
      openDashboard();
    });
    
    updateTrayMenu();
    
    // Global Shortcut to toggle all widgets
    globalShortcut.register('CommandOrControl+Shift+W', () => {
        const wins = Object.values(activeWidgets);
        if (wins.length === 0) return;
        // Check visibility of the first active widget
        const isVisible = wins[0].isVisible();
        wins.forEach(win => {
            if (win && !win.isDestroyed()) {
                if (isVisible) {
                    win.hide();
                } else {
                    win.show();
                    // Restore click-through mode if it was enabled (hide/show resets it on some platforms)
                    const widgetId = getWidgetIdFromWebContents(win.webContents);
                    if (widgetId && getWidgetState(widgetId).clickThrough) {
                        win.setIgnoreMouseEvents(true);
                    }
                }
            }
        });
    });
    
    // Create a default widget if none exist to show it works
    const sampleWidgetPath = path.join(WIDGETS_DIR, 'service-health.widget');
    if (!fs.existsSync(sampleWidgetPath)) {
      const sampleWidget = {
        name: "Service Health Monitor",
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

    if (!isHidden) {
      openDashboard();
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // Tray app, do not quit when windows are closed
  });
}
