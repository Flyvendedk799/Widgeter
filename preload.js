const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getConfig: (key) => ipcRenderer.invoke('widgeter:getConfig', key),
  setConfig: (key, value) => ipcRenderer.invoke('widgeter:setConfig', key, value),
  requestAction: (action, payload) => ipcRenderer.invoke('widgeter:action', action, payload)
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('widgeter', api);
} else {
  window.widgeter = api;
}
