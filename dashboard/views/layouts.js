'use strict';
// Layouts and profiles: arrange open widgets, and save/restore whole setups.
const { h, icon, toast, confirmDialog } = require('../ui');
const { call, store } = require('../api');
const { TEMPLATES } = require('../../engine/layout-templates');

let displayId = null;

const PRESETS = [
  {
    id: 'developer-focus',
    name: 'Developer Focus',
    badge: 'Dev',
    icon: '⚡',
    description: 'Side-by-side terminal & container telemetry for dev workflows.',
    widgets: ['git-status', 'docker-containers', 'ping-monitor', 'api-latency'],
    category: 'dev',
    generate: (ids) => {
      if (!ids.length) return [];
      if (ids.length === 1) return [{ widgetId: ids[0], x: 68, y: 5, width: 28, height: 90 }];
      if (ids.length === 2) {
        return [
          { widgetId: ids[0], x: 44, y: 5, width: 26, height: 90 },
          { widgetId: ids[1], x: 72, y: 5, width: 26, height: 90 }
        ];
      }
      const half = Math.ceil(ids.length / 2);
      const left = ids.slice(0, half);
      const right = ids.slice(half);
      const hLeft = Math.floor(90 / left.length);
      const hRight = Math.floor(90 / right.length);
      const res = [];
      left.forEach((id, i) => {
        res.push({ widgetId: id, x: 44, y: 5 + i * hLeft, width: 26, height: hLeft });
      });
      right.forEach((id, i) => {
        res.push({ widgetId: id, x: 72, y: 5 + i * hRight, width: 26, height: hRight });
      });
      return res;
    }
  },
  {
    id: 'developer-dual',
    name: 'Developer Dual',
    badge: 'Dual',
    icon: '💻',
    description: 'Dual-column arrangement optimized for code and environment status.',
    widgets: ['git-status', 'docker-containers', 'ping-monitor'],
    category: 'dev',
    generate: (ids) => {
      if (!ids.length) return [];
      if (ids.length === 1) return [{ widgetId: ids[0], x: 70, y: 5, width: 28, height: 90 }];
      return [
        { widgetId: ids[0], x: 44, y: 5, width: 27, height: 90 },
        { widgetId: ids[1], x: 72, y: 5, width: 27, height: 90 },
        ...(ids.slice(2).map((id, i) => ({ widgetId: id, x: 16, y: 5 + i * 30, width: 26, height: 28 })))
      ];
    }
  },
  {
    id: 'system-telemetry',
    name: 'System Telemetry',
    badge: 'System',
    icon: '📊',
    description: 'Real-time CPU, memory, GPU, disk, and network hardware gauges.',
    widgets: ['system-stats', 'cpu-cores', 'disk-usage', 'network-stats', 'gpu-monitor'],
    category: 'system',
    generate: (ids) => {
      if (!ids.length) return [];
      const cols = Math.min(ids.length, 2);
      const rows = Math.ceil(ids.length / cols);
      const colW = 24;
      const startX = 100 - (cols * colW) - 1;
      const hEach = Math.min(Math.floor(92 / rows), 45);
      return ids.map((id, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return { widgetId: id, x: startX + c * colW, y: 4 + r * hEach, width: colW, height: hEach };
      });
    }
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    badge: 'Focus',
    icon: '🍃',
    description: 'Clean corner widgets keeping your workspace distraction-free.',
    widgets: ['digital-clock', 'weather', 'zen-breathing'],
    category: 'time',
    generate: (ids) => {
      if (!ids.length) return [];
      let y = 3;
      return ids.slice(0, 3).map((id) => {
        const item = { widgetId: id, x: 76, y, width: 22, height: 26 };
        y += 28;
        return item;
      });
    }
  }
];

async function applyPreset(preset, displayId, data, repaint) {
  let st = store.state;
  if (!st || !st.widgets) {
    try { st = await call('dash:state'); } catch (_) { st = { widgets: [] }; }
  }
  const allWidgets = (st && st.widgets) || [];
  const installedIds = new Set(allWidgets.map((w) => w.id));

  let targetIds = (preset.widgets || []).filter((id) => installedIds.has(id));
  if (!targetIds.length && preset.category) {
    const isCatMatch = (w) => {
      if (preset.category === 'dev') return w.category === 'dev' || w.category === 'developer';
      return w.category === preset.category;
    };
    const maxCount = preset.widgets ? preset.widgets.length : 4;
    targetIds = allWidgets.filter(isCatMatch).slice(0, maxCount).map((w) => w.id);
  }

  if (!targetIds.length) {
    toast('No matching widgets available for ' + preset.name, 'warn');
    return null;
  }

  for (const id of targetIds) {
    const w = allWidgets.find((x) => x.id === id);
    if (!w || !w.enabled) {
      try { await call('widget:toggle', id, true); } catch (_) {}
    }
  }

  const positions = preset.generate(targetIds);
  const r = await call('layout:apply-template', positions, displayId);
  const count = (r && r.applied) || 0;
  const skipped = (r && r.skipped) || [];
  if (!count) {
    toast('No widgets were arranged with ' + preset.name + (skipped.length ? ' (' + skipped.length + ' not open)' : ''), 'warn');
  } else if (skipped.length) {
    toast('Arranged ' + count + ' of ' + (count + skipped.length) + ' widgets with ' + preset.name + ' (' + skipped.length + ' not open)');
  } else {
    toast('Arranged ' + count + ' widget' + (count === 1 ? '' : 's') + ' with ' + preset.name);
  }
  if (repaint) setTimeout(repaint, 100);
  return { targetIds, positions, result: r };
}

async function duplicateLayout(entry, index, data, repaint) {
  const isProfile = entry.kind === 'profile';
  const promptTitle = isProfile ? 'Duplicate profile "' + entry.name + '"?' : 'Duplicate layout "' + entry.name + '"?';
  const promptMsg = isProfile
    ? 'Duplicating will apply this profile to your desktop to save a copy. Widgets not in the profile will be closed, and your current arrangement will change.'
    : 'Duplicating will apply this layout to your desktop to save a copy. Widgets in this layout will be opened and your current widget positions will change. The copy captures everything currently open on the desktop, including widgets that are not in the original layout.';

  const confirmed = await confirmDialog(promptTitle, promptMsg, 'Duplicate & Apply', false);
  if (!confirmed) return null;

  let newName = entry.name + ' (Copy)';
  let count = 2;
  const saved = (data && data.saved) || [];
  while (saved.some((e) => e.name === newName && e.kind === entry.kind)) {
    newName = entry.name + ' (Copy ' + count + ')';
    count++;
  }

  const widgetIds = entry.widgetIds || (entry.groups ? entry.groups.flatMap((g) => (g.positions || []).map((p) => p.widgetId)) : []);
  for (const wid of widgetIds) {
    try { await call('widget:toggle', wid, true); } catch (_) {}
  }

  await call('layout:activate', index);
  await call('layout:save', newName, entry.kind);
  toast('Duplicated "' + entry.name + '" as "' + newName + '"');
  if (repaint) repaint();
  return newName;
}

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
    h('div', { class: 'section-title' }, 'Presets'),
    h('div', { class: 'dash-presets-grid grid' }, PRESETS.map((p) => {
      const apply = h('button', { class: 'btn sm primary dash-preset-btn', onclick: () => applyPreset(p, displayId, data, repaint) }, 'Apply preset');
      return h('div', { class: 'dash-preset-card card' },
        h('div', { class: 'dash-preset-head' },
          h('div', { class: 'dash-preset-title' }, h('span', { class: 'tpl-icon', style: { padding: 0, fontSize: '20px' } }, p.icon), p.name),
          h('span', { class: 'badge accent' }, p.badge)),
        h('div', { class: 'dash-preset-desc' }, p.description),
        h('div', { class: 'card-actions' }, apply));
    })),
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
        h('button', { class: 'btn sm dash-duplicate-btn', title: 'Duplicate layout', onclick: () => duplicateLayout(entry, index, data, repaint).catch((e) => toast(e.message, 'bad')) }, 'Duplicate'),
        h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDialog('Delete "' + entry.name + '"?', 'This cannot be undone.', 'Delete', true)) { await call('layout:delete', index); repaint(); } } }, 'Delete'));
    }) : h('div', { class: 'muted' }, 'Nothing saved yet. Profiles also appear in the tray menu for one-click switching.')));
}

module.exports = { render, PRESETS, applyPreset, duplicateLayout };
void store;
