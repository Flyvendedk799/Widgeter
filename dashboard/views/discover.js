'use strict';
// Discover: the built-in gallery and the community marketplace, plus account and publishing.
const { h, icon, toast, openModal, stars, compact, CATEGORY_LABELS } = require('../ui');
const { call, store, refresh } = require('../api');

const ui = { source: 'builtin', q: '', category: 'all', sort: 'popular', page: 1 };
let galleryCache = null;
let communityTimer = null;

// ---- account ---------------------------------------------------------------------

function openAccount(after) {
  let mode = 'login';
  const body = h('div');
  const modal = openModal(body);
  const paint = () => {
    body.textContent = '';
    const user = h('input', { class: 'input', placeholder: 'username', autocomplete: 'username' });
    const pass = h('input', { class: 'input', type: 'password', placeholder: 'password (8+ characters)', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
    const error = h('div', { class: 'problem error', hidden: true });
    const submit = async () => {
      error.hidden = true;
      try {
        await call(mode === 'login' ? 'market:login' : 'market:register', user.value.trim(), pass.value);
        await refresh();
        modal.close();
        toast('Signed in as ' + user.value.trim());
        if (after) after();
      } catch (e) { error.textContent = e.message; error.hidden = false; }
    };
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    body.append(
      h('h2', {}, mode === 'login' ? 'Sign in' : 'Create an account'),
      h('p', { class: 'muted', style: { margin: '4px 0 16px' } }, 'An account lets you publish widgets and rate the ones you use.'),
      h('div', { class: 'field' }, h('label', {}, 'Username'), user),
      h('div', { class: 'field' }, h('label', {}, 'Password'), pass),
      error,
      h('div', { class: 'modal-actions', style: { justifyContent: 'space-between' } },
        h('button', { class: 'btn ghost', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; paint(); } }, mode === 'login' ? 'Create an account' : 'I have an account'),
        h('button', { class: 'btn primary', onclick: submit }, mode === 'login' ? 'Sign in' : 'Sign up')));
    user.focus();
  };
  paint();
}

// ---- publish -----------------------------------------------------------------------

function openPublish(w, actions) {
  if (!store.state.account) { openAccount(() => openPublish(w, actions)); return; }
  const description = h('textarea', { class: 'input', rows: 3, maxlength: 280, style: { fontFamily: 'inherit' } });
  description.value = w.description || '';
  const category = h('select', { class: 'input' }, Object.entries(CATEGORY_LABELS).map(([k, v]) => h('option', { value: k }, v)));
  category.value = w.category;
  const tags = h('input', { class: 'input', placeholder: 'comma separated, e.g. weather, forecast' });
  tags.value = (w.tags || []).join(', ');
  const changelog = h('input', { class: 'input', placeholder: 'What changed in this version?' });
  const bump = h('input', { type: 'checkbox' });
  const error = h('div', { class: 'problem error', hidden: true });
  const publish = h('button', { class: 'btn primary' }, 'Publish v' + (w.version || '1.0.0'));
  const modal = openModal([
    h('h2', {}, 'Publish ' + w.name),
    h('p', { class: 'muted', style: { margin: '4px 0 16px' } }, 'Publishing as ' + store.state.account.username + '. A preview image is captured from your running widget, so make sure it is enabled and showing something useful.'),
    h('div', { class: 'field' }, h('label', {}, 'Description'), description),
    h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', {}, 'Category'), category), h('div', { class: 'field' }, h('label', {}, 'Tags'), tags)),
    h('div', { class: 'field' }, h('label', {}, 'Changelog'), changelog),
    h('label', { class: 'muted', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, bump, 'Bump the patch version first (needed when this version is already published)'),
    error,
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => modal.close() }, 'Cancel'), publish)
  ]);
  bump.addEventListener('change', () => { publish.textContent = bump.checked ? 'Bump & publish' : 'Publish v' + (w.version || '1.0.0'); });
  publish.addEventListener('click', async () => {
    error.hidden = true;
    publish.disabled = true;
    try {
      const r = await call('market:publish', w.id, {
        description: description.value.trim(), category: category.value,
        tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean), changelog: changelog.value.trim(), bump: bump.checked
      });
      modal.close();
      toast('Published ' + r.slug + ' v' + r.version);
      galleryCache = null;
    } catch (e) {
      error.textContent = e.message + (e.details ? ': ' + e.details.join('; ') : '');
      error.hidden = false;
      publish.disabled = false;
    }
  });
}

// ---- cards -------------------------------------------------------------------------------

function thumbBlock(src, fallbackIcon) {
  return h('div', { class: 'thumb' }, src ? h('img', { src, alt: '', loading: 'lazy' }) : h('div', { class: 'ph' }, fallbackIcon || '🧩'));
}

function galleryCard(g) {
  const state = g.installed ? (g.installedVersion !== g.version ? 'update' : 'installed') : 'new';
  const btn = h('button', { class: 'btn sm ' + (state === 'installed' ? '' : 'primary'), disabled: state === 'installed' }, state === 'installed' ? 'Added' : state === 'update' ? 'Update' : 'Add');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    try { await call('gallery:install', g.slug); toast('Added ' + g.name); galleryCache = null; await refresh(); } catch (err) { toast(err.message, 'bad'); btn.disabled = false; }
  });
  return h('div', { class: 'card' },
    thumbBlock(g.thumbnail, g.icon),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, h('span', { class: 'grow' }, g.name)),
      h('div', { class: 'card-desc' }, g.description),
      h('div', { class: 'card-meta' }, h('span', {}, CATEGORY_LABELS[g.category] || g.category), g.needsSetup ? h('span', { class: 'badge warn' }, 'Needs setup') : h('span', { class: 'badge good' }, 'Works out of the box')),
      h('div', { class: 'card-actions' }, btn)));
}

function communityCard(item, openDetail) {
  const state = item.installedVersion ? (item.installedVersion !== item.latestVersion ? 'update' : 'installed') : 'new';
  const btn = h('button', { class: 'btn sm ' + (state === 'installed' ? '' : 'primary'), disabled: state === 'installed' }, state === 'installed' ? 'Installed' : state === 'update' ? 'Update' : 'Install');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    try { await call('market:install', item.slug); toast('Installed ' + item.name); await refresh(); paintCommunity(); } catch (err) { toast(err.message, 'bad'); btn.disabled = false; }
  });
  return h('div', { class: 'card clickable', onclick: () => openDetail(item.slug) },
    thumbBlock(item.thumbnailUrl, item.icon),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, h('span', { class: 'grow' }, item.name), item.featured ? h('span', { class: 'badge accent' }, 'Featured') : null),
      h('div', { class: 'card-desc' }, item.description),
      h('div', { class: 'card-meta' }, h('span', {}, 'by ' + item.author), item.ratingCount ? h('span', { class: 'stars' }, stars(item.ratingAvg), ' ', item.ratingAvg) : h('span', {}, 'No ratings'), h('span', {}, compact(item.installs) + ' installs'), h('span', {}, 'v' + item.latestVersion)),
      h('div', { class: 'card-actions' }, btn)));
}

// ---- community detail ---------------------------------------------------------------------

async function openCommunityDetail(slug) {
  const body = h('div', {}, h('div', { class: 'muted' }, 'Loading…'));
  const modal = openModal(body, { wide: true });
  try {
    const d = await call('market:detail', slug);
    const installed = (store.state.widgets.find((w) => w.slug === slug) || {}).version;
    const install = h('button', { class: 'btn primary' }, installed ? (installed === d.latestVersion ? 'Reinstall' : 'Update to v' + d.latestVersion) : 'Install v' + d.latestVersion);
    install.addEventListener('click', async () => {
      install.disabled = true;
      try { await call('market:install', slug); toast('Installed ' + d.name); await refresh(); modal.close(); paintCommunity(); } catch (e) { toast(e.message, 'bad'); install.disabled = false; }
    });

    const ratingSelect = h('select', { class: 'input', style: { width: '120px' } }, [5, 4, 3, 2, 1].map((n) => h('option', { value: n }, '★'.repeat(n))));
    const review = h('input', { class: 'input', placeholder: 'Optional review (max 500 characters)', maxlength: 500 });
    const rateBtn = h('button', { class: 'btn' }, 'Rate');
    rateBtn.addEventListener('click', async () => {
      if (!store.state.account) { openAccount(() => {}); return; }
      try { await call('market:rate', slug, Number(ratingSelect.value), review.value.trim()); toast('Thanks for rating'); modal.close(); openCommunityDetail(slug); } catch (e) { toast(e.message, 'bad'); }
    });

    body.textContent = '';
    body.append(
      h('div', { style: { display: 'flex', gap: '18px', alignItems: 'flex-start' } },
        h('div', { style: { width: '260px', flex: 'none' } }, thumbBlock(d.thumbnailUrl, d.icon)),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('h2', {}, (d.icon ? d.icon + ' ' : '') + d.name),
          h('div', { class: 'muted', style: { margin: '4px 0 10px' } }, 'by ' + d.author + ' · v' + d.latestVersion + ' · ' + compact(d.installs) + ' installs · ' + (CATEGORY_LABELS[d.category] || d.category)),
          h('p', {}, d.description),
          h('div', { class: 'chips', style: { margin: '10px 0' } }, (d.tags || []).map((t) => h('span', { class: 'badge' }, t))),
          d.config && d.config.some((c) => c.required) ? h('div', { class: 'problem warn' }, 'Needs setup: ' + d.config.filter((c) => c.required).map((c) => c.label).join(', ')) : null,
          h('div', { class: 'row', style: { marginTop: '12px', alignItems: 'center' } }, install, h('span', { class: 'stars', style: { flex: 'none' } }, d.ratingCount ? stars(d.ratingAvg) + ' ' + d.ratingAvg + ' (' + d.ratingCount + ')' : 'No ratings yet')))),
      h('div', { class: 'section-title' }, 'Versions'),
      h('div', {}, (d.versions || []).slice(0, 6).map((v) => h('div', { class: 'list-row' }, h('strong', {}, 'v' + v.version), h('span', { class: 'grow muted' }, v.changelog || 'No changelog'), h('span', { class: 'faint' }, new Date(v.createdAt).toLocaleDateString())))),
      h('div', { class: 'section-title' }, 'Reviews'),
      h('div', {}, (d.reviews || []).length ? d.reviews.map((r) => h('div', { class: 'list-row' }, h('span', { class: 'stars' }, '★'.repeat(r.rating)), h('div', { class: 'grow' }, h('strong', {}, r.username), r.review ? h('div', { class: 'muted' }, r.review) : null))) : h('div', { class: 'muted' }, 'No reviews yet.')),
      h('div', { class: 'section-title' }, 'Your rating'),
      h('div', { class: 'row', style: { alignItems: 'center' } }, ratingSelect, review, rateBtn));
  } catch (e) {
    body.textContent = '';
    body.append(h('div', { class: 'problem error' }, e.message));
  }
}

// ---- views --------------------------------------------------------------------------------

let gridEl = null;
let controlsEl = null;

function categoryChips(categories, repaint) {
  return h('div', { class: 'chips' }, ['all', ...categories].map((c) => h('button', { class: 'chip' + (ui.category === c ? ' active' : ''), onclick: () => { ui.category = c; ui.page = 1; repaint(); } }, c === 'all' ? 'All' : (CATEGORY_LABELS[c] || c))));
}

async function paintBuiltin() {
  if (!gridEl) return;
  gridEl.textContent = '';
  if (!galleryCache) {
    try { galleryCache = await call('gallery:list'); } catch (e) { gridEl.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'Could not load the gallery'), e.message)); return; }
  }
  const q = ui.q.trim().toLowerCase();
  const list = galleryCache.filter((g) => (ui.category === 'all' || g.category === ui.category) && (!q || [g.name, g.description, g.category, (g.tags || []).join(' ')].join(' ').toLowerCase().includes(q)));
  if (!list.length) gridEl.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'Nothing matches'), 'Try another search.'));
  list.forEach((g) => gridEl.appendChild(galleryCard(g)));
}

async function paintCommunity() {
  if (!gridEl) return;
  gridEl.textContent = '';
  for (let i = 0; i < 6; i++) gridEl.appendChild(h('div', { class: 'skeleton-card' }));
  try {
    const data = await call('market:list', { q: ui.q.trim(), category: ui.category === 'all' ? '' : ui.category, sort: ui.sort, page: ui.page, limit: 24 });
    gridEl.textContent = '';
    if (!data.items.length) gridEl.appendChild(h('div', { class: 'empty' }, h('h3', {}, ui.q ? 'No community widgets match' : 'Nothing published yet'), ui.q ? 'Try another search.' : 'Be the first: open My Widgets, choose a widget, and Publish it.'));
    data.items.forEach((item) => gridEl.appendChild(communityCard(item, openCommunityDetail)));
    const pages = Math.ceil(data.total / data.limit);
    if (pages > 1) gridEl.appendChild(h('div', { class: 'toolbar', style: { gridColumn: '1 / -1', justifyContent: 'center' } },
      h('button', { class: 'btn sm', disabled: ui.page <= 1, onclick: () => { ui.page--; paintCommunity(); } }, 'Previous'), h('span', { class: 'muted' }, 'Page ' + ui.page + ' of ' + pages),
      h('button', { class: 'btn sm', disabled: ui.page >= pages, onclick: () => { ui.page++; paintCommunity(); } }, 'Next')));
  } catch (e) {
    gridEl.textContent = '';
    gridEl.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'Could not reach the marketplace'), h('p', {}, e.message), h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn', onclick: paintCommunity }, icon('refresh'), 'Try again'))));
  }
}

function render(container, actions) {
  container.textContent = '';
  const repaint = () => render(container, actions);
  const search = h('input', { class: 'input search', type: 'search', placeholder: ui.source === 'builtin' ? 'Search the gallery' : 'Search the marketplace', value: ui.q });
  search.addEventListener('input', () => {
    ui.q = search.value;
    ui.page = 1;
    if (ui.source === 'builtin') paintBuiltin();
    else { clearTimeout(communityTimer); communityTimer = setTimeout(paintCommunity, 280); }
  });
  const sort = ui.source === 'community' ? h('select', { class: 'input', style: { width: '150px' }, onchange: (e) => { ui.sort = e.target.value; ui.page = 1; paintCommunity(); } },
    [['popular', 'Most installed'], ['rating', 'Top rated'], ['new', 'Newest'], ['name', 'Name']].map(([v, l]) => h('option', { value: v, selected: ui.sort === v }, l))) : null;
  const account = store.state.account;

  container.append(
    h('div', { class: 'view-head' },
      h('div', {}, h('h1', {}, 'Discover'), h('p', {}, ui.source === 'builtin' ? 'Widgets that ship with Widgeter. They work offline from the app and never need an account.' : 'Widgets published by the community.')),
      h('div', { class: 'toolbar', style: { margin: 0 } },
        h('div', { class: 'seg' }, h('button', { class: ui.source === 'builtin' ? 'active' : '', onclick: () => { ui.source = 'builtin'; ui.category = 'all'; repaint(); } }, 'Built-in'), h('button', { class: ui.source === 'community' ? 'active' : '', onclick: () => { ui.source = 'community'; ui.category = 'all'; repaint(); } }, 'Community')),
        ui.source === 'community' ? (account ? h('span', { class: 'badge' }, icon('user'), account.username) : h('button', { class: 'btn', onclick: () => openAccount(repaint) }, 'Sign in')) : null)));

  controlsEl = h('div', { class: 'toolbar' }, search, categoryChips(Object.keys(CATEGORY_LABELS), repaint), h('span', { class: 'spacer' }), sort);
  gridEl = h('div', { class: 'grid' });
  container.append(controlsEl, gridEl);
  if (ui.source === 'builtin') paintBuiltin(); else paintCommunity();
}

module.exports = { render, openPublish, openAccount, invalidate: () => { galleryCache = null; } };
