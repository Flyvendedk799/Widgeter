const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const format = require('../engine/widget-format');

test('gpu-monitor: manifest conforms to schema and system widget contract', () => {
  const widgetDir = path.join(__dirname, '..', 'gallery', 'gpu-monitor');
  const loaded = format.loadWidget(widgetDir, { strict: true });

  assert.equal(loaded.ok, true, `Validation failed: ${loaded.errors.join('; ')}`);
  assert.equal(loaded.manifest.id, 'gpu-monitor');
  assert.equal(loaded.manifest.version, '1.0.0');
  assert.equal(loaded.manifest.category, 'system');
  assert.equal(loaded.manifest.width, 280);
  assert.equal(loaded.manifest.height, 220);

  const configKeys = loaded.manifest.config.map((c) => c.key);
  assert.ok(configKeys.includes('interval'), 'config must include interval');
  assert.ok(configKeys.includes('temp_unit'), 'config must include temp_unit');
});

test('gpu-monitor: script initializes and renders fallback telemetry into DOM', async () => {
  const scriptPath = path.join(__dirname, '..', 'gallery', 'gpu-monitor', 'script.js');
  const scriptCode = fs.readFileSync(scriptPath, 'utf8');

  const elements = {};
  function makeEl(id) {
    if (!elements[id]) {
      const children = [];
      elements[id] = {
        id,
        textContent: '',
        className: '',
        style: {},
        querySelectorAll: (sel) => {
          if (sel === '.wg-led-seg') {
            if (!children.length) {
              for (let i = 0; i < 10; i++) children.push({ className: 'wg-led-seg' });
            }
            return children;
          }
          return [];
        }
      };
    }
    return elements[id];
  }

  const dom = {
    getElementById: (id) => makeEl(id),
    querySelectorAll: (sel) => []
  };

  const timerIds = [];
  const ctx = vm.createContext({
    require,
    process,
    console,
    document: dom,
    window: {
      widgeter: {
        getConfig: async (k) => (k === 'temp_unit' ? 'c' : 2)
      }
    },
    setInterval: (fn, ms) => {
      timerIds.push(1);
      return 1;
    },
    clearInterval: () => {}
  });

  // Execute the script
  vm.runInContext(scriptCode, ctx);

  // Synchronous first sample must already be rendered
  assert.ok(elements['gpu-model'].textContent.length > 0, 'GPU model should be populated');
  assert.ok(elements['gpu-load-val'].textContent.endsWith('%'), 'GPU load should end with %');
  assert.ok(elements['vram-val'].textContent.includes('GB'), 'VRAM value should include GB');
  assert.ok(elements['vram-pct'].textContent.endsWith('%'), 'VRAM percentage should end with %');
  assert.ok(elements['gpu-temp'].textContent.length > 0, 'Temperature should be populated');
  assert.equal(elements['gpu-temp'].textContent, 'N/A', 'Unmeasured temperature must read N/A');
  assert.equal(elements['gpu-fan'].textContent, 'N/A', 'Unmeasured fan speed must read N/A, not 0 RPM');
  assert.ok(elements['gpu-beacon'].className.includes('wg-beacon'), 'Beacon should have wg-beacon class');
});

test('gpu-monitor: supports Fahrenheit and custom intervals via getConfig', async () => {
  const scriptPath = path.join(__dirname, '..', 'gallery', 'gpu-monitor', 'script.js');
  const scriptCode = fs.readFileSync(scriptPath, 'utf8');

  const elements = {};
  function makeEl(id) {
    if (!elements[id]) {
      const children = [];
      elements[id] = {
        id,
        textContent: '',
        className: '',
        style: {},
        querySelectorAll: (sel) => {
          if (sel === '.wg-led-seg') {
            if (!children.length) {
              for (let i = 0; i < 10; i++) children.push({ className: 'wg-led-seg' });
            }
            return children;
          }
          return [];
        }
      };
    }
    return elements[id];
  }

  const dom = {
    getElementById: (id) => makeEl(id),
    querySelectorAll: (sel) => []
  };

  let intervalConfigured = null;
  const ctx = vm.createContext({
    require,
    process,
    console,
    document: dom,
    window: {
      widgeter: {
        getConfig: async (k) => {
          if (k === 'temp_unit') return 'f';
          if (k === 'interval') return 5;
          return undefined;
        }
      }
    },
    setInterval: (fn, ms) => {
      intervalConfigured = ms;
      return 99;
    },
    clearInterval: () => {}
  });

  vm.runInContext(scriptCode, ctx);

  // Wait for the async init to complete
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(intervalConfigured, 5000, 'Configured interval should be 5000ms');
  assert.ok(elements['gpu-model'].textContent.length > 0, 'Model should be set');
});

test('gpu-monitor: probes hardware once and does not respawn subprocesses on later polls', async () => {
  const scriptCode = fs.readFileSync(path.join(__dirname, '..', 'gallery', 'gpu-monitor', 'script.js'), 'utf8');
  const spawned = [];
  const stubRequire = (name) => {
    if (name === 'child_process') {
      return { execFile: (file, args, opts, cb) => { spawned.push(file); cb(new Error('not found')); } };
    }
    return require(name);
  };
  const elements = {};
  const el = (id) => elements[id] || (elements[id] = {
    textContent: '', className: '', style: {},
    querySelectorAll: () => Array.from({ length: 10 }, () => ({ className: '' }))
  });
  let tick = null;
  const ctx = vm.createContext({
    require: stubRequire,
    process,
    console,
    document: { getElementById: el },
    window: { widgeter: { getConfig: async () => undefined } },
    setInterval: (fn) => { tick = fn; return 1; },
    clearInterval: () => {}
  });
  vm.runInContext(scriptCode, ctx);
  await new Promise((r) => setTimeout(r, 50));
  const afterProbe = spawned.length;
  for (let i = 0; i < 5; i++) {
    tick();
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(spawned.length, afterProbe, 'later polls must not spawn processes without a discrete GPU');
  assert.ok(afterProbe <= 2, 'probe spawns at most nvidia-smi and powershell once');
  assert.ok(elements['gpu-load-val'].textContent.endsWith('%'));
});
