'use strict';
// The built-in gallery: widgets that ship with the app (gallery/<id>/ folders).
const P = require('./paths');
const S = require('./state');
const W = require('./widgets');
const format = require('../engine/widget-format');
const { compareVersions, slugify } = require('../engine/manifest');

function fileUrl(file) {
  return 'file:///' + file.replace(/\\/g, '/');
}

function entries() {
  return format.listWidgets(P.GALLERY_DIR).filter((e) => e.kind === 'folder').map((item) => {
    const loaded = format.loadWidget(item.path);
    return Object.assign({ id: item.id }, loaded);
  }).filter((e) => e.manifest);
}

function installedBySlug() {
  const map = new Map();
  for (const item of W.catalog()) {
    if (item.manifest) map.set(item.manifest.id, item);
  }
  return map;
}

function list() {
  const installed = installedBySlug();
  return entries().map((e) => {
    const m = e.manifest;
    const have = installed.get(m.id);
    return {
      slug: m.id,
      name: m.name,
      description: m.description,
      category: m.category,
      tags: m.tags,
      icon: m.icon,
      version: m.version,
      author: m.author,
      thumbnail: e.thumbnail ? fileUrl(e.thumbnail) : null,
      needsSetup: (m.config || []).some((f) => f.required),
      installed: !!have,
      installedId: have ? have.id : null,
      installedVersion: have && have.manifest ? have.manifest.version : null,
      valid: e.ok
    };
  });
}

function find(slug) {
  return entries().find((e) => e.manifest.id === slug);
}

function install(slug) {
  const entry = find(slug);
  if (!entry) throw new Error('Unknown gallery widget: ' + slug);
  if (!entry.ok) throw new Error('Gallery widget is invalid: ' + entry.errors.join('; '));
  const pkg = format.packWidget(entry.path);
  return W.installPackage(pkg, { type: 'gallery', slug, version: entry.manifest.version });
}

function installMany(slugs) {
  const done = [];
  for (const slug of slugs) {
    try { done.push(Object.assign({ slug }, install(slug))); } catch (e) { done.push({ slug, error: e.message }); }
  }
  return done;
}

// Installed gallery widgets whose bundled version is newer than what is installed.
function availableUpdates() {
  const out = [];
  const bundled = new Map(entries().map((e) => [e.manifest.id, e]));
  for (const item of W.catalog()) {
    if (!item.manifest) continue;
    const state = S.hasWidgetState(item.id) ? S.getWidgetState(item.id) : null;
    if (!state || !state.source || state.source.type !== 'gallery') continue;
    const latest = bundled.get(item.manifest.id);
    if (latest && compareVersions(latest.manifest.version, item.manifest.version) > 0) {
      out.push({
        id: item.id, slug: item.manifest.id, name: item.manifest.name,
        installedVersion: item.manifest.version, latestVersion: latest.manifest.version,
        source: 'gallery', changelog: ''
      });
    }
  }
  return out;
}

// Older releases shipped each widget as a single file named after the repo file
// (weather-widget.widget). Gallery widgets list those names under `legacyIds`;
// swap the file for the gallery folder and carry over position and settings.
function migrateLegacy() {
  const map = new Map();
  for (const e of entries()) {
    for (const legacy of e.manifest.legacyIds) map.set(legacy, e);
  }
  if (!map.size) return [];
  const moved = [];
  const have = installedBySlug();
  for (const item of W.catalog()) {
    const target = map.get(item.id);
    if (!target || have.has(target.manifest.id)) continue;
    const oldState = S.hasWidgetState(item.id) ? JSON.parse(JSON.stringify(S.getWidgetState(item.id))) : null;
    W.uninstall(item.id);
    const newId = slugify(target.manifest.id);
    if (oldState) {
      delete oldState.source;
      S.updateWidgetState(newId, oldState);
    }
    try {
      install(target.manifest.id);
      moved.push({ from: item.id, to: newId });
    } catch (e) {
      console.error('Legacy migration failed for ' + item.id, e);
    }
  }
  return moved;
}

module.exports = { list, find, install, installMany, availableUpdates, migrateLegacy, fileUrl };
