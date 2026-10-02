'use strict';
// App settings: appearance, behaviour, marketplace, AI, updates, shortcuts.
const { h, icon, toast, switchEl, confirmDialog } = require('../ui');
const { call, store, refresh } = require('../api');
const discover = require('./discover');

const ACCENTS = ['#00f5d4', '#3a86ff', '#8338ec', '#ff006e', '#fb5607', '#ffbe0b', '#06d6a0'];

function setting(title, desc, control) {
  return h('div', { class: 'setting' }, h('div', {}, h('h4', {}, title), desc ? h('p', {}, desc) : null), control);
}

function render(container) {
  container.textContent = '';
  const s = store.state;
  const settings = s.settings;
  const update = (patch) => call('settings:update', patch).catch((e) => toast(e.message, 'bad'));

  const theme = h('div', { class: 'seg' }, ['dark', 'light', 'system'].map((t) => h('button', { class: settings.theme === t ? 'active' : '', onclick: async () => { await update({ theme: t }); await refresh(); render(container); } }, t[0].toUpperCase() + t.slice(1))));
  const accentPick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : '#00f5d4', style: { width: '32px', height: '28px', border: 0, background: 'none', padding: 0 } });
  accentPick.addEventListener('change', async () => { await update({ accent: accentPick.value }); await refresh(); render(container); });
  const swatches = h('div', { class: 'swatches' }, h('div', { class: 'swatch' + (settings.accent === 'auto' ? ' active' : ''), style: { background: 'linear-gradient(135deg, #00f5d4 50%, #0a7cff 50%)' }, title: 'Auto (matches the theme)', onclick: async () => { await update({ accent: 'auto' }); await refresh(); render(container); } }), ACCENTS.map((c) => h('div', { class: 'swatch' + (String(settings.accent).toLowerCase() === c ? ' active' : ''), style: { background: c }, title: c, onclick: async () => { await update({ accent: c }); await refresh(); render(container); } })), accentPick);

  const grid = h('select', { class: 'input', style: { width: '130px' } }, [[0, 'Off'], [8, '8 px'], [16, '16 px'], [32, '32 px']].map(([v, l]) => h('option', { value: v, selected: settings.grid === v }, l)));
  grid.addEventListener('change', () => update({ grid: Number(grid.value) }));

  const registryUrl = h('input', { class: 'input', value: settings.registryUrl, style: { width: '300px' } });
  registryUrl.addEventListener('change', () => update({ registryUrl: registryUrl.value.trim() }).then(() => { discover.invalidate(); toast('Marketplace address saved'); }));

  const aiKey = h('input', { class: 'input', type: 'password', placeholder: settings.anthropicKeySet ? 'Key saved (enter a new one to replace)' : 'sk-ant-…', style: { width: '300px' } });
  aiKey.addEventListener('change', async () => { const key = aiKey.value.trim(); await update({ anthropicKey: key }); await refresh(); toast(key ? 'API key saved' : 'API key removed'); render(container); });

  const up = s.updater || { state: 'idle' };
  const updateLabel = { idle: 'Check for updates', dev: 'Updates are disabled in development builds', checking: 'Checking…', current: 'You are up to date', downloading: 'Downloading ' + (up.version || '') + ' (' + up.percent + '%)', ready: 'Update ' + up.version + ' ready', error: 'Update check failed: ' + (up.error || '') }[up.state] || '';

  container.append(
    h('div', { class: 'view-head' }, h('div', {}, h('h1', {}, 'Settings'))),
    h('div', { class: 'settings-group' }, h('h3', {}, 'Appearance'),
      setting('Theme', 'Applies to this window and to every widget that uses the engine styles.', theme),
      setting('Accent colour', 'Used for highlights in the dashboard and in widgets.', swatches)),
    h('div', { class: 'settings-group' }, h('h3', {}, 'Behaviour'),
      setting('Launch on boot', 'Start Widgeter in the tray when you sign in.', switchEl(s.launchOnBoot, async (v) => { await call('settings:launch-on-boot', v); })),
      setting('Snap to edges', 'Widgets align to the screen edge and to each other when you drop them.', switchEl(settings.snap, (v) => update({ snap: v }))),
      setting('Snap to grid', 'Also round positions to a grid.', grid),
      setting('Hide / show widgets', null, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flex: 'none' } }, h('kbd', {}, 'Ctrl+Shift+W'), h('span', { class: 'badge ' + (s.shortcuts.boss ? 'good' : 'bad') }, s.shortcuts.boss ? 'Active' : 'Unavailable'))),
      setting('Exit click-through', 'When a widget is ignoring the mouse.', h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flex: 'none' } }, h('kbd', {}, 'Ctrl+Shift+X'), h('span', { class: 'badge ' + (s.shortcuts.clickThrough ? 'good' : 'bad') }, s.shortcuts.clickThrough ? 'Active' : 'Unavailable')))),
    h('div', { class: 'settings-group' }, h('h3', {}, 'Marketplace'),
      setting('Account', s.account ? 'Signed in as ' + s.account.username : 'Sign in to publish and rate widgets.', s.account
        ? h('button', { class: 'btn', onclick: async () => { await call('market:logout'); await refresh(); render(container); } }, 'Sign out')
        : h('button', { class: 'btn', onclick: () => discover.openAccount(() => render(container)) }, 'Sign in')),
      setting('Server address', 'Where community widgets come from.', registryUrl)),
    h('div', { class: 'settings-group' }, h('h3', {}, 'AI'),
      setting('Anthropic API key', 'Used only by "Generate with Claude" in the Creator. Stored on this PC.', aiKey)),
    h('div', { class: 'settings-group' }, h('h3', {}, 'App'),
      setting('Version ' + s.version, updateLabel, up.state === 'ready'
        ? h('button', { class: 'btn primary', onclick: () => call('updater:install') }, 'Restart to update')
        : h('button', { class: 'btn', disabled: !s.packaged || up.state === 'checking' || up.state === 'downloading', onclick: () => call('updater:check') }, icon('refresh'), 'Check now')),
      setting('Widgets folder', s.widgetsDir, h('button', { class: 'btn', onclick: () => call('app:open-widgets-folder') }, 'Open folder')),
      setting('Restart Widgeter', 'Relaunch and restore your open widgets.', h('button', { class: 'btn', onclick: async () => { if (await confirmDialog('Restart Widgeter?', 'Your widgets will close and come back.', 'Restart')) call('app:restart'); } }, 'Restart'))));
}

module.exports = { render };
