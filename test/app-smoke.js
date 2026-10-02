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
const themeIdx = args.indexOf('--theme');
const theme = themeIdx >= 0 ? args[themeIdx + 1] : null;

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

  if (theme) { await run(`require('./api').call('settings:update', { theme: ${JSON.stringify(theme)} })`); await sleep(800); }
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

  // Drag and drop install: a valid single file, a widget folder and a broken file.
  const dropDir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgeter-drop-'));
  const goodFile = path.join(dropDir, 'dropped.widget');
  fs.writeFileSync(goodFile, JSON.stringify({ name: 'Dropped One', width: 220, height: 120, html: '<div class="wg-card">dropped</div>', css: '', js: '' }));
  const badFile = path.join(dropDir, 'broken.widget');
  fs.writeFileSync(badFile, '{ not json');
  const folder = path.join(dropDir, 'folder-widget');
  require('../engine/widget-format').unpackWidget({ id: 'folder-widget', name: 'Folder Widget', version: '1.0.0', description: 'd', category: 'other', html: '<b>f</b>', css: '', js: '' }, folder);
  const drops = await run(`require('./api').call('install:paths', ${JSON.stringify([goodFile, badFile, folder])})`);
  if (!drops[0].id || drops[1].id || !drops[1].error || !drops[2].id) fail('drop results: ' + JSON.stringify(drops)); else pass('drop install: file ok, folder ok, broken file rejected with "' + drops[1].error.slice(0, 40) + '"');

  // Error surfacing and crash recovery.
  await run(`require('./api').call('install:paths', ${JSON.stringify([(() => { const f = path.join(dropDir, 'boom.widget'); fs.writeFileSync(f, JSON.stringify({ name: 'Boom', width: 200, height: 100, html: '<div>boom</div>', css: '', js: "setTimeout(function(){ throw new Error('kaboom'); }, 200); Promise.reject(new Error('rejected promise'));" })); return f; })()])})`);
  await sleep(1200);
  const boom = (await run("require('./api').call('dash:state')")).widgets.find((x) => x.id === 'boom');
  const boomLogs = boom ? await run(`require('./api').call('widget:logs', 'boom')`) : [];
  if (!boom || boom.health.status !== 'error' || !boomLogs.some((l) => /kaboom/.test(l.message)) || !boomLogs.some((l) => /rejected promise/.test(l.message))) fail('script errors not surfaced: ' + JSON.stringify(boom && boom.health) + ' ' + JSON.stringify(boomLogs.map((l) => l.message))); else pass('uncaught error and rejected promise show up in the widget log, status error');
  const crashTarget = widgetWindows().find((w) => w.getTitle() === 'Digital Clock' || w.getTitle() === first.name) || widgetWindows()[0];
  const crashId = (await run("require('./api').call('dash:state')")).widgets.find((x) => x.name === crashTarget.getTitle()).id;
  crashTarget.webContents.forcefullyCrashRenderer();
  await sleep(400);
  const crashed = (await run("require('./api').call('dash:state')")).widgets.find((x) => x.id === crashId);
  if (!['crashed', 'loading', 'ok'].includes(crashed.health.status)) fail('after crash status is ' + crashed.health.status);
  await waitFor(async () => (await run("require('./api').call('dash:state')")).widgets.find((x) => x.id === crashId).health.status === 'ok', 8000, 'crash recovery');
  pass('crashed widget restarted itself');

  // Polling pauses while widgets are hidden and catches up on show.
  const ticker = path.join(dropDir, 'ticker.widget');
  fs.writeFileSync(ticker, JSON.stringify({ name: 'Ticker', width: 200, height: 100, html: '<div>t</div>', css: '', js: 'window.__n = 0; setInterval(function () { window.__n++; }, 100);' }));
  await run(`require('./api').call('install:paths', ${JSON.stringify([ticker])})`);
  await sleep(1200);
  const tickWin = () => widgetWindows().find((w) => w.getTitle() === 'Ticker');
  const count = () => tickWin().webContents.executeJavaScript('window.__n');
  const n1 = await count();
  await run("require('./api').call('app:set-hidden', true)");
  await sleep(300);
  const n2 = await count();
  await sleep(1500);
  const n3 = await count();
  if (n3 - n2 > 1) fail('interval kept running while hidden (' + n2 + ' -> ' + n3 + ')'); else pass('interval paused while hidden');
  await run("require('./api').call('app:set-hidden', false)");
  await sleep(400);
  const n4 = await count();
  if (n4 <= n3) fail('interval did not resume'); else pass('interval resumed (' + n3 + ' -> ' + n4 + ', first run was ' + n1 + ')');

  // Widget API: clipboard round trip, cached fetch with timeout, notify/log do not throw.
  const api = await tickWin().webContents.executeJavaScript(`(async () => {
    await widgeter.clipboard.writeText('widgeter-e2e-clip');
    const clip = await widgeter.clipboard.readText();
    let timedOut = '';
    try { await widgeter.fetch('http://10.255.255.1/', { timeout: 1200 }); } catch (e) { timedOut = e.message; }
    const cfg = await widgeter.getAllConfig();
    return { clip, timedOut, cfg, dir: typeof widgeter.dataDir, visible: widgeter.isVisible() };
  })()`);
  if (api.clip !== 'widgeter-e2e-clip') fail('clipboard round trip returned ' + JSON.stringify(api.clip)); else pass('widgeter.clipboard round trip');
  if (!/timed out|failed/i.test(api.timedOut)) fail('fetch to a black hole did not time out: ' + api.timedOut); else pass('widgeter.fetch timeout: ' + api.timedOut);

  // Profiles: save, change what is open, switch back.
  await run("require('./api').call('layout:save', 'Smoke profile', 'profile')");
  const listed = await run("require('./api').call('layout:list')");
  const pIndex = listed.saved.findIndex((e) => e.name === 'Smoke profile');
  await run(`require('./api').call('widget:toggle', 'ticker', false)`);
  await sleep(300);
  const before = widgetWindows().length;
  const act = await run(`require('./api').call('layout:activate', ${pIndex})`);
  await sleep(600);
  if (pIndex < 0 || widgetWindows().length <= before) fail('profile did not reopen its widgets (' + before + ' -> ' + widgetWindows().length + ')'); else pass('profile switch reopened widgets and applied ' + act.applied + ' positions');

  // Marketplace round trip against a local registry: register, publish, browse, install, update.
  const { createRegistry } = require('../registry/server');
  const registry = createRegistry({ dbPath: path.join(userData, 'e2e-registry.db'), rateLimit: false });
  await new Promise((r) => registry.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + registry.server.address().port;
  let step = 'start';
  try {
    await run(`require('./api').call('settings:update', { registryUrl: ${JSON.stringify(base)} })`);
    step = 'register';
    await run("require('./api').call('market:register', 'smokeuser', 'smoke-pass-123')");
    const publishable = (await run("require('./api').call('dash:state')")).widgets.find((w) => w.valid && w.source && w.source.type === 'gallery');
    const published = await run(`require('./api').call('market:publish', ${JSON.stringify(publishable.id)}, { description: 'Published by the e2e test', changelog: 'first' })`);
    if (published.slug !== publishable.slug) fail('published slug ' + published.slug); else pass('published ' + published.slug + ' v' + published.version + ' to the registry');
    const listed = await run(`require('./api').call('market:list', { q: ${JSON.stringify(publishable.name)} })`);
    if (!listed.items.some((i) => i.slug === publishable.slug)) fail('published widget missing from community list'); else pass('community list shows it');
    const detail = await run(`require('./api').call('market:detail', ${JSON.stringify(publishable.slug)})`);
    if (!detail.versions || !detail.versions.length) fail('detail has no versions'); else pass('detail lists ' + detail.versions.length + ' version(s)');
    step = 'rate';
    await run(`require('./api').call('market:rate', ${JSON.stringify(publishable.slug)}, 5, 'great')`);
    // Reinstall from the marketplace so the app tracks it as a marketplace widget.
    step = 'remove+install';
    await run(`require('./api').call('widget:remove', ${JSON.stringify(publishable.id)})`);
    await run(`require('./api').call('market:install', ${JSON.stringify(publishable.slug)})`);
    await sleep(400);
    // Publish a newer version as the same user, then expect an update to be offered and applied.
    step = 'second publish';
    const login = await (await fetch(base + '/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'smokeuser', password: 'smoke-pass-123' }) })).json();
    const current = JSON.parse(await (await fetch(base + '/v1/widgets/' + publishable.slug + '/download?count=0')).text());
    const next = Object.assign({}, current, { version: '9.9.9' });
    const pub2 = await fetch(base + '/v1/widgets', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token }, body: JSON.stringify({ package: next, changelog: 'newer' }) });
    if (pub2.status !== 201) fail('second publish failed: ' + pub2.status);
    step = 'updates:check';
    const updates = await run("require('./api').call('updates:check')");
    const u = updates.find((x) => x.slug === publishable.slug);
    if (!u || u.latestVersion !== '9.9.9') fail('update not offered: ' + JSON.stringify(updates)); else pass('update to ' + u.latestVersion + ' offered');
    if (u) {
      step = 'updates:apply';
      await run(`require('./api').call('updates:apply', ${JSON.stringify(u)})`);
      const now = (await run("require('./api').call('dash:state')")).widgets.find((w) => w.slug === publishable.slug);
      if (!now || now.version !== '9.9.9') fail('update did not apply: ' + (now && now.version)); else pass('update applied (v' + now.version + ')');
    }
  } catch (e) { fail('marketplace round trip (' + step + '): ' + e.message); }
  await registry.close();

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
