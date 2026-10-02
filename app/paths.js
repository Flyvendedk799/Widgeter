'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const userData = app.getPath('userData');
const ROOT = path.join(__dirname, '..');

const paths = {
  ROOT,
  userData,
  WIDGETS_DIR: path.join(userData, 'widgets'),
  STATE_FILE: path.join(userData, 'state.json'),
  LAYOUTS_FILE: path.join(userData, 'layouts.json'),
  RUNTIME_DIR: path.join(userData, 'runtime'),
  DATA_DIR: path.join(userData, 'widget-data'),
  THUMBS_DIR: path.join(userData, 'thumbs'),
  BACKUP_DIR: path.join(userData, 'backup'),
  // Built-in widgets ship next to the app (extraResources when packaged).
  GALLERY_DIR: app.isPackaged ? path.join(process.resourcesPath, 'gallery') : path.join(ROOT, 'gallery'),
  ICON_FILE: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(ROOT, 'build', 'icon.png'),
  ENGINE_DIR: path.join(ROOT, 'engine'),
  DASHBOARD_DIR: path.join(ROOT, 'dashboard')
};

for (const dir of [paths.WIDGETS_DIR, paths.RUNTIME_DIR, paths.DATA_DIR, paths.THUMBS_DIR, paths.BACKUP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = paths;
