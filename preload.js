const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getConfig: (key) => ipcRenderer.invoke('widgeter:getConfig', key),
  setConfig: (key, value) => ipcRenderer.invoke('widgeter:setConfig', key, value),
  requestAction: (action, payload) => ipcRenderer.invoke('widgeter:action', action, payload),
  autoResize: (width, height) => ipcRenderer.send('widgeter:auto-resize', { width, height }),
  userResize: (payload) => ipcRenderer.send('widgeter:user-resize', payload),
  onResizeMode: (cb) => {
    ipcRenderer.removeAllListeners('widgeter:resize-mode');
    ipcRenderer.on('widgeter:resize-mode', (_event, payload) => cb(payload));
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('widgeter', api);
} else {
  window.widgeter = api;
}
