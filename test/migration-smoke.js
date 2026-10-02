// Upgrade test: a profile written by the old single-file release must come through
// the new engine with its settings and positions intact.
//
//   npx electron test/migration-smoke.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'widgeter-migrate-'));
app.setPath('userData', userData);

// An old install: two single-file widgets, saved settings, a saved position.
fs.mkdirSync(path.join(userData, 'widgets'), { recursive: true });
for (const f of ['weather-widget.widget', 'todo-list.widget']) fs.copyFileSync(path.join(__dirname, 'fixtures', f), path.join(userData, 'widgets', f));
fs.writeFileSync(path.join(userData, 'widgets', 'my-own.widget'), JSON.stringify({ name: 'My Own', width: 200, height: 100, html: '<div id="x">mine</div>', css: '', js: '' }));
fs.writeFileSync(path.join(userData, 'state.json'), JSON.stringify({
  runOnBoot: false,
  widgets: {
    'weather-widget.widget': { enabled: true, x: 321, y: 123, width: 280, height: 280, opacity: 0.8, config: { owm_city: 'Aarhus', owm_key: 'abc' } },
    'todo-list.widget': { enabled: false, config: {} },
    'my-own.widget': { enabled: true, x: 50, y: 60, config: {} }
  }
}));

const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL ' + m); };
const pass = (m) => console.log('ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

require('../main.js');

app.whenReady().then(async () => {
  await sleep(4000);
  const dash = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Widgeter');
  if (!dash) { fail('dashboard did not open'); return finish(); }
  const state = await dash.webContents.executeJavaScript("require('./api').call('dash:state')");
  const byId = Object.fromEntries(state.widgets.map((w) => [w.id, w]));

  const weather = byId.weather;
  if (!weather) fail('weather-widget.widget was not upgraded to the gallery folder widget; have: ' + Object.keys(byId).join(', '));
  else {
    pass('weather-widget.widget upgraded to gallery widget "weather" v' + weather.version);
    if (weather.configValues.owm_city !== 'Aarhus') fail('saved city lost: ' + JSON.stringify(weather.configValues)); else pass('saved settings carried over (city Aarhus)');
    if (weather.opacity !== 0.8) fail('opacity lost: ' + weather.opacity); else pass('display settings carried over');
    const win = BrowserWindow.getAllWindows().find((w) => w.getTitle().startsWith('Weather'));
    if (!win) fail('weather window is not open');
    else if (win.getBounds().x !== 321 || win.getBounds().y !== 123) fail('position lost: ' + JSON.stringify(win.getBounds()));
    else pass('window reopened at its saved position');
  }
  if (byId['weather-widget.widget']) fail('old file still listed');
  if (!byId['todo-list'] || byId['todo-list'].enabled) fail('disabled widget should stay disabled after upgrade'); else pass('disabled widget stays disabled');
  if (!byId['my-own.widget'] || !byId['my-own.widget'].valid) fail('custom user widget was not left alone'); else pass('custom single-file widget untouched');
  const backups = fs.existsSync(path.join(userData, 'backup')) ? fs.readdirSync(path.join(userData, 'backup')) : [];
  if (!backups.some((b) => /weather-widget/.test(b))) fail('no backup of the replaced file'); else pass('old file backed up');
  finish();
});

function finish() {
  console.log(failures.length ? '\n' + failures.length + ' failure(s)' : '\nall checks passed');
  app.exit(failures.length ? 1 : 0);
}
