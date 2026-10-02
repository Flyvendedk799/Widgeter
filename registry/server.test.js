'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRegistry } = require('./server');

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ADMIN = 'test-admin-token';

const pkg = (over) => Object.assign({
  id: 'hello-world', name: 'Hello World', version: '1.0.0', description: 'x', category: 'other',
  html: '<p>hi</p>', css: '', js: ''
}, over);

// Starts an isolated registry on port 0 with a controllable clock.
async function start(t, opts = {}) {
  const clock = { t: Date.UTC(2026, 0, 1) };
  const reg = createRegistry(Object.assign({ dbPath: ':memory:', adminToken: ADMIN, baseUrl: '', now: () => clock.t }, opts));
  await new Promise((resolve) => reg.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + reg.server.address().port;
  t.after(() => reg.close());
  let ipCounter = 0;

  // Every call gets a fresh client IP unless one is given, so rate limits never leak between steps.
  async function api(method, url, { token, body, ip, headers, raw } = {}) {
    const h = Object.assign({ 'x-forwarded-for': ip || '10.9.' + Math.floor(++ipCounter / 250) + '.' + (ipCounter % 250) }, headers);
    if (token) h.authorization = 'Bearer ' + token;
    let payload;
    if (raw !== undefined) payload = raw;
    else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    const res = await fetch(base + url, { method, headers: h, body: payload });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* not json */ }
    return { status: res.status, headers: res.headers, text, json };
  }

  let userCounter = 0;
  async function user(name) {
    const username = name || 'user' + (++userCounter);
    const r = await api('POST', '/v1/auth/register', { body: { username, password: 'password123' } });
    assert.equal(r.status, 201, r.text);
    return { username, token: r.json.token, id: r.json.user.id };
  }

  const publish = (u, body, opts) => api('POST', '/v1/widgets', Object.assign({ token: u.token, body }, opts));
  const tick = (ms) => { clock.t += ms; };
  return { reg, api, user, publish, tick, clock, base };
}

test('health endpoints', async (t) => {
  const { api, user, publish } = await start(t);
  for (const p of ['/health', '/v1/health']) {
    const r = await api('GET', p);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, service: 'widgeter-registry', widgets: 0 });
  }
  const u = await user();
  await publish(u, { package: pkg() });
  assert.equal((await api('GET', '/health')).json.widgets, 1);
});

test('cors, options, 404 and 405', async (t) => {
  const { api } = await start(t);
  const opt = await api('OPTIONS', '/v1/widgets');
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get('access-control-allow-origin'), '*');
  assert.match(opt.headers.get('access-control-allow-headers'), /Authorization/);

  const ok = await api('GET', '/v1/widgets');
  assert.equal(ok.headers.get('access-control-allow-origin'), '*');

  const nf = await api('GET', '/v1/nope');
  assert.equal(nf.status, 404);
  assert.ok(nf.json.error);
  assert.equal(nf.headers.get('access-control-allow-origin'), '*');

  const wrong = await api('PUT', '/v1/widgets');
  assert.equal(wrong.status, 405);
  assert.ok(wrong.json.error);
  assert.match(wrong.headers.get('allow'), /GET/);
  assert.equal((await api('GET', '/v1/auth/login')).status, 405);
  assert.equal((await api('DELETE', '/health')).status, 405);
});

test('register, login, me, logout', async (t) => {
  const { api, reg } = await start(t);
  const reg1 = await api('POST', '/v1/auth/register', { body: { username: 'Alice_1', password: 'correct horse' } });
  assert.equal(reg1.status, 201);
  assert.match(reg1.json.token, /^[0-9a-f]{64}$/);
  assert.equal(reg1.json.user.username, 'Alice_1');
  assert.equal(typeof reg1.json.user.id, 'number');

  // only a hash of the token is stored; password is hashed with a salt
  const tokens = reg.db.prepare('SELECT token_hash FROM tokens').all();
  assert.equal(tokens.length, 1);
  assert.notEqual(tokens[0].token_hash, reg1.json.token);
  const row = reg.db.prepare('SELECT pass_hash, salt FROM users').get();
  assert.ok(row.salt.length >= 32);
  assert.ok(!row.pass_hash.includes('correct horse'));

  // validation
  const bad = [
    [{ username: 'ab', password: 'password123' }, /username/],
    [{ username: 'x'.repeat(25), password: 'password123' }, /username/],
    [{ username: 'bad name!', password: 'password123' }, /username/],
    [{ username: 'okname', password: 'short' }, /password/],
    [{ username: 'okname' }, /required/],
    [{}, /required/]
  ];
  for (const [body, re] of bad) {
    const r = await api('POST', '/v1/auth/register', { body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.json.error, re);
  }
  assert.equal((await api('POST', '/v1/auth/register', { raw: '{nope' })).status, 400);
  assert.equal((await api('POST', '/v1/auth/register', { raw: '[]' })).status, 400);

  // duplicate, case-insensitive
  const dup = await api('POST', '/v1/auth/register', { body: { username: 'alice_1', password: 'password123' } });
  assert.equal(dup.status, 409);

  // login issues a fresh token; several tokens work at once
  const l1 = await api('POST', '/v1/auth/login', { body: { username: 'ALICE_1', password: 'correct horse' } });
  assert.equal(l1.status, 200);
  assert.notEqual(l1.json.token, reg1.json.token);
  assert.equal(l1.json.user.username, 'Alice_1');
  for (const tok of [reg1.json.token, l1.json.token]) {
    const me = await api('GET', '/v1/me', { token: tok });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.username, 'Alice_1');
    assert.deepEqual(me.json.widgets, []);
  }

  // generic failure
  const wrongPw = await api('POST', '/v1/auth/login', { body: { username: 'Alice_1', password: 'nope-nope' } });
  const noUser = await api('POST', '/v1/auth/login', { body: { username: 'ghost', password: 'nope-nope' } });
  assert.equal(wrongPw.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPw.json.error, noUser.json.error);

  // auth required / bad tokens
  assert.equal((await api('GET', '/v1/me')).status, 401);
  assert.equal((await api('GET', '/v1/me', { token: 'f'.repeat(64) })).status, 401);
  assert.equal((await api('POST', '/v1/auth/logout')).status, 401);

  // logout revokes only the presented token
  const out = await api('POST', '/v1/auth/logout', { token: reg1.json.token });
  assert.deepEqual(out.json, { ok: true });
  assert.equal((await api('GET', '/v1/me', { token: reg1.json.token })).status, 401);
  assert.equal((await api('GET', '/v1/me', { token: l1.json.token })).status, 200);
});

test('publish: success, listing, detail and validation', async (t) => {
  const { api, user, publish, tick } = await start(t);
  const alice = await user('alice');

  assert.equal((await api('POST', '/v1/widgets', { body: { package: pkg() } })).status, 401);

  tick(1000);
  const r = await publish(alice, {
    package: pkg({ author: 'someone-else', icon: 'H', width: 420, height: 180, tags: ['Demo'],
      config: [{ key: 'city', label: 'City', type: 'text', required: true, placeholder: 'x' }, { key: 'units', type: 'select', options: ['c', 'f'] }] }),
    changelog: 'first release', thumbnail: PNG_1X1
  });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual(r.json, { slug: 'hello-world', version: '1.0.0' });

  const detail = await api('GET', '/v1/widgets/hello-world');
  assert.equal(detail.status, 200);
  const d = detail.json;
  assert.equal(d.slug, 'hello-world');
  assert.equal(d.author, 'alice'); // package.author is ignored
  assert.equal(d.name, 'Hello World');
  assert.equal(d.latestVersion, '1.0.0');
  assert.deepEqual(d.tags, ['demo']);
  assert.equal(d.icon, 'H');
  assert.equal(d.installs, 0);
  assert.equal(d.ratingAvg, null);
  assert.equal(d.ratingCount, 0);
  assert.equal(d.featured, false);
  assert.equal(d.thumbnailUrl, '/v1/widgets/hello-world/thumbnail');
  assert.ok(!Number.isNaN(Date.parse(d.createdAt)));
  assert.equal(d.versions.length, 1);
  assert.equal(d.versions[0].version, '1.0.0');
  assert.equal(d.versions[0].changelog, 'first release');
  assert.ok(d.versions[0].size > 50);
  assert.deepEqual(d.config, [
    { key: 'city', label: 'City', type: 'text', required: true },
    { key: 'units', label: 'units', type: 'select', required: false }
  ]);
  assert.deepEqual(d.dimensions, { width: 420, height: 180 });

  const list = await api('GET', '/v1/widgets');
  assert.equal(list.json.total, 1);
  assert.equal(list.json.items[0].slug, 'hello-world');
  assert.equal(list.json.items[0].versions, undefined);

  const me = await api('GET', '/v1/me', { token: alice.token });
  assert.equal(me.json.widgets.length, 1);
  assert.equal(me.json.widgets[0].slug, 'hello-world');

  assert.equal((await api('GET', '/v1/widgets/does-not-exist')).status, 404);
  assert.equal((await api('GET', '/v1/widgets/%E0%A4%A')).status, 400);

  // body overrides description, category and tags; default dimensions without width/height
  const o = await publish(alice, { package: pkg({ id: 'override-me', name: 'Override' }), description: 'better text', category: 'dev', tags: ['One', 'two'] });
  assert.equal(o.status, 201, o.text);
  const od = (await api('GET', '/v1/widgets/override-me')).json;
  assert.equal(od.description, 'better text');
  assert.equal(od.category, 'dev');
  assert.deepEqual(od.tags, ['one', 'two']);
  assert.equal(od.thumbnailUrl, null);
  assert.deepEqual(od.dimensions, { width: 300, height: 300 });

  // validation failures
  const cases = [
    [{}, /package/],
    [{ package: 'nope' }, /package/],
    [{ package: [] }, /package/],
    [{ package: pkg({ id: undefined }) }, /id/],
    [{ package: pkg({ id: 12 }) }, /id/],
    [{ package: pkg({ id: 'Bad Id!' }) }, /Invalid widget package/],
    [{ package: pkg({ version: 'one' }) }, /Invalid widget package/],
    [{ package: pkg({ version: 1 }) }, /version/],
    [{ package: pkg({ name: '' }) }, /Invalid widget package/],
    [{ package: pkg({ description: '' }) }, /Invalid widget package/],
    [{ package: pkg({ html: undefined, css: undefined, js: undefined }) }, /Invalid widget package/],
    [{ package: pkg(), category: 'nonsense' }, /Invalid widget package/],
    [{ package: pkg(), tags: 'nope' }, /Invalid widget package/],
    [{ package: pkg(), description: 42 }, /description/],
    [{ package: pkg(), changelog: 'c'.repeat(2001) }, /changelog/]
  ];
  for (const [body, re] of cases) {
    const res = await publish(alice, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80) + ' -> ' + res.text);
    assert.match(res.json.error, re);
  }
  const detailed = await publish(alice, { package: pkg({ id: 'x', name: '' }) });
  assert.ok(Array.isArray(detailed.json.details) && detailed.json.details.length >= 1);
  assert.equal((await api('GET', '/v1/widgets')).json.total, 2);
});

test('publish: versions and ownership', async (t) => {
  const { api, user, publish, tick } = await start(t);
  const alice = await user('alice');
  const bob = await user('bob');
  assert.equal((await publish(alice, { package: pkg({ version: '1.2.0' }), changelog: 'v1.2' })).status, 201);

  const mine = await publish(bob, { package: pkg({ version: '9.0.0' }) });
  assert.equal(mine.status, 403);

  const same = await publish(alice, { package: pkg({ version: '1.2.0' }) });
  assert.equal(same.status, 409);
  assert.equal(same.json.code, 'version_exists');

  const older = await publish(alice, { package: pkg({ version: '1.1.9' }) });
  assert.equal(older.status, 409);
  assert.equal(older.json.code, 'version_not_newer');

  tick(1000);
  const newer = await publish(alice, { package: pkg({ version: '1.10.0', name: 'Hello Again' }), changelog: 'v1.10' });
  assert.equal(newer.status, 201);
  assert.equal((await publish(alice, { package: pkg({ version: '1.9.0' }) })).status, 409); // 1.9 < 1.10 (numeric compare)

  const d = (await api('GET', '/v1/widgets/hello-world')).json;
  assert.equal(d.latestVersion, '1.10.0');
  assert.equal(d.name, 'Hello Again');
  assert.deepEqual(d.versions.map((v) => v.version), ['1.10.0', '1.2.0']);
  assert.equal(d.versions[0].changelog, 'v1.10');

  // a later version without thumbnail keeps the earlier one
  assert.equal((await publish(alice, { package: pkg({ version: '2.0.0' }), thumbnail: PNG_1X1 })).status, 201);
  assert.equal((await publish(alice, { package: pkg({ version: '2.1.0' }) })).status, 201);
  assert.equal((await api('GET', '/v1/widgets/hello-world/thumbnail')).status, 200);
  assert.equal((await api('GET', '/v1/widgets/hello-world')).json.thumbnailUrl, '/v1/widgets/hello-world/thumbnail');
});

test('publish: thumbnails and size limits', async (t) => {
  const { api, user, publish } = await start(t);
  const alice = await user('alice');

  assert.equal((await publish(alice, { package: pkg({ id: 'no-thumb' }) })).status, 201);
  assert.equal((await api('GET', '/v1/widgets/no-thumb/thumbnail')).status, 404);
  assert.equal((await api('GET', '/v1/widgets/missing/thumbnail')).status, 404);

  const notPng = Buffer.from('GIF89a-this-is-not-a-png').toString('base64');
  const r1 = await publish(alice, { package: pkg({ id: 'thumb-a' }), thumbnail: notPng });
  assert.equal(r1.status, 400);
  assert.match(r1.json.error, /PNG/);
  assert.equal((await publish(alice, { package: pkg({ id: 'thumb-a' }), thumbnail: '***not base64***' })).status, 400);
  assert.equal((await publish(alice, { package: pkg({ id: 'thumb-a' }), thumbnail: 123 })).status, 400);
  assert.equal((await publish(alice, { package: pkg({ id: 'thumb-a' }), thumbnail: '' })).status, 400);

  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(401 * 1024)]).toString('base64');
  assert.equal((await publish(alice, { package: pkg({ id: 'thumb-a' }), thumbnail: big })).status, 413);
  assert.equal((await api('GET', '/v1/widgets/thumb-a')).status, 404); // nothing was created by the failures

  const ok = await publish(alice, { package: pkg({ id: 'thumb-ok' }), thumbnail: PNG_1X1 });
  assert.equal(ok.status, 201);
  const res = await api('GET', '/v1/widgets/thumb-ok/thumbnail');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control'), /public, max-age=3600/);

  // package over 2 MB (each field is below the per-field limit)
  const chunk = 'a'.repeat(500000);
  const huge = await publish(alice, { package: pkg({ id: 'huge', html: chunk, css: chunk, js: chunk, setupHtml: chunk, setupJs: chunk }) });
  assert.equal(huge.status, 413);
  assert.equal((await api('GET', '/v1/widgets/huge')).status, 404);

  // small request bodies are capped at 16 KB
  const tooBig = await api('POST', '/v1/auth/login', { body: { username: 'a'.repeat(20000), password: 'b' } });
  assert.equal(tooBig.status, 413);
});

test('download and install counting', async (t) => {
  const { api, user, publish, tick } = await start(t);
  const alice = await user('alice');
  const p1 = pkg({ version: '1.0.0', js: 'console.log(1)' });
  const p2 = pkg({ version: '1.1.0', js: 'console.log(2)' });
  await publish(alice, { package: p1 });
  tick(10);
  await publish(alice, { package: p2 });

  const dl = await api('GET', '/v1/widgets/hello-world/download', { ip: '1.1.1.1' });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-type'), /^application\/json/);
  assert.equal(dl.headers.get('content-disposition'), 'attachment; filename="hello-world-1.1.0.widget"');
  assert.deepEqual(dl.json, p2);

  const old = await api('GET', '/v1/widgets/hello-world/download?version=1.0.0', { ip: '1.1.1.1' });
  assert.deepEqual(old.json, p1);
  assert.equal(old.headers.get('content-disposition'), 'attachment; filename="hello-world-1.0.0.widget"');
  assert.deepEqual((await api('GET', '/v1/widgets/hello-world/download?version=latest', { ip: '1.1.1.1' })).json, p2);
  assert.equal((await api('GET', '/v1/widgets/hello-world/download?version=9.9.9')).status, 404);
  assert.equal((await api('GET', '/v1/widgets/nope/download')).status, 404);

  const installs = async () => (await api('GET', '/v1/widgets/hello-world')).json.installs;
  assert.equal(await installs(), 1); // same ip counted once, 24h dedupe

  await api('GET', '/v1/widgets/hello-world/download?count=0', { ip: '2.2.2.2' });
  assert.equal(await installs(), 1);

  await api('GET', '/v1/widgets/hello-world/download', { ip: '2.2.2.2', headers: { 'x-forwarded-for': '2.2.2.2, 9.9.9.9' } });
  assert.equal(await installs(), 2);
  // the first x-forwarded-for entry identifies the client, so this is the same client again
  await api('GET', '/v1/widgets/hello-world/download', { headers: { 'x-forwarded-for': '2.2.2.2, 8.8.8.8' } });
  assert.equal(await installs(), 2);
  // cf-connecting-ip wins
  await api('GET', '/v1/widgets/hello-world/download', { headers: { 'cf-connecting-ip': '3.3.3.3' } });
  assert.equal(await installs(), 3);

  tick(23 * 3600 * 1000);
  await api('GET', '/v1/widgets/hello-world/download', { ip: '1.1.1.1' });
  assert.equal(await installs(), 3);
  tick(2 * 3600 * 1000);
  await api('GET', '/v1/widgets/hello-world/download', { ip: '1.1.1.1' });
  assert.equal(await installs(), 4); // counted again after 24h
});

test('ratings: upsert, validation, listing', async (t) => {
  const { api, user, publish, tick } = await start(t);
  const alice = await user('alice');
  const bob = await user('bob');
  const carol = await user('carol');
  await publish(alice, { package: pkg() });
  const rate = (u, body, slug = 'hello-world') => api('POST', '/v1/widgets/' + slug + '/rating', { token: u && u.token, body });

  assert.equal((await rate(null, { rating: 5 })).status, 401);
  assert.equal((await rate(bob, { rating: 5 }, 'nope')).status, 404);
  for (const bad of [{}, { rating: 0 }, { rating: 6 }, { rating: 3.5 }, { rating: '4' }, { rating: 4, review: 'x'.repeat(501) }, { rating: 4, review: 7 }]) {
    assert.equal((await rate(bob, bad)).status, 400, JSON.stringify(bad));
  }

  const r1 = await rate(bob, { rating: 5, review: 'great' });
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.json, { ratingAvg: 5, ratingCount: 1 });
  tick(1000);
  const r2 = await rate(carol, { rating: 4 });
  assert.deepEqual(r2.json, { ratingAvg: 4.5, ratingCount: 2 });
  tick(1000);
  const r3 = await rate(alice, { rating: 4 });
  assert.deepEqual(r3.json, { ratingAvg: 4.3, ratingCount: 3 }); // 13/3 rounded to 1 decimal

  // upsert: same user changes their rating, count stays
  tick(1000);
  const up = await rate(bob, { rating: 1, review: 'changed my mind' });
  assert.deepEqual(up.json, { ratingAvg: 3, ratingCount: 3 });

  const d = (await api('GET', '/v1/widgets/hello-world')).json;
  assert.equal(d.ratingAvg, 3);
  assert.equal(d.ratingCount, 3);

  const list = await api('GET', '/v1/widgets/hello-world/ratings');
  assert.equal(list.json.total, 3);
  assert.equal(list.json.items.length, 3);
  assert.equal(list.json.items[0].username, 'bob'); // most recently touched first
  assert.equal(list.json.items[0].rating, 1);
  assert.equal(list.json.items[0].review, 'changed my mind');
  assert.ok(list.json.items[0].createdAt);
  const page2 = await api('GET', '/v1/widgets/hello-world/ratings?limit=2&page=2');
  assert.equal(page2.json.items.length, 1);
  assert.equal(page2.json.total, 3);
  assert.equal((await api('GET', '/v1/widgets/nope/ratings')).status, 404);
});

test('search, sort and pagination', async (t) => {
  const { api, user, publish, tick } = await start(t);
  const alice = await user('alice');
  const bob = await user('bob');
  const carol = await user('carol');
  tick(1000);
  await publish(alice, { package: pkg({ id: 'alpha', name: 'Alpha Clock', description: 'tells the time', category: 'time', tags: ['clock'] }) });
  tick(1000);
  await publish(bob, { package: pkg({ id: 'bravo', name: 'bravo cpu', description: 'cpu 100% usage_graph', category: 'system', tags: ['cpu', 'monitor'] }) });
  tick(1000);
  await publish(carol, { package: pkg({ id: 'charlie', name: 'Charlie Notes', description: 'scribble', category: 'productivity', tags: ['notes'] }) });

  // installs: bravo 2, charlie 1, alpha 0.  ratings: alpha 5, bravo 3, charlie 4
  const dl = (slug, ip) => api('GET', '/v1/widgets/' + slug + '/download', { ip });
  await dl('bravo', '5.5.5.1'); await dl('bravo', '5.5.5.2'); await dl('charlie', '5.5.5.1');
  const rate = (u, slug, rating) => api('POST', '/v1/widgets/' + slug + '/rating', { token: u.token, body: { rating } });
  await rate(bob, 'alpha', 5); await rate(alice, 'bravo', 3); await rate(alice, 'charlie', 4);

  const slugs = async (qs) => (await api('GET', '/v1/widgets' + qs)).json.items.map((i) => i.slug);
  assert.deepEqual(await slugs(''), ['bravo', 'charlie', 'alpha']); // default = popular
  assert.deepEqual(await slugs('?sort=popular'), ['bravo', 'charlie', 'alpha']);
  assert.deepEqual(await slugs('?sort=new'), ['charlie', 'bravo', 'alpha']);
  assert.deepEqual(await slugs('?sort=rating'), ['alpha', 'charlie', 'bravo']);
  assert.deepEqual(await slugs('?sort=name'), ['alpha', 'bravo', 'charlie']);
  assert.deepEqual(await slugs('?sort=bogus'), ['bravo', 'charlie', 'alpha']);

  // search: name, description, tags, author, case-insensitive
  assert.deepEqual(await slugs('?q=CLOCK'), ['alpha']);
  assert.deepEqual(await slugs('?q=scribble'), ['charlie']);
  assert.deepEqual(await slugs('?q=monitor'), ['bravo']);
  assert.deepEqual(await slugs('?q=carol'), ['charlie']);
  assert.deepEqual(await slugs('?q=zzz'), []);
  // wildcards are escaped
  assert.deepEqual(await slugs('?q=%25'), ['bravo']); // only the literal "100%"
  assert.deepEqual(await slugs('?q=_'), ['bravo']); // only the literal "usage_graph"
  assert.deepEqual(await slugs('?q=100%25%20usage'), ['bravo']);
  assert.deepEqual(await slugs("?q=" + encodeURIComponent("'; DROP TABLE widgets;--")), []);
  assert.equal((await api('GET', '/v1/widgets')).json.total, 3);

  // filters
  assert.deepEqual(await slugs('?category=system'), ['bravo']);
  assert.deepEqual(await slugs('?author=ALICE'), ['alpha']);
  assert.deepEqual(await slugs('?category=system&author=alice'), []);

  // pagination
  const p1 = (await api('GET', '/v1/widgets?limit=2&page=1')).json;
  assert.equal(p1.total, 3);
  assert.equal(p1.page, 1);
  assert.equal(p1.limit, 2);
  assert.deepEqual(p1.items.map((i) => i.slug), ['bravo', 'charlie']);
  const p2 = (await api('GET', '/v1/widgets?limit=2&page=2')).json;
  assert.deepEqual(p2.items.map((i) => i.slug), ['alpha']);
  assert.equal((await api('GET', '/v1/widgets?limit=2&page=3')).json.items.length, 0);
  assert.equal((await api('GET', '/v1/widgets?limit=1000')).json.limit, 60);
  assert.equal((await api('GET', '/v1/widgets?limit=abc&page=-4')).json.limit, 24);
  assert.equal((await api('GET', '/v1/widgets?limit=abc&page=-4')).json.page, 1);

  // summary fields on the listing
  const top = (await api('GET', '/v1/widgets')).json.items[0];
  assert.equal(top.installs, 2);
  assert.equal(top.ratingAvg, 3);
  assert.equal(top.ratingCount, 1);
  assert.equal(top.author, 'bob');
  assert.equal(top.category, 'system');
  assert.deepEqual(top.tags, ['cpu', 'monitor']);
});

test('update check', async (t) => {
  const { api, user, publish, tick } = await start(t);
  const alice = await user('alice');
  await publish(alice, { package: pkg({ id: 'clock-one', version: '1.0.0' }) });
  tick(10);
  await publish(alice, { package: pkg({ id: 'clock-one', version: '1.1.0' }), changelog: 'adds seconds' });
  await publish(alice, { package: pkg({ id: 'clock-two', version: '2.0.0' }), changelog: 'initial' });

  const r = await api('POST', '/v1/updates', { body: { installed: [
    { slug: 'clock-one', version: '1.0.0' },
    { slug: 'clock-two', version: '2.0.0' }, // up to date
    { slug: 'unknown-widget', version: '1.0.0' }, // ignored
    { slug: 'clock-two', version: 'garbage' } // ignored
  ] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { updates: [{ slug: 'clock-one', installedVersion: '1.0.0', latestVersion: '1.1.0', changelog: 'adds seconds' }] });

  assert.deepEqual((await api('POST', '/v1/updates', { body: { installed: [] } })).json, { updates: [] });
  assert.equal((await api('POST', '/v1/updates', { body: {} })).status, 400);
  assert.equal((await api('POST', '/v1/updates', { body: { installed: [{ slug: 1 }] } })).status, 400);
  const many = Array.from({ length: 200 }, (_, i) => ({ slug: 'w' + i, version: '1.0.0' }));
  assert.equal((await api('POST', '/v1/updates', { body: { installed: many } })).status, 200);
  many.push({ slug: 'one-too-many', version: '1.0.0' });
  assert.equal((await api('POST', '/v1/updates', { body: { installed: many } })).status, 400);
});

test('delete: owner, other users and admin', async (t) => {
  const { api, user, publish, reg } = await start(t);
  const alice = await user('alice');
  const bob = await user('bob');
  await publish(alice, { package: pkg({ id: 'mine' }), thumbnail: PNG_1X1 });
  await publish(alice, { package: pkg({ id: 'also-mine' }) });
  await api('POST', '/v1/widgets/mine/rating', { token: bob.token, body: { rating: 4 } });
  await api('GET', '/v1/widgets/mine/download', { ip: '4.4.4.4' });

  assert.equal((await api('DELETE', '/v1/widgets/mine')).status, 401);
  assert.equal((await api('DELETE', '/v1/widgets/mine', { token: bob.token })).status, 403);
  assert.equal((await api('DELETE', '/v1/widgets/mine', { token: 'nottherealadmin' })).status, 401);
  assert.equal((await api('DELETE', '/v1/widgets/nope', { token: alice.token })).status, 404);

  const ok = await api('DELETE', '/v1/widgets/mine', { token: alice.token });
  assert.deepEqual(ok.json, { ok: true });
  assert.equal((await api('GET', '/v1/widgets/mine')).status, 404);
  // cascade
  assert.equal(reg.db.prepare('SELECT COUNT(*) AS n FROM versions WHERE widget_id NOT IN (SELECT id FROM widgets)').get().n, 0);
  assert.equal(reg.db.prepare('SELECT COUNT(*) AS n FROM ratings').get().n, 0);
  assert.equal(reg.db.prepare('SELECT COUNT(*) AS n FROM install_log').get().n, 0);
  assert.equal(reg.db.prepare('SELECT COUNT(*) AS n FROM versions').get().n, 1);

  // slug is free again, even for someone else
  assert.equal((await publish(bob, { package: pkg({ id: 'mine' }) })).status, 201);

  // admin can delete anyone's widget
  assert.equal((await api('DELETE', '/v1/widgets/also-mine', { token: ADMIN })).status, 200);
  assert.equal((await api('GET', '/v1/widgets/also-mine')).status, 404);
});

test('admin: feature and stats', async (t) => {
  const { api, user, publish } = await start(t);
  const alice = await user('alice');
  await publish(alice, { package: pkg({ id: 'one-widget' }) });
  await publish(alice, { package: pkg({ id: 'two-widget' }) });
  await api('GET', '/v1/widgets/one-widget/download', { ip: '7.7.7.7' });

  const feat = (token, slug, body) => api('POST', '/v1/admin/widgets/' + slug + '/feature', { token, body });
  assert.equal((await feat(undefined, 'one-widget', { featured: true })).status, 401);
  assert.equal((await feat(alice.token, 'one-widget', { featured: true })).status, 403);
  assert.equal((await feat(ADMIN, 'nope', { featured: true })).status, 404);
  assert.equal((await feat(ADMIN, 'one-widget', { featured: 'yes' })).status, 400);
  const ok = await feat(ADMIN, 'one-widget', { featured: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);

  const f = await api('GET', '/v1/widgets?featured=1');
  assert.deepEqual(f.json.items.map((i) => i.slug), ['one-widget']);
  assert.equal(f.json.items[0].featured, true);
  await feat(ADMIN, 'one-widget', { featured: false });
  assert.equal((await api('GET', '/v1/widgets?featured=1')).json.total, 0);

  assert.equal((await api('GET', '/v1/admin/stats')).status, 401);
  assert.equal((await api('GET', '/v1/admin/stats', { token: alice.token })).status, 403);
  const stats = await api('GET', '/v1/admin/stats', { token: ADMIN });
  assert.equal(stats.status, 200);
  assert.equal(stats.json.users, 1);
  assert.equal(stats.json.widgets, 2);
  assert.equal(stats.json.versions, 2);
  assert.equal(stats.json.installs, 1);
});

test('admin endpoints return 503 when no admin token is configured', async (t) => {
  const { api } = await start(t, { adminToken: '' });
  assert.equal((await api('GET', '/v1/admin/stats', { token: 'anything' })).status, 503);
  assert.equal((await api('POST', '/v1/admin/widgets/x/feature', { token: 'anything', body: { featured: true } })).status, 503);
  // an empty bearer must never count as the admin
  assert.equal((await api('DELETE', '/v1/widgets/x', { token: '' })).status, 401);
});

test('legacy read-only routes', async (t) => {
  const { api, user, publish, tick } = await start(t);
  const alice = await user('alice');
  const p = pkg({ id: 'legacy-one', name: 'Legacy One', description: 'old client sees me' });
  tick(1000);
  await publish(alice, { package: p });
  tick(1000);
  await publish(alice, { package: pkg({ id: 'legacy-two', name: 'Legacy Two' }) });
  tick(1000);
  const p11 = pkg({ id: 'legacy-one', name: 'Legacy One', description: 'old client sees me', version: '1.1.0' });
  await publish(alice, { package: p11 });

  const list = await api('GET', '/widgets');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.json));
  assert.equal(list.json.length, 2);
  const one = list.json.find((w) => w.name === 'Legacy One');
  assert.deepEqual(Object.keys(one).sort(), ['author', 'created_at', 'description', 'id', 'name']);
  assert.equal(typeof one.id, 'number');
  assert.equal(one.author, 'alice');
  assert.match(one.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  const detail = await api('GET', '/widgets/' + one.id);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.id, one.id);
  assert.equal(detail.json.name, 'Legacy One');
  assert.equal(typeof detail.json.json_content, 'string');
  assert.deepEqual(JSON.parse(detail.json.json_content), p11); // latest version

  assert.equal((await api('GET', '/widgets/99999')).status, 404);
  assert.equal((await api('GET', '/widgets/abc')).status, 404);

  const post = await api('POST', '/widgets', { body: { anything: 1 } });
  assert.equal(post.status, 410);
  assert.deepEqual(post.json, { error: 'Publishing moved to /v1/widgets' });
  assert.equal((await api('DELETE', '/widgets/1')).status, 405);
});

test('rate limits', async (t) => {
  const { api, user, publish, tick } = await start(t);

  // auth: 10 per minute per ip, shared by login and register
  const ip = '203.0.113.9';
  for (let i = 0; i < 10; i++) {
    const r = await api('POST', '/v1/auth/login', { ip, body: { username: 'ghost', password: 'whatever1' } });
    assert.equal(r.status, 401, 'attempt ' + i);
  }
  const blocked = await api('POST', '/v1/auth/login', { ip, body: { username: 'ghost', password: 'whatever1' } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.ok(blocked.json.error);
  assert.equal((await api('POST', '/v1/auth/register', { ip, body: { username: 'someone', password: 'password123' } })).status, 429);
  // other clients are unaffected
  assert.equal((await api('POST', '/v1/auth/login', { ip: '203.0.113.10', body: { username: 'ghost', password: 'whatever1' } })).status, 401);
  tick(61 * 1000);
  assert.equal((await api('POST', '/v1/auth/login', { ip, body: { username: 'ghost', password: 'whatever1' } })).status, 401);

  // publish: 20 per hour per ip (failed attempts count too)
  const alice = await user('alice');
  const pip = '203.0.113.20';
  for (let i = 0; i < 20; i++) assert.equal((await publish(alice, { package: 'nope' }, { ip: pip })).status, 400);
  assert.equal((await publish(alice, { package: pkg() }, { ip: pip })).status, 429);
  tick(3601 * 1000);
  assert.equal((await publish(alice, { package: pkg() }, { ip: pip })).status, 201);

  // rating: 30 per hour per ip
  const rip = '203.0.113.30';
  for (let i = 0; i < 30; i++) assert.equal((await api('POST', '/v1/widgets/hello-world/rating', { token: alice.token, ip: rip, body: { rating: 9 } })).status, 400);
  assert.equal((await api('POST', '/v1/widgets/hello-world/rating', { token: alice.token, ip: rip, body: { rating: 5 } })).status, 429);

  // reads: 300 per minute per ip, health is exempt
  const gip = '203.0.113.40';
  for (let i = 0; i < 300; i++) {
    const r = await api('GET', '/v1/widgets?limit=1', { ip: gip });
    if (r.status !== 200) assert.fail('read ' + i + ' returned ' + r.status);
  }
  assert.equal((await api('GET', '/v1/widgets', { ip: gip })).status, 429);
  assert.equal((await api('GET', '/health', { ip: gip })).status, 200);
});

test('data persists on disk (WAL) and migrations are versioned', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'nested', 'registry.db');

  const a = await start(t, { dbPath });
  const alice = await a.user('alice');
  assert.equal((await a.publish(alice, { package: pkg(), thumbnail: PNG_1X1 })).status, 201);
  assert.equal(a.reg.db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(a.reg.db.prepare('PRAGMA user_version').get().user_version, 1);
  const tokenBefore = alice.token;
  await a.reg.close();

  const b = await start(t, { dbPath });
  assert.equal((await b.api('GET', '/v1/me', { token: tokenBefore })).json.user.username, 'alice');
  assert.equal((await b.api('GET', '/v1/widgets/hello-world')).status, 200);
  assert.equal((await b.api('GET', '/v1/widgets/hello-world/thumbnail')).status, 200);
  assert.equal(b.reg.db.prepare('PRAGMA user_version').get().user_version, 1);
  await b.reg.close();
});

test('baseUrl prefixes thumbnail urls', async (t) => {
  const { user, publish, api } = await start(t, { baseUrl: 'https://registry.example.com/' });
  const alice = await user('alice');
  await publish(alice, { package: pkg(), thumbnail: PNG_1X1 });
  assert.equal((await api('GET', '/v1/widgets/hello-world')).json.thumbnailUrl, 'https://registry.example.com/v1/widgets/hello-world/thumbnail');
});

test('sql injection attempts are inert', async (t) => {
  const { api, user, publish } = await start(t);
  const alice = await user('alice');
  await publish(alice, { package: pkg() });
  const inj = "x' OR '1'='1";
  assert.equal((await api('GET', '/v1/widgets/' + encodeURIComponent(inj))).status, 404);
  assert.equal((await api('GET', '/v1/widgets?category=' + encodeURIComponent(inj))).json.total, 0);
  assert.equal((await api('GET', '/v1/widgets?author=' + encodeURIComponent(inj))).json.total, 0);
  const r = await api('POST', '/v1/auth/login', { body: { username: "alice' --", password: 'password123' } });
  assert.equal(r.status, 401);
});
