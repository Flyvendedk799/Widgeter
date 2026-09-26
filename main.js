const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;
let activeWidgets = {}; // map of widgetId -> BrowserWindow

const WIDGETS_DIR = path.join(app.getPath('userData'), 'widgets');

// Ensure widgets directory exists
if (!fs.existsSync(WIDGETS_DIR)) {
  fs.mkdirSync(WIDGETS_DIR, { recursive: true });
}

function loadWidgetFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const widgetConfig = JSON.parse(fileContent);
    launchWidget(path.basename(filePath), widgetConfig, filePath);
  } catch (error) {
    console.error(`Failed to load widget at ${filePath}:`, error);
    dialog.showErrorBox('Widget Load Error', `Could not load widget: ${error.message}`);
  }
}

function launchWidget(widgetId, config, filePath = null) {
  if (activeWidgets[widgetId]) {
    // Already running, close it to restart
    activeWidgets[widgetId].close();
  }

  const {
    name = "Untitled Widget",
    width = 300,
    height = 300,
    x = undefined,
    y = undefined,
    html = "",
    css = "",
    js = "",
    alwaysOnTop = false,
    draggable_body = true,
    transparent = true,
    backgroundColor = '#00000000'
  } = config;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: transparent,
    backgroundColor: backgroundColor,
    alwaysOnTop: alwaysOnTop,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Allowing node integration for local system access in widgets
    }
  });

  // Construct the HTML document
  const fullHtml = \`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>\${name}</title>
      <style>
        body {
          margin: 0;
          overflow: hidden;
          \${draggable_body ? '-webkit-app-region: drag;' : ''}
        }
        /* Disable dragging on clickable elements */
        button, a, input, textarea, select, .no-drag {
          -webkit-app-region: no-drag;
        }
        \${css}
      </style>
    </head>
    <body>
      \${html}
      <script>
        \${js}
      </script>
    </body>
    </html>
  \`;

  win.loadURL(\`data:text/html;charset=utf-8,\${encodeURIComponent(fullHtml)}\`);

  win.on('closed', () => {
    delete activeWidgets[widgetId];
    if (win.watcher) win.watcher.close();
    updateTrayMenu();
  });

  // Optional: Auto-reload if file changes
  if (filePath && fs.existsSync(filePath)) {
    win.watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        console.log(\`File changed: \${filePath}, reloading...\`);
        setTimeout(() => {
          if (!win.isDestroyed()) {
             // Let's re-read and re-launch
             try {
               const updatedContent = fs.readFileSync(filePath, 'utf-8');
               const updatedConfig = JSON.parse(updatedContent);
               launchWidget(widgetId, updatedConfig, filePath);
             } catch(e) { console.error("Error reloading", e); }
          }
        }, 500); // debounce
      }
    });
  }

  activeWidgets[widgetId] = win;
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const menuTemplate = [
    { label: 'Widgeter Engine', enabled: false },
    { type: 'separator' },
    { label: 'Load .widget file...', click: () => promptLoadWidget() },
    { label: 'Open Widgets Folder', click: () => require('electron').shell.openPath(WIDGETS_DIR) },
    { type: 'separator' },
    { label: 'Active Widgets', enabled: false }
  ];

  for (const [id, win] of Object.entries(activeWidgets)) {
    menuTemplate.push({
      label: \`Close \${id}\`,
      click: () => {
        if (win && !win.isDestroyed()) {
          win.close();
        }
      }
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

function promptLoadWidget() {
  dialog.showOpenDialog({
    title: 'Select a .widget file',
    filters: [
      { name: 'Widget Files', extensions: ['widget'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      // Optionally copy to widgets dir
      const fileName = path.basename(filePath);
      const destPath = path.join(WIDGETS_DIR, fileName);
      if (filePath !== destPath) {
        fs.copyFileSync(filePath, destPath);
      }
      loadWidgetFile(destPath);
    }
  });
}

function loadAllSavedWidgets() {
  fs.readdir(WIDGETS_DIR, (err, files) => {
    if (err) return;
    files.filter(f => f.endsWith('.widget')).forEach(file => {
      loadWidgetFile(path.join(WIDGETS_DIR, file));
    });
  });
}

app.whenReady().then(() => {
  const { nativeImage } = require('electron');
  // Create a simple colored square icon for the tray programmatically
  const icon = nativeImage.createEmpty();
  
  // Workaround: We'll create a 16x16 icon filled with a color using native API or just load a fallback
  // Actually, nativeImage.createEmpty() will be invisible. Let's just create a small buffer for a tiny PNG or use a built-in method.
  // We can use a base64 string.
  const iconBase64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA6SURBVDhPY3iPz/6fAR0wMRAGMII1MoymGwZ4zP2Pz3yQgYmBjoYhAwOMpmsGeMz9j898kIH///8HAJ06ChD6U38mAAAAAElFTkSuQmCC"; // simple 16x16 red square
  tray = new Tray(nativeImage.createFromDataURL('data:image/png;base64,' + iconBase64));

  tray.setToolTip('Widgeter Engine');
  
  updateTrayMenu();
  loadAllSavedWidgets();

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
    loadWidgetFile(sampleWidgetPath);
  }
});

app.on('window-all-closed', () => {
  // Prevent default behavior of quitting when all windows are closed, as this is a tray app
});
