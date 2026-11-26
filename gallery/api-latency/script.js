(function () {
  'use strict';

  const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
  const MAX_HISTORY = 30;

  let targetUrl = 'https://1.1.1.1';
  let pingInterval = 5;
  let slaWarnMs = 200;
  let history = [];
  let isChecking = false;
  let intervalTimer = null;

  function getPercentile(sortedVals, p) {
    if (!sortedVals || sortedVals.length === 0) return null;
    const rank = p * (sortedVals.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    const weight = rank - lower;
    return sortedVals[lower] * (1 - weight) + sortedVals[upper] * weight;
  }

  function calculatePercentiles(samples) {
    const vals = (samples || [])
      .map((s) => (typeof s === 'object' && s !== null ? s.latency : s))
      .filter((v) => typeof v === 'number' && !isNaN(v) && v >= 0)
      .sort((a, b) => a - b);
    if (!vals.length) return { p50: null, p95: null, p99: null };
    return {
      p50: Math.round(getPercentile(vals, 0.5)),
      p95: Math.round(getPercentile(vals, 0.95)),
      p99: Math.round(getPercentile(vals, 0.99))
    };
  }

  function calculateJitter(samples) {
    const vals = (samples || [])
      .map((s) => (typeof s === 'object' && s !== null ? s.latency : s))
      .filter((v) => typeof v === 'number' && !isNaN(v) && v >= 0);
    if (vals.length < 2) return 0;
    let sumDiff = 0;
    for (let i = 1; i < vals.length; i++) {
      sumDiff += Math.abs(vals[i] - vals[i - 1]);
    }
    return Math.round(sumDiff / (vals.length - 1));
  }

  function renderSparkline(samples, width = 272, height = 36) {
    const sparkArea = $('spark-area');
    const sparkLine = $('spark-line');
    const sparkLost = $('spark-lost');
    const sparkDot = $('spark-dot');
    if (!sparkArea || !sparkLine) return;

    if (!samples.length) {
      sparkArea.setAttribute('d', '');
      sparkLine.setAttribute('d', '');
      if (sparkLost) sparkLost.innerHTML = '';
      if (sparkDot) {
        sparkDot.setAttribute('cx', '-10');
        sparkDot.setAttribute('cy', '-10');
      }
      return;
    }

    const padTop = 4;
    const padBottom = 4;
    const plotH = height - padTop - padBottom;
    const n = samples.length;
    const step = n > 1 ? width / (n - 1) : width;

    const valid = samples.filter((s) => s.latency !== null && s.latency >= 0);
    const maxLat = Math.max(10, ...valid.map((s) => s.latency));
    const minLat = 0;
    const range = Math.max(5, maxLat - minLat);

    let linePath = '';
    const areaPoints = [];
    let lostLines = '';
    let lastX = -10;
    let lastY = -10;
    let penDown = false;

    samples.forEach((s, i) => {
      const x = Number((i * step).toFixed(1));
      if (s.latency === null) {
        penDown = false;
        lostLines += `<line x1="${x}" y1="${height - 2}" x2="${x}" y2="${height - 10}"></line>`;
        return;
      }
      const ratio = Math.max(0, Math.min(1, (s.latency - minLat) / range));
      const y = Number((height - padBottom - ratio * plotH).toFixed(1));
      if (!penDown) {
        linePath += `M ${x} ${y}`;
        penDown = true;
      } else {
        linePath += ` L ${x} ${y}`;
      }
      areaPoints.push({ x, y });
      lastX = x;
      lastY = y;
    });

    sparkLine.setAttribute('d', linePath);

    if (areaPoints.length > 0) {
      const firstX = areaPoints[0].x;
      const endX = areaPoints[areaPoints.length - 1].x;
      let areaD = `M ${firstX} ${height}`;
      areaPoints.forEach((pt) => {
        areaD += ` L ${pt.x} ${pt.y}`;
      });
      areaD += ` L ${endX} ${height} Z`;
      sparkArea.setAttribute('d', areaD);
    } else {
      sparkArea.setAttribute('d', '');
    }

    if (sparkLost) sparkLost.innerHTML = lostLines;

    if (sparkDot) {
      if (lastX >= 0) {
        sparkDot.setAttribute('cx', String(lastX));
        sparkDot.setAttribute('cy', String(lastY));
        const latest = samples[samples.length - 1];
        const dotState = !latest.ok ? 'bad' : latest.latency > slaWarnMs ? 'warn' : '';
        sparkDot.setAttribute('class', 'spark-dot' + (dotState ? ' ' + dotState : ''));
        sparkLine.setAttribute('class', 'spark-line' + (dotState ? ' ' + dotState : ''));
      } else {
        sparkDot.setAttribute('cx', '-10');
        sparkDot.setAttribute('cy', '-10');
      }
    }
  }

  function updateUi(result, percentiles, jitter) {
    const beacon = $('beacon');
    const beaconDot = $('beacon-dot');
    const beaconLabel = $('beacon-label');
    const valEl = $('latency-val');
    const badgeEl = $('status-badge');
    const jitterEl = $('jitter-stat');
    const p50El = $('p50-val');
    const p95El = $('p95-val');
    const p99El = $('p99-val');

    let stateClass = 'good';
    let beaconText = 'ONLINE';
    let badgeText = '200 OK';

    if (result.status === 'OFFLINE' || result.status === 'TIMEOUT') {
      stateClass = 'bad';
      beaconText = result.status;
      badgeText = result.statusText;
    } else if (!result.ok) {
      stateClass = typeof result.status === 'number' && result.status >= 500 ? 'bad' : 'warn';
      beaconText = 'HTTP ' + result.status;
      badgeText = 'HTTP ' + result.status;
    } else if (result.latency > slaWarnMs) {
      stateClass = 'warn';
      beaconText = 'SLA WARN';
      badgeText = 'HTTP ' + result.status;
    } else {
      stateClass = 'good';
      beaconText = 'ONLINE';
      badgeText = result.status === 200 ? '200 OK' : 'HTTP ' + result.status;
    }

    if (beacon) beacon.className = 'wg-beacon ' + stateClass;
    if (beaconDot) beaconDot.className = 'wg-dot ' + stateClass + ' pulse';
    if (beaconLabel) beaconLabel.textContent = beaconText;

    if (badgeEl) {
      badgeEl.textContent = badgeText;
      badgeEl.className = 'wg-kpi-badge ' + stateClass;
    }

    if (valEl) {
      if (result.latency !== null) {
        const num = result.latency < 10 ? result.latency.toFixed(1) : Math.round(result.latency);
        valEl.innerHTML = num + ' <small class="unit">ms</small>';
      } else {
        valEl.innerHTML = '-- <small class="unit">ms</small>';
      }
    }

    if (jitterEl) {
      jitterEl.textContent = jitter !== null ? `±${jitter} ms jitter` : '±0 ms jitter';
    }

    if (p50El) p50El.textContent = percentiles.p50 !== null ? percentiles.p50 + ' ms' : '-- ms';
    if (p95El) p95El.textContent = percentiles.p95 !== null ? percentiles.p95 + ' ms' : '-- ms';
    if (p99El) p99El.textContent = percentiles.p99 !== null ? percentiles.p99 + ' ms' : '-- ms';

    renderSparkline(history);
  }

  async function ping() {
    if (isChecking) return;
    isChecking = true;

    const refreshBtn = $('refresh-btn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('spin');
    }

    const t0 = performance.now();
    let result = null;
    const timeoutMs = Math.min(10000, Math.max(1500, pingInterval * 1000 - 500));

    try {
      if (typeof widgeter !== 'undefined' && widgeter.fetch) {
        const res = await widgeter.fetch(targetUrl, {
          ttl: 0,
          timeout: timeoutMs,
          staleOnError: false,
          method: 'GET'
        });
        const elapsed = Math.round(performance.now() - t0);
        result = {
          latency: elapsed,
          ok: res.ok,
          status: res.status,
          statusText: String(res.status)
        };
      } else if (typeof fetch !== 'undefined') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(targetUrl, { signal: controller.signal });
          const elapsed = Math.round(performance.now() - t0);
          result = {
            latency: elapsed,
            ok: res.ok,
            status: res.status,
            statusText: String(res.status)
          };
        } finally {
          clearTimeout(timer);
        }
      } else {
        result = {
          latency: 25,
          ok: true,
          status: 200,
          statusText: '200 OK'
        };
      }
    } catch (err) {
      const msg = String((err && err.message) || err);
      const isTimeout = /timeout|timed[-_ ]?out|etimedout/i.test(msg);
      result = {
        latency: null,
        ok: false,
        status: isTimeout ? 'TIMEOUT' : 'OFFLINE',
        statusText: isTimeout ? 'Timeout' : 'Offline'
      };
    } finally {
      isChecking = false;
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('spin');
      }
    }

    history.push(result);
    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    const percentiles = calculatePercentiles(history);
    const jitter = calculateJitter(history);

    updateUi(result, percentiles, jitter);
  }

  async function init() {
    if (typeof widgeter !== 'undefined' && widgeter.getConfig) {
      const urlConfig = await widgeter.getConfig('target_url');
      if (urlConfig) targetUrl = String(urlConfig).trim();

      const iv = Number(await widgeter.getConfig('ping_interval'));
      if (Number.isFinite(iv) && iv >= 2 && iv <= 60) pingInterval = iv;

      const sla = Number(await widgeter.getConfig('sla_warn_ms'));
      if (Number.isFinite(sla) && sla > 0) slaWarnMs = sla;
    }

    const sub = $('endpoint-sub');
    if (sub) {
      sub.textContent = targetUrl;
      sub.title = targetUrl;
    }

    const refreshBtn = $('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        ping().catch(() => {});
      });
    }

    await ping().catch(() => {});

    if (intervalTimer) clearInterval(intervalTimer);
    intervalTimer = setInterval(() => {
      ping().catch(() => {});
    }, pingInterval * 1000);
    if (intervalTimer && typeof intervalTimer.unref === 'function') {
      intervalTimer.unref();
    }
  }

  function stop() {
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(() => {});
    });
  } else if (typeof document !== 'undefined') {
    init().catch(() => {});
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      calculatePercentiles,
      calculateJitter,
      getPercentile,
      renderSparkline,
      init,
      ping,
      stop
    };
  }
})();
