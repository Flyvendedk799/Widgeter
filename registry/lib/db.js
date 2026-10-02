'use strict';
// SQLite setup (node:sqlite) with PRAGMA user_version based migrations.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  // v1: initial schema
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    username_lc TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  );
  CREATE INDEX idx_tokens_user ON tokens(user_id);

  CREATE TABLE widgets (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'other',
    tags TEXT NOT NULL DEFAULT '[]',
    icon TEXT NOT NULL DEFAULT '',
    latest_version TEXT NOT NULL,
    has_thumb INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    installs INTEGER NOT NULL DEFAULT 0,
    rating_avg REAL,
    rating_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_widgets_owner ON widgets(owner_id);
  CREATE INDEX idx_widgets_category ON widgets(category);
  CREATE INDEX idx_widgets_popular ON widgets(installs DESC, rating_avg DESC);
  CREATE INDEX idx_widgets_new ON widgets(created_at DESC);
  CREATE INDEX idx_widgets_rating ON widgets(rating_avg DESC, rating_count DESC);
  CREATE INDEX idx_widgets_featured ON widgets(featured) WHERE featured = 1;

  CREATE TABLE versions (
    id INTEGER PRIMARY KEY,
    widget_id INTEGER NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    package TEXT NOT NULL,
    changelog TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL,
    thumbnail BLOB,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    UNIQUE (widget_id, version)
  );

  CREATE TABLE ratings (
    widget_id INTEGER NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (widget_id, user_id)
  );

  CREATE TABLE install_log (
    widget_id INTEGER NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
    ip_hash TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (widget_id, ip_hash)
  );
  `
];

function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec('PRAGMA user_version = ' + (v + 1));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

// Wraps a db with a prepared-statement cache and a transaction helper.
function wrap(db) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  return {
    raw: db,
    get: (sql, ...p) => stmt(sql).get(...p),
    all: (sql, ...p) => stmt(sql).all(...p),
    run: (sql, ...p) => stmt(sql).run(...p),
    tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
        throw err;
      }
    }
  };
}

module.exports = { openDb, wrap, MIGRATIONS };
