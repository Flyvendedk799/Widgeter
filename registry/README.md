# Widgeter registry

The server side of the Widgeter widget marketplace. Zero dependencies: only Node built-ins
(`node:http`, `node:sqlite`, `node:crypto`, `node:zlib`). Needs Node 22+ (`node:sqlite` prints an
ExperimentalWarning, which is expected). Reuses `../engine/manifest.js` for package validation.

```
registry/
  server.js        entry point + router + handlers, exports createRegistry()
  lib/db.js        node:sqlite setup, migrations (PRAGMA user_version), statement cache
  lib/auth.js      scrypt password hashing, token helpers
  lib/ratelimit.js in-memory fixed-window limiter
  lib/http.js      JSON/CORS/body helpers
  server.test.js   node:test suite
```

## Run

```
node registry/server.js
```

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3055` | listen port |
| `DATA_DIR` | `registry/data` | directory holding `registry.db` (+ `-wal`/`-shm`) |
| `REGISTRY_ADMIN_TOKEN` | unset | bearer token for `/v1/admin/*` and admin delete; unset = admin endpoints return 503 |
| `REGISTRY_BASE_URL` | empty | prefix for `thumbnailUrl` (e.g. `https://registry.example.com`); empty = relative paths |

`SIGTERM`/`SIGINT` close the HTTP server and the database cleanly (force exit after 10 s).

## Deployment

Runs as a ServerHoster **process service**, command `node registry/server.js`, behind the Cloudflare
tunnel (the client IP is taken from `cf-connecting-ip`, else the first `x-forwarded-for` entry). Set
`DATA_DIR` to a directory **outside the checkout** (e.g. `/var/lib/widgeter-registry`) so redeploys do
not wipe the database, and set `REGISTRY_ADMIN_TOKEN` to a long random string. No `npm install` is needed.

Backups: the DB is in WAL mode; copy `registry.db` together with `registry.db-wal`, or use
`sqlite3 registry.db ".backup out.db"`.

Schema changes are migrations in `lib/db.js` (`MIGRATIONS` array, version stored in `PRAGMA user_version`);
they are applied automatically on start.

## Tests

```
node --test registry/server.test.js
```

(On Node 22 `node --test registry/` does not expand directories; use the file path or a glob.)
Tests start the registry on port 0 with an in-memory DB and a fake clock.

## API v1

JSON everywhere. Errors: `{ "error": "message", "details"?: [...], "code"?: "..." }`. Auth is
`Authorization: Bearer <token>`. CORS is open (`*`). Bodies are capped at 4 MB for publish, 32 KB for
`/v1/updates`, 16 KB elsewhere (413).

Rate limits per client IP (429 + `Retry-After`): register/login 10/min, publish 20/h, rating 30/h, all
`GET`s 300/min (health is exempt).

| Method + path | Auth | Notes |
| --- | --- | --- |
| `GET /health`, `GET /v1/health` | - | `{ ok, service, widgets }` |
| `POST /v1/auth/register` | - | `{ username, password }` -> 201 `{ token, user }`. Username 3-24 of `[a-zA-Z0-9_-]`, unique case-insensitively; password 8-200 chars |
| `POST /v1/auth/login` | - | -> `{ token, user }`; every login/register issues a new token (newest 20 per user are kept) |
| `POST /v1/auth/logout` | user | revokes the presented token |
| `GET /v1/me` | user | `{ user, widgets: [summary] }` |
| `GET /v1/widgets` | - | `?q=&category=&author=&featured=1&sort=popular\|new\|rating\|name&page=&limit=` (limit max 60) -> `{ items, total, page, limit }` |
| `GET /v1/widgets/:slug` | - | summary + `versions`, `config` (`key,label,type,required`), `dimensions` |
| `GET /v1/widgets/:slug/download` | - | `?version=<v\|latest>&count=0\|1`; returns the stored package JSON as `<slug>-<version>.widget`; one install per (client, widget) per 24 h |
| `GET /v1/widgets/:slug/thumbnail` | - | `image/png` from the newest version that has one |
| `POST /v1/widgets` | user | `{ package, description?, category?, tags?, changelog?, thumbnail? }` -> 201 `{ slug, version }` |
| `DELETE /v1/widgets/:slug` | owner or admin | cascades versions/ratings/installs |
| `POST /v1/widgets/:slug/rating` | user | `{ rating: 1-5, review?: <=500 }`, upsert per user -> `{ ratingAvg, ratingCount }` |
| `GET /v1/widgets/:slug/ratings` | - | `?page=&limit=` -> `{ items: [{ username, rating, review, createdAt, updatedAt }], total, page, limit }` |
| `POST /v1/updates` | - | `{ installed: [{ slug, version }] }` (max 200) -> `{ updates: [{ slug, installedVersion, latestVersion, changelog }] }` |
| `POST /v1/admin/widgets/:slug/feature` | admin | `{ featured: boolean }` |
| `GET /v1/admin/stats` | admin | `{ users, widgets, versions, installs, ratings }` |

Legacy, read-only (old desktop clients): `GET /widgets`, `GET /widgets/:id` (numeric widget row id,
`json_content` = latest package JSON string). `POST /widgets` -> 410.

### Publishing rules

* `package.id` is the slug; it is validated with `validateManifest(pkg, { strict: true })` (400 with
  `details` on failure). `description`/`category`/`tags` in the body override the package's for
  validation and listing; the package itself is stored exactly as sent. `author` is always the publisher's username.
* New slug: created and owned by the caller. Existing slug: owner only (403).
* The version must be strictly greater than the latest: 409 with `code` `version_exists` or `version_not_newer`.
* Package JSON max 2 MB (413). Thumbnail: base64 PNG (magic bytes checked), max 400 KB decoded.
* Tokens are random 32-byte hex; only their SHA-256 is stored. Passwords use scrypt with a per-user salt.
