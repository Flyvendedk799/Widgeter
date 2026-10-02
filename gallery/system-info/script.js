// System facts from os; the graphics card name comes from one PowerShell CIM query on Windows (optional).
(function () {
  const os = require('os');
  const { execFile } = require('child_process');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const fmtGB = (b) => (b / 1073741824).toFixed(b >= 10 * 1073741824 ? 0 : 1) + ' GB';
  function fmtUp(s) {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d > 0 ? d + 'd ' + h + 'h' : h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  }

  let gpus = null; // null = not asked / unavailable, [] = none

  function osName() {
    let v = '';
    try { v = os.version(); } catch (e) { /* older runtimes */ }
    if (v) return v;
    return ({ win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[os.platform()] || os.type());
  }

  function row(label, value) {
    return '<div class="wg-row"><span class="wg-lbl">' + esc(label) + '</span><span class="wg-val">' + esc(value) + '</span></div>';
  }
  const card = (title, rows) => '<div class="wg-card"><div class="wg-caption">' + esc(title) + '</div>' + rows.filter(Boolean).join('') + '</div>';

  function render() {
    const cpus = os.cpus();
    const model = cpus[0] ? cpus[0].model.replace(/\s+/g, ' ').trim() : 'Unknown';
    let user = '';
    try { user = os.userInfo().username; } catch (e) { /* no user info */ }
    $('host').textContent = os.hostname();
    $('up').textContent = 'Up ' + fmtUp(os.uptime());
    $('sub').textContent = osName();
    $('body').innerHTML =
      card('Operating system', [
        row('System', osName()),
        row('Build', os.release()),
        row('Architecture', os.arch()),
        user ? row('User', user) : ''
      ]) +
      card('Hardware', [
        row('Processor', model),
        row('Threads', String(cpus.length)),
        row('Memory', fmtGB(os.totalmem())),
        gpus && gpus.length ? row(gpus.length > 1 ? 'Graphics' : 'Graphics', gpus.join(' / ')) : ''
      ]);
  }

  function queryGpu() {
    if (process.platform !== 'win32') return;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      "(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) -join '|'"],
      { windowsHide: true, timeout: 20000 }, (err, out) => {
        if (err) return;
        const list = String(out || '').trim().split('|').map((s) => s.trim()).filter((s) => s && !/basic display|remote display|virtual/i.test(s));
        if (list.length) { gpus = list.slice(0, 2); render(); }
      });
  }

  render();
  queryGpu();
  setInterval(() => { $('up').textContent = 'Up ' + fmtUp(os.uptime()); }, 60000);
})();
