// Live CPU % (os.cpus() time deltas) and memory (os.totalmem/freemem).
(function () {
  const os = require('os');
  const $ = (id) => document.getElementById(id);
  const HISTORY = 60; // x 2s = 2 minutes
  const history = [];
  // No previous sample yet: the first (immediate) reading is the average since boot,
  // so the meters are filled straight away instead of after the first interval.
  let prev = null;

  const level = (v, warn, bad) => (v >= bad ? 'bad' : v >= warn ? 'warn' : '');
  const gb = (b) => { const v = b / 1073741824; return v >= 100 ? v.toFixed(0) : v.toFixed(1); };
  const fmtGB = (b) => gb(b) + ' GB';
  function fmtUp(s) {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d > 0 ? d + 'd ' + h + 'h ' + m + 'm' : h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  }

  function cpuLoad() {
    const cur = os.cpus();
    let idle = 0, total = 0;
    cur.forEach((c, i) => {
      const p = prev ? prev[i] : {}; if (!p) return;
      let t = 0, pt = 0;
      for (const k in c.times) t += c.times[k];
      for (const k in p) pt += p[k];
      total += t - pt; idle += c.times.idle - (p.idle || 0);
    });
    prev = cur.map((c) => Object.assign({}, c.times));
    return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : 0;
  }

  function drawSpark() {
    if (history.length < 2) return;
    const W = 120, H = 40, step = W / (HISTORY - 1), x0 = W - (history.length - 1) * step;
    const pts = history.map((v, i) => (x0 + i * step).toFixed(2) + ',' + (H - 1 - v / 100 * (H - 2)).toFixed(2));
    $('spark-line').setAttribute('d', 'M' + pts.join(' L'));
    $('spark-area').setAttribute('d', 'M' + pts.join(' L') + ' L' + W + ',' + H + ' L' + x0.toFixed(2) + ',' + H + ' Z');
  }

  // baseline: the immediate first reading (since-boot average) is shown but kept out of the
  // live history, so the sparkline and peak only contain real 2-second samples.
  function update(baseline) {
    const cpu = cpuLoad();
    if (!baseline) { history.push(cpu); if (history.length > HISTORY) history.shift(); }
    const total = os.totalmem(), free = os.freemem(), used = total - free, mp = used / total * 100;

    $('cpu').textContent = Math.round(cpu) + '%';
    $('cpu-bar').style.width = cpu + '%';
    $('cpu-bar').className = 'wg-fill ' + level(cpu, 50, 80);
    $('cpu-note').textContent = os.cpus().length + ' threads';
    $('mem').textContent = Math.round(mp) + '%';
    $('mem-bar').style.width = mp + '%';
    $('mem-bar').className = 'wg-fill ' + level(mp, 70, 88);
    // Unit once ("19.6 / 31.8 GB") so the note fits the half-width card without truncating.
    $('mem-note').textContent = gb(used) + ' / ' + fmtGB(total);
    $('mem-note').title = fmtGB(used) + ' used of ' + fmtGB(total);
    if (history.length) $('peak').textContent = 'peak ' + Math.round(Math.max.apply(null, history)) + '%';
    $('uptime').textContent = fmtUp(os.uptime());
    $('free').textContent = fmtGB(free);
    drawSpark();
  }

  $('host').textContent = os.hostname() + ' · ' + os.platform() + ' ' + os.arch();
  update(true);
  // First live sample after 500 ms, then one steady 2 s interval (scheduled exactly once).
  setTimeout(() => { update(); setInterval(update, 2000); }, 500);
})();
