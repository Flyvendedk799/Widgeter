// End-to-end smoke test: starts the real app on a throwaway profile, drives the
// dashboard, installs gallery widgets and checks they run.
//
//   npx electron test/app-smoke.js [--shots <dir>] [--keep]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(app.isPackaged ? 1 : 2);
const shotsIdx = args.indexOf('--shots');
const shotsDir = shotsIdx >= 0 ? args[shotsIdx + 1] : null;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'widgeter-e2e-'));
app.setPath('userData', userData);

const failures = [];
const consoleErrors = [];
const fail = (msg) => { failures.push(msg); console.log('FAIL ' + msg); };
const pass = (msg) => console.log('ok   ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('uncaughtException', (e) => { fail('main process exception: ' + (e.stack || e.message)); });

require('../main.js');

async function waitFor(fn, timeout, label) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  fail('timed out waiting for ' + label);
  return null;
}

const dashboard = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.getTitle() === 'Widgeter');
const widgetWindows = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== dashboard());
const run = (code) => dashboard().webContents.executeJavaScript(code);

async function shot(name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  const image = await dashboard().webContents.capturePage();
  fs.writeFileSync(path.join(shotsDir, name + '.png'), image.toPNG());
}

async function nav(label) {
  await run(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`);
  await sleep(700);
}

async function main() {
  const win = await waitFor(() => dashboard(), 20000, 'dashboard window');
  if (!win) return;
  win.setSize(1200, 800);
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 3) consoleErrors.push(event.message + ' (' + String(event.sourceId).split('/').pop() + ':' + event.lineNumber + ')');
  });
  await waitFor(() => run("!!document.querySelector('.nav-item')"), 15000, 'dashboard UI');
  pass('dashboard opened');

  // First run: the welcome picker should be showing the gallery.
  const picker = await waitFor(() => run("document.querySelectorAll('.pick').length"), 15000, 'first-run picker');
  if (picker) pass('first-run picker lists ' + picker + ' gallery widgets');
  await sleep(600);
  await shot('01-firstrun');
  const clicked = await run("(() => { const b = [...document.querySelectorAll('.modal .btn.primary')].pop(); b.click(); return b.textContent; })()");
  pass('clicked "' + clicked + '"');
  await sleep(3500);

  const state = await run("require('./api').call('dash:state')");
  const widgets = state.widgets;
  pass(widgets.length + ' widgets installed: ' + widgets.map((w) => w.id).join(', '));
  if (!widgets.length) fail('no widgets installed from first-run picker');
  const running = widgetWindows().length;
  if (running !== widgets.filter((w) => w.enabled).length) fail('expected ' + widgets.filter((w) => w.enabled).length + ' widget windows, found ' + running);
  else pass(running + ' widget windows running');

  // Windows should not all be stacked on top of each other.
  const boxes = widgetWindows().map((w) => w.getBounds());
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlaps++;
  }
  if (overlaps) fail(overlaps + ' widget windows overlap on first placement'); else pass('widgets placed without overlapping');

  await sleep(1500);
  await shot('02-widgets');
  for (const [i, label] of ['Discover', 'Creator', 'Layouts', 'Settings', 'My Widgets'].entries()) {
    await nav(label);
    await shot('0' + (3 + i) + '-' + label.toLowerCase().replace(' ', ''));
    pass('rendered ' + label);
  }

  // Open the settings drawer of the first widget with a config schema.
  const withConfig = widgets.find((w) => w.config.length);
  if (withConfig) {
    await run(`require('./views/drawer').openDrawer(${JSON.stringify(withConfig.id)}, 'Settings', {})`);
    await sleep(400);
    const fields = await run("document.querySelectorAll('.drawer .field').length");
    if (!fields) fail('settings drawer for ' + withConfig.id + ' shows no fields'); else pass('settings drawer for ' + withConfig.id + ' shows ' + fields + ' fields');
    await shot('08-drawer');
    await run("require('./views/drawer').closeDrawer()");
  }

  for (const w of widgets) {
    const logs = await run(`require('./api').call('widget:logs', ${JSON.stringify(w.id)})`);
    if (logs.length) console.log('     logs ' + w.id + ': ' + logs.map((l) => l.level + ': ' + l.message.slice(0, 100)).join(' | '));
  }
  // Widget health: nothing should be in an error state after a few seconds.
  const after = await run("require('./api').call('dash:state')");
  for (const w of after.widgets) {
    if (w.enabled && (w.health.status === 'error' || w.health.status === 'failed' || w.health.status === 'crashed')) {
      const logs = await run(`require('./api').call('widget:logs', ${JSON.stringify(w.id)})`);
      fail('widget ' + w.id + ' is ' + w.health.status + ': ' + (w.health.lastError || '') + ' ' + JSON.stringify(logs.slice(-2)));
    }
  }

  // Layout template applies without throwing.
  const applied = await run(`(async () => {
    const api = require('./api');
    const { TEMPLATES } = require('../engine/layout-templates');
    const data = await api.call('layout:list');
    return api.call('layout:apply-template', TEMPLATES[4].generate(data.active), data.displays[0].id);
  })()`);
  if (applied.applied !== widgets.filter((w) => w.enabled).length) fail('grid layout applied to ' + applied.applied + ' widgets'); else pass('grid layout applied to ' + applied.applied + ' widgets');

  // Disable and re-enable.
  const first = widgets.find((w) => w.enabled);
  await run(`require('./api').call('widget:toggle', ${JSON.stringify(first.id)}, false)`);
  await sleep(500);
  if (widgetWindows().length !== running - 1) fail('disabling a widget did not close its window'); else pass('disabling closes the window');
  await run(`require('./api').call('widget:toggle', ${JSON.stringify(first.id)}, true)`);
  await sleep(800);
  if (widgetWindows().length !== running) fail('re-enabling did not reopen the window'); else pass('re-enabling reopens the window');

  // Save a creator draft and make sure it installs.
  const saved = await run(`require('./api').call('creator:save', { id: 'smoke-test', name: 'Smoke Test', version: '1.0.0', description: 'x', category: 'other', width: 200, height: 100, html: '<div class="wg-card">hi</div>', css: '', js: '' })`);
  await sleep(500);
  if (saved.id !== 'smoke-test') fail('creator save returned ' + JSON.stringify(saved)); else pass('creator saved a widget');

  const errs = consoleErrors.filter((m) => !/Autofill|Electron Security Warning/.test(m));
  if (errs.length) fail('dashboard console errors:\n   ' + errs.join('\n   '));
}

app.whenReady().then(async () => {
  try { await main(); } catch (e) { fail('smoke test crashed: ' + (e.stack || e.message)); }
  console.log(failures.length ? '\n' + failures.length + ' failure(s)' : '\nall checks passed');
  app.exit(failures.length ? 1 : 0);
});
