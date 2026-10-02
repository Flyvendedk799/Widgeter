'use strict';
// Publishes the bundled gallery widgets into a registry database, as the "widgeter" user.
// Idempotent: versions that are already published are skipped, newer ones are added.
//
//   DATA_DIR=/path/to/data node registry/seed.js [galleryDir]
//
// The seed account gets a random password stored in DATA_DIR/seed-account.json (mode 600)
// so the widgets stay owned by one account across runs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const { createRegistry } = require('./server');
const format = require('../engine/widget-format');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const galleryDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'gallery'));
const USERNAME = 'widgeter';

function request(port, method, route, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port, method, path: route,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ } resolve({ status: res.statusCode, body: json }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const registry = createRegistry({ dbPath: path.join(dataDir, 'registry.db'), rateLimit: false });
  await new Promise((r) => registry.server.listen(0, '127.0.0.1', r));
  const port = registry.server.address().port;

  const credFile = path.join(dataDir, 'seed-account.json');
  let creds = fs.existsSync(credFile) ? JSON.parse(fs.readFileSync(credFile, 'utf8')) : null;
  let token;
  if (!creds) {
    creds = { username: USERNAME, password: crypto.randomBytes(24).toString('base64url') };
    const res = await request(port, 'POST', '/v1/auth/register', creds);
    if (res.status !== 201) throw new Error('Could not create the seed account: ' + JSON.stringify(res.body));
    fs.writeFileSync(credFile, JSON.stringify(creds), { mode: 0o600 });
    token = res.body.token;
  } else {
    const res = await request(port, 'POST', '/v1/auth/login', creds);
    if (res.status !== 200) throw new Error('Seed account login failed: ' + JSON.stringify(res.body));
    token = res.body.token;
  }

  const summary = { published: 0, skipped: 0, failed: 0 };
  for (const item of format.listWidgets(galleryDir)) {
    const loaded = format.loadWidget(item.path, { strict: true });
    if (!loaded.ok) { summary.failed++; console.log('invalid ' + item.id + ': ' + loaded.errors.join('; ')); continue; }
    const pkg = format.packWidget(item.path);
    const thumbFile = path.join(item.path, format.THUMBNAIL_FILE);
    const body = { package: pkg, changelog: 'Bundled with Widgeter ' + loaded.manifest.version };
    if (fs.existsSync(thumbFile)) body.thumbnail = fs.readFileSync(thumbFile).toString('base64');
    const res = await request(port, 'POST', '/v1/widgets', body, token);
    if (res.status === 201) { summary.published++; console.log('published ' + res.body.slug + ' v' + res.body.version); }
    else if (res.status === 409) { summary.skipped++; }
    else { summary.failed++; console.log('failed ' + item.id + ': ' + res.status + ' ' + JSON.stringify(res.body)); }
  }
  console.log(JSON.stringify(summary));
  await registry.close();
  process.exit(summary.failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
