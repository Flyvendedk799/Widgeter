'use strict';
// Creator: edit a widget's manifest, code and settings with a live preview window.
const { h, icon, toast, switchEl, CATEGORY_LABELS } = require('../ui');
const { call, store } = require('../api');

const TEMPLATES = {
  blank: {
    label: 'Blank widget',
    draft: {
      name: 'My Widget', version: '1.0.0', category: 'other', icon: '🧩', description: 'Describe what this widget shows.', width: 260, height: 160,
      config: [],
      html: "<div class='wg-header'><div class='wg-header-main'><span class='wg-icon'>🧩</span><div><div class='wg-title'>My Widget</div><div class='wg-sub' id='sub'>Ready</div></div></div></div>\n<div class='wg-card'><div class='wg-big' id='value'>--</div></div>",
      css: '',
      js: "document.getElementById('value').textContent = new Date().toLocaleTimeString();\nsetInterval(() => {\n  document.getElementById('value').textContent = new Date().toLocaleTimeString();\n}, 1000);"
    }
  },
  stat: {
    label: 'Stat card from a web API',
    draft: {
      name: 'API Stat', version: '1.0.0', category: 'info', icon: '📊', description: 'Shows one number from a JSON API.', width: 260, height: 170,
      config: [
        { key: 'url', label: 'JSON URL', type: 'url', required: true, placeholder: 'https://api.example.com/value', help: 'Any public endpoint that returns JSON.' },
        { key: 'path', label: 'Value path', type: 'text', default: 'value', help: 'Dotted path to the number, e.g. data.price' },
        { key: 'label', label: 'Label', type: 'text', default: 'Value' }
      ],
      html: "<div class='wg-header'><div class='wg-header-main'><span class='wg-icon'>📊</span><div><div class='wg-title' id='label'>Value</div><div class='wg-sub' id='sub'></div></div></div><button class='wg-btn icon' id='refresh' title='Refresh'>⟳</button></div>\n<div class='wg-card'><div class='wg-big' id='value'>--</div></div>\n<div class='wg-err' id='err'></div>",
      css: '',
      js: "const $ = (id) => document.getElementById(id);\nasync function load() {\n  const cfg = await widgeter.getAllConfig();\n  $('label').textContent = cfg.label || 'Value';\n  if (!cfg.url) { $('err').textContent = 'Open settings and add a JSON URL.'; return; }\n  try {\n    const data = await widgeter.fetchJson(cfg.url, { ttl: 60 });\n    const value = String(cfg.path || 'value').split('.').reduce((o, k) => (o == null ? o : o[k]), data);\n    $('value').textContent = typeof value === 'number' ? value.toLocaleString() : String(value);\n    $('sub').textContent = 'Updated ' + new Date().toLocaleTimeString();\n    $('err').textContent = '';\n  } catch (e) {\n    $('err').textContent = e.message;\n  }\n}\n$('refresh').addEventListener('click', load);\nload();\nsetInterval(load, 60000);"
    }
  },
  feed: {
    label: 'List from a web API',
    draft: {
      name: 'API List', version: '1.0.0', category: 'info', icon: '📰', description: 'Shows a list of items from a JSON API.', width: 300, height: 320,
      config: [
        { key: 'url', label: 'JSON URL', type: 'url', required: true, placeholder: 'https://api.example.com/items' },
        { key: 'limit', label: 'Items to show', type: 'number', default: 8, min: 1, max: 30 }
      ],
      html: "<div class='wg-header'><div class='wg-header-main'><span class='wg-icon'>📰</span><div><div class='wg-title'>API List</div><div class='wg-sub' id='sub'></div></div></div></div>\n<div class='wg-list' id='list'><div class='wg-empty'>Loading…</div></div>",
      css: '',
      js: "const list = document.getElementById('list');\nfunction text(v) { return v == null ? '' : String(v); }\nasync function load() {\n  const cfg = await widgeter.getAllConfig();\n  if (!cfg.url) { list.innerHTML = \"<div class='wg-empty'>Open settings and add a JSON URL.</div>\"; return; }\n  try {\n    const data = await widgeter.fetchJson(cfg.url, { ttl: 120 });\n    const items = (Array.isArray(data) ? data : []).slice(0, cfg.limit || 8);\n    list.textContent = '';\n    for (const item of items) {\n      const row = document.createElement('div');\n      row.className = 'wg-item';\n      const title = document.createElement('span');\n      title.className = 'wg-truncate';\n      title.textContent = text(item.title || item.name || JSON.stringify(item));\n      row.appendChild(title);\n      list.appendChild(row);\n    }\n    if (!items.length) list.innerHTML = \"<div class='wg-empty'>Nothing to show.</div>\";\n  } catch (e) {\n    list.innerHTML = '';\n    const err = document.createElement('div');\n    err.className = 'wg-err';\n    err.textContent = e.message;\n    list.appendChild(err);\n  }\n}\nload();\nsetInterval(load, 120000);"
    }
  }
};

const session = { widgetId: null, draft: null, extra: {}, live: false, previewOpen: false, tab: 'html', dirty: false, template: 'blank' };

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }

function startFromTemplate(key) {
  session.widgetId = null;
  session.template = key;
  loadDraft(JSON.parse(JSON.stringify(TEMPLATES[key].draft)), null);
  session.draft.id = slugify(session.draft.name);
  session.dirty = false;
}

const KNOWN = ['id', 'name', 'version', 'description', 'category', 'icon', 'width', 'height', 'config', 'html', 'css', 'js'];
function loadDraft(obj, widgetId) {
  session.widgetId = widgetId;
  session.extra = {};
  for (const [k, v] of Object.entries(obj)) if (!KNOWN.includes(k)) session.extra[k] = v;
  session.draft = {
    id: obj.id || slugify(obj.name), name: obj.name || '', version: obj.version || '1.0.0', description: obj.description || '', category: obj.category || 'other',
    icon: obj.icon || '', width: obj.width || 300, height: obj.height || 300, config: obj.config || [], html: obj.html || '', css: obj.css || '', js: obj.js || ''
  };
}

async function openWidget(id) {
  const { widgetId, draft } = await call('creator:read', id);
  loadDraft(draft, widgetId);
  session.dirty = false;
  session.previewOpen = false;
}

function assemble() {
  const d = session.draft;
  return Object.assign({}, session.extra, {
    id: d.id, name: d.name, version: d.version, description: d.description, category: d.category, icon: d.icon,
    width: Number(d.width), height: Number(d.height), config: d.config, html: d.html, css: d.css, js: d.js
  });
}

function render(container, actions) {
  if (!session.draft) startFromTemplate('blank');
  container.textContent = '';
  const d = session.draft;
  const editors = {};
  const problems = h('div', { class: 'problems' });
  let validateTimer = null;
  let previewTimer = null;

  const touch = () => {
    session.dirty = true;
    clearTimeout(validateTimer);
    validateTimer = setTimeout(validate, 350);
    if (session.live && session.previewOpen) { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 550); }
  };

  async function validate() {
    let draft;
    try { draft = assemble(); } catch (e) { return; }
    const r = await call('creator:validate', draft).catch((e) => ({ ok: false, errors: [e.message], warnings: [] }));
    problems.textContent = '';
    r.errors.forEach((m) => problems.appendChild(h('div', { class: 'problem error' }, m)));
    r.warnings.forEach((m) => problems.appendChild(h('div', { class: 'problem warn' }, m)));
    if (r.ok && !r.warnings.length) problems.appendChild(h('div', { class: 'problem ok' }, 'Looks good.'));
  }

  async function preview() {
    try {
      const r = await call('creator:preview', assemble());
      session.previewOpen = true;
      if (!r.ok && r.errors && r.errors.length) toast('Preview has problems: ' + r.errors[0], 'bad');
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function save() {
    try {
      const r = await call('creator:save', Object.assign(assemble(), session.widgetId ? { widgetId: session.widgetId } : {}));
      session.widgetId = r.id;
      session.dirty = false;
      toast('Saved ' + d.name + (r.warnings && r.warnings.length ? ' (' + r.warnings[0] + ')' : ''));
      render(container, actions);
    } catch (e) { toast(e.message + (e.details ? ': ' + e.details.join('; ') : ''), 'bad'); }
  }

  const bind = (key, input, transform) => {
    input.addEventListener('input', () => { d[key] = transform ? transform(input.value) : input.value; if (key === 'name' && !session.widgetId && (!d.id || d.id === slugify(d._lastName || ''))) { d.id = slugify(d.name); idInput.value = d.id; } d._lastName = d.name; touch(); });
    return input;
  };
  const field = (label, input, help) => h('div', { class: 'field' }, h('label', {}, label), input, help ? h('div', { class: 'help' }, help) : null);

  const nameInput = bind('name', h('input', { class: 'input', value: d.name }));
  const idInput = bind('id', h('input', { class: 'input', value: d.id, placeholder: 'kebab-case-id' }));
  const versionInput = bind('version', h('input', { class: 'input', value: d.version }));
  const iconInput = bind('icon', h('input', { class: 'input', value: d.icon, maxlength: 4 }));
  const categorySelect = h('select', { class: 'input' }, Object.entries(CATEGORY_LABELS).map(([k, v]) => h('option', { value: k }, v)));
  categorySelect.value = d.category;
  categorySelect.addEventListener('change', () => { d.category = categorySelect.value; touch(); });
  const descInput = bind('description', h('textarea', { class: 'input', rows: 3, maxlength: 280, style: { fontFamily: 'inherit' } }));
  descInput.value = d.description;
  const widthInput = bind('width', h('input', { class: 'input', type: 'number', value: d.width, min: 40, max: 4000 }));
  const heightInput = bind('height', h('input', { class: 'input', type: 'number', value: d.height, min: 40, max: 4000 }));

  const templateSelect = h('select', { class: 'input' }, Object.entries(TEMPLATES).map(([k, t]) => h('option', { value: k }, t.label)));
  templateSelect.value = session.template;
  const newBtn = h('button', { class: 'btn', onclick: () => { startFromTemplate(templateSelect.value); session.previewOpen = false; call('creator:preview-close'); render(container, actions); } }, 'New from template');

  // AI
  const aiPrompt = h('textarea', { class: 'input', rows: 3, placeholder: 'Describe the widget you want, or how to change this one…', style: { fontFamily: 'inherit' } });
  const aiBtn = h('button', { class: 'btn', disabled: !store.state.settings.anthropicKeySet }, icon('play'), 'Generate with Claude');
  aiBtn.addEventListener('click', async () => {
    if (!aiPrompt.value.trim()) return;
    aiBtn.disabled = true;
    aiBtn.textContent = 'Generating…';
    try {
      const hasCode = !!(d.html || d.js);
      const r = await call('ai:generate', aiPrompt.value.trim(), hasCode && session.dirty ? assemble() : null);
      loadDraft(r.widget, session.widgetId);
      session.dirty = true;
      render(container, actions);
      toast(r.errors.length ? 'Generated with problems: ' + r.errors[0] : 'Widget generated. Review it, then preview and save.', r.errors.length ? 'bad' : undefined);
      if (session.live) preview();
    } catch (e) { toast(e.message, 'bad'); aiBtn.disabled = false; aiBtn.textContent = 'Generate with Claude'; }
  });
  const aiBox = h('div', { class: 'field' }, h('label', {}, 'Describe it (AI)'), aiPrompt,
    h('div', { class: 'row', style: { marginTop: '8px' } }, aiBtn),
    store.state.settings.anthropicKeySet ? null : h('div', { class: 'help' }, 'Add your Anthropic API key under Settings to enable this.'));

  // editors
  const theme = document.documentElement.dataset.theme === 'dark' ? 'material-darker' : 'default';
  const makeEditor = (key, mode, value) => {
    const host = h('div');
    const cm = CodeMirror(host, { value, mode, theme, lineNumbers: true, matchBrackets: true, autoCloseBrackets: true, tabSize: 2, indentWithTabs: false, lineWrapping: false });
    cm.on('change', () => { d[key] = cm.getValue(); touch(); });
    editors[key] = { host, cm };
  };
  makeEditor('html', 'htmlmixed', d.html);
  makeEditor('css', 'css', d.css);
  makeEditor('js', 'javascript', d.js);
  const configText = JSON.stringify(d.config, null, 2);
  const configHost = h('div');
  const configCm = CodeMirror(configHost, { value: configText, mode: { name: 'javascript', json: true }, theme, lineNumbers: true, matchBrackets: true, autoCloseBrackets: true, tabSize: 2 });
  const configHelp = h('div', { class: 'help', style: { marginBottom: '8px' } }, 'Settings the user can change, as a JSON array. Each field: key, label, type (text, password, number, select, boolean, textarea, color, url), default, required, help.');
  const configErr = h('div', { class: 'problem error', hidden: true });
  configCm.on('change', () => {
    try { d.config = JSON.parse(configCm.getValue() || '[]'); configErr.hidden = true; touch(); } catch (e) { configErr.textContent = 'Settings JSON: ' + e.message; configErr.hidden = false; }
  });
  editors.config = { host: h('div', {}, configHelp, configHost, configErr), cm: configCm };

  const pane = h('div');
  const tabBar = h('div', { class: 'editor-tabs' });
  const showTab = (key) => {
    session.tab = key;
    tabBar.textContent = '';
    [['html', 'HTML'], ['css', 'CSS'], ['js', 'JavaScript'], ['config', 'Settings']].forEach(([k, label]) => tabBar.appendChild(h('button', { class: 'chip' + (k === key ? ' active' : ''), onclick: () => showTab(k) }, label)));
    pane.textContent = '';
    pane.appendChild(editors[key].host);
    setTimeout(() => editors[key].cm.refresh(), 0);
  };

  const liveSwitch = switchEl(session.live, (v) => { session.live = v; if (v) preview(); });
  const actionsRow = h('div', { class: 'row', style: { marginTop: '14px', flexWrap: 'wrap' } },
    h('button', { class: 'btn', onclick: preview }, icon('play'), 'Preview'),
    h('button', { class: 'btn primary', onclick: save }, icon('check'), session.widgetId ? 'Save' : 'Save & install'));

  const side = h('div', { class: 'creator-side' },
    session.widgetId ? h('div', { class: 'banner', style: { fontSize: '12px' } }, 'Editing ' + session.widgetId) : h('div', { class: 'field' }, h('label', {}, 'Start from'), templateSelect, h('div', { style: { marginTop: '8px' } }, newBtn)),
    field('Name', nameInput),
    h('div', { class: 'row' }, field('ID', idInput), field('Version', versionInput)),
    h('div', { class: 'row' }, field('Category', categorySelect), field('Icon', iconInput)),
    field('Description', descInput),
    h('div', { class: 'row' }, field('Width', widthInput), field('Height', heightInput)),
    h('div', { class: 'field inline' }, h('div', {}, h('label', {}, 'Live preview'), h('div', { class: 'help' }, 'Opens a real widget window and updates it as you type.')), liveSwitch),
    actionsRow,
    h('div', { style: { height: '16px' } }),
    aiBox,
    session.widgetId ? h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { const f = await call('creator:export', session.widgetId); if (f) toast('Exported to ' + f); } }, 'Export'), h('button', { class: 'btn', onclick: () => { const w = store.state.widgets.find((x) => x.id === session.widgetId); if (w) actions.publish(w); } }, 'Publish')) : null);

  container.append(
    h('div', { class: 'view-head' }, h('div', {}, h('h1', {}, 'Creator'), h('p', {}, 'Build widgets with HTML, CSS and JavaScript. The preview window is the real thing, with the same API and styles.'))),
    h('div', { class: 'creator' }, side, h('div', {}, tabBar, pane, problems)));
  showTab(session.tab || 'html');
  validate();
}

function leave() {
  call('creator:preview-close').catch(() => {});
  session.previewOpen = false;
}

module.exports = { render, openWidget, leave, isDirty: () => session.dirty };
