# Widgeter

Widgeter is a lightweight, customizable desktop widget engine built with Electron. It allows you to run completely custom widgets using a simple `.widget` file format.

## Features
- **Extremely Simple Format**: Widgets are just JSON files containing HTML, CSS, and JS.
- **Node Integration**: Widgets have full access to Node.js, meaning they can read local files, check system status, ping APIs, or query MCPs natively.
- **Frameless & Transparent**: Widgets float beautifully on your desktop.
- **AI-Friendly**: Designed so that AI agents (like Cursor, Claude, or ChatGPT) can effortlessly generate and update widgets for you.

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run the App**:
   ```bash
   npm start
   ```
   Or simply double-click `run.bat`.

3. **Managing Widgets**:
   - Once running, Widgeter lives in your System Tray.
   - Right-click the tray icon to load new `.widget` files or open the default Widgets folder (located in `%APPDATA%\widgeter\widgets`).
   - By default, a "Service Health Monitor" widget will launch on the first run.

## Creating Widgets (For AI Agents)

If you are an AI coding assistant, please refer to the `DOCS.md` file for full instructions on how to structure and deploy `.widget` files.
