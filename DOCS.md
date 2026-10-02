# Writing Widgeter widgets

Widgeter is a desktop widget engine (Electron). A widget is a small web page that floats on the desktop, with full Node.js access. This is the one reference for people and AI agents who write widgets. `README.md` covers installing and running the app.

## Two ways to ship a widget

| Layout | What it is | Use it for |
|---|---|---|
| **Folder** `my-widget/` | `widget.json` + `index.html` + `style.css` + `script.js` (+ optional `thumbnail.png`) | Writing and editing. Readable diffs, real files. |
| **Single file** `my-widget.widget` | One JSON file: the manifest with `html`, `css`, `js` as strings | Sharing, drag and drop, the marketplace, older widgets. |

Both are the same thing. Drop either on the dashboard, or put them in the widgets folder (`%APPDATA%\widgeter\widgets`). `node scripts/widget-cli.js pack|unpack|validate` converts and checks them.

## The manifest (`widget.json`)

```json
{
  "id": "weather",
  "name": "Weather",
  "version": "1.2.0",
  "author": "Your Name",
  "description": "Current conditions for one city, from OpenWeatherMap.",
  "category": "info",
  "tags": ["weather", "forecast"],
  "icon": "🌤️",
  "width": 280,
  "height": 260,
  "config": [
    { "key": "owm_key", "label": "OpenWeatherMap API key", "type": "password", "required": true,
      "help": "Free at openweathermap.org/api" },
    { "key": "owm_city", "label": "City", "type": "text", "default": "Copenhagen" },
    { "key": "units", "label": "Units", "type": "select", "default": "metric",
      "options": [{ "value": "metric", "label": "°C" }, { "value": "imperial", "label": "°F" }] }
  ]
}
```

| Field | Notes |
|---|---|
| `id` | Required to publish. 2-48 chars of `a-z 0-9 -`. This is the marketplace slug. |
| `name`, `description` | Shown in the gallery and marketplace. Description max 280 chars. |
| `version` | `major.minor.patch`. Bump it to publish an update. |
| `category` | `system dev info productivity finance time media other` |
| `width`, `height` | Starting size in px. Users can resize; see Smart resize below. |
| `alwaysOnTop`, `draggable_body`, `transparent`, `backgroundColor` | Window behaviour. Defaults: `false`, `true`, `true`, `#00000000`. |
| `useBaseStyles` | `true` by default for widgets that declare a `version`. See Styling. |
| `config` | The settings form (see below). |
| `legacyIds` | Old filenames this widget replaces; used by the app when upgrading. |

### Settings (`config`)

Declare what the user can configure and the dashboard builds the form: validation, defaults, a "needs setup" badge when a required field is empty, and a Save button that reloads the widget. Field types: `text`, `password`, `number` (`min`, `max`, `step`), `select` (`options`), `boolean`, `textarea`, `color`, `url`. Each field has `key`, `label`, optional `default`, `placeholder`, `help`, `required`.

Read values in the widget with `await widgeter.getConfig('key')` or `await widgeter.getAllConfig()`. Defaults from the manifest are applied for you. Never hard-code keys, tokens, usernames or hosts: make them settings.

Older widgets can still ship `setupHtml` / `setupJs` (custom HTML run in the dashboard). Prefer `config`.

## The runtime API (`window.widgeter`)

Everything async returns a Promise.

| Call | What it does |
|---|---|
| `getConfig(key)`, `getAllConfig()`, `setConfig(key, value)` | Settings and persistent per-widget values. |
| `fetch(url, { ttl, timeout, headers, method, body })` | Shared, cached HTTP from the main process. Returns `{ ok, status, headers, text, json(), cached }`. `ttl` is seconds, `timeout` is ms (default 15000, then it rejects with "Request timed out"); identical in-flight requests are merged and requests to one host are spaced out. Serves stale data if the network fails. |
| `fetchJson(url, opts)` | Same, returns parsed JSON, throws on a non-2xx status. **Use this for web APIs** instead of `https.get`. |
| `clipboard.readText()`, `clipboard.writeText(text)` | System clipboard (text). |
| `notify(title, body)` | Native desktop notification. |
| `openExternal(url)` | Open an http(s) link in the default browser. |
| `dataDir` | A folder this widget can write to (notes, todo lists). Survives updates. |
| `log(level, message)` | Appears in the widget's log drawer in the dashboard. `console.error` and uncaught errors land there too. |
| `isVisible()`, `onVisible(cb)` | False while the widget is hidden or the PC is asleep or locked. |
| `autoResize`, `userResize`, `onResizeMode` | Window sizing; normally not needed. |

Node is available too: `require('os')`, `require('fs')`, `require('child_process')`, and so on. Prefer `os`/`fs` over shelling out. On Windows `wmic` is gone from current builds: use `powershell -NoProfile -Command "Get-CimInstance ..."` when a command is unavoidable, and always handle failure.

### Polling

Use plain `setInterval`. The engine pauses every interval while the widget is hidden (Ctrl+Shift+W) or the PC is asleep, and runs each once on resume. Keep intervals sensible (30 s or more for web APIs) and pass `ttl` to `fetch` so several widgets sharing an API call it once.

### Real data only

A widget shows real data or an honest empty/error state. Do not simulate values with `Math.random()`.

## Styling

The engine injects design tokens into every widget and, unless `useBaseStyles` is `false`, a small component set. Light and dark themes and the user's accent colour work automatically if you use the tokens.

Tokens: `--wg-bg --wg-fg --wg-muted --wg-faint --wg-border --wg-surface --wg-surface-hover --wg-accent --wg-accent-soft --wg-good --wg-bad --wg-warn --wg-radius --wg-font --wg-mono`.

Components (see `engine/base.css`): `.wg-header .wg-header-main .wg-icon .wg-title .wg-sub`, `.wg-card`, `.wg-row .wg-lbl .wg-val`, `.wg-big .wg-big-sm .wg-caption`, `.wg-list .wg-item`, `.wg-badge` (`.good .bad .warn .accent`), `.wg-dot` (`.good .bad .warn .pulse`), `.wg-bar > .wg-fill`, `.wg-btn` (`.primary .danger .sm .icon`), `.wg-input`, `.wg-empty`, `.wg-err`, `.wg-skeleton`, and layout helpers `.wg-stack .wg-inline .wg-spread .wg-grow .wg-truncate .wg-grid-2 .wg-grid-3`.

The base styles turn `<body>` into the widget card (glass background, border, rounded corners), so the widget's own CSS only has to describe what is specific to it.

### Dragging and clicking

By default the whole body drags the window. `button`, `a`, `input`, `textarea`, `select` and `.no-drag` are clickable. Give any other clickable element the `no-drag` class.

### Smart resize

The user can switch a widget to Smart resize (dashboard or right-click menu); the engine then fits the window height to the content. Don't use `min-height: 100vh` / `100%` on the root, and don't call `autoResize` with `scrollHeight`.

## Rules for good widgets

1. Works with no setup where possible; otherwise shows what to configure.
2. Handles failure: offline, bad API key, empty results, command not found. Show it in the UI.
3. Escapes untrusted text (`textContent`, or an `escapeHtml` helper) before `innerHTML`.
4. No top-level `return` in `script.js` (it is a classic script; wrap in a function if you need early exit).
5. Cheap: no tight timers, `ttl` on HTTP, pause-friendly (use `setInterval`, not recursive `setTimeout` chains).

## Testing a widget

```
node scripts/widget-cli.js validate gallery/weather
npx electron test/widget-smoke.js weather                 # loads it headlessly, fails on script errors
npx electron test/widget-smoke.js weather --shots shots   # also writes shots/weather.png
npx electron test/widget-smoke.js weather --theme light
```

The dashboard's **Creator** tab opens a live preview window as you type and shows the widget's log.

## Publishing

In the dashboard open **Discover → Community**, sign in, and use **Publish** on one of your widgets (or the Creator's Publish button). The server needs `id`, `version`, `description`; the preview image is captured from your running widget. Publishing the same `id` with a higher `version` releases an update; installed copies are offered the update automatically.

For app development, architecture and the registry see `CONTRIBUTING.md` and `registry/README.md`.
