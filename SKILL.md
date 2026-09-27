# Widgeter Agent Skill

This file provides context and instructions for AI agents (like Claude or Cursor) on how to interact with, build for, and understand the **Widgeter** ecosystem.

## What is Widgeter?
Widgeter is a lightweight desktop widget engine built on Electron. It allows users to run customizable, frameless widgets on their Windows desktop. Widgets are standalone JSON files (`.widget`) containing HTML, CSS, and JS, meaning they require no compilation or complex setups.

## Creating a Widget
A widget is defined by a single `.widget` JSON file. Here is the schema you should use when generating a widget:

```json
{
  "name": "Widget Name",
  "width": 300,
  "height": 400,
  "x": 100, 
  "y": 100,
  "alwaysOnTop": false,
  "draggable_body": true,
  "transparent": true,
  "backgroundColor": "#00000000",
  "html": "<div id='app'>Hello World</div>",
  "css": "body { color: white; font-family: sans-serif; }",
  "js": "console.log('Widget loaded!');"
}
```

### Important Design Rules for Widgets:
1. **Draggability:** If `"draggable_body": true` is set, the entire `body` is draggable across the desktop using `-webkit-app-region: drag;`. 
2. **Clickable Elements:** To ensure buttons or inputs are clickable, they must have `-webkit-app-region: no-drag;`. The engine automatically applies this to `button, a, input, textarea, select, .no-drag`.
3. **Node Integration:** Widgets have `nodeIntegration: true` and `contextIsolation: false`. You can safely use `require('fs')`, `require('https')`, or other Node modules directly inside the `"js"` string.

## The Widgeter API (`window.widgeter`)
Widgets have access to a persistent configuration API exposed via `window.widgeter`. This allows widgets to store user preferences (like API keys, cities for weather, or themes) without modifying the `.widget` file.

**Note:** The API is asynchronous and returns Promises.

- **`await window.widgeter.getConfig(key)`**: Fetches a value from the user's `state.json`.
- **`await window.widgeter.setConfig(key, value)`**: Saves a value to the user's `state.json`.

**Example Usage in a Widget:**
```javascript
async function loadApiKey() {
  const apiKey = await window.widgeter.getConfig('api_key');
  if (!apiKey) {
    document.getElementById('status').innerText = 'Please set api_key in Dashboard';
    return;
  }
  // Use the API key...
}
loadApiKey();
```

## Installing Widgets Programmatically
If you (the agent) are asked to install a widget for the user:
1. Generate the `.widget` JSON file.
2. Save it directly to the user's Widgeter data directory: `%APPDATA%/widgeter/widgets/`
3. The Widgeter engine watches this folder and will automatically pick it up, or the user can toggle it from their Dashboard.

## Publishing to the Marketplace
The user has a self-hosted Widgeter Marketplace running at `https://widgeter.mast3kmedia.dk`.
If you are asked to upload/publish a widget to the marketplace:
1. Create a `FormData` payload containing the widget file (or pass `json_content`, `name`, `author`, `description`).
2. Make a `POST` request to `https://widgeter.mast3kmedia.dk/widgets`.
3. Use the authorization header `Bearer tobias-secret` (as the user is currently the only one allowed to upload).

Example Node.js request:
```javascript
const fetch = require('node-fetch');
await fetch('https://widgeter.mast3kmedia.dk/widgets', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer tobias-secret'
  },
  body: JSON.stringify({
    name: 'My Cool Widget',
    author: 'AI Assistant',
    description: 'A very cool widget',
    json_content: JSON.stringify(widgetConfigObject)
  })
});
```

## Architecture & Codebase
- **`main.js`**: The Electron main process. Handles IPC, State (`state.json`), and launching widgets.
- **`dashboard.html` / `dashboard.js`**: The management UI where users toggle widgets and edit widget configs.
- **`preload.js`**: Injects the `window.widgeter` IPC bridge into the widgets.
- **State Location**: `%APPDATA%/widgeter/state.json` (Stores widget enabled/disabled states, window X/Y coordinates, and config variables).
