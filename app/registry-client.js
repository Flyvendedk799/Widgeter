'use strict';
// Talks to the Widgeter registry (the marketplace server).
const { net } = require('electron');

const S = require('./state');
const W = require('./widgets');
const gallery = require('./gallery');
const format = require('../engine/widget-format');
const { compareVersions } = require('../engine/manifest');

const TIMEOUT_MS = 15000;

function baseUrl() {
  return String(S.getSettings().registryUrl || S.DEFAULT_REGISTRY_URL).replace(/\/+$/, '');
}

async function request(method, route, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const account = S.getState().account;
  if (options.auth !== false && account && account.token) headers.Authorization = 'Bearer ' + account.token;
  let res;
  try {
    res = await net.fetch(baseUrl() + route, {
      method, headers, signal: controller.signal,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch (e) {
    const err = new Error(controller.signal.aborted ? 'The marketplace did not respond in time.' : 'Could not reach the marketplace (' + (e.cause && e.cause.code ? e.cause.code : e.message) + ').');
    err.offline = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Marketplace error ' + res.status);
    err.status = res.status;
    err.details = data && data.details;
    if (res.status === 401 && account) { S.getState().account = null; S.saveState(); }
    throw err;
  }
  return data;
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? '?' + s : '';
}

const absolutize = (item) => (item && item.thumbnailUrl && item.thumbnailUrl.startsWith('/') ? Object.assign({}, item, { thumbnailUrl: baseUrl() + item.thumbnailUrl }) : item);

async function list(params) {
  const data = await request('GET', '/v1/widgets' + qs(params), { auth: false });
  data.items = data.items.map(absolutize);
  const installed = new Map();
  for (const item of W.catalog()) if (item.manifest) installed.set(item.manifest.id, item.manifest.version);
  data.items.forEach((i) => { i.installedVersion = installed.get(i.slug) || null; });
  return data;
}

async function detail(slug) {
  const d = absolutize(await request('GET', '/v1/widgets/' + encodeURIComponent(slug), { auth: false }));
  const ratings = await request('GET', '/v1/widgets/' + encodeURIComponent(slug) + '/ratings', { auth: false }).catch(() => ({ items: [], total: 0 }));
  d.reviews = ratings.items;
  return d;
}

async function install(slug, version) {
  const pkg = await request('GET', '/v1/widgets/' + encodeURIComponent(slug) + '/download' + qs({ version: version || 'latest' }), { auth: false });
  return W.installPackage(pkg, { type: 'marketplace', slug, version: pkg.version });
}

async function login(username, password) {
  const data = await request('POST', '/v1/auth/login', { body: { username, password }, auth: false });
  S.getState().account = { username: data.user.username, token: data.token };
  S.saveState();
  return { username: data.user.username };
}

async function register(username, password) {
  const data = await request('POST', '/v1/auth/register', { body: { username, password }, auth: false });
  S.getState().account = { username: data.user.username, token: data.token };
  S.saveState();
  return { username: data.user.username };
}

async function logout() {
  try { await request('POST', '/v1/auth/logout', { body: {} }); } catch (e) { /* token may already be invalid */ }
  S.getState().account = null;
  S.saveState();
}

function account() {
  const a = S.getState().account;
  return a ? { username: a.username } : null;
}

async function mine() {
  const data = await request('GET', '/v1/me');
  data.widgets = data.widgets.map(absolutize);
  return data;
}

async function rate(slug, rating, review) {
  return request('POST', '/v1/widgets/' + encodeURIComponent(slug) + '/rating', { body: { rating, review } });
}

// Publishes an installed widget. meta: { description, category, tags, changelog }
async function publish(id, meta) {
  const entry = W.entryById(id);
  if (!entry || !entry.manifest) throw new Error('Widget not found.');
  const pkg = format.packWidget(entry.path);
  const merged = Object.assign({}, entry.manifest, pkg);
  if (!merged.id) throw new Error('Give the widget an id before publishing.');
  let thumbnail;
  try {
    const png = (await W.captureThumbnail(id)) || require('fs').readFileSync(W.thumbPath(id));
    thumbnail = png.toString('base64');
  } catch (e) { /* publish without a preview image */ }
  const body = {
    package: pkg,
    description: meta.description || entry.manifest.description,
    category: meta.category || entry.manifest.category,
    tags: meta.tags || entry.manifest.tags,
    changelog: meta.changelog || '',
    thumbnail
  };
  const result = await request('POST', '/v1/widgets', { body });
  return result;
}

// Installed widgets with a newer version available, from the marketplace and the bundled gallery.
async function checkUpdates() {
  const out = gallery.availableUpdates();
  const tracked = [];
  for (const item of W.catalog()) {
    if (!item.manifest) continue;
    const st = require('./state');
    const state = st.hasWidgetState(item.id) ? st.getWidgetState(item.id) : null;
    if (state && state.source && state.source.type === 'marketplace') tracked.push({ id: item.id, slug: item.manifest.id, version: item.manifest.version, name: item.manifest.name });
  }
  if (tracked.length) {
    try {
      const data = await request('POST', '/v1/updates', { body: { installed: tracked.map((t) => ({ slug: t.slug, version: t.version })) }, auth: false });
      for (const u of data.updates) {
        const t = tracked.find((x) => x.slug === u.slug);
        if (t && compareVersions(u.latestVersion, t.version) > 0) {
          out.push({ id: t.id, slug: t.slug, name: t.name, installedVersion: t.version, latestVersion: u.latestVersion, source: 'marketplace', changelog: u.changelog || '' });
        }
      }
    } catch (e) { /* offline: bundled updates are still reported */ }
  }
  return out;
}

async function applyUpdate(update) {
  if (update.source === 'gallery') return gallery.install(update.slug);
  return install(update.slug, update.latestVersion);
}

module.exports = { baseUrl, list, detail, install, login, register, logout, account, mine, rate, publish, checkUpdates, applyUpdate };
