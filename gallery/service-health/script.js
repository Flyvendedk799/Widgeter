const net = require('net');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SLOTS = 12;      // history bars shown
const KEEP = 120;      // results kept per target
const MAX_TARGETS = 30;
const STORE = 'wg-health-history-v1';
const CODE = { down: 0, up: 1, warn: 2 };
const NAME = ['down', 'up', 'warn'];

let targets = [];
let history = loadHistory();
let results = {};      // key -> latest result
let fails = {};        // key -> consecutive failures
let alerted = {};      // key -> true once a "down" notification went out
let timeoutMs = 8000;
let notify = true;
let checking = false;
let lastRun = null;

function loadHistory() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
function saveHistory() { try { localStorage.setItem(STORE, JSON.stringify(history)); } catch (e) { /* storage unavailable */ } }

// ---- targets -------------------------------------------------------------
function parseTargets(raw) {
  const out = [];
  String(raw || '').split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line || line[0] === '#') return;
    let label = '';
    const bar = line.indexOf('|');
    if (bar > 0) { label = line.slice(0, bar).trim(); line = line.slice(bar + 1).trim(); }
    let m, t;
    if ((m = /^tcp:\/\/(\[[^\]]+\]|[^\s:/]+):(\d{1,5})$/i.exec(line))) t = { kind: 'tcp', host: m[1].replace(/^\[|\]$/g, ''), port: +m[2] };
    else if (/^https?:\/\/\S+$/i.test(line)) t = { kind: 'http', url: line };
    else if ((m = /^(\[[^\]]+\]|[^\s:/]+):(\d{1,5})$/.exec(line))) t = { kind: 'tcp', host: m[1].replace(/^\[|\]$/g, ''), port: +m[2] };
    else if (/^[^\s/]+\.[^\s/]+(\/\S*)?$/.test(line)) t = { kind: 'http', url: 'https://' + line };
    else t = { kind: 'bad', raw: line };
    if (t.kind === 'tcp' && (t.port < 1 || t.port > 65535)) t = { kind: 'bad', raw: line };
    if (t.kind === 'http') { try { new URL(t.url); } catch (e) { t = { kind: 'bad', raw: line }; } }
    t.name = label || (t.kind === 'http' ? t.url.replace(/^https?:\/\//i, '').replace(/\/$/, '') : t.kind === 'tcp' ? t.host + ':' + t.port : t.raw);
    t.key = t.kind === 'http' ? t.url : t.kind === 'tcp' ? 'tcp://' + t.host + ':' + t.port : 'bad:' + t.raw;
    out.push(t);
  });
  return out.slice(0, MAX_TARGETS);
}

// ---- checks ----------------------------------------------------------------
function withTimeout(promise, ms) {
  let timer;
  const t = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

function describeError(e) {
  const m = String((e && e.message) || e);
  if (/timeout|TIMED_OUT|ETIMEDOUT/i.test(m)) return 'Timeout';
  if (/ENOTFOUND|EAI_AGAIN|NAME_NOT_RESOLVED/i.test(m)) return 'DNS';
  if (/ECONNREFUSED|CONNECTION_REFUSED/i.test(m)) return 'Refused';
  if (/ECONNRESET|CONNECTION_RESET|CONNECTION_CLOSED/i.test(m)) return 'Reset';
  if (/CERT|SSL|TLS/i.test(m)) return 'TLS';
  if (/ADDRESS_UNREACHABLE|NETWORK_CHANGED|INTERNET_DISCONNECTED|ENETUNREACH|EHOSTUNREACH/i.test(m)) return 'Offline';
  return 'Down';
}

async function httpCheck(url) {
  const t0 = performance.now();
  try {
    let res = await withTimeout(widgeter.fetch(url, { method: 'HEAD' }), timeoutMs);
    if (res.status === 405 || res.status === 501) res = await withTimeout(widgeter.fetch(url, { method: 'GET' }), timeoutMs);
    const ms = Math.round(performance.now() - t0);
    const state = res.status < 400 ? 'up' : res.status < 500 ? 'warn' : 'down';
    return { state, ms, label: String(res.status) };
  } catch (e) {
    return { state: 'down', ms: null, label: describeError(e) };
  }
}

function tcpCheck(host, port) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const sock = new net.Socket();
    let settled = false;
    const finish = (r) => { if (settled) return; settled = true; sock.destroy(); resolve(r); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish({ state: 'up', ms: Math.round(performance.now() - t0), label: 'Open' }));
    sock.once('timeout', () => finish({ state: 'down', ms: null, label: 'Timeout' }));
    sock.once('error', (e) => finish({ state: 'down', ms: null, label: describeError(e) }));
    try { sock.connect(port, host); } catch (e) { finish({ state: 'down', ms: null, label: 'Down' }); }
  });
}

async function checkOne(t) {
  if (t.kind === 'http') return httpCheck(t.url);
  if (t.kind === 'tcp') return tcpCheck(t.host, t.port);
  return { state: 'down', ms: null, label: 'Invalid' };
}

function record(t, r) {
  if (t.kind === 'bad') return;
  results[t.key] = r;
  const h = history[t.key] || (history[t.key] = []);
  h.push([CODE[r.state], r.ms == null ? -1 : r.ms]);
  if (h.length > KEEP) h.splice(0, h.length - KEEP);

  if (r.state === 'down') {
    fails[t.key] = (fails[t.key] || 0) + 1;
    if (notify && fails[t.key] === 2 && !alerted[t.key]) {
      alerted[t.key] = true;
      widgeter.notify(t.name + ' is down', r.label + ' · ' + (t.kind === 'http' ? t.url : t.host + ':' + t.port));
    }
  } else {
    fails[t.key] = 0;
    if (alerted[t.key]) {
      alerted[t.key] = false;
      if (notify) widgeter.notify(t.name + ' is back up', r.ms != null ? r.ms + ' ms' : '');
    }
  }
}

async function runChecks() {
  if (checking || !targets.length) return;
  checking = true;
  if (lastRun) $('sub').textContent = 'Checking…';
  try {
    await Promise.all(targets.map(async (t) => { if (t.kind !== 'bad') record(t, await checkOne(t)); }));
    lastRun = new Date();
    saveHistory();
    render();
  } catch (e) {
    $('list').innerHTML = '<div class="wg-err">' + esc(e.message || e) + '</div>';
  } finally {
    checking = false;
  }
}

// ---- rendering ---------------------------------------------------------------
const LABEL = { up: 'Online', warn: 'Degraded', down: 'Offline' };

function fmtMs(ms) { return ms == null ? '' : ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s'; }

function histBars(key) {
  const h = (history[key] || []).slice(-SLOTS);
  let s = '';
  for (let i = 0; i < SLOTS - h.length; i++) s += '<i></i>';
  h.forEach((e) => { s += '<i class="' + NAME[e[0]] + '"></i>'; });
  return s;
}

function banner(real) {
  const known = real.filter((t) => results[t.key]);
  if (!known.length) return { cls: '', title: 'Checking…', sub: '' };
  const down = known.filter((t) => results[t.key].state === 'down').length;
  const warn = known.filter((t) => results[t.key].state === 'warn').length;
  const when = lastRun ? 'Updated ' + lastRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  if (down === known.length) return { cls: 'bad', title: 'Major outage', sub: 'All ' + known.length + ' services unreachable. ' + when };
  if (down) return { cls: 'warn', title: 'Partial outage', sub: down + ' of ' + known.length + ' services down. ' + when };
  if (warn) return { cls: 'warn', title: 'Degraded', sub: warn + ' of ' + known.length + ' returning errors. ' + when };
  return { cls: 'good', title: 'All systems operational', sub: known.length + ' of ' + known.length + ' services up. ' + when };
}

function render() {
  const real = targets.filter((t) => t.kind !== 'bad');
  const b = banner(real);
  $('sub').textContent = real.length + ' service' + (real.length === 1 ? '' : 's');
  const rows = targets.map((t) => {
    if (t.kind === 'bad') return '<div class="sh-row"><span class="wg-dot"></span><span class="sh-name wg-truncate" title="' + esc(t.raw) + '">' + esc(t.raw) + '</span><span class="wg-badge bad sh-badge">invalid</span></div>';
    const r = results[t.key];
    const cls = !r ? '' : r.state === 'up' ? 'good' : r.state === 'warn' ? 'warn' : 'bad';
    return '<div class="sh-row" title="' + esc(t.kind === 'http' ? t.url : t.host + ':' + t.port) + (r && r.state !== 'up' ? ' (' + esc(r.label) + ')' : '') + '">' +
      '<span class="wg-dot ' + cls + '"></span><span class="sh-name wg-truncate">' + esc(t.name) + '</span>' +
      '<span class="sh-hist">' + histBars(t.key) + '</span>' +
      '<span class="sh-ms">' + (r ? fmtMs(r.ms) : '') + '</span>' +
      '<span class="wg-badge sh-badge ' + cls + '">' + (r ? (r.state === 'up' ? LABEL.up : r.state === 'warn' ? esc(r.label) : esc(r.label === 'Down' ? LABEL.down : r.label)) : '…') + '</span></div>';
  }).join('');
  $('list').innerHTML = '<div class="wg-card sh-banner ' + b.cls + '"><span class="wg-dot ' + b.cls + ' ' + (b.cls === 'bad' ? 'pulse' : '') + '"></span>' +
    '<div class="wg-grow"><div class="sh-banner-title">' + esc(b.title) + '</div><div class="sh-banner-sub wg-truncate">' + esc(b.sub) + '</div></div></div>' +
    '<div class="sh-rows">' + rows + '</div>';
}

// ---- start -----------------------------------------------------------------
(async function init() {
  targets = parseTargets(await widgeter.getConfig('sh_services'));
  timeoutMs = Math.max(1, Number(await widgeter.getConfig('sh_timeout')) || 6) * 1000;
  notify = (await widgeter.getConfig('sh_notify')) === true;
  const every = Math.max(15, Number(await widgeter.getConfig('sh_interval')) || 60);

  $('refresh').addEventListener('click', runChecks);
  if (!targets.length) {
    $('sub').textContent = 'Not configured';
    $('list').innerHTML = '<div class="wg-empty">🩺<br>Add the services to watch in this widget’s settings<br>(“Services”, one per line).</div>';
    return;
  }
  render();
  runChecks();
  setInterval(runChecks, every * 1000);
})();
