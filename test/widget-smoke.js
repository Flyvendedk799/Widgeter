// Loads widgets headlessly in real Electron windows, using the real page composer
// and preload, and reports script errors. Also renders screenshots.
//
//   npx electron test/widget-smoke.js                    all gallery widgets
//   npx electron test/widget-smoke.js weather clock      only these
//   npx electron test/widget-smoke.js --thumbs           write gallery/<id>/thumbnail.png
//   npx electron test/widget-smoke.js --shots <dir>      write <dir>/<id>.png (for eyeballing)
//   npx electron test/widget-smoke.js --dir <path>       widgets in another folder
//   options: --wait <ms> (default 5000)  --theme light|dark  --size
const { app, BrowserWindow, ipcMain, net } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const format = require('../engine/widget-format');
const { composePage, themeAttrs } = require('../engine/compose');
const { configDefaults } = require('../engine/manifest');
const { createFetchCache } = require('../engine/net-cache');

const args = process.argv.slice(app.isPackaged ? 1 : 2);
const flag = (name) => args.includes('--' + name);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const valueArgs = new Set(['--dir', '--wait', '--shots', '--theme']);
const only = args.filter((a, i) => !a.startsWith('--') && !valueArgs.has(args[i - 1]));

const galleryDir = path.resolve(opt('dir', path.join(__dirname, '..', 'gallery')));
const waitMs = Number(opt('wait', 5000));
const theme = opt('theme', 'dark');
const shotsDir = opt('shots', null);
const NETWORK_NOISE = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|Request failed|HTTP \d{3}|NetworkError|Failed to fetch|net::ERR/i;

app.on('window-all-closed', () => {});
app.disableHardwareAcceleration();

const fetchCache = createFetchCache((url, opts) => net.fetch(url, opts));
const sessions = new Map(); // webContents id -> { id, logs, config }

ipcMain.handle('widgeter:getConfig', (e, key) => { const s = sessions.get(e.sender.id); return s ? s.config[key] : undefined; });
ipcMain.handle('widgeter:getAllConfig', (e) => { const s = sessions.get(e.sender.id); return s ? s.config : {}; });
ipcMain.handle('widgeter:setConfig', () => true);
ipcMain.handle('widgeter:fetch', async (e, url, opts) => {
  try { return await fetchCache.fetch(url, opts || {}); } catch (err) { return { error: 'Request failed: ' + (err.cause && err.cause.code ? err.cause.code : err.message) }; }
});
ipcMain.on('widgeter:notify', () => {});
ipcMain.on('widgeter:open-external', () => {});
ipcMain.on('widgeter:data-dir', (e) => {
  const s = sessions.get(e.sender.id);
  const dir = path.join(os.tmpdir(), 'widgeter-smoke-data', s ? s.id : 'x');
  fs.mkdirSync(dir, { recursive: true });
  e.returnValue = dir;
});
ipcMain.on('widgeter:log', (e, entry) => { const s = sessions.get(e.sender.id); if (s) s.logs.push(entry); });
ipcMain.on('widgeter:auto-resize', () => {});
ipcMain.on('widgeter:user-resize', () => {});

async function runOne(item) {
  const result = { id: item.id, errors: [], warnings: [], info: [] };
  const loaded = format.loadWidget(item.path, { strict: item.kind === 'folder' });
  result.warnings.push(...loaded.warnings);
  if (!loaded.ok) { result.errors.push(...loaded.errors.map((m) => 'manifest: ' + m)); return result; }
  const m = loaded.manifest;

  const htmlPath = path.join(os.tmpdir(), 'widgeter-smoke-' + item.id.replace(/[^a-z0-9]/gi, '_') + '.html');
  fs.writeFileSync(htmlPath, composePage(item.id, m, { autoResize: false, minWidth: 160, maxWidth: 800, minHeight: 80, maxHeight: 900 }, themeAttrs(theme, 'auto')), 'utf8');

  const win = new BrowserWindow({
    width: m.width, height: m.height, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, preload: path.join(__dirname, '..', 'preload.js') }
  });
  const session = { id: item.id, logs: [], config: configDefaults(m) };
  sessions.set(win.webContents.id, session);
  win.webContents.on('console-message', (event) => {
    const level = event.level;
    if (level === 'error' || level === 3) session.logs.push({ level: 'error', message: event.message + (event.lineNumber ? ' (' + String(event.sourceId).split('/').pop() + ':' + event.lineNumber + ')' : '') });
  });
  win.webContents.on('render-process-gone', (e, d) => result.errors.push('renderer crashed: ' + d.reason));
  win.webContents.on('did-fail-load', (e, code, desc) => { if (code !== -3) result.errors.push('load failed: ' + desc); });

  try {
    await win.loadFile(htmlPath);
    await new Promise((r) => setTimeout(r, waitMs));
    const probe = await win.webContents.executeJavaScript(`({
      text: (document.body.innerText || '').trim().length,
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      scrollH: document.body.scrollHeight, innerH: window.innerHeight
    })`);
    if (probe.text === 0) result.errors.push('widget rendered no visible text');
    if (probe.scrollW > probe.innerW + 4) result.warnings.push('horizontal overflow (' + probe.scrollW + ' > ' + probe.innerW + ')');
    result.info.push(probe.innerW + 'x' + probe.innerH + ' content ' + probe.scrollH + 'px');
    result.contentHeight = probe.scrollH;

    for (const log of session.logs) {
      if (log.level !== 'error') continue;
      (NETWORK_NOISE.test(log.message) ? result.warnings : result.errors).push('script: ' + log.message);
    }

    if (flag('thumbs') || shotsDir) {
      const hideGrip = await win.webContents.insertCSS('#widgeter-resize-grip{display:none !important}');
      const image = await win.webContents.capturePage();
      await win.webContents.removeInsertedCSS(hideGrip);
      if (image.isEmpty()) result.warnings.push('screenshot was empty');
      else {
        const size = image.getSize();
        const png = (size.width > 520 ? image.resize({ width: 520, quality: 'good' }) : image).toPNG();
        if (flag('thumbs')) fs.writeFileSync(path.join(item.path, 'thumbnail.png'), png);
        if (shotsDir) { fs.mkdirSync(shotsDir, { recursive: true }); fs.writeFileSync(path.join(shotsDir, item.id + '.png'), png); }
      }
    }
  } catch (e) {
    result.errors.push('harness: ' + e.message);
  } finally {
    sessions.delete(win.webContents.id);
    win.destroy();
  }
  return result;
}

app.whenReady().then(async () => {
  let items = format.listWidgets(galleryDir);
  if (only.length) items = items.filter((i) => only.includes(i.id) || only.includes(i.id.replace(/\.widget$/, '')));
  if (!items.length) { console.log('No widgets found in ' + galleryDir); app.exit(2); return; }

  let failed = 0;
  for (const item of items) {
    const r = await runOne(item);
    const ok = r.errors.length === 0;
    if (!ok) failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + r.id + (r.info.length ? '  [' + r.info.join(', ') + ']' : ''));
    for (const e of r.errors) console.log('   error:   ' + e);
    for (const w of r.warnings) console.log('   warning: ' + w);
  }
  console.log('\n' + (items.length - failed) + '/' + items.length + ' widgets passed');
  app.exit(failed ? 1 : 0);
});
