const { execFile } = require('child_process');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_ROWS = 60;
let busy = false;

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function explain(r) {
  const err = r.err;
  const text = (r.stderr || (err && err.message) || '').trim();
  if (err && err.code === 'ENOENT') return { title: 'Docker CLI not found', hint: 'Install Docker Desktop and make sure “docker” is on your PATH.' };
  if (err && err.killed) return { title: 'Docker did not respond', hint: 'The docker command timed out after 10 s. Is Docker Desktop still starting?' };
  if (/daemon|pipe|cannot connect|dockerDesktop|connection refused|permission denied/i.test(text)) {
    return { title: 'Docker is not running', hint: 'Start Docker Desktop (or the Docker service) and this will fill in.' };
  }
  return { title: 'docker failed', hint: text.split('\n')[0].slice(0, 200) || 'Unknown error' };
}

function formatPorts(raw) {
  const seen = new Set();
  const out = [];
  String(raw || '').split(',').forEach((part) => {
    const m = /:(\d+)(?:-\d+)?->(\d+)(?:-\d+)?\/(tcp|udp)/.exec(part.trim());
    if (!m) return;
    const label = m[1] === m[2] ? m[1] : m[1] + '→' + m[2];
    const full = label + (m[3] === 'udp' ? '/udp' : '');
    if (!seen.has(full)) { seen.add(full); out.push(full); }
  });
  if (out.length > 3) return out.slice(0, 3).join(', ') + ' +' + (out.length - 3);
  return out.join(', ');
}

function classify(c) {
  const state = String(c.State || '').toLowerCase() || (/^up/i.test(c.Status || '') ? 'running' : 'exited');
  const status = String(c.Status || '');
  if (state === 'running') {
    if (/unhealthy/i.test(status)) return { cls: 'bad', on: true };
    if (/starting/i.test(status)) return { cls: 'warn', on: true };
    return { cls: 'good', on: true };
  }
  if (state === 'paused' || state === 'restarting') return { cls: 'warn', on: true };
  if (state === 'dead' || (state === 'exited' && !/\(0\)/.test(status))) return { cls: 'bad', on: false };
  return { cls: '', on: false };
}

function render(containers, showAll) {
  const items = containers.map((c) => Object.assign({ k: classify(c) }, c));
  items.sort((a, b) => (b.k.on - a.k.on) || String(a.Names).localeCompare(String(b.Names)));
  const running = items.filter((c) => c.k.on).length;
  $('sub').textContent = showAll
    ? running + ' running · ' + items.length + ' total'
    : running + ' running';
  if (!items.length) {
    $('list').innerHTML = '<div class="wg-empty">No ' + (showAll ? '' : 'running ') + 'containers.</div>';
    return;
  }
  const rows = items.slice(0, MAX_ROWS).map((c) => {
    const ports = formatPorts(c.Ports);
    const name = String(c.Names || c.ID || '?').split(',')[0];
    return '<div class="wg-item dk-item' + (c.k.on ? '' : ' off') + '" title="' + esc(name + ' · ' + (c.Image || '') + ' · ' + (c.Status || '')) + '">' +
      '<span class="wg-dot ' + c.k.cls + '"></span>' +
      '<div class="wg-grow"><div class="dk-name wg-truncate">' + esc(name) + '</div><div class="dk-meta wg-truncate">' + esc(c.Image) + '</div></div>' +
      '<div class="dk-right"><div class="dk-status wg-truncate">' + esc(c.Status) + '</div>' +
      (ports ? '<div class="dk-ports wg-truncate">' + esc(ports) + '</div>' : '') + '</div></div>';
  });
  if (items.length > MAX_ROWS) rows.push('<div class="dk-more">+' + (items.length - MAX_ROWS) + ' more</div>');
  $('list').innerHTML = rows.join('');
}

async function update() {
  if (busy) return;
  busy = true;
  try {
    const showAll = !!(await widgeter.getConfig('dk_all'));
    const r = await run('docker', ['ps'].concat(showAll ? ['-a'] : [], ['--format', '{{json .}}']));
    if (r.err) {
      const e = explain(r);
      $('sub').textContent = 'Unavailable';
      $('list').innerHTML = '<div class="wg-empty"><div style="font-size:22px;margin-bottom:4px">🐳</div><b>' + esc(e.title) + '</b><br>' + esc(e.hint) + '</div>';
      return;
    }
    const containers = [];
    r.stdout.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      try { containers.push(JSON.parse(line)); } catch (e) { /* ignore a malformed line */ }
    });
    render(containers, showAll);
  } finally {
    busy = false;
  }
}

$('refresh').addEventListener('click', update);
update();
setInterval(update, 15000);
