(async function () {
  const fs = require('fs');
  const path = require('path');

  const FILE = path.join(widgeter.dataDir, 'notes.txt');
  // Older versions kept the note in %APPDATA%\widgeter\notes.txt; bring it across once.
  const OLD_FILE = process.env.APPDATA ? path.join(process.env.APPDATA, 'widgeter', 'notes.txt') : '';

  const ta = document.getElementById('qn-text');
  const countEl = document.getElementById('qn-count');
  const statusEl = document.getElementById('qn-status');
  const clearBtn = document.getElementById('qn-clear');

  const size = Math.max(10, Math.min(22, Number(await widgeter.getConfig('qn_font_size')) || 13));
  ta.style.fontSize = size + 'px';

  let saveTimer = null;
  let dirty = false;

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'qn-status' + (cls ? ' ' + cls : '');
  }

  function updateCount() {
    const t = ta.value.trim();
    const words = t ? t.split(/\s+/).length : 0;
    countEl.textContent = words + (words === 1 ? ' word' : ' words') + ' · ' + ta.value.length + ' chars';
  }

  function writeNow() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    try {
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, ta.value);
      fs.renameSync(tmp, FILE);
      dirty = false;
      setStatus('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'ok');
    } catch (e) {
      setStatus('Could not save: ' + e.message, 'err');
    }
  }

  function scheduleSave() {
    dirty = true;
    setStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 600);
  }

  try {
    if (fs.existsSync(FILE)) ta.value = fs.readFileSync(FILE, 'utf8');
    else if (OLD_FILE && fs.existsSync(OLD_FILE)) {
      ta.value = fs.readFileSync(OLD_FILE, 'utf8');
      dirty = true;
      writeNow(); // copy to the new location; the old file is left untouched
    }
  } catch (e) {
    setStatus('Could not load notes: ' + e.message, 'err');
  }
  updateCount();

  ta.addEventListener('input', () => { updateCount(); scheduleSave(); });
  window.addEventListener('beforeunload', writeNow);

  document.getElementById('qn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      setStatus('Copied to clipboard', 'ok');
    } catch (e) {
      setStatus('Copy failed: ' + e.message, 'err');
    }
  });

  let armed = null;
  clearBtn.addEventListener('click', () => {
    if (!ta.value) return;
    if (!armed) {
      clearBtn.textContent = 'Sure?';
      armed = setTimeout(() => { armed = null; clearBtn.textContent = 'Clear'; }, 2500);
      return;
    }
    clearTimeout(armed);
    armed = null;
    clearBtn.textContent = 'Clear';
    ta.value = '';
    updateCount();
    dirty = true;
    writeNow();
    ta.focus();
  });
})();
