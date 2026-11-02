// Per-core CPU usage from os.cpus() time deltas, plus a load-history chart.
(function () {
  const os = require('os');
  const $ = (id) => document.getElementById(id);
  const canvas = $('cpu-canvas'), ctx = canvas.getContext('2d');
  const grid = $('core-grid');
  const HISTORY = 60;
  const history = [];
  let prev = os.cpus().map((c) => Object.assign({}, c.times));
  let fills = [], w = 0, h = 0, colors = {};

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors.accent = cs.getPropertyValue('--wg-accent').trim() || '#00f5d4';
    colors.border = cs.getPropertyValue('--wg-border').trim() || 'rgba(255,255,255,0.1)';
    colors.faint = cs.getPropertyValue('--wg-faint').trim() || '#646a80';
    colors.warn = cs.getPropertyValue('--wg-warn').trim();
    colors.bad = cs.getPropertyValue('--wg-bad').trim();
  }

  function buildCores(n) {
    grid.textContent = '';
    grid.classList.toggle('dense', n > 12);
    fills = [];
    for (let i = 0; i < n; i++) {
      const col = document.createElement('div'); col.className = 'core-col';
      const track = document.createElement('div'); track.className = 'core-track';
      const fill = document.createElement('div'); fill.className = 'core-fill'; fill.style.height = '0%';
      track.appendChild(fill);
      const tag = document.createElement('span'); tag.className = 'core-tag'; tag.textContent = i + 1;
      col.append(track, tag);
      col.title = 'Thread ' + (i + 1);
      grid.appendChild(col);
      fills.push({ fill, col });
    }
  }

  function sample() {
    const cur = os.cpus();
    const loads = cur.map((c, i) => {
      const p = prev[i]; if (!p) return 0;
      let t = 0, pt = 0;
      for (const k in c.times) t += c.times[k];
      for (const k in p) pt += p[k];
      const dt = t - pt;
      return dt > 0 ? Math.max(0, Math.min(100, 100 * (1 - (c.times.idle - p.idle) / dt))) : 0;
    });
    prev = cur.map((c) => Object.assign({}, c.times));
    return { loads, cur };
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
    ctx.beginPath();
    [0.25, 0.5, 0.75].forEach((f) => { const y = Math.round(h * f) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); });
    ctx.stroke();
    if (history.length < 2) return;
    const dx = w / (HISTORY - 1);
    const x0 = w - (history.length - 1) * dx;
    const y = (v) => h - 2 - (v / 100) * (h - 4);
    ctx.beginPath();
    history.forEach((v, i) => { const x = x0 + i * dx; if (i === 0) ctx.moveTo(x, y(v)); else ctx.lineTo(x, y(v)); });
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = colors.accent; ctx.stroke();
    ctx.lineTo(w, h); ctx.lineTo(x0, h); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    ctx.globalAlpha = 0.28; g.addColorStop(0, colors.accent); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
  }

  function fit() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    w = Math.max(20, Math.round(r.width)); h = Math.max(20, Math.round(r.height));
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function tick() {
    const { loads, cur } = sample();
    if (loads.length !== fills.length) buildCores(loads.length);
    loads.forEach((v, i) => {
      fills[i].fill.style.height = v.toFixed(0) + '%';
      fills[i].fill.className = 'core-fill' + (v > 90 ? ' bad' : v > 70 ? ' warn' : '');
      fills[i].col.title = 'Thread ' + (i + 1) + ': ' + Math.round(v) + '%';
    });
    const total = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
    history.push(total);
    if (history.length > HISTORY) history.shift();
    $('total').textContent = Math.round(total) + '%';
    $('m-peak').textContent = Math.round(Math.max.apply(null, history)) + '%';
    const mhz = cur[0] && cur[0].speed;
    $('m-clock').textContent = mhz ? (mhz / 1000).toFixed(2) + ' GHz' : '—';
    $('m-cores').textContent = String(cur.length);
    draw();
  }

  const first = os.cpus()[0];
  $('model').textContent = first ? first.model.replace(/\s+/g, ' ').trim() : 'Unknown processor';
  readColors();
  buildCores(os.cpus().length);
  new ResizeObserver(fit).observe(canvas);
  fit();
  setTimeout(tick, 400);
  setInterval(tick, 1000);
})();
