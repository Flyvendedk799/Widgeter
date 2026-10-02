(async function () {
  const fs = require('fs');
  const path = require('path');

  const FILE = path.join(widgeter.dataDir, 'todos.json');
  // Older versions kept tasks in %APPDATA%\widgeter\todos.json; bring them across once.
  const OLD_FILE = process.env.APPDATA ? path.join(process.env.APPDATA, 'widgeter', 'todos.json') : '';

  const newOnTop = (await widgeter.getConfig('todo_new_on_top')) !== false;
  const doneLast = (await widgeter.getConfig('todo_done_last')) !== false;

  const listEl = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  const fillEl = document.getElementById('todo-fill');
  const inputEl = document.getElementById('todo-inp');
  const clearBtn = document.getElementById('todo-clear');
  const statusEl = document.getElementById('todo-save');

  let todos = []; // { id, text, done }
  let saveTimer = null;
  let dirty = false;
  let nextId = Date.now();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function writeNow() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    try {
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(todos));
      fs.renameSync(tmp, FILE);
      dirty = false;
      statusEl.textContent = '';
    } catch (e) {
      statusEl.textContent = 'Could not save: ' + e.message;
    }
  }

  function save() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 300);
  }

  function normalise(data) {
    if (!Array.isArray(data)) return [];
    return data.filter((t) => t && typeof t.text === 'string').map((t) => ({ id: Number(t.id) || nextId++, text: t.text, done: !!t.done }));
  }

  function load() {
    try {
      if (fs.existsSync(FILE)) { todos = normalise(JSON.parse(fs.readFileSync(FILE, 'utf8'))); return; }
      if (OLD_FILE && fs.existsSync(OLD_FILE)) {
        todos = normalise(JSON.parse(fs.readFileSync(OLD_FILE, 'utf8')));
        dirty = true;
        writeNow(); // copy to the new location; the old file is left untouched
      }
    } catch (e) {
      statusEl.textContent = 'Could not load tasks: ' + e.message;
    }
  }

  function render() {
    const done = todos.filter((t) => t.done).length;
    const open = todos.length - done;
    countEl.textContent = todos.length ? open + ' open · ' + done + ' done' : 'Nothing to do';
    fillEl.style.width = (todos.length ? Math.round((done / todos.length) * 100) : 0) + '%';
    clearBtn.hidden = done === 0;

    if (!todos.length) {
      listEl.innerHTML = '<div class="wg-empty">No tasks yet.<br>Type one above and press Enter.</div>';
      return;
    }
    const shown = doneLast ? todos.filter((t) => !t.done).concat(todos.filter((t) => t.done)) : todos;
    listEl.innerHTML = shown.map((t) =>
      '<div class="todo-item' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
      '<div class="todo-check no-drag" data-act="toggle" title="' + (t.done ? 'Mark as open' : 'Mark as done') + '">' + (t.done ? '✓' : '') + '</div>' +
      '<span class="todo-text no-drag" data-act="toggle" title="' + escapeHtml(t.text) + '">' + escapeHtml(t.text) + '</span>' +
      '<button class="todo-del no-drag" data-act="del" title="Delete">×</button></div>'
    ).join('');
  }

  function add() {
    const text = inputEl.value.trim();
    if (!text) return;
    const item = { id: nextId++, text, done: false };
    if (newOnTop) todos.unshift(item); else todos.push(item);
    inputEl.value = '';
    save(); render();
  }

  listEl.addEventListener('click', (e) => {
    const target = e.target.closest('[data-act]');
    const row = e.target.closest('[data-id]');
    if (!target || !row) return;
    const id = Number(row.dataset.id);
    const idx = todos.findIndex((t) => t.id === id);
    if (idx < 0) return;
    if (target.dataset.act === 'toggle') todos[idx].done = !todos[idx].done;
    else todos.splice(idx, 1);
    save(); render();
  });

  document.getElementById('todo-add').addEventListener('click', add);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  clearBtn.addEventListener('click', () => {
    todos = todos.filter((t) => !t.done);
    save(); render();
  });
  window.addEventListener('beforeunload', writeNow);

  load();
  render();
})();
