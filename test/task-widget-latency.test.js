'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const format = require('../engine/widget-format');
const widgetScript = require('../gallery/api-latency/script.js');

test('api-latency: manifest loads and strictly validates', () => {
  const dir = path.join(__dirname, '..', 'gallery', 'api-latency');
  const res = format.loadWidget(dir, { strict: true });

  assert.equal(res.ok, true, 'Manifest must validate cleanly with no errors');
  assert.equal(res.errors.length, 0, 'Must have zero errors');
  assert.equal(res.manifest.id, 'api-latency');
  assert.equal(res.manifest.name, 'API Latency Monitor');
  assert.equal(res.manifest.version, '1.0.0');
  assert.equal(res.manifest.category, 'dev');
  assert.equal(res.manifest.width, 300);
  assert.equal(res.manifest.height, 220);

  const configs = res.manifest.config;
  assert.ok(Array.isArray(configs), 'Config must be an array');
  const configKeys = configs.map((c) => c.key);
  assert.ok(configKeys.includes('target_url'), 'Must have target_url config');
  assert.ok(configKeys.includes('ping_interval'), 'Must have ping_interval config');
  assert.ok(configKeys.includes('sla_warn_ms'), 'Must have sla_warn_ms config');

  const packed = format.packWidget(dir);
  assert.equal(packed.id, 'api-latency');
  assert.ok(packed.html.includes('wg-beacon'), 'HTML includes wg-beacon');
  assert.ok(packed.html.includes('wg-kpi-card'), 'HTML includes wg-kpi-card');
  assert.ok(packed.html.includes('wg-spark-box'), 'HTML includes wg-spark-box');
  assert.ok(packed.html.includes('wg-split-row'), 'HTML includes wg-split-row');
  assert.ok(packed.css.includes('--wg-good'), 'CSS includes --wg-good');
  assert.ok(packed.css.includes('--wg-mono'), 'CSS includes --wg-mono');
});

test('api-latency: calculatePercentiles computes accurate P50, P95, and P99', () => {
  // Empty or invalid input
  const empty = widgetScript.calculatePercentiles([]);
  assert.deepEqual(empty, { p50: null, p95: null, p99: null });

  // Single sample
  const single = widgetScript.calculatePercentiles([42]);
  assert.deepEqual(single, { p50: 42, p95: 42, p99: 42 });

  // Known distribution: 10, 20, 30, 40, 50
  const dist = [10, 20, 30, 40, 50];
  const p = widgetScript.calculatePercentiles(dist);
  assert.equal(p.p50, 30);
  assert.equal(p.p95, 48);
  assert.equal(p.p99, 50);

  // Object samples with null/error values
  const mixed = [
    { latency: 15 },
    { latency: null },
    { latency: 25 },
    { latency: 35 },
    { latency: 45 }
  ];
  const pMixed = widgetScript.calculatePercentiles(mixed);
  assert.equal(pMixed.p50, 30);
  assert.ok(pMixed.p95 >= 40 && pMixed.p95 <= 45);
});

test('api-latency: calculateJitter computes mean absolute difference between samples', () => {
  // Less than 2 samples
  assert.equal(widgetScript.calculateJitter([]), 0);
  assert.equal(widgetScript.calculateJitter([20]), 0);

  // Successive differences: |15 - 10| + |12 - 15| + |18 - 12| = 5 + 3 + 6 = 14 / 3 = 4.66 -> 5
  const samples = [10, 15, 12, 18];
  const jitter = widgetScript.calculateJitter(samples);
  assert.equal(jitter, 5);

  // Zero jitter for steady latencies
  assert.equal(widgetScript.calculateJitter([25, 25, 25, 25]), 0);
});

test('api-latency: dynamic vector sparkline path generation and error ticks', () => {
  const elements = {};
  const mockDoc = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          attrs: {},
          setAttribute(k, v) { this.attrs[k] = String(v); },
          getAttribute(k) { return this.attrs[k]; },
          innerHTML: ''
        };
      }
      return elements[id];
    }
  };

  global.document = mockDoc;

  // Initialize mock elements
  const sparkArea = mockDoc.getElementById('spark-area');
  const sparkLine = mockDoc.getElementById('spark-line');
  const sparkLost = mockDoc.getElementById('spark-lost');
  const sparkDot = mockDoc.getElementById('spark-dot');

  const history = [
    { latency: 20, ok: true },
    { latency: 45, ok: true },
    { latency: null, ok: false }, // failed ping
    { latency: 30, ok: true }
  ];

  widgetScript.renderSparkline(history, 272, 36);

  const linePath = sparkLine.getAttribute('d');
  const areaPath = sparkArea.getAttribute('d');

  assert.ok(linePath.startsWith('M'), 'Sparkline path must start with M command');
  assert.ok(linePath.includes('L'), 'Sparkline path must contain lineTo coordinates');
  assert.ok(areaPath.startsWith('M') && areaPath.endsWith('Z'), 'Sparkline area path must be closed polygon');
  assert.ok(sparkLost.innerHTML.includes('<line'), 'Failed ping should render lost line tick');
  assert.equal(sparkDot.getAttribute('cx'), '272');
});

test('api-latency: HTTP health check handles 2xx, non-2xx, and timeout responses', async () => {
  const dom = {};
  function makeEl(id) {
    return {
      id,
      className: '',
      textContent: '',
      innerHTML: '',
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      classList: {
        add(c) { this.classes = this.classes || new Set(); this.classes.add(c); },
        remove(c) { this.classes = this.classes || new Set(); this.classes.delete(c); }
      },
      addEventListener() {}
    };
  }

  const ids = [
    'endpoint-sub', 'beacon', 'beacon-dot', 'beacon-label', 'refresh-btn',
    'status-badge', 'latency-val', 'jitter-stat', 'p50-val', 'p95-val', 'p99-val',
    'spark-area', 'spark-line', 'spark-lost', 'spark-dot'
  ];

  ids.forEach((id) => { dom[id] = makeEl(id); });
  global.document = { getElementById: (id) => dom[id] };

  let fetchResponse = { ok: true, status: 200, statusText: 'OK' };
  global.widgeter = {
    getConfig: async (key) => {
      if (key === 'target_url') return 'https://api.example.com';
      if (key === 'ping_interval') return 5;
      if (key === 'sla_warn_ms') return 100;
      return null;
    },
    fetch: async () => fetchResponse
  };

  // Run initialization and successful 200 OK ping
  await widgetScript.init();
  assert.equal(dom['endpoint-sub'].textContent, 'https://api.example.com');
  assert.ok(dom['beacon'].className.includes('good'));
  assert.equal(dom['beacon-label'].textContent, 'ONLINE');
  assert.ok(dom['latency-val'].innerHTML.includes('ms'));

  // Test non-2xx status (e.g. 503 Service Unavailable)
  fetchResponse = { ok: false, status: 503, statusText: 'Service Unavailable' };
  await widgetScript.ping();
  assert.ok(dom['beacon'].className.includes('bad'));
  assert.equal(dom['beacon-label'].textContent, 'HTTP 503');
  assert.equal(dom['status-badge'].textContent, 'HTTP 503');

  // Test network failure / timeout
  global.widgeter.fetch = async () => { throw new Error('Request timed out after 5s'); };
  await widgetScript.ping();
  assert.ok(dom['beacon'].className.includes('bad'));
  assert.equal(dom['beacon-label'].textContent, 'TIMEOUT');
  assert.equal(dom['status-badge'].textContent, 'Timeout');
  assert.ok(dom['latency-val'].innerHTML.includes('--'));

  widgetScript.stop();
  delete global.document;
  delete global.widgeter;
});
