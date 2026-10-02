'use strict';
// The per-widget side panel: settings form, display options, logs, about.
const { h, icon, toast, switchEl, confirmDialog, CATEGORY_LABELS, timeAgo } = require('../ui');
const { call, store, ipcRenderer, on, subscribe } = require('../api');

let current = null; // { id, tab, close }
let logSink = null;  // set while the Logs tab is showing
on('dash:log', ({ id, entry }) => { if (logSink) logSink(id, entry); });

function healthLook(w) {
  const status = w.health.status;
  if (status === 'disabled') return { cls: '', text: 'Off' };
  if (w.health.needsSetup && status !== 'error') return { cls: 'warn', text: 'Needs setup' };
  return {
    ok: { cls: 'good', text: 'Running' }, loading: { cls: 'warn pulse', text: 'Starting' },
    error: { cls: 'bad', text: 'Error' }, crashed: { cls: 'warn pulse', text: 'Restarting' },
    failed: { cls: 'bad', text: 'Crashed' }, stopped: { cls: '', text: 'Stopped' }
  }[status] || { cls: '', text: status };
}

// ---- settings tab ---------------------------------------------------------------

function fieldControl(field, value) {
  let input;
  if (field.type === 'boolean') {
    const sw = switchEl(!!value, () => {});
    sw.dataset.key = field.key;
    return { el: sw, read: () => sw.querySelector('input').checked };
  }
  if (field.type === 'select') {
    input = h('select', { class: 'input' }, (field.options || []).map((o) => h('option', { value: o.value }, o.label)));
    input.value = value !== undefined && value !== null ? String(value) : '';
  } else if (field.type === 'textarea') {
    input = h('textarea', { class: 'input', rows: 4, placeholder: field.placeholder || '' });
    input.value = value !== undefined && value !== null ? String(value) : '';
  } else {
    const type = { password: 'password', number: 'number', color: 'color', url: 'url' }[field.type] || 'text';
    input = h('input', { class: 'input', type, placeholder: field.placeholder || '', min: field.min, max: field.max, step: field.step });
    input.value = value !== undefined && value !== null && value !== '' ? String(value) : (field.type === 'color' ? '#00f5d4' : '');
  }
  return { el: input, read: () => input.value };
}

function buildConfigForm(w) {
  const controls = new Map();
  const form = h('div');
  for (const field of w.config) {
    const value = w.configValues[field.key];
    const { el, read } = fieldControl(field, value);
    controls.set(field.key, read);
    const missing = field.required && (value === undefined || value === null || value === '');
    const label = h('label', {}, field.label, field.required ? h('span', { class: 'req' }, '*') : null);
    if (field.type === 'boolean') {
      form.appendChild(h('div', { class: 'field inline' }, h('div', {}, label, field.help ? h('div', { class: 'help' }, field.help) : null), el));
    } else {
      form.appendChild(h('div', { class: 'field' + (missing ? ' missing' : '') }, label, el, field.help ? h('div', { class: 'help' }, field.help) : null));
    }
  }
  const save = h('button', { class: 'btn primary', onclick: async () => {
    const values = {};
    for (const [key, read] of controls) values[key] = read();
    try {
      await call('widget:set-config', w.id, values);
      toast('Saved. ' + w.name + ' reloaded.');
    } catch (e) { toast(e.message, 'bad'); }
  } }, 'Save settings');
  const reset = h('button', { class: 'btn ghost', onclick: async () => {
    if (!(await confirmDialog('Reset settings?', 'This clears your saved values for ' + w.name + ' and restores the defaults.', 'Reset', true))) return;
    await call('widget:set-config', w.id, Object.fromEntries(w.config.map((f) => [f.key, f.default !== undefined ? f.default : (f.type === 'boolean' ? false : '')])));
    toast('Settings reset');
  } }, 'Reset');
  form.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, save, reset));
  return form;
}

function buildLegacySetup(w) {
  const panel = h('div', { id: 'setup-' + w.id, class: 'legacy-setup' });
  panel.innerHTML = w.setupHtml; // author-supplied setup UI of an older widget
  const legacy = Object.assign({}, w, { config: w.rawConfig });
  setTimeout(() => {
    try { new Function('widget', 'ipcRenderer', w.setupJs || '')(legacy, ipcRenderer); } catch (e) { console.error('setupJs error for ' + w.id, e); }
  }, 0);
  return panel;
}

function settingsTab(w) {
  if (w.config.length) return buildConfigForm(w);
  if (w.setupHtml) return buildLegacySetup(w);
  return h('div', { class: 'muted' }, 'This widget has no settings. It works out of the box.');
}

// ---- display tab ------------------------------------------------------------------

function displayTab(w) {
  const wrap = h('div');
  let timer = null;
  let pending = {};
  const send = (patch) => {
    Object.assign(pending, patch);
    clearTimeout(timer);
    timer = setTimeout(() => { call('widget:set-display', w.id, pending).catch((e) => toast(e.message, 'bad')); pending = {}; }, 70);
  };
  const slider = (label, hint, key, min, max, value, unit, scale) => {
    const val = h('span', { class: 'val' }, Math.round(value * (scale || 1)) + unit);
    const input = h('input', { type: 'range', min, max, value: Math.round(value * (scale || 1)) });
    input.addEventListener('input', () => { val.textContent = input.value + unit; send({ [key]: Number(input.value) / (scale || 1) }); });
    return h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'slider-row' }, input, val), hint ? h('div', { class: 'help' }, hint) : null);
  };
  const mode = h('select', { class: 'input' }, h('option', { value: 'auto' }, 'Smart: fit height to content'), h('option', { value: 'fixed' }, 'Fixed: keep the size I drag'));
  mode.value = w.autoResize ? 'auto' : 'fixed';
  mode.addEventListener('change', () => send({ autoResize: mode.value === 'auto' }));
  wrap.append(
    h('div', { class: 'field' }, h('label', {}, 'Resize mode'), mode, h('div', { class: 'help' }, 'Drag the corner grip of the widget to resize. Dragging an edge switches to Fixed.')),
    slider('Opacity', 'How solid the widget looks.', 'opacity', 10, 100, w.opacity, '%', 100),
    slider('Minimum width', '', 'minWidth', 80, 800, w.minWidth, 'px'),
    slider('Maximum width', '', 'maxWidth', 200, 2000, w.maxWidth, 'px'),
    slider('Minimum height', '', 'minHeight', 50, 800, w.minHeight, 'px'),
    slider('Maximum height', 'Taller content scrolls inside the widget.', 'maxHeight', 80, 2000, w.maxHeight, 'px'),
    h('div', { class: 'field inline' }, h('div', {}, h('label', {}, 'Click-through'), h('div', { class: 'help' }, 'Mouse clicks pass to the windows behind it. Ctrl+Shift+X turns this off for all widgets.')), switchEl(w.clickThrough, (v) => send({ clickThrough: v }))),
    h('div', { class: 'field inline' }, h('div', {}, h('label', {}, 'Always on top'), h('div', { class: 'help' }, 'Keep above other windows.')), switchEl(w.sticky, (v) => call('widget:set-sticky', w.id, v))),
    h('button', { class: 'btn', onclick: () => { call('widget:set-display', w.id, { autoResize: false, opacity: 1, clickThrough: false, minWidth: 160, maxWidth: 800, minHeight: 80, maxHeight: 900 }); toast('Display reset'); close(); openDrawer(w.id, 'display'); } }, 'Reset display')
  );
  return wrap;
}

// ---- logs tab ----------------------------------------------------------------------

function logsTab(w) {
  const box = h('div', { class: 'logbox' });
  const empty = h('div', { class: 'muted', style: { padding: '8px' } }, 'No messages yet. Errors, warnings and console output from this widget appear here.');
  const lineEl = (e) => h('div', { class: 'logline ' + e.level, title: e.extra || '' }, h('time', {}, new Date(e.t).toLocaleTimeString()), e.message);
  const render = (entries) => {
    box.textContent = '';
    if (!entries.length) box.appendChild(empty);
    entries.forEach((e) => box.appendChild(lineEl(e)));
    box.scrollTop = box.scrollHeight;
  };
  call('widget:logs', w.id).then(render);
  logSink = (id, entry) => {
    if (id !== w.id || !box.isConnected) return;
    if (box.contains(empty)) box.textContent = '';
    box.appendChild(lineEl(entry));
    box.scrollTop = box.scrollHeight;
  };
  return h('div', {}, box, h('div', { class: 'row', style: { marginTop: '10px' } },
    h('button', { class: 'btn', onclick: async () => { await call('widget:logs-clear', w.id); render([]); } }, 'Clear'),
    h('button', { class: 'btn', onclick: () => call('widget:reload', w.id) }, 'Reload widget')));
}

// ---- about tab ---------------------------------------------------------------------

function aboutTab(w, actions) {
  const kv = h('dl', { class: 'kv' });
  const add = (k, v) => { if (v) kv.append(h('dt', {}, k), h('dd', {}, v)); };
  add('Name', w.name);
  add('Version', w.version);
  add('Author', w.author);
  add('Category', CATEGORY_LABELS[w.category] || w.category);
  add('Description', w.description);
  add('Source', w.source ? ({ gallery: 'Built-in gallery', marketplace: 'Community marketplace', local: 'Installed from a file' }[w.source.type] || w.source.type) : 'Created locally');
  add('Format', w.kind === 'folder' ? 'Folder widget' : 'Single .widget file');
  add('File', w.id);
  const menu = h('div', { class: 'row', style: { marginTop: '18px', flexWrap: 'wrap' } },
    h('button', { class: 'btn', onclick: () => actions.edit(w.id) }, icon('edit'), 'Edit'),
    h('button', { class: 'btn', onclick: async () => { const f = await call('creator:export', w.id); if (f) toast('Exported to ' + f); } }, icon('download'), 'Export'),
    h('button', { class: 'btn', onclick: () => actions.publish(w) }, icon('upload'), 'Publish'),
    h('button', { class: 'btn danger', onclick: async () => {
      if (await confirmDialog('Delete ' + w.name + '?', 'The widget and its settings are removed. A backup copy is kept in the app data folder.', 'Delete', true)) { await call('widget:remove', w.id); close(); toast('Deleted ' + w.name); }
    } }, 'Delete'));
  return h('div', {}, kv, menu);
}

// ---- drawer ---------------------------------------------------------------------------

function close() {
  logSink = null;
  if (!current) return;
  current.close();
  current = null;
}

function openDrawer(id, tab, actions) {
  const w = store.state.widgets.find((x) => x.id === id);
  if (!w) return;
  actions = actions || (current && current.actions);
  close();
  const root = document.getElementById('drawer-root');
  const scrim = h('div', { class: 'scrim', onclick: close });
  const look = healthLook(w);
  const statusEl = h('span', { class: 'badge ' + look.cls.split(' ')[0] }, h('span', { class: 'dot ' + look.cls }), look.text);
  const tabs = ['Settings', 'Display', 'Logs', 'About'];
  const body = h('div', { class: 'drawer-body' });
  const tabBar = h('div', { class: 'tabs' });
  const panel = h('div', { class: 'drawer', role: 'dialog' },
    h('div', { class: 'drawer-head' },
      h('div', { class: 'grow' }, h('h2', {}, (w.icon ? w.icon + ' ' : '') + w.name), h('div', { class: 'muted', style: { marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' } }, statusEl, w.version ? 'v' + w.version : '')),
      h('button', { class: 'btn ghost icon', onclick: close, 'aria-label': 'Close' }, icon('x'))),
    tabBar, body);

  const show = (name) => {
    current.tab = name;
    tabBar.textContent = '';
    tabs.forEach((t) => tabBar.appendChild(h('button', { class: 'tab' + (t === name ? ' active' : ''), onclick: () => show(t) }, t + (t === 'Logs' && w.health.logCount ? ' (' + w.health.logCount + ')' : ''))));
    body.textContent = '';
    if (w.health.lastError && name === 'Settings') body.appendChild(h('div', { class: 'banner bad' }, 'Last error: ' + w.health.lastError));
    const fresh = store.state.widgets.find((x) => x.id === id) || w;
    body.appendChild(name === 'Settings' ? settingsTab(fresh) : name === 'Display' ? displayTab(fresh) : name === 'Logs' ? logsTab(fresh) : aboutTab(fresh, actions));
  };

  root.append(scrim, panel);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  current = { id, tab, actions, show, close: () => { document.removeEventListener('keydown', onKey); scrim.remove(); panel.remove(); } };
  show(tab || (w.config.length || w.setupHtml ? 'Settings' : 'Display'));
}

module.exports = { openDrawer, closeDrawer: close, healthLook, timeAgo };

// Keep the Display tab honest when the widget is resized by dragging its corner while the panel is open.
subscribe(() => {
  if (!current || current.tab !== 'Display') return;
  const active = document.activeElement;
  if (active && active.closest && active.closest('.drawer')) return; // user is mid-edit
  current.show('Display');
});
