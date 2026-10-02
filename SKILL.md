# Widgeter agent guide

Instructions for AI agents (Claude, Cursor, ...) that build widgets for or work on **Widgeter**, an Electron desktop widget engine.

## Building a widget for a user

1. Read [DOCS.md](DOCS.md). It is the contract: manifest, `config` schema, the `window.widgeter` API, `.wg-*` components, rules.
2. Create a **folder widget**:
   ```
   my-widget/
     widget.json     manifest (id, name, version, description, category, icon, width, height, config[])
     index.html      body markup
     style.css       only what is specific to this widget
     script.js       logic
   ```
3. Validate and run it headlessly before handing it over:
   ```
   node scripts/widget-cli.js validate my-widget
   npx electron test/widget-smoke.js --dir <parent-folder> my-widget --shots out
   ```
   Read the PNG in `out/` and check it in `--theme light` too.
4. Install it for the user: copy the folder (or a packed `.widget` file, `node scripts/widget-cli.js pack my-widget`) into the widgets folder, `%APPDATA%\widgeter\widgets`. A running Widgeter notices it within a second. Dropping it on the dashboard works too.

### Non-negotiables

- Real data only; show honest empty and error states. No `Math.random()` pretend metrics.
- Anything a user must supply (API key, city, repo) is a `config` field, never hard-coded.
- Use `widgeter.fetchJson(url, { ttl })` for web APIs, not `https.get`. Use `os`/`fs` rather than shelling out. Windows 11 has no `wmic`.
- Escape untrusted text before `innerHTML`. No top-level `return` in `script.js`.
- Use the engine's tokens and components so the widget follows light/dark themes and the accent colour.

## Working on the app

Architecture is in [CONTRIBUTING.md](CONTRIBUTING.md). Commands: `npm test`, `npm run validate`, `npm run test:widgets`, `npm run test:app`. Do not hard-code server addresses or credentials: the marketplace address is a setting.

## Publishing

Publishing uses a marketplace account created in the app (Discover → Community → Sign in). The app signs in and publishes with the user's own account; do not publish on a user's behalf without them asking for it. The HTTP API is documented in [registry/README.md](registry/README.md).
