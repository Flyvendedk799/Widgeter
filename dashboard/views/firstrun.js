'use strict';
// First launch: choose starter widgets from the built-in gallery.
const { h, toast, openModal, CATEGORY_LABELS } = require('../ui');
const { call, refresh } = require('../api');

const RECOMMENDED = ['system-stats', 'weather', 'digital-clock', 'todo-list', 'hacker-news', 'pomodoro'];

async function show() {
  let gallery;
  try { gallery = await call('gallery:list'); } catch (e) { return; }
  const chosen = new Set(RECOMMENDED.filter((slug) => gallery.some((g) => g.slug === slug)));
  const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', maxHeight: '48vh', overflowY: 'auto', padding: '2px' } });
  const addBtn = h('button', { class: 'btn primary' });
  const count = () => { addBtn.textContent = chosen.size ? 'Add ' + chosen.size + ' widget' + (chosen.size > 1 ? 's' : '') : 'Continue without widgets'; };

  for (const g of gallery) {
    const tile = h('div', { class: 'card clickable pick' + (chosen.has(g.slug) ? ' on' : '') },
      h('div', { class: 'thumb', style: { aspectRatio: '16 / 9' } }, g.thumbnail ? h('img', { src: g.thumbnail, alt: '' }) : h('div', { class: 'ph' }, g.icon || '🧩')),
      h('div', { class: 'check' }, '✓'),
      h('div', { class: 'card-body', style: { padding: '8px 10px 10px' } }, h('div', { class: 'card-title', style: { fontSize: '13px' } }, h('span', { class: 'grow' }, g.name)), h('div', { class: 'faint', style: { fontSize: '11px' } }, CATEGORY_LABELS[g.category] || g.category)));
    tile.addEventListener('click', () => {
      if (chosen.has(g.slug)) chosen.delete(g.slug); else chosen.add(g.slug);
      tile.classList.toggle('on', chosen.has(g.slug));
      count();
    });
    grid.appendChild(tile);
  }
  count();

  const modal = openModal([
    h('h2', {}, 'Welcome to Widgeter'),
    h('p', { class: 'muted', style: { margin: '4px 0 16px' } }, 'Widgets float on your desktop. Pick a few to start with; you can add, remove and rearrange them any time.'),
    grid,
    h('div', { class: 'modal-actions', style: { justifyContent: 'space-between' } },
      h('button', { class: 'btn ghost', onclick: async () => { await call('firstrun:skip'); await refresh(); modal.close(); } }, 'Skip'),
      addBtn)
  ], { wide: true });

  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    const results = await call('firstrun:install', [...chosen]);
    const failed = results.filter((r) => r.error);
    await refresh();
    modal.close();
    toast(failed.length ? 'Some widgets could not be added: ' + failed[0].error : (results.length ? 'Added ' + results.length + ' widget(s). Right-click a widget for quick options.' : 'You can add widgets from Discover any time.'), failed.length ? 'bad' : undefined);
  });
}

module.exports = { show };
