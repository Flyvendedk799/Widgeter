(function () {
  const fs = require('fs');
  const path = require('path');

  const FILE = path.join(widgeter.dataDir, 'clips.json');
  const MAX_LEN = 20000;
  const listEl = document.getElementById('cb-list');
  const metaEl = document.getElementById('cb-meta');

  let max = 25;
  let persist = false;
  let clips = []; // newest first: { text, at }
  let lastSeen = null;
  let flash = -1;
  let flashTimer = null;
  let saveTimer = null;
  let fatal = '';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  // ---- clipboard access ----------------------------------------------------------
  async function readClipboard() {
    try {
      return String(await widgeter.clipboard.readText()).replace(/\r\n/g, '\n');
    } catch (e) {
      fatal = 'Clipboard access is unavailable: ' + e.message;
      render();
      return null;
    }
  }

  const writeClipboard = (text) => widgeter.clipboard.writeText(text);

  // ---- history -------------------------------------------------------------------
  function save() {
    if (!persist) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const tmp = FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(clips));
        fs.renameSync(tmp, FILE);
      } catch (e) { console.error('Could not save clips: ' + e.message); }
    }, 400);
  }

  function load() {
    if (!persist) {
      try { fs.unlinkSync(FILE); } catch (e) { /* nothing stored */ }
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (Array.isArray(data)) clips = data.filter((c) => c && typeof c.text === 'string').slice(0, max);
    } catch (e) { /* first run */ }
  }

  function render() {
    if (fatal) {
      metaEl.textContent = 'Unavailable';
      listEl.innerHTML = '<div class="wg-err">' + escapeHtml(fatal) + '</div>';
      return;
    }
    metaEl.textContent = clips.length ? clips.length + (clips.length === 1 ? ' clip' : ' clips') + ' · live' : 'Watching…';
    if (!clips.length) {
      listEl.innerHTML = '<div class="wg-empty">Nothing copied yet.<br>Copy some text and it shows up here.</div>';
      return;
    }
    listEl.innerHTML = clips.map((c, i) => {
      const preview = c.text.length > 160 ? c.text.slice(0, 160) + '…' : c.text;
      const tag = i === flash ? '<span class="copied">Copied</span>' : '<span>' + ago(c.at) + '</span>';
      return '<div class="wg-item clip no-drag' + (c.text === lastSeen ? ' current' : '') + '" data-i="' + i + '" title="Click to copy">' +
        '<div class="wg-grow"><div class="clip-text">' + escapeHtml(preview) + '</div>' +
        '<div class="clip-meta">' + tag + '<span>·</span><span>' + c.text.length + ' chars</span></div></div>' +
        '<button class="clip-del no-drag" data-del="' + i + '" title="Remove">×</button></div>';
    }).join('');
  }

  function add(text) {
    clips = clips.filter((c) => c.text !== text);
    clips.unshift({ text, at: Date.now() });
    if (clips.length > max) clips.length = max;
    save();
  }

  let polling = false;
  async function poll() {
    if (polling || fatal) return;
    polling = true;
    const t = await readClipboard();
    polling = false;
    if (t === null || t === lastSeen) return;
    lastSeen = t;
    if (t.trim()) add(t.length > MAX_LEN ? t.slice(0, MAX_LEN) : t);
    render();
  }

  listEl.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      clips.splice(Number(del.dataset.del), 1);
      save(); render();
      return;
    }
    const item = e.target.closest('[data-i]');
    if (!item) return;
    const i = Number(item.dataset.i);
    if (!clips[i]) return;
    const text = clips[i].text;
    lastSeen = text; // so the poll does not re-add it
    flash = i;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flash = -1; render(); }, 1200);
    render();
    await writeClipboard(text);
  });

  document.getElementById('cb-clear').addEventListener('click', async () => {
    clips = [];
    flash = -1;
    lastSeen = '';
    save(); render();
    await writeClipboard('');
  });

  (async function init() {
    max = Math.max(5, Math.min(100, Number(await widgeter.getConfig('cb_max')) || 25));
    persist = !!(await widgeter.getConfig('cb_persist'));
    load();
    render();
    await poll();
    setInterval(poll, 1500);
    setInterval(render, 30000); // refresh "x ago" labels
  })();
})();
