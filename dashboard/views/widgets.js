'use strict';
// "My Widgets": everything installed, with status, quick toggles and settings.
const { h, icon, toast, switchEl, openMenu, confirmDialog, CATEGORY_LABELS } = require('../ui');
const { call, store } = require('../api');
const { openDrawer, healthLook } = require('./drawer');

const filter = { q: '', category: 'all' };
let updates = [];

async function checkUpdates() {
  try { updates = await call('updates:check'); } catch (e) { updates = []; }
  const badge = document.getElementById('nav-badge-widgets');
  if (badge) { badge.textContent = updates.length; badge.hidden = !updates.length; }
}

function matches(w) {
  if (filter.category !== 'all' && w.category !== filter.category) return false;
  const q = filter.q.trim().toLowerCase();
  if (!q) return true;
  return [w.name, w.description, w.category, (w.tags || []).join(' ')].join(' ').toLowerCase().includes(q);
}

function card(w, actions) {
  const look = healthLook(w);
  const update = updates.find((u) => u.id === w.id);
  const thumb = h('div', { class: 'thumb' },
    w.thumbnail ? h('img', { src: w.thumbnail, alt: '', loading: 'lazy' }) : h('div', { class: 'ph' }, w.icon || '🧩'),
    h('div', { class: 'corner' },
      update ? h('span', { class: 'badge accent' }, 'Update ' + update.latestVersion) : null,
      !w.valid ? h('span', { class: 'badge bad' }, 'Invalid') : null));

  const status = h('span', { class: 'badge ' + look.cls.split(' ')[0], title: w.health.lastError || '' }, h('span', { class: 'dot ' + look.cls }), look.text);
  const open = (tab) => openDrawer(w.id, tab, actions);

  return h('div', { class: 'card clickable' + (w.enabled ? '' : ' off'), onclick: () => open() },
    thumb,
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, h('span', { class: 'grow', title: w.name }, w.name), switchEl(w.enabled, (v) => call('widget:toggle', w.id, v).catch((e) => toast(e.message, 'bad')))),
      h('div', { class: 'card-desc' }, w.description || (w.valid ? 'No description.' : w.errors.join('; '))),
      h('div', { class: 'card-meta' }, status, h('span', {}, CATEGORY_LABELS[w.category] || w.category), w.version ? h('span', {}, 'v' + w.version) : null),
      h('div', { class: 'card-actions', onclick: (e) => e.stopPropagation() },
        update ? h('button', { class: 'btn sm primary', onclick: async () => { try { await call('updates:apply', update); toast('Updated ' + w.name + ' to ' + update.latestVersion); await checkUpdates(); } catch (e) { toast(e.message, 'bad'); } } }, 'Update') : null,
        h('button', { class: 'btn sm', onclick: () => open() }, icon('gear'), 'Settings'),
        h('button', { class: 'btn sm ghost', title: 'Logs', onclick: () => open('Logs') }, icon('logs'), w.health.logCount ? String(w.health.logCount) : ''),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost icon', 'aria-label': 'More', onclick: (e) => openMenu(e.currentTarget, [
          { label: 'Edit in Creator', run: () => actions.edit(w.id) },
          { label: 'Reload', run: () => call('widget:reload', w.id) },
          { label: 'Export .widget…', run: async () => { const f = await call('creator:export', w.id); if (f) toast('Exported to ' + f); } },
          { label: 'Publish to marketplace…', run: () => actions.publish(w) },
          '-',
          { label: 'Delete', danger: true, run: async () => { if (await confirmDialog('Delete ' + w.name + '?', 'The widget and its settings are removed. A backup copy is kept in the app data folder.', 'Delete', true)) { await call('widget:remove', w.id); toast('Deleted ' + w.name); } } }
        ]) }, icon('more')))));
}

function render(container, actions) {
  const all = store.state.widgets;
  container.textContent = '';
  const categories = ['all', ...new Set(all.map((w) => w.category))];

  const attention = all.filter((w) => w.enabled && (w.health.status === 'error' || w.health.status === 'failed'));
  const needSetup = all.filter((w) => w.enabled && w.health.needsSetup);

  container.append(
    h('div', { class: 'view-head' },
      h('div', {}, h('h1', {}, 'My Widgets'), h('p', {}, all.length ? all.filter((w) => w.enabled).length + ' of ' + all.length + ' running' : 'Nothing installed yet')),
      h('div', { class: 'toolbar', style: { margin: 0 } },
        h('button', { class: 'btn', onclick: async () => reportInstall(await call('install:pick')) }, icon('upload'), 'Load file…'),
        h('button', { class: 'btn primary', onclick: () => actions.go('discover') }, icon('plus'), 'Add widgets'))));

  if (updates.length) {
    container.appendChild(h('div', { class: 'banner' }, icon('refresh'), h('span', {}, updates.length + ' widget update' + (updates.length > 1 ? 's' : '') + ' available'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm primary', onclick: async () => {
        for (const u of updates) { try { await call('updates:apply', u); } catch (e) { toast(u.name + ': ' + e.message, 'bad'); } }
        toast('Widgets updated'); await checkUpdates(); render(container, actions);
      } }, 'Update all')));
  }
  if (attention.length) container.appendChild(h('div', { class: 'banner bad' }, attention.length + ' widget' + (attention.length > 1 ? 's have' : ' has') + ' errors: ' + attention.map((w) => w.name).join(', ')));
  else if (needSetup.length) container.appendChild(h('div', { class: 'banner warn' }, needSetup.map((w) => w.name).join(', ') + (needSetup.length > 1 ? ' need' : ' needs') + ' setup before showing data.'));

  if (all.length) {
    const search = h('input', { class: 'input search', type: 'search', placeholder: 'Search installed widgets', value: filter.q });
    const grid = h('div', { class: 'grid' });
    const paint = () => {
      grid.textContent = '';
      const list = all.filter(matches);
      if (!list.length) grid.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'No widgets match'), 'Try a different search or category.'));
      list.forEach((w) => grid.appendChild(card(w, actions)));
    };
    search.addEventListener('input', () => { filter.q = search.value; paint(); });
    container.append(h('div', { class: 'toolbar' }, search, h('div', { class: 'chips' }, categories.map((c) => h('button', { class: 'chip' + (filter.category === c ? ' active' : ''), onclick: () => { filter.category = c; render(container, actions); } }, c === 'all' ? 'All' : (CATEGORY_LABELS[c] || c))))), grid);
    paint();
  } else {
    container.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'No widgets yet'), h('p', {}, 'Pick some from the built-in gallery, browse community widgets, or drop a .widget file anywhere in this window.'),
      h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn primary', onclick: () => actions.go('discover') }, icon('plus'), 'Browse widgets'))));
  }
}

function reportInstall(results) {
  for (const r of results || []) {
    if (r.error) toast((r.path ? r.path.split(/[\\/]/).pop() + ': ' : '') + r.error, 'bad');
    else toast('Installed ' + r.id);
  }
}

module.exports = { render, checkUpdates, reportInstall, getUpdates: () => updates };
