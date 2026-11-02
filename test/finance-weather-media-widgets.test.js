'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const format = require('../engine/widget-format');

const WIDGETS = [
  'crypto-prices',
  'crypto-chart',
  'currency-rates',
  'weather',
  'weather-forecast',
  'audio-spectrum'
];

test('finance, weather and media widgets load and validate cleanly', () => {
  for (const id of WIDGETS) {
    const dir = path.join(__dirname, '..', 'gallery', id);
    const loaded = format.loadWidget(dir, { strict: true });
    assert.equal(loaded.ok, true, `widget ${id} should be valid`);
    assert.equal(loaded.errors.length, 0, `widget ${id} should have no errors`);
  }
});

test('crypto-prices contains modernized sparkline and badge styling', () => {
  const dir = path.join(__dirname, '..', 'gallery', 'crypto-prices');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

  assert.ok(css.includes('.spark-area'), 'style.css has .spark-area');
  assert.ok(css.includes('.spark-line'), 'style.css has .spark-line');
  assert.ok(css.includes('.sym'), 'style.css has .sym');
  assert.ok(js.includes('wg-stat-trend'), 'script.js renders .wg-stat-trend');
  assert.ok(js.includes('wg-badge'), 'script.js renders .wg-badge');
  assert.ok(js.includes('polygon'), 'script.js generates sparkline polygon');
});

test('crypto-chart contains modernized canvas glowing chart and stat cards', () => {
  const dir = path.join(__dirname, '..', 'gallery', 'crypto-chart');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

  assert.ok(html.includes('stat-card'), 'index.html has stat-card elements');
  assert.ok(css.includes('.stat-card'), 'style.css styles stat cards');
  assert.ok(css.includes('backdrop-filter'), 'style.css has modern frosted hover glass');
  assert.ok(js.includes('wg-stat-trend'), 'script.js renders .wg-stat-trend');
  assert.ok(js.includes('shadowBlur'), 'script.js draws glowing chart line');
});

test('currency-rates contains sleek conversion card styling and dynamic sparklines', () => {
  const dir = path.join(__dirname, '..', 'gallery', 'currency-rates');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

  assert.ok(css.includes('.code-badge'), 'style.css has code-badge pill');
  assert.ok(css.includes('.spark-area'), 'style.css has spark-area');
  assert.ok(js.includes('wg-stat-trend'), 'script.js renders .wg-stat-trend');
  assert.ok(js.includes('wg-badge'), 'script.js renders .wg-badge');
});

test('weather features atmospheric hero card, hourly layout, and metric cells', () => {
  const dir = path.join(__dirname, '..', 'gallery', 'weather');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

  assert.ok(css.includes('.now-card'), 'style.css has atmospheric .now-card');
  assert.ok(css.includes('.hour-col'), 'style.css has .hour-col');
  assert.ok(css.includes('.stat-cell'), 'style.css has .stat-cell');
  assert.ok(js.includes('now-card'), 'script.js renders now-card');
  assert.ok(js.includes('rain-chip'), 'script.js renders rain probability chips');
});

test('weather-forecast features flexible multi-day layout, today highlight, and range sliders', () => {
  const dir = path.join(__dirname, '..', 'gallery', 'weather-forecast');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

  assert.ok(css.includes('.day.today'), 'style.css styles current day highlight');
  assert.ok(css.includes('.rain-chip'), 'style.css styles rain chip');
  assert.ok(css.includes('.range i'), 'style.css styles gradient temperature range slider');
  assert.ok(js.includes('today'), 'script.js applies today class');
});

test('audio-spectrum features vivid equalizer styling and peak caps', () => {
  const dir = path.join(__dirname, '..', 'gallery', 'audio-spectrum');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

  assert.ok(css.includes('.stage'), 'style.css has stage styling');
  assert.ok(css.includes('.meter .wg-fill'), 'style.css styles input meter');
  assert.ok(js.includes('roundRect'), 'script.js supports rounded bar paths');
  assert.ok(js.includes('shadowBlur'), 'script.js draws glowing peak caps');
  assert.ok(js.includes('ResizeObserver'), 'script.js observes container resize');
});
