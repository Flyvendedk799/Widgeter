const net = require('net');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SLOTS = 30;      // history bars shown
const KEEP = 120;      // results kept per target
const MAX_TARGETS = 30;
const STORE = 'wg-uptime-history-v1';
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
function fmtMs(ms) { return ms == null ? '–' : ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s'; }

function histBars(key) {
  const h = (history[key] || []).slice(-SLOTS);
  let s = '';
  for (let i = 0; i < SLOTS - h.length; i++) s += '<i></i>';
  h.forEach((e) => { s += '<i class="' + NAME[e[0]] + '"></i>'; });
  return s;
}

function uptimePct(key) {
  const h = history[key] || [];
  if (!h.length) return '–';
  const good = h.filter((e) => e[0] !== 0).length;
  const p = (good / h.length) * 100;
  return (p >= 99.95 ? '100' : p.toFixed(1)) + '%';
}

function render() {
  const real = targets.filter((t) => t.kind !== 'bad');
  const up = real.filter((t) => results[t.key] && results[t.key].state !== 'down').length;
  $('sub').textContent = up + '/' + real.length + ' up' + (lastRun ? ' · ' + lastRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
  $('list').innerHTML = targets.map((t) => {
    if (t.kind === 'bad') return '<div class="wg-item uc-item"><div class="uc-top"><span class="wg-dot"></span><span class="uc-name wg-truncate" title="' + esc(t.raw) + '">' + esc(t.raw) + '</span></div><div class="uc-bad-target">Not a URL or host:port</div></div>';
    const r = results[t.key];
    const cls = !r ? '' : r.state === 'up' ? 'good' : r.state === 'warn' ? 'warn' : 'bad';
    return '<div class="wg-item uc-item" title="' + esc(t.kind === 'http' ? t.url : t.host + ':' + t.port) + '">' +
      '<div class="uc-top"><span class="wg-dot ' + cls + '"></span><span class="uc-name wg-truncate">' + esc(t.name) + '</span>' +
      '<span class="uc-ms">' + (r ? fmtMs(r.ms) : '') + '</span>' +
      '<span class="wg-badge uc-code ' + cls + '">' + esc(r ? r.label : '…') + '</span></div>' +
      '<div class="uc-bottom"><div class="uc-hist">' + histBars(t.key) + '</div><span class="uc-pct" title="Uptime over the last ' + (history[t.key] || []).length + ' checks">' + uptimePct(t.key) + '</span></div></div>';
  }).join('');
}

// ---- start -----------------------------------------------------------------
(async function init() {
  targets = parseTargets(await widgeter.getConfig('uc_urls'));
  timeoutMs = Math.max(1, Number(await widgeter.getConfig('uc_timeout')) || 8) * 1000;
  notify = (await widgeter.getConfig('uc_notify')) !== false;
  const every = Math.max(15, Number(await widgeter.getConfig('uc_interval')) || 60);

  $('refresh').addEventListener('click', runChecks);
  if (!targets.length) {
    $('sub').textContent = 'Not configured';
    $('list').innerHTML = '<div class="wg-empty">🟢<br>Add the websites or services to watch in this widget’s settings<br>(“Targets”, one per line).</div>';
    return;
  }
  render();
  runChecks();
  setInterval(runChecks, every * 1000);
})();
