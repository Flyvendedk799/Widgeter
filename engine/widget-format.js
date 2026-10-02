'use strict';
// Reading, writing and packing widgets on disk.
//
// Two layouts are supported and are interchangeable:
//   single file   foo.widget            JSON: manifest + html/css/js strings (legacy and transport format)
//   folder        foo/widget.json       manifest only, with foo/index.html, foo/style.css, foo/script.js beside it
//
// Folders are what authors edit (readable diffs, real files); the single-file
// form is what travels (marketplace packages, drag and drop, export).

const fs = require('fs');
const path = require('path');
const { validateManifest, DEFAULT_FILES } = require('./manifest');

const MANIFEST_FILE = 'widget.json';
const THUMBNAIL_FILE = 'thumbnail.png';

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return JSON.parse(text);
}

function isFolderWidget(p) {
  try {
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, MANIFEST_FILE));
  } catch (e) {
    return false;
  }
}

// Reads a widget (file or folder) into one flat object with html/css/js inlined.
function readRaw(p) {
  if (isFolderWidget(p)) {
    const raw = readJson(path.join(p, MANIFEST_FILE));
    const files = Object.assign({}, DEFAULT_FILES, raw.files || {});
    for (const key of ['html', 'css', 'js']) {
      if (typeof raw[key] === 'string') continue;
      const file = path.join(p, files[key]);
      // Folder widgets never reach outside their own directory.
      if (path.relative(p, file).startsWith('..')) continue;
      if (fs.existsSync(file)) raw[key] = fs.readFileSync(file, 'utf8');
    }
    delete raw.files;
    return { kind: 'folder', raw };
  }
  return { kind: 'file', raw: readJson(p) };
}

function loadWidget(p, options = {}) {
  let source;
  try {
    source = readRaw(p);
  } catch (e) {
    return { ok: false, kind: 'file', errors: ['Could not read widget: ' + e.message], warnings: [], manifest: null };
  }
  const result = validateManifest(source.raw, options);
  result.kind = source.kind;
  result.path = p;
  if (source.kind === 'folder') {
    const thumb = path.join(p, THUMBNAIL_FILE);
    result.thumbnail = fs.existsSync(thumb) ? thumb : null;
  } else {
    result.thumbnail = null;
  }
  return result;
}

// Inlined single-file object, ready to be published or written as a .widget.
function packWidget(p) {
  const { raw } = readRaw(p);
  const out = Object.assign({}, raw);
  delete out.files;
  return out;
}

function writeFileAtomic(file, content) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

// Writes a package object out as a folder widget (replacing what is there).
function unpackWidget(pkg, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const manifest = Object.assign({}, pkg);
  const sources = { html: manifest.html, css: manifest.css, js: manifest.js };
  delete manifest.html;
  delete manifest.css;
  delete manifest.js;
  delete manifest.files;
  for (const key of ['html', 'css', 'js']) {
    const file = path.join(destDir, DEFAULT_FILES[key]);
    if (typeof sources[key] === 'string' && sources[key].length) writeFileAtomic(file, sources[key]);
    else if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  writeFileAtomic(path.join(destDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
}

// Everything installable in a directory: *.widget files and widget folders.
function listWidgets(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (/\.widget$/i.test(name)) out.push({ id: name, kind: 'file', path: full });
    else if (isFolderWidget(full)) out.push({ id: name, kind: 'folder', path: full });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// Paths whose changes mean "reload this widget".
function watchTargets(p) {
  return isFolderWidget(p) ? { path: p, recursive: true } : { path: p, recursive: false };
}

module.exports = {
  MANIFEST_FILE,
  THUMBNAIL_FILE,
  isFolderWidget,
  loadWidget,
  packWidget,
  unpackWidget,
  listWidgets,
  watchTargets,
  writeFileAtomic
};
