// Network adapters from os.networkInterfaces(); live throughput from /proc/net/dev (Linux)
// or a small PowerShell loop around Get-NetAdapterStatistics (Windows). Omitted where unavailable.
(function () {
  const os = require('os');
  const fs = require('fs');
  const { spawn } = require('child_process');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const rates = {};          // adapter name -> { rx, tx } bytes/s
  let last = null;           // { t, bytes: { name: {rx, tx} } }
  let haveRates = false;
  let ps = null;

  function fmtRate(bps) {
    const bits = bps * 8, u = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    let i = 0, v = bits;
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    return { n: v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1), u: u[i] };
  }
  const rateHtml = (bps) => { const r = fmtRate(bps); return esc(r.n) + '<span class="unit">' + r.u + '</span>'; };
  const rateText = (bps) => { const r = fmtRate(bps); return r.n + ' ' + r.u; };

  function ingest(bytes) {
    const now = Date.now();
    if (last) {
      const dt = (now - last.t) / 1000;
      if (dt > 0.2) {
        for (const name in bytes) {
          const p = last.bytes[name];
          if (!p) continue;
          rates[name] = { rx: Math.max(0, (bytes[name].rx - p.rx) / dt), tx: Math.max(0, (bytes[name].tx - p.tx) / dt) };
        }
        haveRates = true;
      }
    }
    last = { t: now, bytes: bytes };
    render();
  }

  function startCounters() {
    if (process.platform === 'linux') {
      const read = () => {
        try {
          const out = {};
          fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).forEach((line) => {
            const m = line.match(/^\s*([^:]+):\s*(\d+)(?:\s+\d+){7}\s+(\d+)/);
            if (m) out[m[1]] = { rx: Number(m[2]), tx: Number(m[3]) };
          });
          ingest(out);
        } catch (e) { /* no throughput */ }
      };
      read(); setInterval(read, 2000);
    } else if (process.platform === 'win32') {
      startPowerShell();
    }
  }

  // One long-lived PowerShell instead of one spawn per sample; it exits when this window's process is gone.
  function startPowerShell() {
    const script = 'while (Get-Process -Id ' + process.pid + ' -ErrorAction SilentlyContinue) { ' +
      '$s = @(Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object Name,ReceivedBytes,SentBytes); ' +
      'Write-Output (ConvertTo-Json -InputObject $s -Compress); Start-Sleep -Seconds 2 }';
    let buf = '';
    try {
      ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { ps = null; return; }
    ps.on('error', () => { ps = null; });
    ps.on('exit', () => { ps = null; });
    ps.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const arr = JSON.parse(line), bytes = {};
          (Array.isArray(arr) ? arr : [arr]).forEach((a) => { if (a && a.Name) bytes[a.Name] = { rx: a.ReceivedBytes, tx: a.SentBytes }; });
          ingest(bytes);
        } catch (e) { /* partial line */ }
      }
    });
  }
  function stopPowerShell() { if (ps) { try { ps.kill(); } catch (e) { /* gone */ } ps = null; } }
  window.addEventListener('pagehide', stopPowerShell);
  window.addEventListener('beforeunload', stopPowerShell);
  // Stop sampling while hidden, restart on resume (Windows only; Linux uses setInterval which the engine pauses).
  if (window.widgeter && window.widgeter.onVisible && process.platform === 'win32') {
    window.widgeter.onVisible((v) => {
      if (!v) { stopPowerShell(); last = null; } else if (!ps) startPowerShell();
    });
  }

  function collect() {
    const out = [];
    const all = os.networkInterfaces();
    Object.keys(all).forEach((name) => {
      const list = (all[name] || []).filter((i) => !i.internal);
      if (!list.length) return;
      const v4 = list.find((i) => i.family === 'IPv4' || i.family === 4);
      const v6s = list.filter((i) => i.family === 'IPv6' || i.family === 6);
      const v6 = v6s.find((i) => !/^fe80/i.test(i.address)) || null;
      const mac = (list[0].mac && list[0].mac !== '00:00:00:00:00:00') ? list[0].mac : null;
      out.push({ name, v4: v4 ? v4.address : null, mask: v4 ? v4.netmask : null, v6: v6 ? v6.address : null, linkLocal: !v4 && !v6, mac });
    });
    // Adapters with a usable address first.
    out.sort((a, b) => (a.linkLocal - b.linkLocal) || a.name.localeCompare(b.name));
    return out;
  }

  function render() {
    const list = collect();
    const active = list.filter((i) => !i.linkLocal);
    const hidden = list.length - active.length;
    $('sub').textContent = active.length ? active.length + (active.length === 1 ? ' active adapter' : ' active adapters') : 'No active adapters';

    let rx = 0, tx = 0;
    if (haveRates) {
      active.forEach((i) => { const r = rates[i.name]; if (r) { rx += r.rx; tx += r.tx; } });
      $('speed').hidden = false;
      $('down').innerHTML = rateHtml(rx);
      $('up').innerHTML = rateHtml(tx);
    }

    if (!active.length) {
      $('ifaces').innerHTML = '<div class="wg-empty">No network connection<br>Check your cable or Wi-Fi.</div>';
      return;
    }
    $('ifaces').innerHTML = active.map((i) => {
      const r = rates[i.name];
      return '<div class="wg-card iface"><div class="head"><span class="nm wg-truncate" title="' + esc(i.name) + '">' + esc(i.name) + '</span>' +
        '<span class="wg-badge ' + (i.v4 ? 'good' : '') + '">' + (i.v4 ? 'IPv4' : 'IPv6') + '</span></div>' +
        (i.v4 ? '<div class="wg-row"><span class="wg-lbl">IPv4</span><span class="wg-val" title="mask ' + esc(i.mask) + '">' + esc(i.v4) + '</span></div>' : '') +
        (i.v6 ? '<div class="wg-row"><span class="wg-lbl">IPv6</span><span class="wg-val" title="' + esc(i.v6) + '">' + esc(i.v6) + '</span></div>' : '') +
        (i.mac ? '<div class="wg-row"><span class="wg-lbl">MAC</span><span class="wg-val">' + esc(i.mac.toUpperCase()) + '</span></div>' : '') +
        (r && active.length > 1 ? '<div class="wg-row"><span class="wg-lbl">Speed</span><span class="wg-val rate">↓ ' + esc(rateText(r.rx)) + ' &nbsp; ↑ ' + esc(rateText(r.tx)) + '</span></div>' : '') +
        '</div>';
    }).join('') + (hidden ? '<div class="wg-caption" style="text-align:center;padding:2px">' + hidden + ' inactive adapter' + (hidden > 1 ? 's' : '') + ' hidden</div>' : '');
  }

  $('refresh').addEventListener('click', render);
  render();
  setInterval(render, 5000);
  startCounters();
})();
