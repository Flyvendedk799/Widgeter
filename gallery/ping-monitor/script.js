// Ping monitor: system `ping` (cross-platform flags, locale-independent parsing),
// falling back to a TCP connect timing when ping cannot be run.
(function () {
  const { execFile } = require('child_process');
  const net = require('net');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const HISTORY = 30, MAX_HOSTS = 12;
  const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,252}$/;

  let hosts = [];            // [{ host, label, samples: [ms|null], last }]
  let busy = false;

  function parseHosts(text) {
    const out = [], seen = new Set();
    String(text || '').split(/\r?\n/).forEach((line) => {
      const parts = line.split('|');
      const host = parts[0].trim();
      if (!host || !HOST_RE.test(host) || seen.has(host.toLowerCase()) || out.length >= MAX_HOSTS) return;
      seen.add(host.toLowerCase());
      out.push({ host, label: (parts[1] || '').trim(), samples: [], last: undefined });
    });
    return out;
  }

  // Latency from a ping reply. Windows localises the words ("time=", "tid=", "Zeit=") but always
  // prints "<value>ms" after "=" or "<"; Linux/macOS print "time=12.3 ms".
  function parseLatency(out) {
    const m = String(out || '').match(/[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/i);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.'));
    return /</.test(m[0]) ? Math.max(0.5, v - 0.5) : v;
  }

  function tcpPing(host) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let done = false;
      const sock = net.connect({ host, port: 443 });
      const finish = (ok) => { if (done) return; done = true; sock.destroy(); resolve(ok ? performance.now() - t0 : null); };
      sock.setTimeout(2500);
      sock.on('connect', () => finish(true));
      sock.on('timeout', () => finish(false));
      sock.on('error', () => finish(false));
    });
  }

  function pingOnce(host) {
    return new Promise((resolve) => {
      const p = process.platform;
      const args = p === 'win32' ? ['-n', '1', '-w', '2000', host]
        : p === 'darwin' ? ['-c', '1', '-W', '2000', host]
        : ['-c', '1', '-W', '2', host];
      execFile('ping', args, { windowsHide: true, timeout: 6000 }, (err, stdout) => {
        if (err && err.code === 'ENOENT') { tcpPing(host).then(resolve); return; }
        resolve(parseLatency(stdout));
      });
    });
  }

  const tone = (ms) => (ms === null ? 'bad' : ms < 60 ? 'good' : ms < 150 ? 'warn' : 'bad');

  function spark(h) {
    const vals = h.samples.filter((v) => v !== null);
    const max = Math.max(50, vals.length ? Math.max.apply(null, vals) : 0);
    const W = 60, H = 20, step = W / (HISTORY - 1), x0 = W - (h.samples.length - 1) * step;
    let d = '', pen = false, lost = '';
    h.samples.forEach((v, i) => {
      const x = (x0 + i * step).toFixed(1);
      if (v === null) { pen = false; lost += '<line class="lost" x1="' + x + '" y1="' + (H - 5) + '" x2="' + x + '" y2="' + (H - 1) + '"/>'; return; }
      const y = (H - 2 - (v / max) * (H - 5)).toFixed(1);
      d += (pen ? 'L' : 'M') + x + ',' + y + ' '; pen = true;
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><path class="ln" d="' + d + '"/>' + lost + '</svg>';
  }

  function render() {
    const root = $('hosts');
    if (!hosts.length) { root.innerHTML = '<div class="wg-empty">No valid hosts configured.<br>Add some in the widget settings.</div>'; $('sum').textContent = 'No hosts'; return; }
    const known = hosts.filter((h) => h.last !== undefined);
    const up = known.filter((h) => h.last !== null);
    const avg = up.length ? Math.round(up.reduce((a, h) => a + h.last, 0) / up.length) : null;
    $('sum').textContent = known.length ? up.length + '/' + hosts.length + ' reachable' + (avg !== null ? ' · avg ' + avg + ' ms' : '') : 'Checking…';
    root.innerHTML = hosts.map((h) => {
      const n = h.samples.length, lost = h.samples.filter((v) => v === null).length;
      const loss = n ? Math.round(lost / n * 100) : 0;
      const t = h.last === undefined ? '' : tone(h.last);
      const ms = h.last === undefined ? '…' : h.last === null ? 'DOWN' : (h.last < 10 ? h.last.toFixed(1) : Math.round(h.last)) + '<small> ms</small>';
      return '<div class="host"><span class="wg-dot ' + t + '"></span>' +
        '<div class="who"><div class="addr" title="' + esc(h.host) + '">' + esc(h.label || h.host) + '</div>' +
        '<div class="meta">' + (h.label ? esc(h.host) + ' · ' : '') + loss + '% loss</div></div>' +
        spark(h) + '<span class="ms ' + (t ? 'wg-' + t : '') + '">' + ms + '</span></div>';
    }).join('');
  }

  async function run() {
    if (busy || !hosts.length) return;
    busy = true;
    $('refresh').disabled = true;
    try {
      await Promise.all(hosts.map(async (h) => {
        const ms = await pingOnce(h.host);
        h.last = ms;
        h.samples.push(ms);
        if (h.samples.length > HISTORY) h.samples.shift();
      }));
    } finally { busy = false; $('refresh').disabled = false; }
    render();
  }

  async function init() {
    hosts = parseHosts(await widgeter.getConfig('ping_hosts'));
    const iv = Math.min(300, Math.max(3, Number(await widgeter.getConfig('ping_interval')) || 10));
    $('refresh').addEventListener('click', run);
    render();
    run();
    setInterval(run, iv * 1000);
  }
  init();
})();
