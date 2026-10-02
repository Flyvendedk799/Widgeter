# Contributing to Widgeter

## Layout

```
main.js                 app entry: tray, shortcuts, power events, dashboard window
preload.js              window.widgeter, the API inside every widget window
app/
  paths.js state.js     folders, persisted state (state.json)
  widgets.js            widget runtime: catalog, windows, health, logs, crash recovery, install/uninstall
  gallery.js            built-in gallery + upgrade from old single-file widgets
  layouts.js            saved layouts and profiles, per-display positions
  registry-client.js    marketplace client (browse, install, publish, rate, update check)
  ai.js                 "describe a widget" with the Claude API
  updater.js            app self-update (electron-updater, GitHub Releases)
  ipc.js                every IPC channel; dashboard channels reply { ok, data | error }
engine/                 pure/shared code, no Electron imports (unit-tested)
  manifest.js           the widget manifest: validation, config schema helpers
  widget-format.js      read/write/pack folder and single-file widgets
  compose.js            builds the HTML page a widget runs in (used by app AND tests)
  tokens.css base.css   design tokens and .wg-* components injected into widgets
  runtime-client.js     in-widget shim: error forwarding, interval pausing
  smart-resize-client.js, resize-math.js, snap.js, placement.js, layout-templates.js, net-cache.js
dashboard/              the dashboard UI (vanilla JS, no build step)
gallery/<id>/           built-in widgets: widget.json + index.html + style.css + script.js + thumbnail.png
registry/               marketplace server, zero dependencies (see registry/README.md)
scripts/                widget-cli.js (validate/pack/unpack), make-icons.js
test/                   unit tests, widget smoke test, app smoke test
```

## Principles

- **One definition of a widget** (`engine/manifest.js`), shared by the app, the registry and the tests.
- **The test page is the real page.** `engine/compose.js` builds widget HTML for both the app and `test/widget-smoke.js`.
- **Widgets are untrusted input to the UI**: the dashboard builds DOM with `textContent`, never string-concatenated HTML (the only `innerHTML` is legacy `setupHtml` shipped by older widgets).
- **No fake data** in the gallery. Gallery widgets must pass `npm run test:widgets` in dark and light.

## Adding a gallery widget

1. `gallery/<id>/widget.json` with `id`, `name`, `version`, `author`, `description`, `category`, `icon`, `width`, `height`, `config`.
2. Write `index.html`, `style.css`, `script.js` (see DOCS.md).
3. `npm run validate && npx electron test/widget-smoke.js <id> --shots shots`, look at the screenshot.
4. `npm run thumbnails` to generate `thumbnail.png`.
5. Bump `version` when you change a shipped widget; installed copies are offered the update.

## Releases

Tag `vX.Y.Z` on master; `.github/workflows/release.yml` builds the installer and publishes it to GitHub Releases, which installed apps use for updates. After a release that changes the gallery, run `registry/seed.js` on the server so the community tab lists the new versions.

## The marketplace server

Runs as a ServerHoster process service: `node registry/server.js`, data in `DATA_DIR`. Deploys on push. See `registry/README.md`.
