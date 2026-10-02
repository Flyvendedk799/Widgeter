'use strict';
// Tiny fixed-window in-memory rate limiter, keyed by arbitrary strings.

function createLimiter(now) {
  const buckets = new Map();

  function sweep() {
    const t = now();
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
  }
  const timer = setInterval(sweep, 60 * 1000);
  timer.unref();

  // Returns { ok, retryAfter } (seconds). Counts the attempt either way.
  function hit(name, ip, max, windowMs) {
    const t = now();
    const key = name + '|' + ip;
    let b = buckets.get(key);
    if (!b || b.resetAt <= t) {
      if (buckets.size > 100000) sweep();
      b = { count: 0, resetAt: t + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > max) return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
    return { ok: true, retryAfter: 0 };
  }

  return { hit, stop: () => clearInterval(timer) };
}

const LIMITS = {
  auth: { max: 10, windowMs: 60 * 1000 },
  publish: { max: 20, windowMs: 60 * 60 * 1000 },
  rating: { max: 30, windowMs: 60 * 60 * 1000 },
  read: { max: 300, windowMs: 60 * 1000 }
};

module.exports = { createLimiter, LIMITS };
