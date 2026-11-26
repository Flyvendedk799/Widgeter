'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// ---- Mock Minimal DOM --------------------------------------------------------

class MockClassList {
  constructor(el) {
    this._el = el;
  }
  _tokens() {
    return (this._el.className || '').trim().split(/\s+/).filter(Boolean);
  }
  contains(cls) {
    return this._tokens().includes(cls);
  }
  add(...classes) {
    const set = new Set(this._tokens());
    classes.forEach((c) => set.add(c));
    this._el.className = Array.from(set).join(' ');
  }
  remove(...classes) {
    const removeSet = new Set(classes);
    this._el.className = this._tokens().filter((c) => !removeSet.has(c)).join(' ');
  }
  toggle(cls, force) {
    if (force === undefined) {
      if (this.contains(cls)) this.remove(cls);
      else this.add(cls);
    } else if (force) {
      this.add(cls);
    } else {
      this.remove(cls);
    }
    return this.contains(cls);
  }
}

class MockNode {}

class MockElement extends MockNode {
  constructor(tagName) {
    super();
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.classList = new MockClassList(this);
    this._className = '';
    this._textContent = '';
    this._value = '';
    this._listeners = {};
    this.parentNode = null;
  }

  get className() {
    return this._className;
  }
  set className(val) {
    this._className = String(val || '');
  }

  get textContent() {
    return this._textContent;
  }
  set textContent(val) {
    this._textContent = String(val || '');
    this.children = [];
  }

  get value() {
    return this._value;
  }
  set value(val) {
    this._value = String(val);
  }

  get firstChild() {
    return this.children[0] || null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'value') this._value = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] || null;
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    for (const c of children) {
      if (c) this.appendChild(c);
    }
  }

  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx !== -1) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter((l) => l !== fn);
    }
  }

  dispatchEvent(event) {
    const list = this._listeners[event.type] || [];
    for (const fn of list) {
      fn.call(this, event);
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      if (!(node instanceof MockElement)) return;
      if (matchesSimple(node, selector)) results.push(node);
      for (const child of node.children) check(child);
    };
    check(this);
    return results;
  }
}

class MockTextNode extends MockNode {
  constructor(text) {
    super();
    this.text = String(text);
    this.parentNode = null;
  }
}

function matchesSimple(el, selector) {
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) {
    const classes = selector.slice(1).split('.');
    return classes.every((c) => el.classList.contains(c));
  }
  if (selector.includes('.')) {
    const [tag, ...classes] = selector.split('.');
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    return classes.every((c) => el.classList.contains(c));
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

// Setup global mock DOM
global.Node = MockNode;
const body = new MockElement('body');
const toastWrap = new MockElement('div');
toastWrap.id = 'toast-wrap';
const modalRoot = new MockElement('div');
modalRoot.id = 'modal-root';
body.appendChild(toastWrap);
body.appendChild(modalRoot);

global.document = {
  body: body,
  createElement: (tag) => new MockElement(tag),
  createTextNode: (text) => new MockTextNode(text),
  getElementById: (id) => global.document.body.querySelector('#' + id),
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelectorAll: (sel) => global.document.body.querySelectorAll(sel)
};
global.window = {
  innerWidth: 1200,
  innerHeight: 800
};

// Intercept electron and mock backend IPC
let mockIpcState = {
  widgets: [],
  displays: [{ id: 1, label: 'Primary (1920x1080)', primary: true }],
  saved: [],
  active: []
};

let lastConfirmResponse = true;
let lastConfirmArgs = null;
// IPC calls made by the views, in order: [channel, ...args].
const calls = [];
// When set, replaces the reply of layout:apply-template.
let applyTemplateReply = null;

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron') {
    return {
      ipcRenderer: {
        invoke: async (channel, ...args) => {
          calls.push([channel, ...args]);
          if (channel === 'dash:state') return { ok: true, data: mockIpcState };
          if (channel === 'layout:list') return { ok: true, data: mockIpcState };
          if (channel === 'layout:apply-template') return { ok: true, data: applyTemplateReply || { applied: args[0].length, skipped: [] } };
          if (channel === 'layout:activate') return { ok: true, data: { skipped: [] } };
          if (channel === 'layout:save') {
            mockIpcState.saved.push({ name: args[0], kind: args[1] });
            return { ok: true, data: { ok: true } };
          }
          if (channel === 'widget:toggle') return { ok: true, data: { ok: true } };
          if (channel === 'updates:check') return { ok: true, data: [] };
          return { ok: true, data: { ok: true } };
        },
        on: () => {},
        send: () => {}
      }
    };
  }
  return origRequire.apply(this, arguments);
};

const ui = require('../dashboard/ui');
// Mock confirmDialog and toast before requiring views that destructure them
ui.confirmDialog = async (title, message, confirmLabel, danger) => {
  lastConfirmArgs = { title, message, confirmLabel, danger };
  return lastConfirmResponse;
};
ui.toast = (message, kind) => {
  const wrap = global.document.getElementById('toast-wrap');
  if (wrap) {
    const el = global.document.createElement('div');
    el.className = 'toast' + (kind === 'bad' ? ' bad' : '');
    el.textContent = message;
    wrap.appendChild(el);
  }
};

const widgetsView = require('../dashboard/views/widgets');
const layoutsView = require('../dashboard/views/layouts');
const drawer = require('../dashboard/views/drawer');

// ---- Tests -------------------------------------------------------------------

test('widgets view: defines all 9 required category filter pills in exact order', () => {
  const ids = widgetsView.CATEGORIES.map((c) => c.id);
  assert.deepEqual(ids, [
    'all',
    'system',
    'dev',
    'info',
    'productivity',
    'finance',
    'time',
    'media',
    'other'
  ]);
});

test('widgets view: getCategories avoids duplicate "developer" pill next to "Dev"', () => {
  const sampleWidgets = [
    { id: 'w1', category: 'dev' },
    { id: 'w2', category: 'developer' }, // should map to 'dev' without creating duplicate
    { id: 'w3', category: 'custom-cat' }
  ];
  const cats = widgetsView.getCategories(sampleWidgets);
  const catIds = cats.map((c) => c.id);
  assert.ok(catIds.includes('dev'));
  assert.ok(!catIds.includes('developer'), 'developer must not be added as a separate duplicate pill');
  assert.ok(catIds.includes('custom-cat'), 'custom unknown category should be appended');
});

test('widgets view: matches() correctly handles developer alias and unknown categories', () => {
  widgetsView.filter.q = '';

  // Category dev matches 'dev' and 'developer'
  widgetsView.filter.category = 'dev';
  assert.equal(widgetsView.matches({ id: 'w1', category: 'dev' }), true);
  assert.equal(widgetsView.matches({ id: 'w2', category: 'developer' }), true);
  assert.equal(widgetsView.matches({ id: 'w3', category: 'system' }), false);

  // Category other matches unknown/misc, but not known standard categories
  widgetsView.filter.category = 'other';
  assert.equal(widgetsView.matches({ id: 'w4', category: 'other' }), true);
  assert.equal(widgetsView.matches({ id: 'w5', category: 'unknown-cat' }), true);
  assert.equal(widgetsView.matches({ id: 'w6', category: 'system' }), false);
  assert.equal(widgetsView.matches({ id: 'w7', category: 'finance' }), false);
});

test('widgets view: matches() searches case-insensitively across name, desc, tags, id, cat and fallback errors', () => {
  widgetsView.filter.category = 'all';

  // Search by name
  widgetsView.filter.q = 'Docker';
  assert.equal(widgetsView.matches({ id: 'dock', name: 'Docker Containers', category: 'dev' }), true);

  // Search by tag
  widgetsView.filter.q = 'telemetry';
  assert.equal(widgetsView.matches({ id: 'sys', name: 'System', tags: ['Hardware', 'Telemetry'] }), true);

  // Search by ID
  widgetsView.filter.q = 'ping-mon';
  assert.equal(widgetsView.matches({ id: 'ping-monitor', name: 'Latency' }), true);

  // Search with empty description and errors array
  widgetsView.filter.q = 'missing manifest';
  assert.equal(widgetsView.matches({ id: 'broken', name: 'Broken', description: '', errors: ['Missing manifest.json'] }), true);

  // Non-matching query
  widgetsView.filter.q = 'xyz123nonexistent';
  assert.equal(widgetsView.matches({ id: 'sys', name: 'System Stats' }), false);
});

test('widgets view: interactive pill clicking toggles active pill without destroying search state', () => {
  widgetsView.filter.q = 'stats';
  widgetsView.filter.category = 'all';

  const container = new MockElement('div');
  const api = require('../dashboard/api');
  api.store.state = {
    widgets: [
      { id: 'w-sys', name: 'System Stats', category: 'system', enabled: true, valid: true, health: { status: 'healthy' } },
      { id: 'w-dev', name: 'Dev Stats', category: 'dev', enabled: true, valid: true, health: { status: 'healthy' } }
    ]
  };

  widgetsView.render(container, { go: () => {} });

  const filterBar = container.querySelector('.dash-filter-bar');
  assert.ok(filterBar, '.dash-filter-bar must be rendered');

  const searchInput = container.querySelector('.input.dash-search-input');
  assert.ok(searchInput, '.input.dash-search-input must be rendered');
  assert.equal(searchInput.value, 'stats');

  const pills = container.querySelectorAll('.dash-filter-pill');
  assert.ok(pills.length >= 9, 'Should have at least 9 filter pills');

  const devPill = pills.find((p) => p.dataset.category === 'dev');
  assert.ok(devPill, 'Dev pill exists');

  const cardTitles = () => container.querySelectorAll('.grow').map((el) => el.getAttribute('title'));
  assert.deepEqual(cardTitles(), ['System Stats', 'Dev Stats'], 'both cards match before filtering');

  // Click dev pill
  devPill.dispatchEvent({ type: 'click' });
  assert.equal(widgetsView.filter.category, 'dev');
  assert.ok(devPill.classList.contains('active'), 'Dev pill should become active');

  // Search state survives the click and the grid is re-filtered
  assert.equal(searchInput.value, 'stats', 'search input value is unchanged by a pill click');
  assert.equal(widgetsView.filter.q, 'stats', 'filter.q is unchanged by a pill click');
  assert.deepEqual(cardTitles(), ['Dev Stats'], 'system card is gone after clicking Dev');

  // Verify only dev pill has active class among pills
  const activePills = pills.filter((p) => p.classList.contains('active'));
  assert.equal(activePills.length, 1);
  assert.equal(activePills[0].dataset.category, 'dev');
});

test('layouts view: defines presets with valid layout coordinate generators', () => {
  const presetIds = layoutsView.PRESETS.map((p) => p.name);
  assert.ok(presetIds.includes('Developer Focus'));
  assert.ok(presetIds.includes('Developer Dual'));
  assert.ok(presetIds.includes('System Telemetry'));
  assert.ok(presetIds.includes('Minimalist'));

  for (const preset of layoutsView.PRESETS) {
    const coords = preset.generate(['widget-1', 'widget-2']);
    assert.equal(coords.length, 2);
    for (const box of coords) {
      assert.ok(box.x >= 0 && box.x <= 100);
      assert.ok(box.y >= 0 && box.y <= 100);
      assert.ok(box.width > 0 && box.width <= 100);
      assert.ok(box.height > 0 && box.height <= 100);
    }
  }
});

const toggledIds = () => calls.filter((c) => c[0] === 'widget:toggle').map((c) => c[1]);
const toastTexts = () => toastWrap.children.map((el) => el.textContent);
function resetRecording() {
  calls.length = 0;
  toastWrap.textContent = '';
  applyTemplateReply = null;
}

test('layouts view: applyPreset bounded category fallback and honest count', async () => {
  const api = require('../dashboard/api');
  api.store.state = {
    widgets: [
      { id: 'git-status', category: 'dev', enabled: false },
      { id: 'docker-containers', category: 'dev', enabled: false }
    ]
  };

  const devPreset = layoutsView.PRESETS.find((p) => p.id === 'developer-focus');
  const res = await layoutsView.applyPreset(devPreset, 1, { active: [] });
  assert.ok(res, 'Preset should apply');
  assert.deepEqual(res.targetIds, ['git-status', 'docker-containers']);
  assert.equal(res.positions.length, 2);
});

test('layouts view: applyPreset does not enable unrelated disabled widgets', async () => {
  resetRecording();
  const api = require('../dashboard/api');
  api.store.state = {
    widgets: [
      { id: 'git-status', category: 'dev', enabled: false },
      { id: 'docker-containers', category: 'dev', enabled: false },
      { id: 'audio-spectrum', category: 'media', enabled: false }
    ]
  };

  const devPreset = layoutsView.PRESETS.find((p) => p.id === 'developer-focus');
  const res = await layoutsView.applyPreset(devPreset, 1, { active: [] });
  assert.deepEqual(res.targetIds, ['git-status', 'docker-containers']);
  assert.deepEqual(toggledIds(), ['git-status', 'docker-containers'], 'the disabled unrelated widget is not toggled');
});

test('layouts view: applyPreset category fallback is capped at preset.widgets.length and skips other categories', async () => {
  resetRecording();
  const api = require('../dashboard/api');
  // None of the preset's named widgets are installed; six dev-category widgets are.
  api.store.state = {
    widgets: [
      { id: 'audio-spectrum', category: 'media', enabled: false },
      { id: 'dev-1', category: 'dev', enabled: false },
      { id: 'dev-2', category: 'developer', enabled: false },
      { id: 'dev-3', category: 'dev', enabled: false },
      { id: 'dev-4', category: 'dev', enabled: false },
      { id: 'dev-5', category: 'dev', enabled: false },
      { id: 'dev-6', category: 'dev', enabled: false }
    ]
  };

  const devPreset = layoutsView.PRESETS.find((p) => p.id === 'developer-focus');
  const res = await layoutsView.applyPreset(devPreset, 1, { active: [] });
  assert.ok(res, 'Preset should apply through the category fallback');
  assert.equal(res.targetIds.length, devPreset.widgets.length);
  assert.deepEqual(res.targetIds, ['dev-1', 'dev-2', 'dev-3', 'dev-4']);
  assert.deepEqual(toggledIds(), ['dev-1', 'dev-2', 'dev-3', 'dev-4'], 'only the capped dev widgets are toggled');
});

test('layouts view: applyPreset toast reports what was actually arranged', async () => {
  const api = require('../dashboard/api');
  api.store.state = {
    widgets: [
      { id: 'git-status', category: 'dev', enabled: true },
      { id: 'docker-containers', category: 'dev', enabled: true }
    ]
  };
  const devPreset = layoutsView.PRESETS.find((p) => p.id === 'developer-focus');

  // Nothing arranged: the backend skipped every widget because none has a window yet.
  resetRecording();
  applyTemplateReply = { applied: 0, skipped: ['git-status', 'docker-containers'] };
  await layoutsView.applyPreset(devPreset, 1, { active: [] });
  let texts = toastTexts();
  assert.equal(texts.length, 1);
  assert.doesNotMatch(texts[0], /Arranged/, 'must not claim widgets were arranged');
  assert.match(texts[0], /No widgets were arranged/);
  assert.match(texts[0], /2 not open/);

  // Partly arranged
  resetRecording();
  applyTemplateReply = { applied: 1, skipped: ['docker-containers'] };
  await layoutsView.applyPreset(devPreset, 1, { active: [] });
  texts = toastTexts();
  assert.match(texts[0], /^Arranged 1 of 2 widgets with Developer Focus \(1 not open\)$/);

  // Fully arranged
  resetRecording();
  applyTemplateReply = { applied: 2, skipped: [] };
  await layoutsView.applyPreset(devPreset, 1, { active: [] });
  assert.equal(toastTexts()[0], 'Arranged 2 widgets with Developer Focus');
  applyTemplateReply = null;
});

test('layouts view: applyPreset safely returns null and warns when no matching widgets installed', async () => {
  const api = require('../dashboard/api');
  api.store.state = {
    widgets: [
      { id: 'audio-spectrum', category: 'media', enabled: true }
    ]
  };

  const devPreset = layoutsView.PRESETS.find((p) => p.id === 'developer-focus');
  // devPreset requires dev widgets, none installed
  const res = await layoutsView.applyPreset(devPreset, 1, { active: [] });
  assert.equal(res, null, 'Must return null and not fallback to arbitrary media widgets');
});

test('layouts view: duplicateLayout prompts confirmDialog and prevents live changes when cancelled', async () => {
  const savedEntry = { name: 'My Profile', kind: 'profile', widgetIds: ['git-status'] };
  const data = { saved: [savedEntry] };

  // Case 1: user cancels confirmation dialog
  resetRecording();
  lastConfirmResponse = false;
  const cancelRes = await layoutsView.duplicateLayout(savedEntry, 0, data);
  assert.equal(cancelRes, null, 'Should return null and not duplicate when cancelled');
  assert.ok(lastConfirmArgs, 'confirmDialog was shown');
  assert.deepEqual(
    calls.filter((c) => ['widget:toggle', 'layout:activate', 'layout:save'].includes(c[0])),
    [],
    'no widget is opened, no layout activated and nothing saved when cancelled'
  );

  // Case 2: user confirms dialog
  resetRecording();
  lastConfirmResponse = true;
  const confirmRes = await layoutsView.duplicateLayout(savedEntry, 0, data);
  assert.equal(confirmRes, 'My Profile (Copy)');
  assert.deepEqual(calls, [
    ['widget:toggle', 'git-status', true],
    ['layout:activate', 0],
    ['layout:save', 'My Profile (Copy)', 'profile']
  ], 'toggle, then activate, then save');
});

test('layouts view: duplicateLayout confirmation text tells the user what will happen', async () => {
  resetRecording();
  lastConfirmResponse = false;

  await layoutsView.duplicateLayout({ name: 'Work', kind: 'layout', widgetIds: ['git-status'] }, 0, { saved: [] });
  assert.match(lastConfirmArgs.message, /will be opened/);
  assert.match(lastConfirmArgs.message, /captures everything currently open/);

  await layoutsView.duplicateLayout({ name: 'Work', kind: 'profile', widgetIds: ['git-status'] }, 0, { saved: [] });
  assert.match(lastConfirmArgs.message, /Widgets not in the profile will be closed/);
  lastConfirmResponse = true;
});

test('drawer: healthLook and modernized status indicators operate properly', () => {
  const healthy = drawer.healthLook({ enabled: true, health: { status: 'ok' } });
  assert.equal(healthy.cls, 'good');

  const warn = drawer.healthLook({ enabled: true, health: { status: 'loading' } });
  assert.equal(warn.cls, 'warn pulse');

  const err = drawer.healthLook({ enabled: true, health: { status: 'error' } });
  assert.equal(err.cls, 'bad');
});

test('layouts view: render creates presets grid, cards, and duplicate buttons', async () => {
  const container = new MockElement('div');
  mockIpcState.saved = [
    { name: 'Coding Layout', kind: 'layout', widgetIds: ['git-status'] },
    { name: 'Dev Profile', kind: 'profile', widgetIds: ['docker-containers'] }
  ];
  await layoutsView.render(container);

  const presetsGrid = container.querySelector('.dash-presets-grid');
  assert.ok(presetsGrid, 'presets grid must be rendered');

  const presetCards = container.querySelectorAll('.dash-preset-card');
  assert.equal(presetCards.length, layoutsView.PRESETS.length);

  const presetBtns = container.querySelectorAll('.dash-preset-btn');
  assert.equal(presetBtns.length, layoutsView.PRESETS.length);

  const duplicateBtns = container.querySelectorAll('.dash-duplicate-btn');
  assert.equal(duplicateBtns.length, 2, 'Should render duplicate button for each saved layout');
});

test('widgets view: render outputs status beacons and search input with proper classes', () => {
  widgetsView.filter.q = '';
  widgetsView.filter.category = 'all';

  const container = new MockElement('div');
  const api = require('../dashboard/api');
  api.store.state = {
    widgets: [
      { id: 'w-ok', name: 'Widget 1', category: 'dev', enabled: true, valid: true, health: { status: 'ok' } }
    ]
  };

  widgetsView.render(container, { go: () => {} });
  const beacon = container.querySelector('.dash-status-beacon');
  assert.ok(beacon, '.dash-status-beacon must be rendered in card meta');
  assert.ok(beacon.classList.contains('good'), 'beacon has .good class for healthy widget');

  const searchWrap = container.querySelector('.dash-search-wrap');
  assert.ok(searchWrap, '.dash-search-wrap must be rendered');
});
