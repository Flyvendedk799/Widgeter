'use strict';
// A small shared fetch cache for widgets. Widgets call widgeter.fetch() from many
// windows; this collapses identical requests, honours a per-call TTL, spaces out
// requests to the same host, and can serve stale data when the network fails.

function createFetchCache(fetchImpl, options = {}) {
  const maxEntries = options.maxEntries || 200;
  const maxBytes = options.maxBytes || 2 * 1024 * 1024;
  const minHostGapMs = options.minHostGapMs === undefined ? 250 : options.minHostGapMs;
  const defaultTimeoutMs = options.defaultTimeoutMs || 15000;
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

  const entries = new Map(); // key -> { at, value }
  const inflight = new Map(); // key -> Promise
  const hostNext = new Map(); // host -> earliest next start (ms)

  function keyOf(url, opts) {
    const headers = opts.headers ? JSON.stringify(Object.entries(opts.headers).sort()) : '';
    return (opts.method || 'GET') + ' ' + url + ' ' + headers + ' ' + (opts.body || '');
  }

  function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return ''; }
  }

  function trim() {
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  async function paceHost(host) {
    if (!host || !minHostGapMs) return;
    const t = now();
    const start = Math.max(t, hostNext.get(host) || 0);
    hostNext.set(host, start + minHostGapMs);
    if (start > t) await sleep(start - t);
  }

  async function run(url, opts) {
    await paceHost(hostOf(url));
    const timeoutMs = Math.min(120000, Math.max(1000, Number(opts.timeout) || defaultTimeoutMs));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    let text;
    try {
      res = await fetchImpl(url, {
        method: opts.method || 'GET',
        headers: Object.assign({ 'User-Agent': 'Widgeter' }, opts.headers || {}),
        body: opts.body,
        signal: controller.signal
      });
      text = await res.text();
    } catch (e) {
      if (controller.signal.aborted) throw new Error('Request timed out after ' + Math.round(timeoutMs / 1000) + 's');
      throw e;
    } finally {
      clearTimeout(timer);
    }
    return {
      ok: res.ok,
      status: res.status,
      headers: Object.fromEntries(res.headers ? res.headers.entries() : []),
      text: text.length > maxBytes ? text.slice(0, maxBytes) : text,
      truncated: text.length > maxBytes
    };
  }

  // opts: { ttl (seconds, default 0 = no cache), timeout (ms, default 15000), staleOnError (default true), method, headers, body }
  async function fetchCached(url, opts = {}) {
    const ttlMs = Math.max(0, Number(opts.ttl) || 0) * 1000;
    const cacheable = !opts.method || opts.method === 'GET';
    const key = keyOf(url, opts);
    const hit = entries.get(key);

    if (cacheable && ttlMs && hit && now() - hit.at < ttlMs) return Object.assign({ cached: true }, hit.value);

    if (inflight.has(key)) return inflight.get(key);
    const p = run(url, opts)
      .then((value) => {
        if (cacheable && ttlMs && value.ok) {
          entries.delete(key);
          entries.set(key, { at: now(), value });
          trim();
        }
        return value;
      })
      .catch((err) => {
        if (cacheable && opts.staleOnError !== false && hit) {
          return Object.assign({ cached: true, stale: true }, hit.value);
        }
        throw err;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return { fetch: fetchCached, clear: () => { entries.clear(); hostNext.clear(); }, size: () => entries.size };
}

module.exports = { createFetchCache };
