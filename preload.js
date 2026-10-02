const { contextBridge, ipcRenderer } = require('electron');

function formatArgs(args) {
  return args.map((a) => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  }).join(' ');
}

// The widget-facing API. Everything async returns a Promise.
const api = {
  version: 2,

  // Settings declared in the widget's manifest (or saved by older widgets).
  getConfig: (key) => ipcRenderer.invoke('widgeter:getConfig', key),
  getAllConfig: () => ipcRenderer.invoke('widgeter:getAllConfig'),
  setConfig: (key, value) => ipcRenderer.invoke('widgeter:setConfig', key, value),

  // Shared, cached HTTP. opts: { ttl: seconds, timeout: ms (default 15000), headers, method, body }
  // Resolves { ok, status, headers, text, json(), cached? }.
  fetch: async (url, opts) => {
    const res = await ipcRenderer.invoke('widgeter:fetch', String(url), opts || {});
    if (res && res.error) throw new Error(res.error);
    res.json = () => JSON.parse(res.text);
    return res;
  },
  // Same, but returns the parsed JSON and throws on non-2xx.
  fetchJson: async (url, opts) => {
    const res = await api.fetch(url, opts);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + new URL(url).host);
    return res.json();
  },

  // System clipboard (text). Reads work without the widget being focused.
  clipboard: {
    readText: () => ipcRenderer.invoke('widgeter:clipboard-read'),
    writeText: (text) => ipcRenderer.invoke('widgeter:clipboard-write', String(text))
  },

  notify: (title, body) => ipcRenderer.send('widgeter:notify', { title: String(title || ''), body: String(body || '') }),
  openExternal: (url) => ipcRenderer.send('widgeter:open-external', String(url)),
  // Folder this widget may keep files in (created on demand, survives updates).
  dataDir: ipcRenderer.sendSync('widgeter:data-dir'),

  // Shows up in the dashboard's log drawer for this widget.
  log: (level, message, extra) => ipcRenderer.send('widgeter:log', { level, message: String(message), extra: extra ? String(extra) : undefined }),

  // Visibility: false while the widget is hidden or the PC is asleep. Intervals pause automatically.
  isVisible: () => !(window.__widgeterRuntime && window.__widgeterRuntime.isPaused()),
  onVisible: (cb) => (window.__widgeterRuntime ? window.__widgeterRuntime.onVisible(cb) : () => {}),

  // Window sizing (see DOCS.md, Smart resize)
  autoResize: (width, height) => ipcRenderer.send('widgeter:auto-resize', { width, height }),
  userResize: (payload) => ipcRenderer.send('widgeter:user-resize', payload),
  onResizeMode: (cb) => {
    ipcRenderer.removeAllListeners('widgeter:resize-mode');
    ipcRenderer.on('widgeter:resize-mode', (_event, payload) => cb(payload));
  }
};

ipcRenderer.on('widgeter:theme', (_event, t) => {
  const root = document.documentElement;
  root.dataset.theme = t.theme;
  if (t.accent) {
    root.style.setProperty('--wg-accent', t.accent);
    root.style.setProperty('--wg-accent-soft', t.accentSoft);
  } else {
    root.style.removeProperty('--wg-accent');
    root.style.removeProperty('--wg-accent-soft');
  }
});

ipcRenderer.on('widgeter:paused', (_event, paused) => {
  if (window.__widgeterRuntime) window.__widgeterRuntime.setPaused(paused);
});

// Console output from the widget lands in the dashboard log drawer too.
for (const level of ['warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    api.log(level, formatArgs(args));
  };
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('widgeter', api);
} else {
  window.widgeter = api;
}
