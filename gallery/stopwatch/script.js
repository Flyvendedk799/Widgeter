(async function () {
  const precision = String((await widgeter.getConfig('sw_precision')) || 'cs');
  const saved = (await widgeter.getConfig('sw_state')) || {};

  const timeEl = document.getElementById('sw-time');
  const subEl = document.getElementById('sw-sub');
  const toggleBtn = document.getElementById('sw-toggle');
  const lapBtn = document.getElementById('sw-lap');
  const lapsEl = document.getElementById('sw-laps');

  // Wall-clock based: while running, elapsed = base + (now - startedAt), so it stays
  // right even when the interval is paused (hidden widget, PC asleep) or the widget reloads.
  let running = !!saved.running && Number(saved.startedAt) > 0;
  let startedAt = running ? Number(saved.startedAt) : 0;
  let base = Math.max(0, Number(saved.base) || 0);
  let laps = Array.isArray(saved.laps) ? saved.laps.filter((l) => l && Number.isFinite(l.time)) : []; // oldest first: { time, delta }
  let timer = null;

  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const elapsed = () => base + (running ? Date.now() - startedAt : 0);

  function fmt(ms) {
    ms = Math.max(0, Math.floor(ms));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    let out = (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
    if (precision === 'cs') out += '.' + pad(Math.floor((ms % 1000) / 10));
    else if (precision === 'ms') out += '.' + pad(ms % 1000, 3);
    return out;
  }

  function persist() {
    widgeter.setConfig('sw_state', { running, startedAt, base, laps });
  }

  function renderLaps() {
    if (!laps.length) { lapsEl.innerHTML = ''; return; }
    let best = -1;
    let worst = -1;
    if (laps.length >= 3) {
      laps.forEach((l, i) => {
        if (best < 0 || l.delta < laps[best].delta) best = i;
        if (worst < 0 || l.delta > laps[worst].delta) worst = i;
      });
    }
    lapsEl.innerHTML = laps.map((l, i) =>
      '<div class="lap' + (i === best ? ' best' : i === worst ? ' worst' : '') + '">' +
      '<span class="lap-n">Lap ' + (i + 1) + '</span><span class="lap-delta">+' + fmt(l.delta) + '</span>' +
      '<span class="lap-total">' + fmt(l.time) + '</span></div>'
    ).reverse().join('');
  }

  function renderControls() {
    toggleBtn.textContent = running ? '⏸ Pause' : (base > 0 ? '▶ Resume' : '▶ Start');
    lapBtn.disabled = !running;
    timeEl.classList.toggle('running', running);
    subEl.textContent = laps.length ? laps.length + (laps.length === 1 ? ' lap' : ' laps') : (running ? 'Running' : (base > 0 ? 'Paused' : 'Ready'));
  }

  function tick() { timeEl.textContent = fmt(elapsed()); }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(tick, precision === 's' ? 250 : 40);
  }

  toggleBtn.addEventListener('click', () => {
    if (running) {
      base = elapsed();
      running = false;
      clearInterval(timer);
    } else {
      startedAt = Date.now();
      running = true;
      startTimer();
    }
    tick(); renderControls(); persist();
  });

  lapBtn.addEventListener('click', () => {
    if (!running) return;
    const t = elapsed();
    const prev = laps.length ? laps[laps.length - 1].time : 0;
    laps.push({ time: t, delta: t - prev });
    renderLaps(); renderControls(); persist();
  });

  document.getElementById('sw-reset').addEventListener('click', () => {
    clearInterval(timer);
    running = false; startedAt = 0; base = 0; laps = [];
    tick(); renderLaps(); renderControls(); persist();
  });

  tick(); renderLaps(); renderControls();
  if (running) startTimer();
})();
