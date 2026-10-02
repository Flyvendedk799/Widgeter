// Top memory consumers. Windows: tasklist (fast, no PowerShell start-up); macOS/Linux: ps.
(function () {
  const os = require('os');
  const { execFile } = require('child_process');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let cfg = { count: 8, group: true, interval: 5 };
  let busy = false;

  function fmtMem(kb) {
    const mb = kb / 1024;
    return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
  }

  // tasklist /FO CSV /NH -> "Image","PID","Session","Session#","1.234 K". The memory column is
  // localised (separators, "K"), so keep only its digits.
  function parseTasklist(out) {
    const procs = [];
    out.split(/\r?\n/).forEach((line) => {
      line = line.trim();
      if (line.charAt(0) !== '"') return;
      const f = line.slice(1, -1).split('","');
      if (f.length < 5) return;
      const kb = parseInt(f[f.length - 1].replace(/\D/g, ''), 10);
      if (!f[0] || isNaN(kb)) return;
      procs.push({ name: f[0], pid: f[1], kb });
    });
    return procs;
  }

  function parsePs(out) {
    const procs = [];
    out.split('\n').forEach((line) => {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/);
      if (m) procs.push({ pid: m[1], kb: parseInt(m[2], 10), name: m[3].split('/').pop() });
    });
    return procs;
  }

  function list() {
    return new Promise((resolve, reject) => {
      const win = process.platform === 'win32';
      const cmd = win ? 'tasklist' : 'ps';
      const args = win ? ['/FO', 'CSV', '/NH'] : ['-A', '-o', 'pid=,rss=,comm='];
      execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 15000 }, (err, stdout) => {
        if (err && !stdout) return reject(err);
        const procs = win ? parseTasklist(stdout) : parsePs(stdout);
        if (!procs.length) return reject(new Error('Could not read the process list.'));
        resolve(procs);
      });
    });
  }

  function render(procs) {
    let rows = procs;
    if (cfg.group) {
      const map = new Map();
      procs.forEach((p) => {
        const key = p.name.toLowerCase();
        const g = map.get(key) || { name: p.name, kb: 0, n: 0 };
        g.kb += p.kb; g.n++;
        map.set(key, g);
      });
      rows = Array.from(map.values());
    } else rows = procs.map((p) => Object.assign({ n: 1 }, p));
    rows.sort((a, b) => b.kb - a.kb);
    const top = rows.slice(0, cfg.count), max = top[0] ? top[0].kb : 1;
    const totalKb = os.totalmem() / 1024;
    $('sub').textContent = procs.length + ' processes · ' + Math.round((1 - os.freemem() / os.totalmem()) * 100) + '% of RAM in use';
    $('list').innerHTML = top.map((p, i) => {
      const share = p.kb / totalKb * 100;
      return '<div class="proc" title="' + esc(p.name) + ' — ' + share.toFixed(1) + '% of RAM">' +
        '<div class="line"><span class="rank">' + (i + 1) + '</span><span class="nm">' + esc(p.name) + '</span>' +
        (p.n > 1 ? '<span class="cnt">×' + p.n + '</span>' : '') +
        '<span class="mem">' + fmtMem(p.kb) + '</span></div>' +
        '<div class="wg-bar"><div class="wg-fill" style="width:' + Math.max(2, Math.round(p.kb / max * 100)) + '%"></div></div></div>';
    }).join('');
  }

  async function update() {
    if (busy) return;
    busy = true;
    try { render(await list()); }
    catch (e) {
      $('list').innerHTML = '<div class="wg-err">Could not read processes: ' + esc(e.message) + '</div>';
      $('sub').textContent = 'Unavailable';
    } finally { busy = false; }
  }

  async function init() {
    const n = Number(await widgeter.getConfig('proc_count'));
    const g = await widgeter.getConfig('proc_group');
    const iv = Number(await widgeter.getConfig('proc_interval'));
    cfg.count = Math.min(15, Math.max(3, n || 8));
    cfg.group = g !== false && g !== 'false';
    cfg.interval = Math.min(60, Math.max(2, iv || 5));
    $('refresh').addEventListener('click', update);
    update();
    setInterval(update, cfg.interval * 1000);
  }
  init();
})();
