const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const format = require('../engine/widget-format');

const WIDGETS = [
  {
    id: 'system-stats',
    expectedIds: ['host', 'cpu', 'cpu-bar', 'cpu-note', 'mem', 'mem-bar', 'mem-note', 'peak', 'uptime', 'free', 'spark-line', 'spark-area']
  },
  {
    id: 'cpu-cores',
    expectedIds: ['model', 'total', 'cpu-canvas', 'core-grid', 'm-clock', 'm-cores', 'm-peak']
  },
  {
    id: 'disk-usage',
    expectedIds: ['sub', 'refresh', 'drives']
  },
  {
    id: 'battery',
    expectedIds: ['icon', 'sub', 'badge', 'pct', 'cap', 'barwrap', 'fill', 'src', 'tlbl', 'time']
  },
  {
    id: 'network-stats',
    expectedIds: ['sub', 'refresh', 'speed', 'down', 'up', 'ifaces']
  },
  {
    id: 'top-processes',
    expectedIds: ['sub', 'refresh', 'list']
  }
];

test('system-resource-widgets: manifests validate cleanly with strict mode', () => {
  for (const { id } of WIDGETS) {
    const dir = path.join(__dirname, '..', 'gallery', id);
    const loaded = format.loadWidget(dir, { strict: true });
    assert.equal(loaded.ok, true, `${id} failed validation: ${loaded.errors.join('; ')}`);
    assert.equal(loaded.manifest.id, id);
    assert.equal(loaded.manifest.category, 'system');
    assert.ok(loaded.manifest.width >= 200 && loaded.manifest.width <= 500);
    assert.ok(loaded.manifest.height >= 100 && loaded.manifest.height <= 600);
  }
});

test('system-resource-widgets: preserve required DOM IDs used by telemetry scripts', () => {
  for (const { id, expectedIds } of WIDGETS) {
    const htmlPath = path.join(__dirname, '..', 'gallery', id, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const elId of expectedIds) {
      const re = new RegExp(`id=["']${elId}["']`);
      assert.ok(re.test(html), `Widget ${id} missing required ID "${elId}"`);
    }
  }
});

test('system-resource-widgets: scripts have valid syntax', () => {
  for (const { id } of WIDGETS) {
    const jsPath = path.join(__dirname, '..', 'gallery', id, 'script.js');
    const code = fs.readFileSync(jsPath, 'utf8');
    assert.doesNotThrow(() => {
      new vm.Script(code, { filename: jsPath });
    }, `Syntax error in ${id}/script.js`);
  }
});

test('system-resource-widgets: styles incorporate modern tokens and glass card styles', () => {
  for (const { id } of WIDGETS) {
    const cssPath = path.join(__dirname, '..', 'gallery', id, 'style.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(css.includes('--wg-mono'), `${id} should utilize --wg-mono for monospace telemetry metrics`);
    assert.ok(css.includes('backdrop-filter') || css.includes('--wg-surface'), `${id} should utilize glass surface styling`);
    assert.ok(css.includes('border-radius') || css.includes('--wg-radius'), `${id} should utilize rounded surfaces`);
  }
});

test('system-resource-widgets: html templates include status indicator dots', () => {
  for (const { id } of WIDGETS) {
    const htmlPath = path.join(__dirname, '..', 'gallery', id, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('wg-dot'), `${id} HTML should include status dot .wg-dot indicator`);
  }
});
