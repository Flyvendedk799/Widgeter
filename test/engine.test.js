const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const manifest = require('../engine/manifest');
const format = require('../engine/widget-format');
const { createFetchCache } = require('../engine/net-cache');
const { snapBounds } = require('../engine/snap');
const { findFreeSpot } = require('../engine/placement');
const { TEMPLATES } = require('../engine/layout-templates');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'widgeter-test-'));

test('manifest: valid widget normalises with defaults', () => {
  const r = manifest.validateManifest({ id: 'hello', name: 'Hello', version: '1.2.3', description: 'x', html: '<p>hi</p>' }, { strict: true });
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.manifest.category, 'other');
  assert.equal(r.manifest.width, 300);
  assert.equal(r.manifest.useBaseStyles, true);
});

test('manifest: legacy widget without version keeps its own styles and warns', () => {
  const r = manifest.validateManifest({ name: 'Old Widget', js: '' });
  assert.equal(r.ok, true);
  assert.equal(r.manifest.id, 'old-widget');
  assert.equal(r.manifest.useBaseStyles, false);
  assert.ok(r.warnings.length >= 1);
});

test('manifest: strict mode demands id, version and description', () => {
  const r = manifest.validateManifest({ name: 'X', html: '' }, { strict: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /id is required/.test(e)));
  assert.ok(r.errors.some((e) => /version is required/.test(e)));
  assert.ok(r.errors.some((e) => /description is required/.test(e)));
});

test('manifest: rejects bad ids, versions, categories and config', () => {
  const bad = manifest.validateManifest({
    id: 'Bad Id', name: 'N', version: '1.0', category: 'nope', html: '',
    config: [{ key: '1x', type: 'text' }, { key: 'ok', type: 'weird' }, { key: 'sel', type: 'select' }, { key: 'dup' }, { key: 'dup' }]
  });
  assert.equal(bad.ok, false);
  const text = bad.errors.join('\n');
  assert.match(text, /id must be/);
  assert.match(text, /version must look like/);
  assert.match(text, /category must be one of/);
  assert.match(text, /config\[0\]\.key/);
  assert.match(text, /weird/);
  assert.match(text, /options is required/);
  assert.match(text, /declared twice/);
});

test('manifest: compareVersions orders semver numerically', () => {
  assert.equal(manifest.compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(manifest.compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(manifest.compareVersions('0.9.9', '1.0.0'), -1);
});

test('manifest: config defaults, coercion and missing-required', () => {
  const m = manifest.validateManifest({
    id: 'cfg', name: 'Cfg', version: '1.0.0', html: '',
    config: [
      { key: 'city', type: 'text', default: 'Oslo' },
      { key: 'count', type: 'number', default: 5, min: 1, max: 10 },
      { key: 'on', type: 'boolean' },
      { key: 'token', type: 'password', required: true }
    ]
  }).manifest;
  assert.deepEqual(manifest.configDefaults(m), { city: 'Oslo', count: 5 });
  assert.equal(manifest.coerceConfigValue(m.config[1], '50'), 10);
  assert.equal(manifest.coerceConfigValue(m.config[1], 'abc'), 5);
  assert.equal(manifest.coerceConfigValue(m.config[2], 'on'), true);
  assert.deepEqual(manifest.missingRequired(m, {}), ['token']);
  assert.deepEqual(manifest.missingRequired(m, { token: 'x' }), []);
});

test('widget-format: folder and single-file round trip', () => {
  const dir = tmp();
  const pkg = { id: 'round-trip', name: 'Round Trip', version: '1.0.0', description: 'd', html: '<b>x</b>', css: 'b{color:red}', js: 'var a = 1;', config: [{ key: 'k', type: 'text' }] };
  const folder = path.join(dir, 'round-trip');
  format.unpackWidget(pkg, folder);
  assert.ok(fs.existsSync(path.join(folder, 'widget.json')));
  assert.equal(fs.readFileSync(path.join(folder, 'index.html'), 'utf8'), '<b>x</b>');
  assert.equal(format.isFolderWidget(folder), true);

  const loaded = format.loadWidget(folder, { strict: true });
  assert.equal(loaded.ok, true, loaded.errors.join('; '));
  assert.equal(loaded.kind, 'folder');
  assert.equal(loaded.manifest.css, 'b{color:red}');

  const packed = format.packWidget(folder);
  assert.equal(packed.js, 'var a = 1;');
  assert.equal(packed.files, undefined);

  fs.writeFileSync(path.join(dir, 'single.widget'), JSON.stringify(packed));
  const items = format.listWidgets(dir);
  assert.deepEqual(items.map((i) => [i.id, i.kind]), [['round-trip', 'folder'], ['single.widget', 'file']]);
});

test('widget-format: broken json is reported, not thrown', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'bad.widget'), '{ nope');
  const r = format.loadWidget(path.join(dir, 'bad.widget'));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Could not read widget/);
});

test('widget-format: folder widgets cannot read files outside their folder', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'top secret');
  const folder = path.join(dir, 'w');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'widget.json'), JSON.stringify({ id: 'w1', name: 'W', version: '1.0.0', description: 'd', files: { html: '../secret.txt' } }));
  const loaded = format.loadWidget(folder);
  assert.notEqual(loaded.manifest && loaded.manifest.html, 'top secret');
});

test('net-cache: ttl cache, in-flight dedupe, stale on error', async () => {
  let calls = 0;
  let fail = false;
  let clock = 1000;
  const fakeFetch = async (url) => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    if (fail) throw new Error('offline');
    return { ok: true, status: 200, headers: new Map(), text: async () => 'body-' + calls };
  };
  const cache = createFetchCache(fakeFetch, { now: () => clock, minHostGapMs: 0 });

  const [a, b] = await Promise.all([cache.fetch('https://x.test/a', { ttl: 60 }), cache.fetch('https://x.test/a', { ttl: 60 })]);
  assert.equal(calls, 1, 'identical in-flight requests share one fetch');
  assert.equal(a.text, b.text);

  const hit = await cache.fetch('https://x.test/a', { ttl: 60 });
  assert.equal(hit.cached, true);
  assert.equal(calls, 1);

  clock += 61000;
  fail = true;
  const stale = await cache.fetch('https://x.test/a', { ttl: 60 });
  assert.equal(stale.stale, true, 'serves stale data when the network fails');

  await assert.rejects(cache.fetch('https://x.test/never-fetched', { ttl: 60 }), /offline/);
});

test('net-cache: ttl 0 never caches', async () => {
  let calls = 0;
  const cache = createFetchCache(async () => { calls++; return { ok: true, status: 200, headers: new Map(), text: async () => 'x' }; }, { minHostGapMs: 0 });
  await cache.fetch('https://x.test/z');
  await cache.fetch('https://x.test/z');
  assert.equal(calls, 2);
});

test('snap: aligns to screen edge and to neighbours, stays inside the work area', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const edge = snapBounds({ x: 8, y: 500, width: 300, height: 200 }, area, [], { threshold: 12 });
  assert.equal(edge.x, 0);
  const right = snapBounds({ x: 1610, y: 100, width: 300, height: 200 }, area, [], { threshold: 12 });
  assert.equal(right.x, 1620);
  const neighbour = snapBounds({ x: 330, y: 20, width: 100, height: 100 }, area, [{ x: 20, y: 20, width: 300, height: 100 }], { threshold: 12, gap: 8 });
  assert.equal(neighbour.x, 328);
  assert.equal(neighbour.y, 20);
  const far = snapBounds({ x: 500, y: 500, width: 100, height: 100 }, area, [], { threshold: 12 });
  assert.deepEqual([far.x, far.y], [500, 500]);
  const off = snapBounds({ x: -50, y: 2000, width: 100, height: 100 }, area, [], { threshold: 0 });
  assert.ok(off.x >= 0 && off.y + 100 <= 1040);
});

test('snap: grid rounding', () => {
  const r = snapBounds({ x: 117, y: 203, width: 100, height: 100 }, { x: 0, y: 0, width: 1000, height: 1000 }, [], { threshold: 0, grid: 16 });
  assert.deepEqual([r.x, r.y], [112, 208]);
});

test('placement: new widgets get free, non-overlapping spots', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const placed = [];
  for (let i = 0; i < 12; i++) {
    const spot = findFreeSpot({ width: 280, height: 260 }, area, placed);
    const box = { x: spot.x, y: spot.y, width: 280, height: 260 };
    for (const p of placed) {
      const overlap = box.x < p.x + p.width && p.x < box.x + box.width && box.y < p.y + p.height && p.y < box.y + box.height;
      assert.equal(overlap, false, 'widget ' + i + ' overlaps');
    }
    assert.ok(box.x >= 0 && box.x + box.width <= 1920 && box.y >= 0 && box.y + box.height <= 1040);
    placed.push(box);
  }
});

test('placement: a full screen falls back to a cascade instead of throwing', () => {
  const area = { x: 0, y: 0, width: 400, height: 300 };
  const spot = findFreeSpot({ width: 380, height: 280 }, area, [{ x: 0, y: 0, width: 400, height: 300 }]);
  assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.y));
});

test('layout templates: every template covers every widget with sane percentages', () => {
  for (const t of TEMPLATES) {
    for (const n of [1, 2, 5, 9]) {
      const ids = Array.from({ length: n }, (_, i) => 'w' + i);
      const out = t.generate(ids);
      assert.equal(out.length, n, t.name + ' with ' + n);
      for (const p of out) {
        for (const k of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(p[k]), t.name + ' ' + k);
        assert.ok(p.width > 0 && p.height > 0, t.name + ' has an empty box');
      }
    }
  }
});
