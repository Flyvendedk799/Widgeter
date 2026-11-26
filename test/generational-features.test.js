'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const manifest = require('../engine/manifest');
const format = require('../engine/widget-format');
const { composePage, themeAttrs } = require('../engine/compose');

const GENERATIONAL_MANIFESTS = {
  'gpu-monitor': {
    id: 'gpu-monitor',
    name: 'GPU Telemetry',
    version: '1.0.0',
    author: 'Widgeter',
    description: 'Real-time GPU load, VRAM allocation, temperature, and fan telemetry.',
    category: 'system',
    tags: ['gpu', 'hardware', 'system'],
    icon: '🎮',
    width: 280,
    height: 220,
    config: [
      { key: 'interval', label: 'Refresh Interval (s)', type: 'number', default: 2, min: 1, max: 60 },
      { key: 'temp_unit', label: 'Temperature Unit', type: 'select', default: 'c', options: [{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }] }
    ]
  },
  'zen-breathing': {
    id: 'zen-breathing',
    name: 'Zen Breathing',
    version: '1.0.0',
    author: 'Widgeter',
    description: 'Guided 4-7-8 respiration ring for relaxation, focus, and mindfulness.',
    category: 'productivity',
    tags: ['zen', 'breathing', 'focus', 'health'],
    icon: '🧘',
    width: 260,
    height: 260,
    config: [
      { key: 'technique', label: 'Pattern', type: 'select', default: '4-7-8', options: [{ value: '4-7-8', label: 'Relax (4-7-8)' }, { value: 'box', label: 'Box (4-4-4-4)' }, { value: 'energize', label: 'Awake (4-2-4-2)' }] },
      { key: 'sound_cue', label: 'Chime Audio Cue', type: 'boolean', default: false }
    ]
  },
  'api-latency': {
    id: 'api-latency',
    name: 'API Latency Monitor',
    version: '1.0.0',
    author: 'Widgeter',
    description: 'Real-time HTTP endpoint ping telemetry, jitter sparkline, and P99 latency percentiles.',
    category: 'dev',
    tags: ['api', 'latency', 'dev', 'network'],
    icon: '⚡',
    width: 300,
    height: 220,
    config: [
      { key: 'target_url', label: 'Target URL', type: 'url', default: 'https://1.1.1.1' },
      { key: 'ping_interval', label: 'Ping Interval (s)', type: 'number', default: 5, min: 2, max: 60 },
      { key: 'sla_warn_ms', label: 'Warning Threshold (ms)', type: 'number', default: 200 }
    ]
  }
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'widgeter-gen-test-'));

test('tokens: engine/tokens.css defines generational tokens in dark mode', () => {
  const dummy = manifest.validateManifest({
    id: 'tokens-dark-test',
    name: 'Tokens Dark Test',
    version: '1.0.0',
    description: 'Verifying dark tokens composition',
    html: '<div class="test"></div>'
  }).manifest;

  const html = composePage('tokens-dark-test', dummy, {}, themeAttrs('dark'));
  assert.ok(html.includes('data-theme="dark"'), 'composed page should be dark theme');

  const tokensCss = fs.readFileSync(path.join(__dirname, '../engine/tokens.css'), 'utf8');
  const rootMatch = /:root\s*\{([^}]+)\}/s.exec(tokensCss);
  assert.ok(rootMatch, ':root block must exist in tokens.css');
  const rootContent = rootMatch[1];

  const requiredTokens = [
    { name: '--wg-radius-pill', value: '9999px' },
    { name: '--wg-glow-good', value: '0 0 10px rgba(74, 222, 128, 0.4)' },
    { name: '--wg-glow-bad', value: '0 0 10px rgba(248, 113, 113, 0.4)' },
    { name: '--wg-glow-warn', value: '0 0 10px rgba(251, 191, 36, 0.4)' }
  ];

  for (const { name, value } of requiredTokens) {
    assert.ok(rootContent.includes(`${name}: ${value};`), `:root must define ${name}: ${value};`);
    assert.ok(html.includes(`${name}: ${value};`), `composed page must inject dark token ${name}`);
  }
});

test('tokens: engine/tokens.css defines generational tokens in light mode', () => {
  const dummy = manifest.validateManifest({
    id: 'tokens-light-test',
    name: 'Tokens Light Test',
    version: '1.0.0',
    description: 'Verifying light tokens composition',
    html: '<div class="test"></div>'
  }).manifest;

  const html = composePage('tokens-light-test', dummy, {}, themeAttrs('light'));
  assert.ok(html.includes('data-theme="light"'), 'composed page should be light theme');

  const tokensCss = fs.readFileSync(path.join(__dirname, '../engine/tokens.css'), 'utf8');
  const lightMatch = /:root\[data-theme=['"]light['"]\]\s*\{([^}]+)\}/s.exec(tokensCss);
  assert.ok(lightMatch, ':root[data-theme="light"] block must exist in tokens.css');
  const lightContent = lightMatch[1];

  const requiredTokens = [
    { name: '--wg-radius-pill', value: '9999px' },
    { name: '--wg-glow-good', value: '0 0 10px rgba(74, 222, 128, 0.4)' },
    { name: '--wg-glow-bad', value: '0 0 10px rgba(248, 113, 113, 0.4)' },
    { name: '--wg-glow-warn', value: '0 0 10px rgba(251, 191, 36, 0.4)' }
  ];

  for (const { name, value } of requiredTokens) {
    assert.ok(lightContent.includes(`${name}: ${value};`), `:root[data-theme="light"] must define ${name}: ${value};`);
    assert.ok(html.includes(`${name}: ${value};`), `composed page must inject light token ${name}`);
  }
});

test('base styles: .wg-kpi-card, .wg-kpi-val, .wg-kpi-lbl and .wg-kpi-badge layout and typography', () => {
  const dummy = manifest.validateManifest({
    id: 'kpi-test',
    name: 'KPI Test',
    version: '1.0.0',
    description: 'Verifying KPI base styles',
    useBaseStyles: true,
    html: '<div class="wg-kpi-card"><div class="wg-kpi-lbl">GPU LOAD</div><div class="wg-kpi-val">87%</div><span class="wg-kpi-badge good">+5%</span></div>'
  }).manifest;

  const html = composePage('kpi-test', dummy, {}, themeAttrs('dark'));
  const baseCss = fs.readFileSync(path.join(__dirname, '../engine/base.css'), 'utf8');

  // .wg-kpi-card
  assert.ok(baseCss.includes('.wg-kpi-card'), '.wg-kpi-card selector must exist in base.css');
  assert.ok(/padding:\s*10px/.test(baseCss), '.wg-kpi-card must specify padding 10px');
  assert.ok(/gap:\s*4px/.test(baseCss), '.wg-kpi-card must specify gap 4px');
  assert.ok(/flex-direction:\s*column/.test(baseCss), '.wg-kpi-card must specify flex-direction column');

  // .wg-kpi-val
  assert.ok(baseCss.includes('.wg-kpi-val'), '.wg-kpi-val selector must exist in base.css');
  assert.ok(/font-family:\s*var\(--wg-mono\)/.test(baseCss), '.wg-kpi-val must use var(--wg-mono)');
  assert.ok(/font-size:\s*20px/.test(baseCss), '.wg-kpi-val must use font-size 20px');
  assert.ok(/font-weight:\s*700/.test(baseCss), '.wg-kpi-val must use font-weight 700');

  // .wg-kpi-lbl
  assert.ok(baseCss.includes('.wg-kpi-lbl'), '.wg-kpi-lbl selector must exist in base.css');
  assert.ok(/font-size:\s*11px/.test(baseCss), '.wg-kpi-lbl must use font-size 11px');
  assert.ok(/text-transform:\s*uppercase/.test(baseCss), '.wg-kpi-lbl must use uppercase text');
  assert.ok(/letter-spacing:\s*0\.05em/.test(baseCss), '.wg-kpi-lbl must specify letter-spacing 0.05em');

  // .wg-kpi-badge
  assert.ok(baseCss.includes('.wg-kpi-badge'), '.wg-kpi-badge selector must exist in base.css');
  assert.ok(/border-radius:\s*var\(--wg-radius-pill\)/.test(baseCss), '.wg-kpi-badge must use var(--wg-radius-pill)');
  assert.ok(/padding:\s*2px\s+6px/.test(baseCss), '.wg-kpi-badge must use padding 2px 6px');
  assert.ok(baseCss.includes('.wg-kpi-badge.good'), '.wg-kpi-badge.good state must exist');
  assert.ok(baseCss.includes('.wg-kpi-badge.bad'), '.wg-kpi-badge.bad state must exist');
  assert.ok(baseCss.includes('.wg-kpi-badge.warn'), '.wg-kpi-badge.warn state must exist');
  assert.ok(baseCss.includes('.wg-kpi-badge.accent'), '.wg-kpi-badge.accent state must exist');

  assert.ok(html.includes('.wg-kpi-card'), 'composed widget HTML must include .wg-kpi-card');
});

test('base styles: .wg-beacon status beacon pill and pulsing indicator', () => {
  const dummy = manifest.validateManifest({
    id: 'beacon-test',
    name: 'Beacon Test',
    version: '1.0.0',
    description: 'Verifying beacon styles',
    useBaseStyles: true,
    html: '<div class="wg-beacon good">Operational</div>'
  }).manifest;

  const html = composePage('beacon-test', dummy, {}, themeAttrs('dark'));
  const baseCss = fs.readFileSync(path.join(__dirname, '../engine/base.css'), 'utf8');

  assert.ok(baseCss.includes('.wg-beacon'), '.wg-beacon selector must exist in base.css');
  assert.ok(baseCss.includes('.wg-beacon.good'), '.wg-beacon.good state must exist');
  assert.ok(baseCss.includes('.wg-beacon.bad'), '.wg-beacon.bad state must exist');
  assert.ok(baseCss.includes('.wg-beacon.warn'), '.wg-beacon.warn state must exist');
  assert.ok(baseCss.includes('.wg-beacon::before'), '.wg-beacon::before status dot must exist');
  assert.ok(baseCss.includes('var(--wg-glow-good)'), '.wg-beacon.good must utilize var(--wg-glow-good)');
  assert.ok(baseCss.includes('var(--wg-glow-bad)'), '.wg-beacon.bad must utilize var(--wg-glow-bad)');
  assert.ok(baseCss.includes('var(--wg-glow-warn)'), '.wg-beacon.warn must utilize var(--wg-glow-warn)');
  assert.ok(baseCss.includes('wg-pulse'), '.wg-beacon must feature pulsing dot animation');

  assert.ok(html.includes('.wg-beacon'), 'composed widget HTML must include .wg-beacon');
});

test('base styles: .wg-segmented-tabs compact pill tab group and active states', () => {
  const dummy = manifest.validateManifest({
    id: 'tabs-test',
    name: 'Tabs Test',
    version: '1.0.0',
    description: 'Verifying segmented tabs styles',
    useBaseStyles: true,
    html: '<div class="wg-segmented-tabs"><button class="wg-segmented-tab active">Tab 1</button><button class="wg-segmented-tab">Tab 2</button></div>'
  }).manifest;

  const html = composePage('tabs-test', dummy, {}, themeAttrs('dark'));
  const baseCss = fs.readFileSync(path.join(__dirname, '../engine/base.css'), 'utf8');

  assert.ok(baseCss.includes('.wg-segmented-tabs'), '.wg-segmented-tabs selector must exist');
  assert.ok(baseCss.includes('.wg-segmented-tab'), '.wg-segmented-tab selector must exist');
  assert.ok(baseCss.includes('.wg-segmented-tab.active'), '.wg-segmented-tab.active state must exist');
  assert.ok(baseCss.includes('var(--wg-accent-soft)'), '.wg-segmented-tab.active must use var(--wg-accent-soft)');
  assert.ok(baseCss.includes('var(--wg-accent)'), '.wg-segmented-tab.active must use var(--wg-accent)');

  assert.ok(html.includes('.wg-segmented-tabs'), 'composed widget HTML must include .wg-segmented-tabs');
});

test('base styles: .wg-spark-box vector sparkline wrapper dimensions and overflow', () => {
  const dummy = manifest.validateManifest({
    id: 'spark-test',
    name: 'Spark Test',
    version: '1.0.0',
    description: 'Verifying spark box styles',
    useBaseStyles: true,
    html: '<div class="wg-spark-box"><svg><polyline points="0,10 20,5 40,8"></polyline></svg></div>'
  }).manifest;

  const html = composePage('spark-test', dummy, {}, themeAttrs('dark'));
  const baseCss = fs.readFileSync(path.join(__dirname, '../engine/base.css'), 'utf8');

  assert.ok(baseCss.includes('.wg-spark-box'), '.wg-spark-box selector must exist');
  assert.ok(/height:\s*36px/.test(baseCss), '.wg-spark-box must specify height 36px');
  assert.ok(/overflow:\s*hidden/.test(baseCss), '.wg-spark-box must specify overflow: hidden');
  assert.ok(baseCss.includes('.wg-spark-box svg'), '.wg-spark-box svg selector must exist');

  assert.ok(html.includes('.wg-spark-box'), 'composed widget HTML must include .wg-spark-box');
});

test('base styles: .wg-led-meter 10-segment container and status styles', () => {
  const dummy = manifest.validateManifest({
    id: 'led-test',
    name: 'LED Test',
    version: '1.0.0',
    description: 'Verifying LED meter styles',
    useBaseStyles: true,
    html: '<div class="wg-led-meter"><div class="wg-led-seg on good"></div><div class="wg-led-seg on warn"></div><div class="wg-led-seg on bad"></div></div>'
  }).manifest;

  const html = composePage('led-test', dummy, {}, themeAttrs('dark'));
  const baseCss = fs.readFileSync(path.join(__dirname, '../engine/base.css'), 'utf8');

  assert.ok(baseCss.includes('.wg-led-meter'), '.wg-led-meter selector must exist');
  assert.ok(baseCss.includes('.wg-led-seg'), '.wg-led-seg selector must exist');
  assert.ok(/height:\s*16px/.test(baseCss), '.wg-led-seg must specify height 16px');
  assert.ok(baseCss.includes('.wg-led-seg.on.good') || baseCss.includes('.wg-led-seg.good.on'), '.wg-led-seg good state must exist');
  assert.ok(baseCss.includes('.wg-led-seg.on.warn') || baseCss.includes('.wg-led-seg.warn.on'), '.wg-led-seg warn state must exist');
  assert.ok(baseCss.includes('.wg-led-seg.on.bad') || baseCss.includes('.wg-led-seg.bad.on'), '.wg-led-seg bad state must exist');

  assert.ok(html.includes('.wg-led-meter'), 'composed widget HTML must include .wg-led-meter');
});

test('base styles: .wg-split-row flex row with dotted divider', () => {
  const dummy = manifest.validateManifest({
    id: 'split-row-test',
    name: 'Split Row Test',
    version: '1.0.0',
    description: 'Verifying split row styles',
    useBaseStyles: true,
    html: '<div class="wg-split-row"><span class="wg-lbl">P99 Latency</span><span class="wg-val">12ms</span></div>'
  }).manifest;

  const html = composePage('split-row-test', dummy, {}, themeAttrs('dark'));
  const baseCss = fs.readFileSync(path.join(__dirname, '../engine/base.css'), 'utf8');

  assert.ok(baseCss.includes('.wg-split-row'), '.wg-split-row selector must exist');
  assert.ok(baseCss.includes('.wg-split-row .wg-lbl') || baseCss.includes('.wg-split-row > .wg-lbl'), '.wg-split-row .wg-lbl selector must exist');
  assert.ok(baseCss.includes('.wg-split-row .wg-val') || baseCss.includes('.wg-split-row > .wg-val'), '.wg-split-row .wg-val selector must exist');
  assert.ok(baseCss.includes('border-bottom: 1px dotted var(--wg-border)'), '.wg-split-row must include dotted divider border');

  assert.ok(html.includes('.wg-split-row'), 'composed widget HTML must include .wg-split-row');
});

test('base styles: .wg-radial-wrap circular progress container and centered label', () => {
  const dummy = manifest.validateManifest({
    id: 'radial-test',
    name: 'Radial Test',
    version: '1.0.0',
    description: 'Verifying radial gauge styles',
    useBaseStyles: true,
    html: '<div class="wg-radial-wrap"><svg viewBox="0 0 76 76"><circle class="wg-radial-bg" cx="38" cy="38" r="32"/><circle class="wg-radial-fill good" cx="38" cy="38" r="32"/></svg><div class="wg-radial-val">78%</div></div>'
  }).manifest;

  const html = composePage('radial-test', dummy, {}, themeAttrs('dark'));
  const baseCss = fs.readFileSync(path.join(__dirname, '../engine/base.css'), 'utf8');

  assert.ok(baseCss.includes('.wg-radial-wrap'), '.wg-radial-wrap selector must exist');
  assert.ok(baseCss.includes('.wg-radial-wrap svg'), '.wg-radial-wrap svg selector must exist');
  assert.ok(baseCss.includes('.wg-radial-bg'), '.wg-radial-bg selector must exist');
  assert.ok(baseCss.includes('.wg-radial-fill'), '.wg-radial-fill selector must exist');
  assert.ok(baseCss.includes('.wg-radial-val') || baseCss.includes('.wg-radial-center'), '.wg-radial-val centered text selector must exist');

  assert.ok(html.includes('.wg-radial-wrap'), 'composed widget HTML must include .wg-radial-wrap');
});

test('base styles: useBaseStyles toggles inclusion of generational component library', () => {
  const withBase = manifest.validateManifest({
    id: 'with-base',
    name: 'With Base',
    version: '1.0.0',
    description: 'With base styles',
    useBaseStyles: true,
    html: '<div class="wg-kpi-card"></div>'
  }).manifest;

  const withoutBase = manifest.validateManifest({
    id: 'without-base',
    name: 'Without Base',
    version: '1.0.0',
    description: 'Without base styles',
    useBaseStyles: false,
    html: '<div class="wg-kpi-card"></div>'
  }).manifest;

  const htmlWith = composePage('with-base', withBase, {}, themeAttrs('dark'));
  const htmlWithout = composePage('without-base', withoutBase, {}, themeAttrs('dark'));

  assert.ok(htmlWith.includes('.wg-kpi-card'), 'composed page with useBaseStyles: true should contain .wg-kpi-card');
  assert.ok(htmlWith.includes('.wg-beacon'), 'composed page with useBaseStyles: true should contain .wg-beacon');
  assert.ok(!htmlWithout.includes('.wg-kpi-card'), 'composed page with useBaseStyles: false must not contain .wg-kpi-card');
  assert.ok(!htmlWithout.includes('.wg-beacon'), 'composed page with useBaseStyles: false must not contain .wg-beacon');
});

test('manifest: gpu-monitor manifest satisfies generational contract schema and config', () => {
  const raw = GENERATIONAL_MANIFESTS['gpu-monitor'];
  const res = manifest.validateManifest(raw, { allowFiles: true, strict: true });
  assert.equal(res.ok, true, `gpu-monitor validation failed: ${res.errors.join('; ')}`);
  assert.equal(res.errors.length, 0);

  const m = res.manifest;
  assert.equal(m.id, 'gpu-monitor');
  assert.equal(m.name, 'GPU Telemetry');
  assert.equal(m.version, '1.0.0');
  assert.equal(m.author, 'Widgeter');
  assert.equal(m.category, 'system');
  assert.deepEqual(m.tags, ['gpu', 'hardware', 'system']);
  assert.equal(m.icon, '🎮');
  assert.equal(m.width, 280);
  assert.equal(m.height, 220);
  assert.equal(m.useBaseStyles, true);

  // Config schema validation
  assert.equal(m.config.length, 2);
  const [intervalField, tempUnitField] = m.config;
  assert.equal(intervalField.key, 'interval');
  assert.equal(intervalField.type, 'number');
  assert.equal(intervalField.default, 2);
  assert.equal(intervalField.min, 1);
  assert.equal(intervalField.max, 60);

  assert.equal(tempUnitField.key, 'temp_unit');
  assert.equal(tempUnitField.type, 'select');
  assert.equal(tempUnitField.default, 'c');
  assert.deepEqual(tempUnitField.options, [
    { value: 'c', label: '°C' },
    { value: 'f', label: '°F' }
  ]);

  // configDefaults and coerceConfigValue
  const defaults = manifest.configDefaults(m);
  assert.deepEqual(defaults, { interval: 2, temp_unit: 'c' });

  assert.equal(manifest.coerceConfigValue(intervalField, '10'), 10);
  assert.equal(manifest.coerceConfigValue(intervalField, '999'), 60, 'should clamp to max 60');
  assert.equal(manifest.coerceConfigValue(intervalField, '0'), 1, 'should clamp to min 1');
  assert.equal(manifest.coerceConfigValue(tempUnitField, 'f'), 'f');
});

test('manifest: zen-breathing manifest satisfies generational contract schema and config', () => {
  const raw = GENERATIONAL_MANIFESTS['zen-breathing'];
  const res = manifest.validateManifest(raw, { allowFiles: true, strict: true });
  assert.equal(res.ok, true, `zen-breathing validation failed: ${res.errors.join('; ')}`);
  assert.equal(res.errors.length, 0);

  const m = res.manifest;
  assert.equal(m.id, 'zen-breathing');
  assert.equal(m.name, 'Zen Breathing');
  assert.equal(m.version, '1.0.0');
  assert.equal(m.author, 'Widgeter');
  assert.equal(m.category, 'productivity');
  assert.deepEqual(m.tags, ['zen', 'breathing', 'focus', 'health']);
  assert.equal(m.icon, '🧘');
  assert.equal(m.width, 260);
  assert.equal(m.height, 260);
  assert.equal(m.useBaseStyles, true);

  // Config schema validation
  assert.equal(m.config.length, 2);
  const [techniqueField, soundCueField] = m.config;
  assert.equal(techniqueField.key, 'technique');
  assert.equal(techniqueField.type, 'select');
  assert.equal(techniqueField.default, '4-7-8');
  assert.deepEqual(techniqueField.options, [
    { value: '4-7-8', label: 'Relax (4-7-8)' },
    { value: 'box', label: 'Box (4-4-4-4)' },
    { value: 'energize', label: 'Awake (4-2-4-2)' }
  ]);

  assert.equal(soundCueField.key, 'sound_cue');
  assert.equal(soundCueField.type, 'boolean');
  assert.equal(soundCueField.default, false);

  // configDefaults and coerceConfigValue
  const defaults = manifest.configDefaults(m);
  assert.deepEqual(defaults, { technique: '4-7-8', sound_cue: false });

  assert.equal(manifest.coerceConfigValue(soundCueField, 'true'), true);
  assert.equal(manifest.coerceConfigValue(soundCueField, 'on'), true);
  assert.equal(manifest.coerceConfigValue(soundCueField, false), false);
  assert.equal(manifest.coerceConfigValue(soundCueField, 'false'), false);
  assert.equal(manifest.coerceConfigValue(techniqueField, 'box'), 'box');
});

test('manifest: api-latency manifest satisfies generational contract schema and config', () => {
  const raw = GENERATIONAL_MANIFESTS['api-latency'];
  const res = manifest.validateManifest(raw, { allowFiles: true, strict: true });
  assert.equal(res.ok, true, `api-latency validation failed: ${res.errors.join('; ')}`);
  assert.equal(res.errors.length, 0);

  const m = res.manifest;
  assert.equal(m.id, 'api-latency');
  assert.equal(m.name, 'API Latency Monitor');
  assert.equal(m.version, '1.0.0');
  assert.equal(m.author, 'Widgeter');
  assert.equal(m.category, 'dev');
  assert.deepEqual(m.tags, ['api', 'latency', 'dev', 'network']);
  assert.equal(m.icon, '⚡');
  assert.equal(m.width, 300);
  assert.equal(m.height, 220);
  assert.equal(m.useBaseStyles, true);

  // Config schema validation
  assert.equal(m.config.length, 3);
  const [urlField, pingIntervalField, slaWarnMsField] = m.config;
  assert.equal(urlField.key, 'target_url');
  assert.equal(urlField.type, 'url');
  assert.equal(urlField.default, 'https://1.1.1.1');

  assert.equal(pingIntervalField.key, 'ping_interval');
  assert.equal(pingIntervalField.type, 'number');
  assert.equal(pingIntervalField.default, 5);
  assert.equal(pingIntervalField.min, 2);
  assert.equal(pingIntervalField.max, 60);

  assert.equal(slaWarnMsField.key, 'sla_warn_ms');
  assert.equal(slaWarnMsField.type, 'number');
  assert.equal(slaWarnMsField.default, 200);

  // configDefaults and coerceConfigValue
  const defaults = manifest.configDefaults(m);
  assert.deepEqual(defaults, {
    target_url: 'https://1.1.1.1',
    ping_interval: 5,
    sla_warn_ms: 200
  });

  assert.equal(manifest.coerceConfigValue(urlField, 'https://api.github.com'), 'https://api.github.com');
  assert.equal(manifest.coerceConfigValue(pingIntervalField, '100'), 60, 'should clamp to max 60');
  assert.equal(manifest.coerceConfigValue(pingIntervalField, '1'), 2, 'should clamp to min 2');
  assert.equal(manifest.coerceConfigValue(slaWarnMsField, '150'), 150);
});

test('manifest: rejects invalid generational widget schemas and configs', () => {
  // Invalid category
  const badCat = manifest.validateManifest({
    ...GENERATIONAL_MANIFESTS['gpu-monitor'],
    category: 'invalid-category'
  }, { allowFiles: true });
  assert.equal(badCat.ok, false);
  assert.ok(badCat.errors.some((e) => /category must be one of/.test(e)));

  // Dimensions out of range (< 40 or > 4000)
  const badDim = manifest.validateManifest({
    ...GENERATIONAL_MANIFESTS['zen-breathing'],
    width: 25
  }, { allowFiles: true });
  assert.equal(badDim.ok, false);
  assert.ok(badDim.errors.some((e) => /width must be a number between 40 and 4000/.test(e)));

  // Unsupported config field type
  const badConfig = manifest.validateManifest({
    ...GENERATIONAL_MANIFESTS['api-latency'],
    config: [{ key: 'bad_field', type: 'unknown_type' }]
  }, { allowFiles: true });
  assert.equal(badConfig.ok, false);
  assert.ok(badConfig.errors.some((e) => /type "unknown_type" is not one of/.test(e)));

  // Duplicate config key
  const dupConfig = manifest.validateManifest({
    ...GENERATIONAL_MANIFESTS['gpu-monitor'],
    config: [
      { key: 'interval', type: 'number', default: 2 },
      { key: 'interval', type: 'number', default: 5 }
    ]
  }, { allowFiles: true });
  assert.equal(dupConfig.ok, false);
  assert.ok(dupConfig.errors.some((e) => /declared twice/.test(e)));

  // Strict mode demands description and version
  const strictFail = manifest.validateManifest({
    ...GENERATIONAL_MANIFESTS['gpu-monitor'],
    description: ''
  }, { allowFiles: true, strict: true });
  assert.equal(strictFail.ok, false);
  assert.ok(strictFail.errors.some((e) => /description is required/.test(e)));
});

test('widget-format: generational widget packages unpack, load strictly and pack', () => {
  const dir = tmp();
  try {
    for (const [id, rawManifest] of Object.entries(GENERATIONAL_MANIFESTS)) {
      const widgetDir = path.join(dir, id);
      const pkg = {
        ...rawManifest,
        html: `<div id="${id}-root"></div>`,
        css: `#${id}-root { color: var(--wg-fg); }`,
        js: `console.log("${id} initialized");`
      };

      format.unpackWidget(pkg, widgetDir);
      assert.ok(fs.existsSync(path.join(widgetDir, 'widget.json')));
      assert.ok(fs.existsSync(path.join(widgetDir, 'index.html')));
      assert.ok(fs.existsSync(path.join(widgetDir, 'style.css')));
      assert.ok(fs.existsSync(path.join(widgetDir, 'script.js')));
      assert.equal(format.isFolderWidget(widgetDir), true);

      const loaded = format.loadWidget(widgetDir, { strict: true });
      assert.equal(loaded.ok, true, `${id} folder failed validation: ${(loaded.errors || []).join('; ')}`);
      assert.equal(loaded.kind, 'folder');
      assert.equal(loaded.manifest.id, id);
      assert.equal(loaded.manifest.useBaseStyles, true);
      assert.equal(loaded.manifest.css, `#${id}-root { color: var(--wg-fg); }`);

      const packed = format.packWidget(widgetDir);
      assert.equal(packed.id, id);
      assert.equal(packed.js, `console.log("${id} initialized");`);
      assert.equal(packed.files, undefined);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('regression: all existing gallery widgets and merged generational widgets pass validation', () => {
  const galleryDir = path.join(__dirname, '..', 'gallery');
  const widgets = format.listWidgets(galleryDir);
  assert.ok(widgets.length > 0, 'gallery must contain widgets');

  let failedCount = 0;
  const failureMessages = [];

  for (const w of widgets) {
    const r = format.loadWidget(w.path, { strict: w.kind === 'folder' });
    if (!r.ok) {
      failedCount++;
      failureMessages.push(`${w.id}: ${(r.errors || []).join('; ')}`);
    } else {
      assert.ok(r.manifest.id, `${w.id} has valid id`);
      assert.ok(r.manifest.name, `${w.id} has name`);
      assert.ok(r.manifest.version, `${w.id} has version`);
      assert.ok(r.manifest.category, `${w.id} has category`);
      assert.ok(r.manifest.width >= 40 && r.manifest.width <= 4000, `${w.id} width in range`);
      assert.ok(r.manifest.height >= 40 && r.manifest.height <= 4000, `${w.id} height in range`);
    }
  }

  assert.equal(failedCount, 0, `All gallery widgets must pass validation. Failures:\n${failureMessages.join('\n')}`);
});
