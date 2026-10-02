const net = require('net');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_PORTS = 60;
let entries = [];
let defaultHost = '127.0.0.1';
let timeoutMs = 1500;
let hideClosed = false;
let results = [];
let scanning = false;
let lastScan = null;

// "3000 label", "host:3000 label" or "[::1]:3000 label"
function parseEntries(raw, host) {
  const out = [];
  String(raw || '').split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line || line[0] === '#') return;
    const m = /^(?:(\[[^\]]+\]|[^\s:]+):)?(\d{1,5})(?:\s+(.*))?$/.exec(line);
    const port = m ? +m[2] : 0;
    if (!m || port < 1 || port > 65535) { out.push({ bad: line }); return; }
    out.push({ host: (m[1] || host).replace(/^\[|\]$/g, ''), custom: !!m[1], port, label: (m[3] || '').trim() });
  });
  return out.slice(0, MAX_PORTS);
}

function checkPort(host, port) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const sock = new net.Socket();
    let settled = false;
    const finish = (r) => { if (settled) return; settled = true; sock.destroy(); resolve(r); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish({ open: true, ms: Math.max(1, Math.round(performance.now() - t0)) }));
    sock.once('timeout', () => finish({ open: false, why: 'timeout' }));
    sock.once('error', (e) => finish({ open: false, why: e && e.code === 'ENOTFOUND' ? 'dns' : 'closed' }));
    try { sock.connect(port, host); } catch (e) { finish({ open: false, why: 'closed' }); }
  });
}

async function scan() {
  if (scanning || !entries.length) return;
  scanning = true;
  try {
    results = await Promise.all(entries.map((e) => (e.bad ? Promise.resolve({ open: false, why: 'bad' }) : checkPort(e.host, e.port))));
    lastScan = new Date();
    render();
  } catch (e) {
    $('list').innerHTML = '<div class="wg-err">' + esc(e.message || e) + '</div>';
  } finally {
    scanning = false;
  }
}

function render() {
  const open = results.filter((r) => r.open).length;
  const total = entries.filter((e) => !e.bad).length;
  const hosts = Array.from(new Set(entries.filter((e) => !e.bad).map((e) => e.host)));
  $('sub').textContent = open + ' of ' + total + ' open · ' + (hosts.length === 1 ? hosts[0] : hosts.length + ' hosts') +
    (lastScan ? ' · ' + lastScan.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const rows = [];
  entries.forEach((e, i) => {
    const r = results[i] || { open: false, why: '…' };
    if (e.bad) {
      rows.push('<div class="wg-item pc-item closed"><span class="pc-label wg-truncate wg-grow">' + esc(e.bad) + '</span><span class="wg-badge bad pc-badge">invalid</span></div>');
      return;
    }
    if (hideClosed && !r.open) return;
    const badge = r.open ? '<span class="wg-badge good pc-badge">open</span>'
      : r.why === 'timeout' ? '<span class="wg-badge warn pc-badge" title="No answer within the timeout (filtered?)">timeout</span>'
      : r.why === 'dns' ? '<span class="wg-badge bad pc-badge">no host</span>'
      : '<span class="wg-badge pc-badge">closed</span>';
    rows.push('<div class="wg-item pc-item' + (r.open ? '' : ' closed') + '" title="' + esc(e.host + ':' + e.port) + '">' +
            '<span class="pc-port">' + e.port + (e.custom ? '<span class="pc-host wg-truncate">' + esc(e.host) + '</span>' : '') + '</span>' +
      '<span class="pc-label wg-truncate wg-grow">' + esc(e.label) + '</span>' +
      (r.open ? '<span class="pc-ms">' + r.ms + ' ms</span>' : '') + badge + '</div>');
  });
  $('list').innerHTML = rows.length ? rows.join('') : '<div class="wg-empty">No open ports on this list right now.</div>';
}

(async function init() {
  defaultHost = String(await widgeter.getConfig('pc_host') || '').trim() || '127.0.0.1';
  entries = parseEntries(await widgeter.getConfig('pc_ports'), defaultHost);
  timeoutMs = Math.max(300, (Number(await widgeter.getConfig('pc_timeout')) || 1.5) * 1000);
  hideClosed = (await widgeter.getConfig('pc_hide_closed')) === true;
  const every = Math.max(5, Number(await widgeter.getConfig('pc_interval')) || 15);

  $('refresh').addEventListener('click', scan);
  if (!entries.length) {
    $('sub').textContent = 'Not configured';
    $('list').innerHTML = '<div class="wg-empty">🔌<br>Add the ports to check in this widget’s settings<br>(“Ports”, one per line).</div>';
    return;
  }
  scan();
  setInterval(scan, every * 1000);
})();
