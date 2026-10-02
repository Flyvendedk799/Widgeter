# Widgeter

Widgeter puts live widgets on your desktop: system stats, weather, GitHub, notes, timers, anything you can build with HTML, CSS and JavaScript. It runs in the system tray, widgets float on the desktop with transparent glass windows, and everything is themeable.

- **37 built-in widgets** that use real data (no fakes), most working with zero setup.
- **Discover** built-in widgets and a **community marketplace**, install in one click, get update notices.
- **Creator** with a code editor and a live preview window, plus optional "describe it" generation with Claude.
- **Layouts and profiles**: edge/grid snapping, per-monitor layouts, one-click profile switching from the tray.
- **Settings forms generated from a manifest**: widgets declare their settings, the app builds the UI.
- **Light and dark themes** and an accent colour that every widget follows.
- Widgets are cheap: polling pauses while hidden or when the PC sleeps, HTTP is cached and shared.

## Install

Download the latest installer from the [Releases](https://github.com/Flyvendedk799/Widgeter/releases) page. The app updates itself.

## Run from source

```bash
npm install
npm start
```

First launch shows a picker with starter widgets. After that Widgeter lives in the tray; click the icon for the dashboard, right-click for the menu. `Ctrl+Shift+W` hides or shows every widget, `Ctrl+Shift+X` turns off click-through.

## Make a widget

A widget is a folder (or one `.widget` JSON file). Start in the **Creator** tab, or read [DOCS.md](DOCS.md): manifest, settings schema, the `window.widgeter` API, styling components and testing. Widgets you build can be published from the dashboard.

AI agents: see [SKILL.md](SKILL.md).

## Marketplace server

`registry/` is the zero-dependency server behind the community tab (Node's built-in `http` and `sqlite`). See [registry/README.md](registry/README.md). The address is configurable under Settings, default `https://widgetapi.mast3kmedia.dk`.

## Development

```bash
npm test                 # unit tests: engine + registry
npm run validate         # check every gallery widget's manifest
npm run test:widgets     # load every gallery widget in Electron and fail on script errors
npm run test:app         # launch the real app on a throwaway profile and drive the UI
npm run thumbnails       # regenerate gallery/*/thumbnail.png
npm run dist             # build the Windows installer
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture.
