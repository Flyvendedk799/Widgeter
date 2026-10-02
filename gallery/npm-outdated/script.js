const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_ROWS = 40;
const ORDER = { major: 0, minor: 1, patch: 2, missing: 3 };
let busy = false;

// `npm outdated` exits with 1 when something is outdated, so only the output matters.
// On Windows npm is npm.cmd, which cannot be spawned directly; go through cmd.exe with a fixed
// command line (nothing from the settings is ever put into it, the folder is only the cwd).
function runNpm(cwd) {
  const opts = { cwd, windowsHide: true, timeout: 90000, maxBuffer: 16 * 1024 * 1024 };
  return new Promise((resolve) => {
    const done = (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    if (process.platform === 'win32') {
      execFile(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm outdated --json'], Object.assign({ windowsVerbatimArguments: true }, opts), done);
    } else {
      execFile('npm', ['outdated', '--json'], opts, done);
    }
  });
}

function parseVer(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
}

function severity(p) {
  const cur = parseVer(p.current), lat = parseVer(p.latest || p.wanted);
  if (!cur) return 'missing';
  if (!lat) return 'patch';
  if (cur[0] !== lat[0]) return 'major';
  if (cur[1] !== lat[1]) return 'minor';
  return 'patch';
}

function explain(r) {
  const text = (r.stderr || '').trim();
  if (r.err && r.err.killed) return { title: 'npm timed out', hint: 'The registry did not answer within 90 s. Check your connection and try again.' };
  if (r.err && r.err.code === 'ENOENT') return { title: 'npm not found', hint: 'Install Node.js and make sure npm is on your PATH.' };
  if (/is not recognized|not found/i.test(text) && /npm/i.test(text)) return { title: 'npm not found', hint: 'Install Node.js and make sure npm is on your PATH.' };
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network|offline/i.test(text)) return { title: 'Could not reach the npm registry', hint: 'You appear to be offline. The widget retries automatically.' };
  return { title: 'npm outdated failed', hint: (text.split('\n').find((l) => /error|ERR!/i.test(l)) || text.split('\n')[0] || 'Unknown error').slice(0, 200) };
}

function show(html) { $('content').innerHTML = html; $('content').classList.remove('stale'); }

function emptyState(icon, title, hint) {
  show('<div class="wg-empty"><div class="no-ok">' + icon + '</div><b>' + esc(title) + '</b>' + (hint ? '<br>' + esc(hint) : '') + '</div>');
}

function render(data, dir) {
  const pkgs = Object.keys(data).map((name) => {
    const p = data[name] || {};
    return { name, cur: p.current, wanted: p.wanted, latest: p.latest || p.wanted, dev: p.type === 'devDependencies', sev: severity(p) };
  });
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!pkgs.length) {
    $('sub').textContent = 'Up to date';
    emptyState('✅', 'All dependencies are up to date', 'Checked ' + time);
    return;
  }
  pkgs.sort((a, b) => ORDER[a.sev] - ORDER[b.sev] || a.name.localeCompare(b.name));
  const n = (s) => pkgs.filter((p) => p.sev === s).length;
  $('sub').textContent = pkgs.length + ' outdated · ' + path.basename(dir);
  let h = '<div class="wg-card no-summary"><div class="wg-grid-3">' +
    '<div class="no-count bad"><div class="wg-big-sm">' + n('major') + '</div><div class="wg-caption">Major</div></div>' +
    '<div class="no-count warn"><div class="wg-big-sm">' + n('minor') + '</div><div class="wg-caption">Minor</div></div>' +
    '<div class="no-count good"><div class="wg-big-sm">' + n('patch') + '</div><div class="wg-caption">Patch</div></div>' +
    '</div></div>';
  h += pkgs.slice(0, MAX_ROWS).map((p) => {
    const badge = p.sev === 'major' ? '<span class="wg-badge bad no-badge">major</span>'
      : p.sev === 'minor' ? '<span class="wg-badge warn no-badge">minor</span>'
      : p.sev === 'missing' ? '<span class="wg-badge no-badge" title="Not installed. Run npm install.">missing</span>'
      : '<span class="wg-badge good no-badge">patch</span>';
    const tip = p.name + ': ' + (p.cur || 'not installed') + ' (wanted ' + (p.wanted || '?') + ', latest ' + (p.latest || '?') + ')';
    return '<div class="no-row" title="' + esc(tip) + '"><div class="no-name wg-truncate">' + esc(p.name) + (p.dev ? '<span class="no-dev">dev</span>' : '') + '</div>' +
      '<div class="no-ver">' + esc(p.cur || '–') + ' → <b>' + esc(p.latest || '?') + '</b></div>' + badge + '</div>';
  }).join('');
  if (pkgs.length > MAX_ROWS) h += '<div class="no-more">+' + (pkgs.length - MAX_ROWS) + ' more</div>';
  h += '<div class="no-foot">' + (n('missing') ? n('missing') + ' not installed (run npm install) · ' : '') + 'Checked ' + time + '</div>';
  show(h);
}

async function check() {
  if (busy) return;
  busy = true;
  try {
    const dir = String(await widgeter.getConfig('npm_dir') || '').trim().replace(/^["']|["']$/g, '');
    if (!dir) {
      $('sub').textContent = 'Not configured';
      emptyState('📦', 'Choose a project folder', 'Set “Project folder” in this widget’s settings.');
      return;
    }
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
      $('sub').textContent = 'No package.json';
      emptyState('⚠️', 'No package.json found', dir);
      return;
    }
    $('sub').textContent = 'Checking registry…';
    $('content').classList.add('stale');
    $('refresh').disabled = true;
    const r = await runNpm(dir);
    let data = null;
    try { data = r.stdout.trim() ? JSON.parse(r.stdout) : {}; } catch (e) { data = null; }
    if (data && data.error && typeof data.error === 'object') {
      // npm reports registry/config problems as {"error":{"code","summary"}} on stdout
      const code = String(data.error.code || '');
      const offline = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|ECONNRESET/.test(code + ' ' + data.error.summary);
      $('sub').textContent = offline ? 'Offline' : 'Check failed';
      emptyState('⚠️', offline ? 'Could not reach the npm registry' : 'npm outdated failed', String(data.error.summary || code).slice(0, 200));
    } else if (data) {
      render(data, dir);
    } else {
      const e = explain(r);
      $('sub').textContent = 'Check failed';
      emptyState('⚠️', e.title, e.hint);
    }
  } finally {
    $('refresh').disabled = false;
    busy = false;
  }
}

(async function init() {
  const mins = Math.max(5, Number(await widgeter.getConfig('npm_interval_min')) || 30);
  $('refresh').addEventListener('click', check);
  check();
  setInterval(check, mins * 60000);
})();
