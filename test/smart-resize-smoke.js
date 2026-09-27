const { app, BrowserWindow } = require('electron');

app.on('window-all-closed', () => {});
const fs = require('fs');
const os = require('os');
const path = require('path');

app.whenReady().then(async () => {
  const probe = new BrowserWindow({
    width: 200,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  probe.destroy();

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    x: 40,
    y: 40,
    show: false,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false
    }
  });

  const client = fs.readFileSync(path.join(__dirname, '..', 'engine', 'smart-resize-client.js'), 'utf8');
  const html = `<!DOCTYPE html><html><head><style>
    body { margin: 0; padding: 0; }
    .container { min-height: 100vh; }
    .item { height: 48px; width: 1000px; }
  </style></head><body>
    <div class="container"><div class="item">Hi</div></div>
    <script>window.__widgeterDisplay = { enabled: true, minWidth: 80, maxWidth: 2000, minHeight: 50, maxHeight: 2000 };</script>
    <script>window.widgeter = { autoResize: function(w, h){ window.__sent = { width: w, height: h }; }, userResize: function(){}, onResizeMode: function(){} };</script>
    <script>${client}</script>
  </body></html>`;

  const htmlPath = path.join(os.tmpdir(), 'widgeter-resize-smoke.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  await win.loadFile(htmlPath);
  const initialHeight = await win.webContents.executeJavaScript('window.innerHeight');
  if (initialHeight < 100) win.showInactive();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const result = await win.webContents.executeJavaScript(`({
    sent: window.__sent || null,
    measured: window.__widgeterMeasure(),
    innerHeight: window.innerHeight
  })`);
  console.log(JSON.stringify(result));
  win.destroy();

  const height = result.measured && result.measured.height;
  const width = result.measured && result.measured.width;
  if (!(height < 140) || !(width > 900)) {
    console.error('FAIL smart resize measured', result);
    app.exit(1);
    return;
  }
  if (!result.sent || result.sent.height > 140) {
    console.error('FAIL smart resize did not report the short height', result);
    app.exit(1);
    return;
  }
  const dash = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  const dashErrors = [];
  dash.webContents.on('console-message', (event, level, message) => {
    const text = typeof event === 'object' && event.message ? event.message : message;
    const sev = typeof event === 'object' && event.level != null ? event.level : level;
    if (sev === 3 || sev === 'error') dashErrors.push(String(text));
  });
  await dash.loadFile(path.join(__dirname, '..', 'dashboard.html'));
  const creatorName = await dash.webContents.executeJavaScript("document.getElementById('field-name').value");
  const display = await dash.webContents.executeJavaScript(`(() => {
    widgetsData = [{
      id: 'demo.widget', name: 'Demo', enabled: true, autoResize: true, opacity: 0.8,
      clickThrough: false, minWidth: 160, maxWidth: 800, minHeight: 80, maxHeight: 900,
      config: {}, sticky: false
    }];
    renderWidgets();
    const mode = document.getElementById('resize-mode-demo.widget');
    mode.value = 'fixed';
    mode.dispatchEvent(new Event('change'));
    const laid = columnLayout(['a.widget', 'b.widget'], 0, 25);
    const sum = laid.reduce((total, item) => total + item.height, 0);
    return {
      mode: mode.value,
      badge: document.getElementById('mode-badge-demo.widget').textContent,
      auto: widgetsData[0].autoResize,
      sum
    };
  })()`);
  console.log(JSON.stringify({ creatorName, display, dashErrors }));
  dash.destroy();
  win.destroy();
  if (creatorName !== 'My New Widget') {
    console.error('FAIL dashboard did not initialize');
    app.exit(1);
    return;
  }
  if (dashErrors.length) {
    console.error('FAIL dashboard errors', dashErrors);
    app.exit(1);
    return;
  }
  if (!display || display.auto !== false || display.badge !== 'Fixed size' || display.sum !== 100) {
    console.error('FAIL display settings or layout math', display);
    app.exit(1);
    return;
  }
  const reqHtml = path.join(os.tmpdir(), 'widgeter-require-check.html');
  fs.writeFileSync(reqHtml, '<!DOCTYPE html><body><script>try{require("fs");require("electron");window.__req="ok";}catch(e){window.__req=e.message;}</script></body>');
  const reqWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  await reqWin.loadFile(reqHtml);
  const required = await reqWin.webContents.executeJavaScript('window.__req');
  reqWin.destroy();
  if (required !== 'ok') {
    console.error('FAIL widget require()', required);
    app.exit(1);
    return;
  }
  console.log('PASS');
  app.exit(0);
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
