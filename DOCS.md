# Widgeter - Widget Creation Guide for AI Agents

Welcome, Agent! You have been asked to create a widget for the **Widgeter** engine.
Widgeter is a lightweight, Electron-based desktop widget runtime. It loads widgets from `.widget` files.

## What is a `.widget` file?

A `.widget` file is **simply a JSON file** with the `.widget` extension. It contains the configuration, HTML, CSS, and JavaScript for a single widget. Because it is pure JSON, it is extremely easy for you (the AI) to generate and modify.

## Widget File Structure

Here is the JSON schema of a `.widget` file:

```json
{
  "name": "My Widget Name",
  "width": 300,
  "height": 200,
  "x": 100,             // Optional: X position on screen
  "y": 100,             // Optional: Y position on screen
  "draggable_body": true, // Default true. If true, the entire widget can be dragged around the screen.
  "alwaysOnTop": false, // Optional: Force widget to stay above other windows
  "transparent": true,  // Default true. Sets the Electron window to transparent.
  "backgroundColor": "#00000000", // Default fully transparent. Use hex with alpha.
  
  "html": "<div id='app'>...</div>",
  "css": "body { color: white; background: rgba(0,0,0,0.5); }",
  "js": "console.log('Widget logic goes here');"
}
```

## Smart resize

Widgeter measures each widget and, when Smart resize is on, fits the window height to that content. You do not need to call anything for this to work.

- Turn it on from the widget's Setup panel, or from the widget's right-click menu.
- The corner grip sets the width while Smart resize is on, and sets both width and height in Fixed mode.
- Dragging a window edge switches that widget back to Fixed.
- `window.widgeter.autoResize(width, height)` still exists if a widget must report an exact size. Pass the content size, not `document.documentElement.scrollWidth` / `scrollHeight` — those match the window and fight Smart resize.
- Avoid `min-height: 100vh` and `min-height: 100%` on the widget root. They pin the widget to the window and stop it from shrinking.

## Important Notes for AI Agents

1. **Self-Contained**: The `.widget` file should be entirely self-contained. All styling must go in the `css` property, all markup in `html`, and all logic in `js`.
2. **Node Integration is ENABLED**: The widget runs inside an Electron `BrowserWindow` with `nodeIntegration: true` and `contextIsolation: false`. This is **crucial**!
   - You can use Node.js built-ins in the `js` property: `const fs = require('fs'); const os = require('os'); const { exec } = require('child_process');`.
   - This makes it extremely powerful for creating "live stats" or "service health" widgets, as you can ping servers, read local system logs, execute terminal commands, or connect to MCPs/APIs directly from the widget's JS.
3. **Draggability**: By default, `draggable_body: true` adds `-webkit-app-region: drag;` to the `body` tag. 
   - Interactive elements (`button`, `a`, `input`, `textarea`, `select`) automatically get `-webkit-app-region: no-drag;` so they remain clickable.
   - If you have custom clickable UI elements (like a `div` acting as a button), you **must** add the class `no-drag` to them, or add `-webkit-app-region: no-drag;` in your CSS for that element, otherwise the user will drag the window instead of clicking the element.
4. **Transparency**: Make sure your CSS utilizes rgba or transparent backgrounds if you want the desktop background to show through. A good default is `background: rgba(30, 30, 40, 0.85);` for a sleek, glass-like look.
5. **No Escaping Issues**: When writing the `html`, `css`, and `js` as strings in the JSON file, be careful to properly escape quotes, or just use single quotes `'` inside the code block to avoid escaping double quotes `"` in JSON.

## Example: System Monitor Widget

Here is an example `.widget` file that displays local CPU usage and memory (using Node.js modules inside the widget!):

```json
{
  "name": "SysMon",
  "width": 250,
  "height": 150,
  "html": "<div class='panel'><h3>System Monitor</h3><div class='stat'><span>Mem:</span><span id='mem'>--</span></div><div class='stat'><span>Platform:</span><span id='plat'>--</span></div></div>",
  "css": "body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: rgba(20, 20, 20, 0.9); color: #fff; margin: 0; padding: 15px; border-radius: 12px; border: 1px solid #444; } h3 { margin-top: 0; color: #00ffcc; font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 5px; } .stat { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }",
  "js": "const os = require('os'); setInterval(() => { const total = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1); const free = (os.freemem() / 1024 / 1024 / 1024).toFixed(1); const used = (total - free).toFixed(1); document.getElementById('mem').innerText = `${used} GB / ${total} GB`; document.getElementById('plat').innerText = os.platform(); }, 1000);"
}
```

## How to Start the Engine

1. Open a terminal in the Widgeter folder.
2. Run `npm start` (or double-click `run.bat` on Windows).
3. The app runs in the **System Tray** (bottom right on Windows). Look for the red square icon (or fallback icon). 
4. Right-click the tray icon to load new widgets or open the widgets folder.

## How to Deploy a Widget

To install the widget, simply write the JSON file to a file with the `.widget` extension, e.g., `sysmon.widget`. 
The user can load it by double-clicking it or using the Widgeter System Tray menu -> "Load .widget file...". If the user is currently using the AI, the AI can simply drop the `.widget` file into the user's widgets directory (`%APPDATA%/widgeter/widgets` or wherever Widgeter stores them, as configured in the main engine), and then either restart Widgeter or instruct the user to load it from the Tray.
