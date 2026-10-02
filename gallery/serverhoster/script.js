const { execFile } = require('child_process');
const fs = require('fs');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DB = '/root/.survhub/survhub.db';
let token = null;
let busy = false;
let lastServices = null;
let lastOk = null;

function ssh(key, login, remoteCmd, timeout) {
  const args = ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new', '--', login, remoteCmd];
  return new Promise((resolve) => {
    execFile('ssh', args, { windowsHide: true, timeout: timeout || 20000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function sshProblem(r, host) {
  const text = (r.stderr || '').trim();
  if (r.err && r.err.code === 'ENOENT') return { title: 'OpenSSH client not found', hint: 'Install the “OpenSSH Client” optional Windows feature.' };
  if (r.err && r.err.killed) return { title: 'SSH timed out', hint: 'No answer from ' + host + '. Is the server reachable?' };
  if (/permission denied|publickey/i.test(text)) return { title: 'SSH login refused', hint: 'The server rejected the key. Check the user name and key file.' };
  if (/could not resolve|name or service not known|no route|timed out|refused|unreachable/i.test(text)) return { title: 'Cannot reach ' + host, hint: text.split('\n').pop().slice(0, 160) };
  if (/identity file|no such file|bad permissions|invalid format/i.test(text)) return { title: 'SSH key problem', hint: text.split('\n')[0].slice(0, 160) };
  if (/sudo/i.test(text)) return { title: 'sudo needs a password', hint: 'The SSH user must have passwordless sudo to read the session token.' };
  if (/no such table|unable to open|not found/i.test(text)) return { title: 'ServerHoster database not found', hint: 'Expected ' + DB + ' on the server. ' + text.split('\n')[0].slice(0, 120) };
  return { title: 'SSH command failed', hint: (text.split('\n')[0] || (r.err && r.err.message) || 'Unknown error').slice(0, 200) };
}

function fail(title, hint) { const e = new Error(title); e.title = title; e.hint = hint || ''; return e; }

async function apiLogin(base, user, password) {
  const res = await widgeter.fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password }) });
  if (res.status === 401 || res.status === 403) throw fail('Dashboard login rejected', 'Check the dashboard user name and password in the settings.');
  if (res.status === 429) throw fail('Too many login attempts', 'The server rate-limits logins. Try again in a minute.');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = res.json();
  if (!j || !j.token) throw new Error('no token in login response');
  return String(j.token);
}

async function getToken(cfg) {
  const { key, login, host } = cfg;
  if (cfg.password) {
    try { return await apiLogin(cfg.base, cfg.user, cfg.password); } catch (e) { if (e.title) throw e; /* API not reachable from here: use SSH */ }
  }
  const r = await ssh(key, login, "sudo -n sqlite3 -readonly -cmd '.timeout 4000' " + DB + " 'select token from sessions order by created_at desc limit 1;'");
  if (r.err) { const p = sshProblem(r, host); throw fail(p.title, p.hint); }
  const t = r.stdout.trim();
  if (!t) throw fail('No active session', 'Sign in to the ServerHoster dashboard once, or save the dashboard password in this widget’s settings so it can log in by itself.');
  return t;
}

async function viaApi(base, tok) {
  const res = await widgeter.fetch(base + '/services', { headers: { authorization: 'Bearer ' + tok, accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) return { auth: false };
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return { auth: true, data: res.json() };
}

async function viaSsh(key, login, host, port, tok) {
  if (!/^[A-Za-z0-9._~+\/=-]+$/.test(tok)) throw fail('Unexpected token format', 'The stored session token has unusual characters.');
  const r = await ssh(key, login, "curl -s -m 8 -H 'authorization: Bearer " + tok + "' http://localhost:" + port + '/services');
  if (r.err) { const p = sshProblem(r, host); throw fail(p.title, p.hint); }
  let data;
  try { data = JSON.parse(r.stdout); } catch (e) { throw fail('Server returned no data', 'Is ServerHoster running on port ' + port + '?'); }
  if (data && data.error) return { auth: false };
  return { auth: true, data };
}

async function fetchServices(cfg) {
  const { key, login, host, base, port } = cfg;
  const attempt = async () => {
    if (!token) token = await getToken(cfg);
    try {
      return await viaApi(base, token);
    } catch (e) {
      // The API port may be firewalled from here; ask the server itself over SSH.
      return viaSsh(key, login, host, port, token);
    }
  };
  let r = await attempt();
  if (!r.auth) { token = null; r = await attempt(); }
  if (!r.auth) throw fail('Session expired', 'Sign in to the ServerHoster dashboard again, then refresh.');
  if (!Array.isArray(r.data)) throw fail('Unexpected API response', 'The server did not return a list of services.');
  return r.data;
}

function config(raw) {
  const login = String(raw.vps_user || '').trim();
  const key = String(raw.ssh_key || '').trim().replace(/^["']|["']$/g, '');
  if (!login || !key) return null;
  if (!/^[A-Za-z0-9_.-]+@[A-Za-z0-9.:_\[\]-]+$|^[A-Za-z0-9._\[\]][A-Za-z0-9.:_\[\]-]*$/.test(login)) throw fail('Invalid SSH login', 'Use the form user@host, for example administrator@203.0.113.10.');
  const host = login.split('@').pop();
  let base = String(raw.api_url || '').trim().replace(/\/+$/, '');
  if (!base) base = 'http://' + (host.indexOf(':') > -1 && host[0] !== '[' ? '[' + host + ']' : host) + ':8787';
  let port = '8787';
  try { port = new URL(base).port || (/^https:/i.test(base) ? '443' : '80'); } catch (e) { throw fail('Invalid API URL', base); }
  return { login, key, host, base, port, user: String(raw.api_user || 'admin').trim() || 'admin', password: String(raw.api_password || ''), hideStopped: raw.hide_stopped === true };
}

// ---- rendering ---------------------------------------------------------------
function statusOf(s) {
  const st = String(s.status || '').toLowerCase();
  if (st === 'running') return { cls: 'good', rank: 1, running: true };
  if (st === 'stopped' || st === 'idle' || st === 'exited') return { cls: '', rank: 2, stopped: true };
  if (st === 'failed' || st === 'crashed' || st === 'error') return { cls: 'bad', rank: 0 };
  return { cls: 'warn', rank: 0 }; // starting, building, deploying, ...
}

function siteOf(s) {
  const list = String(s.domains || s.domain || '').split(',').map((d) => d.trim()).filter((d) => d && d.indexOf('*') < 0);
  return list[0] || '';
}

function render(services, hideStopped) {
  const items = services.map((s) => Object.assign({ st: statusOf(s), site: siteOf(s) }, s));
  const running = items.filter((s) => s.st.running).length;
  const stopped = items.filter((s) => s.st.stopped).length;
  const problems = items.length - running - stopped;
  items.sort((a, b) => a.st.rank - b.st.rank || String(a.name).localeCompare(String(b.name)));
  const shown = hideStopped ? items.filter((s) => !s.st.stopped) : items;
  const pct = items.length ? Math.round((running / items.length) * 100) : 0;
  const tone = problems ? 'bad' : running === items.length ? 'good' : 'warn';

  let h = '<div class="wg-card sv-summary"><div class="sv-sum-top"><div class="wg-big-sm">' + running + '<span> / ' + items.length + ' running</span></div>' +
    '<div class="wg-inline">' + (problems ? '<span class="wg-badge bad">' + problems + (problems > 1 ? ' issues' : ' issue') + '</span>' : '') + (stopped ? '<span class="wg-badge">' + stopped + ' stopped</span>' : '') + '</div></div>' +
    '<div class="wg-bar"><div class="wg-fill ' + tone + '" style="width:' + pct + '%"></div></div></div>';

  h += '<div class="wg-list">' + shown.map((s) => {
    const meta = s.site || (s.port ? ':' + s.port : '');
    const restarts = !s.st.running && Number(s.restart_count) > 0 ? ' · ' + s.restart_count + ' restarts' : '';
    return '<div class="wg-item sv-svc' + (s.site ? ' link no-drag' : '') + (s.st.stopped ? ' stopped' : '') + '"' + (s.site ? ' data-site="' + esc(s.site) + '"' : '') +
      ' title="' + esc(s.name + ' · ' + s.status + (s.site ? ' · ' + s.site : '')) + '">' +
      '<span class="wg-dot ' + s.st.cls + '"></span>' +
      '<div class="wg-grow"><div class="sv-name wg-truncate">' + esc(s.name) + '</div><div class="sv-meta wg-truncate">' + esc(meta + restarts) + '</div></div>' +
      '<span class="wg-badge sv-type">' + esc(s.type) + '</span></div>';
  }).join('') + '</div>';
  if (hideStopped && stopped) h += '<div class="sv-note">' + stopped + ' stopped service' + (stopped > 1 ? 's' : '') + ' hidden</div>';
  $('content').innerHTML = h;
}

function showError(e, cfg) {
  const title = e.title || 'Update failed';
  const hint = e.hint || e.message || '';
  if (lastServices) {
    $('sub').innerHTML = '<span class="sv-warn">' + esc(title) + '</span> · showing data from ' + esc(lastOk.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    return;
  }
  $('sub').textContent = cfg ? cfg.host : 'Error';
  $('content').innerHTML = '<div class="wg-empty"><div style="font-size:22px;margin-bottom:4px">🚀</div><b>' + esc(title) + '</b>' + (hint ? '<br>' + esc(hint) : '') + '</div>';
}

async function update() {
  if (busy) return;
  busy = true;
  let cfg = null;
  try {
    cfg = config(await widgeter.getAllConfig());
    if (!cfg) {
      $('sub').textContent = 'Not configured';
      $('content').innerHTML = '<div class="wg-empty">🚀<br>Enter the SSH login and key of your ServerHoster server in this widget’s settings.</div>';
      return;
    }
    if (!fs.existsSync(cfg.key)) throw fail('SSH key file not found', cfg.key);
    const services = await fetchServices(cfg);
    lastServices = services;
    lastOk = new Date();
    $('sub').textContent = cfg.host + ' · ' + lastOk.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    render(services, cfg.hideStopped);
  } catch (e) {
    showError(e, cfg);
  } finally {
    busy = false;
  }
}

$('content').addEventListener('click', (ev) => {
  const el = ev.target.closest && ev.target.closest('[data-site]');
  if (el) widgeter.openExternal('https://' + el.getAttribute('data-site'));
});
$('refresh').addEventListener('click', update);
update();
setInterval(update, 20000);
