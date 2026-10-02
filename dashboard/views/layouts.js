'use strict';
// Layouts and profiles: arrange open widgets, and save/restore whole setups.
const { h, icon, toast, confirmDialog } = require('../ui');
const { call, store } = require('../api');
const { TEMPLATES } = require('../../engine/layout-templates');

let displayId = null;

async function render(container) {
  container.textContent = '';
  const data = await call('layout:list');
  const primary = data.displays.find((d) => d.primary) || data.displays[0];
  if (!data.displays.some((d) => d.id === displayId)) displayId = primary && primary.id;

  const repaint = () => render(container);

  const name = h('input', { class: 'input', placeholder: 'Name, e.g. Work or Gaming', style: { width: '220px' } });
  const kind = h('select', { class: 'input', style: { width: '170px' } },
    h('option', { value: 'layout' }, 'Layout (positions only)'),
    h('option', { value: 'profile' }, 'Profile (widgets + positions)'));
  const save = async () => {
    if (!name.value.trim()) { toast('Give it a name first', 'bad'); return; }
    try { await call('layout:save', name.value.trim(), kind.value); toast('Saved "' + name.value.trim() + '"'); repaint(); } catch (e) { toast(e.message, 'bad'); }
  };

  container.append(
    h('div', { class: 'view-head' }, h('div', {}, h('h1', {}, 'Layouts'), h('p', {}, 'Arrange your widgets on the desktop, then save the arrangement. Widgets also snap to screen edges and to each other when you drop them.'))),
    data.displays.length > 1 ? h('div', { class: 'toolbar' }, h('span', { class: 'muted' }, 'Apply templates to'), h('select', { class: 'input', style: { width: '260px' }, onchange: (e) => { displayId = Number(e.target.value); } }, data.displays.map((d) => h('option', { value: d.id, selected: d.id === displayId }, d.label)))) : null,
    h('div', { class: 'section-title' }, 'Templates'),
    h('div', { class: 'grid' }, TEMPLATES.map((t) => {
      const apply = h('button', { class: 'btn sm primary', disabled: !data.active.length }, data.active.length ? 'Apply to ' + data.active.length + ' open widget' + (data.active.length > 1 ? 's' : '') : 'No open widgets');
      apply.addEventListener('click', async () => {
        try { const r = await call('layout:apply-template', t.generate(data.active), displayId); toast('Arranged ' + r.applied + ' widget(s)'); } catch (e) { toast(e.message, 'bad'); }
      });
      return h('div', { class: 'card' }, h('div', { class: 'tpl-icon' }, t.icon), h('div', { class: 'card-body' }, h('div', { class: 'card-title' }, t.name), h('div', { class: 'card-desc' }, t.description), h('div', { class: 'card-actions' }, apply)));
    })),
    h('div', { class: 'section-title' }, 'Saved'),
    h('div', { class: 'toolbar' }, name, kind, h('button', { class: 'btn', onclick: save }, icon('plus'), 'Save current arrangement')),
    h('div', {}, data.saved.length ? data.saved.map((entry, index) => {
      const widgets = entry.widgetIds ? entry.widgetIds.length : 0;
      return h('div', { class: 'list-row' },
        h('div', { class: 'grow' }, h('strong', {}, entry.name), h('div', { class: 'muted' }, (entry.kind === 'profile' ? 'Profile' : 'Layout') + ' · ' + widgets + ' widget' + (widgets === 1 ? '' : 's') + (entry.groups && entry.groups.length > 1 ? ' · ' + entry.groups.length + ' displays' : '') + (entry.createdAt ? ' · ' + new Date(entry.createdAt).toLocaleDateString() : ''))),
        h('button', { class: 'btn sm primary', onclick: async () => { try { const r = await call('layout:activate', index); toast((entry.kind === 'profile' ? 'Switched to ' : 'Applied ') + entry.name + (r.skipped.length ? ' (' + r.skipped.length + ' not open)' : '')); } catch (e) { toast(e.message, 'bad'); } } }, entry.kind === 'profile' ? 'Switch to' : 'Apply'),
        h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDialog('Delete "' + entry.name + '"?', 'This cannot be undone.', 'Delete', true)) { await call('layout:delete', index); repaint(); } } }, 'Delete'));
    }) : h('div', { class: 'muted' }, 'Nothing saved yet. Profiles also appear in the tray menu for one-click switching.')));
}

module.exports = { render };
void store;
