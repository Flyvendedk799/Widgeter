'use strict';
// App self-update through GitHub Releases (electron-updater). Only active in
// packaged builds; in development every call is a harmless no-op.
const { app } = require('electron');

const S = require('./state');

let updater = null;
let status = { state: 'idle', version: null, percent: 0, error: null };
let notify = () => {};

function set(patch) {
  status = Object.assign({}, status, patch);
  notify(status);
}

function init(onStatus) {
  notify = onStatus || notify;
  if (!app.isPackaged) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (e) {
    console.error('electron-updater unavailable:', e.message);
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  updater.on('update-available', (info) => set({ state: 'downloading', version: info.version, percent: 0 }));
  updater.on('update-not-available', () => set({ state: 'current' }));
  updater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version, percent: 100 }));
  updater.on('error', (err) => set({ state: 'error', error: String(err && err.message ? err.message : err) }));
  if (S.getSettings().checkUpdates) setTimeout(check, 15000);
}

function check() {
  if (!updater) { set({ state: app.isPackaged ? 'error' : 'dev', error: app.isPackaged ? 'Updater unavailable' : null }); return; }
  updater.checkForUpdates().catch((e) => set({ state: 'error', error: e.message }));
}

function installNow() {
  if (updater && status.state === 'ready') updater.quitAndInstall();
}

const getStatus = () => status;

module.exports = { init, check, installNow, getStatus };
