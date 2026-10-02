'use strict';
// Widget manifest: the one definition of what a widget is. Shared by the desktop
// app, the registry server, the validator and the test suite, so it must stay
// dependency-free and runnable in plain Node.

const CATEGORIES = ['system', 'dev', 'info', 'productivity', 'finance', 'time', 'media', 'other'];
const FIELD_TYPES = ['text', 'password', 'number', 'select', 'boolean', 'textarea', 'color', 'url'];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

const LIMITS = { name: 60, description: 280, author: 60, tag: 24, tags: 8, source: 512 * 1024, configFields: 30 };

const DEFAULT_FILES = { html: 'index.html', css: 'style.css', js: 'script.js' };

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateConfigField(field, index, errors) {
  const where = 'config[' + index + ']';
  if (!isPlainObject(field)) {
    errors.push(where + ' must be an object');
    return null;
  }
  if (typeof field.key !== 'string' || !KEY_RE.test(field.key)) {
    errors.push(where + '.key must be an identifier (letters, digits, underscore)');
    return null;
  }
  const type = field.type || 'text';
  if (!FIELD_TYPES.includes(type)) {
    errors.push(where + '.type "' + type + '" is not one of ' + FIELD_TYPES.join(', '));
    return null;
  }
  const out = {
    key: field.key,
    label: String(field.label || field.key),
    type,
    help: field.help ? String(field.help) : '',
    placeholder: field.placeholder ? String(field.placeholder) : '',
    required: !!field.required
  };
  if (field.default !== undefined) out.default = field.default;
  if (type === 'select') {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      errors.push(where + '.options is required for select fields');
      return null;
    }
    out.options = field.options.map((o) => (isPlainObject(o)
      ? { value: String(o.value), label: String(o.label !== undefined ? o.label : o.value) }
      : { value: String(o), label: String(o) }));
  }
  if (type === 'number') {
    if (field.min !== undefined) out.min = Number(field.min);
    if (field.max !== undefined) out.max = Number(field.max);
    if (field.step !== undefined) out.step = Number(field.step);
  }
  return out;
}

// Returns { ok, errors, warnings, manifest }. `manifest` is normalised: every
// optional field has its default, so callers never branch on "is it set".
function validateManifest(raw, options = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['Widget must be a JSON object'], warnings, manifest: null };
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) errors.push('name is required');
  else if (name.length > LIMITS.name) errors.push('name must be at most ' + LIMITS.name + ' characters');

  let id = raw.id;
  if (id === undefined || id === '') {
    id = slugify(name);
    if (options.strict) errors.push('id is required');
    else warnings.push('id missing, derived "' + id + '" from name');
  }
  if (id && !ID_RE.test(id)) errors.push('id must be 2-48 chars of a-z, 0-9 and "-"');

  let version = raw.version;
  if (version === undefined) {
    version = '1.0.0';
    if (options.strict) errors.push('version is required');
    else warnings.push('version missing, assuming 1.0.0');
  }
  if (!SEMVER_RE.test(String(version))) errors.push('version must look like 1.2.3');

  const category = raw.category || 'other';
  if (!CATEGORIES.includes(category)) errors.push('category must be one of ' + CATEGORIES.join(', '));

  const description = raw.description ? String(raw.description) : '';
  if (description.length > LIMITS.description) errors.push('description must be at most ' + LIMITS.description + ' characters');
  if (options.strict && !description) errors.push('description is required');

  const author = raw.author ? String(raw.author) : '';
  if (author.length > LIMITS.author) errors.push('author must be at most ' + LIMITS.author + ' characters');

  let tags = [];
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags)) errors.push('tags must be an array');
    else {
      tags = raw.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean);
      if (tags.length > LIMITS.tags) errors.push('at most ' + LIMITS.tags + ' tags');
      if (tags.some((t) => t.length > LIMITS.tag)) errors.push('tags must be at most ' + LIMITS.tag + ' characters');
    }
  }

  for (const key of ['width', 'height']) {
    if (raw[key] !== undefined && !(Number.isFinite(raw[key]) && raw[key] >= 40 && raw[key] <= 4000)) {
      errors.push(key + ' must be a number between 40 and 4000');
    }
  }

  const config = [];
  if (raw.config !== undefined) {
    if (!Array.isArray(raw.config)) errors.push('config must be an array of field definitions');
    else {
      if (raw.config.length > LIMITS.configFields) errors.push('at most ' + LIMITS.configFields + ' config fields');
      const seen = new Set();
      raw.config.forEach((f, i) => {
        const field = validateConfigField(f, i, errors);
        if (!field) return;
        if (seen.has(field.key)) errors.push('config key "' + field.key + '" is declared twice');
        seen.add(field.key);
        config.push(field);
      });
    }
  }

  // Source: either inline html/css/js (single-file .widget) or a files map
  // pointing at siblings (folder widget). Folder widgets are inlined by the
  // loader before they get here, so a manifest with `files` and no inline source
  // is only valid when options.allowFiles is set.
  const hasInline = ['html', 'css', 'js'].some((k) => typeof raw[k] === 'string');
  if (!hasInline && !options.allowFiles) errors.push('widget has no html, css or js');
  for (const k of ['html', 'css', 'js', 'setupHtml', 'setupJs']) {
    if (raw[k] !== undefined && typeof raw[k] !== 'string') errors.push(k + ' must be a string');
    else if (typeof raw[k] === 'string' && raw[k].length > LIMITS.source) errors.push(k + ' is larger than ' + (LIMITS.source / 1024) + ' KB');
  }
  if (raw.files !== undefined && !isPlainObject(raw.files)) errors.push('files must be an object');
  if (raw.setupHtml && config.length) warnings.push('setupHtml is ignored when a config schema is declared');

  const manifest = {
    id,
    name,
    version: String(version),
    author,
    description,
    category,
    tags,
    icon: raw.icon ? String(raw.icon).slice(0, 8) : '',
    config,
    width: raw.width !== undefined ? raw.width : 300,
    height: raw.height !== undefined ? raw.height : 300,
    minWidth: raw.minWidth,
    minHeight: raw.minHeight,
    alwaysOnTop: !!raw.alwaysOnTop,
    draggable_body: raw.draggable_body !== false,
    transparent: raw.transparent !== false,
    backgroundColor: raw.backgroundColor || '#00000000',
    // Widgets written before manifests existed (no version) keep their own look.
    useBaseStyles: raw.useBaseStyles !== undefined ? !!raw.useBaseStyles : raw.version !== undefined,
    html: raw.html,
    css: raw.css,
    js: raw.js,
    setupHtml: raw.setupHtml,
    setupJs: raw.setupJs,
    files: raw.files,
    legacyIds: Array.isArray(raw.legacyIds) ? raw.legacyIds.map(String) : [],
    x: raw.x,
    y: raw.y
  };
  return { ok: errors.length === 0, errors, warnings, manifest };
}

// Default values declared by a config schema, so widgets can rely on getConfig().
function configDefaults(manifest) {
  const out = {};
  for (const field of (manifest && manifest.config) || []) {
    if (field.default !== undefined) out[field.key] = field.default;
  }
  return out;
}

// Coerce a value coming from a form into the type the field declares.
function coerceConfigValue(field, value) {
  if (field.type === 'boolean') return value === true || value === 'true' || value === 'on';
  if (field.type === 'number') {
    if (value === '' || value === null || value === undefined) return field.default !== undefined ? field.default : null;
    const n = Number(value);
    if (!Number.isFinite(n)) return field.default !== undefined ? field.default : null;
    let v = n;
    if (field.min !== undefined) v = Math.max(field.min, v);
    if (field.max !== undefined) v = Math.min(field.max, v);
    return v;
  }
  return value === undefined || value === null ? '' : String(value);
}

// Fields that are required but have no value yet; drives the "needs setup" badge.
function missingRequired(manifest, values) {
  const out = [];
  for (const field of (manifest && manifest.config) || []) {
    if (!field.required) continue;
    const v = values && values[field.key] !== undefined ? values[field.key] : field.default;
    if (v === undefined || v === null || v === '') out.push(field.key);
  }
  return out;
}

module.exports = {
  CATEGORIES,
  FIELD_TYPES,
  DEFAULT_FILES,
  LIMITS,
  slugify,
  compareVersions,
  validateManifest,
  configDefaults,
  coerceConfigValue,
  missingRequired
};
