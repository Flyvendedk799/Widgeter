'use strict';
// Widgeter widget marketplace registry. Zero dependencies: Node built-ins only.
//
//   node registry/server.js            (PORT, DATA_DIR, REGISTRY_ADMIN_TOKEN, REGISTRY_BASE_URL)
//   const { createRegistry } = require('./registry/server')   (used by the tests)

const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

const { validateManifest, compareVersions } = require('../engine/manifest');
const { openDb, wrap } = require('./lib/db');
const { createLimiter, LIMITS } = require('./lib/ratelimit');
const { hashPassword, verifyPassword, sha256, newToken, safeEqual } = require('./lib/auth');
const { HttpError, send, sendJson, readBody, parseJson, CORS } = require('./lib/http');

const SERVICE = 'widgeter-registry';
const BODY_LIMIT_PUBLISH = 4 * 1024 * 1024;
const BODY_LIMIT_DEFAULT = 16 * 1024;
const BODY_LIMIT_UPDATES = 32 * 1024; // 200 entries do not reliably fit in 16 KB
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 400 * 1024;
const MAX_TOKENS_PER_USER = 20;
const MAX_UPDATE_ENTRIES = 200;
const INSTALL_WINDOW_MS = 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

class Reply {
  constructor(status, body, headers) { this.status = status; this.body = body; this.headers = headers; }
}
const reply = (status, body, headers) => new Reply(status, body, headers);

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function bearer(req) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

function escapeLike(s) { return s.replace(/[\\%_]/g, (c) => '\\' + c); }
const iso = (ms) => new Date(ms).toISOString();
const sqliteDate = (ms) => iso(ms).slice(0, 19).replace('T', ' ');
const parseTags = (s) => { try { const t = JSON.parse(s); return Array.isArray(t) ? t : []; } catch (_) { return []; } };
const intParam = (v, dflt, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

function compile(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { re, keys };
}

function decodeThumbnail(value) {
  if (typeof value !== 'string' || !value) throw new HttpError(400, 'thumbnail must be a base64 encoded PNG string');
  const b64 = value.replace(/^data:image\/png;base64,/, '');
  if (b64.length > Math.ceil(MAX_THUMBNAIL_BYTES * 4 / 3) + 8) throw new HttpError(413, 'thumbnail is larger than ' + MAX_THUMBNAIL_BYTES / 1024 + ' KB');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new HttpError(400, 'thumbnail is not valid base64');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > MAX_THUMBNAIL_BYTES) throw new HttpError(413, 'thumbnail is larger than ' + MAX_THUMBNAIL_BYTES / 1024 + ' KB');
  if (buf.length < PNG_MAGIC.length || !buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) throw new HttpError(400, 'thumbnail must be a PNG image');
  return buf;
}

// ---------------------------------------------------------------------------
// registry factory
// ---------------------------------------------------------------------------

function createRegistry({ dbPath, adminToken, baseUrl = '', now = Date.now, rateLimit = true } = {}) {
  if (!dbPath) throw new Error('createRegistry: dbPath is required');
  const rawDb = openDb(dbPath);
  const db = wrap(rawDb);
  const limiter = createLimiter(now);
  const base = String(baseUrl || '').replace(/\/+$/, '');

  // Salt for hashing client IPs in the install log (stored so dedup survives restarts).
  let ipSalt = (db.get("SELECT value FROM meta WHERE key = 'ip_salt'") || {}).value;
  if (!ipSalt) {
    ipSalt = crypto.randomBytes(16).toString('hex');
    db.run("INSERT INTO meta (key, value) VALUES ('ip_salt', ?)", ipSalt);
  }
  // Used to spend the same time on unknown usernames as on wrong passwords.
  let dummyCredential = null;

  // ---- presenters ---------------------------------------------------------

  const SUMMARY_FROM = 'FROM widgets w JOIN users u ON u.id = w.owner_id';
  const SUMMARY_COLS = 'SELECT w.*, u.username AS author ' + SUMMARY_FROM;

  function summary(w) {
    return {
      slug: w.slug,
      name: w.name,
      description: w.description,
      author: w.author,
      category: w.category,
      tags: parseTags(w.tags),
      icon: w.icon,
      latestVersion: w.latest_version,
      installs: w.installs,
      ratingAvg: w.rating_count > 0 && w.rating_avg !== null ? Math.round(w.rating_avg * 10) / 10 : null,
      ratingCount: w.rating_count,
      thumbnailUrl: w.has_thumb ? base + '/v1/widgets/' + w.slug + '/thumbnail' : null,
      featured: !!w.featured,
      createdAt: iso(w.created_at),
      updatedAt: iso(w.updated_at)
    };
  }

  function findWidget(slug) {
    const w = db.get(SUMMARY_COLS + ' WHERE w.slug = ?', slug);
    if (!w) throw new HttpError(404, 'Widget not found');
    return w;
  }

  // ---- auth ---------------------------------------------------------------

  function issueToken(userId) {
    const token = newToken();
    const t = now();
    db.tx(() => {
      db.run('INSERT INTO tokens (token_hash, user_id, created_at, last_used_at) VALUES (?, ?, ?, ?)', sha256(token), userId, t, t);
      db.run(
        `DELETE FROM tokens WHERE user_id = ? AND token_hash NOT IN
           (SELECT token_hash FROM tokens WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
        userId, userId, MAX_TOKENS_PER_USER
      );
    });
    return token;
  }

  function resolveUser(token) {
    if (!token) return null;
    const hash = sha256(token);
    const row = db.get('SELECT u.id, u.username, t.last_used_at FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?', hash);
    if (!row) return null;
    const t = now();
    if (t - row.last_used_at > 60 * 1000) db.run('UPDATE tokens SET last_used_at = ? WHERE token_hash = ?', t, hash);
    return { id: row.id, username: row.username, tokenHash: hash };
  }

  function authenticate(ctx, mode) {
    const token = bearer(ctx.req);
    const isAdminToken = !!(adminToken && token && safeEqual(token, adminToken));
    if (mode === 'admin') {
      if (!adminToken) throw new HttpError(503, 'Admin API is not configured');
      if (!token) throw new HttpError(401, 'Authentication required');
      if (!isAdminToken) throw new HttpError(403, 'Admin token required');
      ctx.isAdmin = true;
      return;
    }
    if (mode === 'any' && isAdminToken) { ctx.isAdmin = true; return; }
    const user = resolveUser(token);
    if (!user) throw new HttpError(401, 'Authentication required');
    ctx.user = user;
  }

  const publicUser = (u) => ({ id: u.id, username: u.username });

  // ---- handlers: health + auth -------------------------------------------

  function health() {
    return { ok: true, service: SERVICE, widgets: db.get('SELECT COUNT(*) AS n FROM widgets').n };
  }

  function credentials(body) {
    const { username, password } = body;
    if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, 'username and password are required');
    return { username, password };
  }

  async function register(ctx) {
    const { username, password } = credentials(ctx.body);
    const errors = [];
    if (!USERNAME_RE.test(username)) errors.push('username must be 3-24 characters of a-z, A-Z, 0-9, "_" and "-"');
    if (password.length < 8) errors.push('password must be at least 8 characters');
    if (password.length > 200) errors.push('password must be at most 200 characters');
    if (errors.length) throw new HttpError(400, errors[0], { details: errors });
    if (db.get('SELECT 1 AS x FROM users WHERE username_lc = ?', username.toLowerCase())) throw new HttpError(409, 'Username is already taken');

    const { hash, salt } = await hashPassword(password);
    let id;
    try {
      id = Number(db.run('INSERT INTO users (username, username_lc, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)', username, username.toLowerCase(), hash, salt, now()).lastInsertRowid);
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) throw new HttpError(409, 'Username is already taken');
      throw err;
    }
    return reply(201, { token: issueToken(id), user: { id, username } });
  }

  async function login(ctx) {
    const { username, password } = credentials(ctx.body);
    const bad = new HttpError(401, 'Invalid username or password');
    const row = db.get('SELECT * FROM users WHERE username_lc = ?', username.toLowerCase());
    if (!row) {
      if (!dummyCredential) dummyCredential = await hashPassword('not-a-real-password');
      await verifyPassword(password, dummyCredential.hash, dummyCredential.salt);
      throw bad;
    }
    if (!(await verifyPassword(password, row.pass_hash, row.salt))) throw bad;
    return { token: issueToken(row.id), user: publicUser(row) };
  }

  function logout(ctx) {
    db.run('DELETE FROM tokens WHERE token_hash = ?', ctx.user.tokenHash);
    return { ok: true };
  }

  function me(ctx) {
    const rows = db.all(SUMMARY_COLS + ' WHERE w.owner_id = ? ORDER BY w.updated_at DESC, w.id DESC', ctx.user.id);
    return { user: publicUser(ctx.user), widgets: rows.map(summary) };
  }

  // ---- handlers: widgets --------------------------------------------------

  const SORTS = {
    popular: 'w.installs DESC, COALESCE(w.rating_avg, 0) DESC, w.rating_count DESC, w.id ASC',
    new: 'w.created_at DESC, w.id DESC',
    rating: 'COALESCE(w.rating_avg, 0) DESC, w.rating_count DESC, w.installs DESC, w.id ASC',
    name: 'w.name COLLATE NOCASE ASC, w.id ASC'
  };

  function listWidgets(ctx) {
    const q = ctx.query;
    const where = [];
    const params = [];
    const text = (q.get('q') || '').trim().slice(0, 100);
    if (text) {
      const like = '%' + escapeLike(text) + '%';
      where.push("(w.name LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\' OR w.tags LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
    if (q.get('category')) { where.push('w.category = ?'); params.push(q.get('category')); }
    if (q.get('author')) { where.push('u.username_lc = ?'); params.push(q.get('author').toLowerCase()); }
    if (q.get('featured') === '1' || q.get('featured') === 'true') where.push('w.featured = 1');
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';

    const order = SORTS[q.get('sort')] || SORTS.popular;
    const limit = intParam(q.get('limit'), 24, 1, 60);
    const page = intParam(q.get('page'), 1, 1, 1e6);
    const total = db.get('SELECT COUNT(*) AS n ' + SUMMARY_FROM + clause, ...params).n;
    const rows = db.all(SUMMARY_COLS + clause + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?', ...params, limit, (page - 1) * limit);
    return { items: rows.map(summary), total, page, limit };
  }

  function widgetDetail(ctx) {
    const w = findWidget(ctx.params.slug);
    const versions = db.all('SELECT version, changelog, size, created_at FROM versions WHERE widget_id = ? ORDER BY id DESC', w.id)
      .map((v) => ({ version: v.version, changelog: v.changelog, size: v.size, createdAt: iso(v.created_at) }));
    const latest = db.get('SELECT meta FROM versions WHERE widget_id = ? AND version = ?', w.id, w.latest_version);
    let meta = {};
    try { meta = JSON.parse(latest.meta); } catch (_) { /* keep defaults */ }
    return Object.assign(summary(w), {
      versions,
      config: meta.config || [],
      dimensions: { width: meta.width || 300, height: meta.height || 300 }
    });
  }

  function download(ctx) {
    const w = findWidget(ctx.params.slug);
    const wanted = ctx.query.get('version') || 'latest';
    const version = wanted === 'latest' ? w.latest_version : wanted;
    const v = db.get('SELECT package FROM versions WHERE widget_id = ? AND version = ?', w.id, version);
    if (!v) throw new HttpError(404, 'Version not found');

    if (ctx.query.get('count') !== '0') {
      const t = now();
      const ipHash = sha256(ipSalt + ':' + ctx.ip);
      db.tx(() => {
        const seen = db.get('SELECT at FROM install_log WHERE widget_id = ? AND ip_hash = ?', w.id, ipHash);
        if (seen && t - seen.at < INSTALL_WINDOW_MS) return;
        db.run('INSERT INTO install_log (widget_id, ip_hash, at) VALUES (?, ?, ?) ON CONFLICT (widget_id, ip_hash) DO UPDATE SET at = excluded.at', w.id, ipHash, t);
        db.run('UPDATE widgets SET installs = installs + 1 WHERE id = ?', w.id);
      });
    }
    return reply(200, v.package, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + w.slug + '-' + version + '.widget"',
      'Cache-Control': 'no-store'
    });
  }

  function thumbnail(ctx) {
    const w = findWidget(ctx.params.slug);
    const v = db.get('SELECT thumbnail FROM versions WHERE widget_id = ? AND thumbnail IS NOT NULL ORDER BY id DESC LIMIT 1', w.id);
    if (!v) throw new HttpError(404, 'This widget has no thumbnail');
    return reply(200, Buffer.from(v.thumbnail), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
  }

  function publish(ctx) {
    const body = ctx.body;
    const pkg = body.package;
    if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) throw new HttpError(400, 'package must be a widget object');
    if (typeof pkg.id !== 'string') throw new HttpError(400, 'package.id is required (it becomes the widget slug)');
    if (typeof pkg.version !== 'string') throw new HttpError(400, 'package.version is required');

    const text = JSON.stringify(pkg);
    const size = Buffer.byteLength(text);
    if (size > MAX_PACKAGE_BYTES) throw new HttpError(413, 'Package is larger than ' + MAX_PACKAGE_BYTES / 1024 / 1024 + ' MB');

    // Body fields override what the package says about itself.
    const candidate = Object.assign({}, pkg);
    if (body.description !== undefined) {
      if (typeof body.description !== 'string') throw new HttpError(400, 'description must be a string');
      candidate.description = body.description;
    }
    if (body.category !== undefined) {
      if (typeof body.category !== 'string') throw new HttpError(400, 'category must be a string');
      candidate.category = body.category;
    }
    if (body.tags !== undefined) candidate.tags = body.tags;
    let changelog = '';
    if (body.changelog !== undefined) {
      if (typeof body.changelog !== 'string' || body.changelog.length > 2000) throw new HttpError(400, 'changelog must be a string of at most 2000 characters');
      changelog = body.changelog;
    }
    const thumb = body.thumbnail === undefined || body.thumbnail === null ? null : decodeThumbnail(body.thumbnail);

    const result = validateManifest(candidate, { strict: true });
    if (!result.ok) throw new HttpError(400, 'Invalid widget package', { details: result.errors });
    const m = result.manifest;
    const meta = JSON.stringify({
      config: m.config.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
      width: m.width,
      height: m.height
    });

    const t = now();
    const slug = m.id;
    const tags = JSON.stringify(m.tags);
    db.tx(() => {
      let w = db.get('SELECT id, owner_id, latest_version, has_thumb FROM widgets WHERE slug = ?', slug);
      if (!w) {
        const id = Number(db.run(
          `INSERT INTO widgets (slug, owner_id, name, description, category, tags, icon, latest_version, has_thumb, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          slug, ctx.user.id, m.name, m.description, m.category, tags, m.icon, m.version, thumb ? 1 : 0, t, t
        ).lastInsertRowid);
        w = { id, has_thumb: thumb ? 1 : 0 };
      } else {
        if (w.owner_id !== ctx.user.id) throw new HttpError(403, 'Widget "' + slug + '" belongs to another author');
        if (db.get('SELECT 1 AS x FROM versions WHERE widget_id = ? AND version = ?', w.id, m.version)) {
          throw new HttpError(409, 'Version ' + m.version + ' already exists', { code: 'version_exists' });
        }
        if (compareVersions(m.version, w.latest_version) <= 0) {
          throw new HttpError(409, 'Version ' + m.version + ' is not newer than the latest version ' + w.latest_version, { code: 'version_not_newer' });
        }
        db.run(
          `UPDATE widgets SET name = ?, description = ?, category = ?, tags = ?, icon = ?, latest_version = ?,
             has_thumb = ?, updated_at = ? WHERE id = ?`,
          m.name, m.description, m.category, tags, m.icon, m.version, thumb ? 1 : w.has_thumb, t, w.id
        );
      }
      db.run(
        'INSERT INTO versions (widget_id, version, package, changelog, size, thumbnail, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        w.id, m.version, text, changelog, size, thumb, meta, t
      );
    });
    return reply(201, { slug, version: m.version });
  }

  function deleteWidget(ctx) {
    const w = findWidget(ctx.params.slug);
    if (!ctx.isAdmin && w.owner_id !== ctx.user.id) throw new HttpError(403, 'Only the author can delete this widget');
    db.run('DELETE FROM widgets WHERE id = ?', w.id);
    return { ok: true };
  }

  // ---- handlers: ratings --------------------------------------------------

  function rate(ctx) {
    const w = findWidget(ctx.params.slug);
    const { rating, review } = ctx.body;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'rating must be an integer from 1 to 5');
    if (review !== undefined && review !== null && (typeof review !== 'string' || review.length > 500)) throw new HttpError(400, 'review must be a string of at most 500 characters');
    const t = now();
    return db.tx(() => {
      db.run(
        `INSERT INTO ratings (widget_id, user_id, rating, review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (widget_id, user_id) DO UPDATE SET rating = excluded.rating, review = excluded.review, updated_at = excluded.updated_at`,
        w.id, ctx.user.id, rating, review || '', t, t
      );
      const agg = db.get('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM ratings WHERE widget_id = ?', w.id);
      db.run('UPDATE widgets SET rating_avg = ?, rating_count = ? WHERE id = ?', agg.avg, agg.n, w.id);
      return { ratingAvg: Math.round(agg.avg * 10) / 10, ratingCount: agg.n };
    });
  }

  function listRatings(ctx) {
    const w = findWidget(ctx.params.slug);
    const limit = intParam(ctx.query.get('limit'), 20, 1, 50);
    const page = intParam(ctx.query.get('page'), 1, 1, 1e6);
    const total = db.get('SELECT COUNT(*) AS n FROM ratings WHERE widget_id = ?', w.id).n;
    const items = db.all(
      `SELECT u.username, r.rating, r.review, r.created_at, r.updated_at FROM ratings r JOIN users u ON u.id = r.user_id
       WHERE r.widget_id = ? ORDER BY r.updated_at DESC, r.rowid DESC LIMIT ? OFFSET ?`,
      w.id, limit, (page - 1) * limit
    ).map((r) => ({ username: r.username, rating: r.rating, review: r.review, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) }));
    return { items, total, page, limit };
  }

  // ---- handlers: updates + admin -----------------------------------------

  function checkUpdates(ctx) {
    const installed = ctx.body.installed;
    if (!Array.isArray(installed)) throw new HttpError(400, 'installed must be an array of { slug, version }');
    if (installed.length > MAX_UPDATE_ENTRIES) throw new HttpError(400, 'installed may contain at most ' + MAX_UPDATE_ENTRIES + ' entries');
    const updates = [];
    for (const e of installed) {
      if (!e || typeof e.slug !== 'string' || typeof e.version !== 'string') throw new HttpError(400, 'Every installed entry needs a string slug and version');
      if (!SEMVER_RE.test(e.version)) continue;
      const w = db.get('SELECT id, slug, latest_version FROM widgets WHERE slug = ?', e.slug);
      if (!w || compareVersions(w.latest_version, e.version) <= 0) continue;
      const v = db.get('SELECT changelog FROM versions WHERE widget_id = ? AND version = ?', w.id, w.latest_version);
      updates.push({ slug: w.slug, installedVersion: e.version, latestVersion: w.latest_version, changelog: v ? v.changelog : '' });
    }
    return { updates };
  }

  function setFeatured(ctx) {
    const w = findWidget(ctx.params.slug);
    if (typeof ctx.body.featured !== 'boolean') throw new HttpError(400, 'featured must be a boolean');
    db.run('UPDATE widgets SET featured = ? WHERE id = ?', ctx.body.featured ? 1 : 0, w.id);
    return { ok: true, slug: w.slug, featured: ctx.body.featured };
  }

  function stats() {
    const n = (sql) => db.get(sql).n;
    return {
      users: n('SELECT COUNT(*) AS n FROM users'),
      widgets: n('SELECT COUNT(*) AS n FROM widgets'),
      versions: n('SELECT COUNT(*) AS n FROM versions'),
      installs: n('SELECT COALESCE(SUM(installs), 0) AS n FROM widgets'),
      ratings: n('SELECT COUNT(*) AS n FROM ratings')
    };
  }

  // ---- legacy (read-only, for old desktop clients) -----------------------

  function legacyList() {
    return db.all('SELECT w.id, w.name, w.description, u.username AS author, w.created_at ' + SUMMARY_FROM + ' ORDER BY w.created_at DESC, w.id DESC LIMIT 1000')
      .map((r) => Object.assign(r, { created_at: sqliteDate(r.created_at) }));
  }

  function legacyOne(ctx) {
    const id = /^\d+$/.test(ctx.params.id) ? Number(ctx.params.id) : -1;
    const r = db.get(
      `SELECT w.id, w.name, w.description, u.username AS author, w.created_at, v.package AS json_content
       FROM widgets w JOIN users u ON u.id = w.owner_id JOIN versions v ON v.widget_id = w.id AND v.version = w.latest_version
       WHERE w.id = ?`, id
    );
    if (!r) throw new HttpError(404, 'Widget not found');
    return Object.assign(r, { created_at: sqliteDate(r.created_at) });
  }

  function legacyPublish() {
    throw new HttpError(410, 'Publishing moved to /v1/widgets');
  }

  // ---- router -------------------------------------------------------------
  // opts: limit (rate-limit bucket), auth ('user' | 'admin' | 'any'), body (max bytes), noReadLimit

  const routes = [];
  const route = (method, pattern, handler, opts = {}) => routes.push(Object.assign({ method, handler }, compile(pattern), opts));

  route('GET', '/health', health, { noReadLimit: true });
  route('GET', '/v1/health', health, { noReadLimit: true });

  route('POST', '/v1/auth/register', register, { limit: 'auth', body: BODY_LIMIT_DEFAULT });
  route('POST', '/v1/auth/login', login, { limit: 'auth', body: BODY_LIMIT_DEFAULT });
  route('POST', '/v1/auth/logout', logout, { auth: 'user' });
  route('GET', '/v1/me', me, { auth: 'user' });

  route('GET', '/v1/widgets', listWidgets);
  route('POST', '/v1/widgets', publish, { limit: 'publish', auth: 'user', body: BODY_LIMIT_PUBLISH });
  route('GET', '/v1/widgets/:slug', widgetDetail);
  route('DELETE', '/v1/widgets/:slug', deleteWidget, { auth: 'any' });
  route('GET', '/v1/widgets/:slug/download', download);
  route('GET', '/v1/widgets/:slug/thumbnail', thumbnail);
  route('POST', '/v1/widgets/:slug/rating', rate, { limit: 'rating', auth: 'user', body: BODY_LIMIT_DEFAULT });
  route('GET', '/v1/widgets/:slug/ratings', listRatings);
  route('POST', '/v1/updates', checkUpdates, { body: BODY_LIMIT_UPDATES });

  route('POST', '/v1/admin/widgets/:slug/feature', setFeatured, { auth: 'admin', body: BODY_LIMIT_DEFAULT });
  route('GET', '/v1/admin/stats', stats, { auth: 'admin' });

  route('GET', '/widgets', legacyList);
  route('GET', '/widgets/:id', legacyOne);
  route('POST', '/widgets', legacyPublish);

  async function dispatch(req, res) {
    let url;
    try { url = new URL(req.url, 'http://registry.local'); } catch (_) { throw new HttpError(400, 'Malformed URL'); }
    if (req.method === 'OPTIONS') { send(req, res, 204, null, { 'Cache-Control': 'no-store' }); return; }

    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    let match = null;
    const allowed = [];
    for (const r of routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method === req.method) { match = { r, m }; break; }
      allowed.push(r.method);
    }
    if (!match) {
      if (allowed.length) throw new HttpError(405, 'Method not allowed', { headers: { Allow: allowed.join(', ') + ', OPTIONS' } });
      throw new HttpError(404, 'Not found');
    }

    const { r, m } = match;
    const ctx = { req, res, ip: clientIp(req), query: url.searchParams, params: {}, body: null, user: null, isAdmin: false };
    r.keys.forEach((k, i) => {
      try { ctx.params[k] = decodeURIComponent(m[i + 1]); } catch (_) { throw new HttpError(400, 'Malformed URL'); }
    });

    const gates = [];
    if (req.method === 'GET' && !r.noReadLimit) gates.push(['read', LIMITS.read]);
    if (r.limit) gates.push([r.limit, LIMITS[r.limit]]);
    for (const [name, lim] of rateLimit ? gates : []) {
      const hit = limiter.hit(name, ctx.ip, lim.max, lim.windowMs);
      if (!hit.ok) throw new HttpError(429, 'Too many requests, try again later', { retryAfter: hit.retryAfter, headers: { 'Retry-After': String(hit.retryAfter) } });
    }

    if (r.auth) authenticate(ctx, r.auth);
    if (r.body) ctx.body = parseJson(await readBody(req, r.body));

    const out = await r.handler(ctx);
    if (out instanceof Reply) {
      const headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, out.headers);
      const isJson = /json/.test(headers['Content-Type']);
      if (isJson && typeof out.body !== 'string') send(req, res, out.status, JSON.stringify(out.body), headers);
      else send(req, res, out.status, out.body, headers);
    } else {
      sendJson(req, res, 200, out);
    }
  }

  const server = http.createServer((req, res) => {
    dispatch(req, res).catch((err) => {
      if (res.headersSent) { res.destroy(); return; }
      if (err instanceof HttpError) {
        const body = Object.assign({ error: err.message }, err.extra.code ? { code: err.extra.code } : {},
          err.extra.details ? { details: err.extra.details } : {}, err.extra.retryAfter ? { retryAfter: err.extra.retryAfter } : {});
        const headers = Object.assign({}, err.extra.headers);
        if (err.extra.close) { headers.Connection = 'close'; res.on('finish', () => req.destroy()); }
        sendJson(req, res, err.status, body, headers);
        return;
      }
      console.error('[registry] unhandled error on', req.method, req.url, err);
      sendJson(req, res, 500, { error: 'Internal server error' });
    });
  });
  server.keepAliveTimeout = 65 * 1000; // longer than typical proxy/tunnel idle timeouts
  server.requestTimeout = 60 * 1000;

  let closed = false;
  function close() {
    if (closed) return Promise.resolve();
    closed = true;
    limiter.stop();
    return new Promise((resolve) => {
      const finish = () => { try { rawDb.close(); } catch (_) { /* already closed */ } resolve(); };
      if (!server.listening) { finish(); return; }
      server.close(finish);
      server.closeIdleConnections();
      setTimeout(() => server.closeAllConnections(), 2000).unref();
    });
  }

  return { server, db: rawDb, close };
}

module.exports = { createRegistry, CORS };

// ---------------------------------------------------------------------------
// run directly
// ---------------------------------------------------------------------------

if (require.main === module) {
  const port = Number(process.env.PORT) || 3055;
  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const adminToken = process.env.REGISTRY_ADMIN_TOKEN || '';
  const registry = createRegistry({
    dbPath: path.join(dataDir, 'registry.db'),
    adminToken,
    baseUrl: process.env.REGISTRY_BASE_URL || ''
  });
  registry.server.listen(port, () => {
    console.log('[registry] listening on :' + port + ', data in ' + dataDir + (adminToken ? '' : ' (admin API disabled: REGISTRY_ADMIN_TOKEN not set)'));
  });
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log('[registry] ' + signal + ' received, shutting down');
    setTimeout(() => process.exit(1), 10000).unref();
    registry.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
