// Drive usage via fs.statfsSync (Node 18.15+ / Electron). Windows: drive letters C-Z; elsewhere: "/".
(function () {
  const fs = require('fs');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function fmt(bytes) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0, v = bytes;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)) + ' ' + u[i];
  }

  function candidates() {
    if (process.platform === 'win32') {
      const out = [];
      for (let c = 67; c <= 90; c++) out.push(String.fromCharCode(c) + ':\\'); // skip A:/B: (floppy)
      return out;
    }
    return ['/'];
  }

  function readDrives() {
    const drives = [];
    for (const p of candidates()) {
      try {
        const s = fs.statfsSync(p);
        const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
        if (!(total > 0)) continue;
        drives.push({ path: p, label: process.platform === 'win32' ? p.slice(0, 2) : p, total, free, used: total - free });
      } catch (e) { /* drive not present or not ready */ }
    }
    return drives;
  }

  function render() {
    const root = $('drives');
    let drives;
    try { drives = readDrives(); } catch (e) {
      root.innerHTML = '<div class="wg-err">' + esc(e.message) + '</div>';
      $('sub').textContent = 'Could not read drives';
      return;
    }
    if (!drives.length) {
      root.innerHTML = '<div class="wg-empty">No drives found</div>';
      $('sub').textContent = 'No drives';
      return;
    }
    const free = drives.reduce((a, d) => a + d.free, 0), total = drives.reduce((a, d) => a + d.total, 0);
    $('sub').textContent = drives.length + (drives.length === 1 ? ' drive' : ' drives') + ' \u00b7 ' + fmt(free) + ' free of ' + fmt(total);
    root.innerHTML = drives.map((d) => {
      const pct = Math.round(d.used / d.total * 100);
      const cls = pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : '';
      return '<div class="wg-card drive">' +
        '<div class="top"><span class="name">' + esc(d.label) + '</span><span class="free"><b class="' + (pct >= 90 ? 'wg-bad' : '') + '">' + fmt(d.free) + '</b> free</span></div>' +
        '<div class="wg-bar"><div class="wg-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
        '<div class="bot"><span>' + fmt(d.used) + ' used of ' + fmt(d.total) + '</span><b>' + pct + '%</b></div>' +
        '</div>';
    }).join('');
  }

  $('refresh').addEventListener('click', render);
  render();
  setInterval(render, 60000);
})();
