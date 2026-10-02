// Spectrum analyzer for the default audio input (microphone / line-in).
(function () {
  const BANDS = 24, FMIN = 40, FMAX = 16000;
  const $ = (id) => document.getElementById(id);
  const canvas = $('spec'), ctx2d = canvas.getContext('2d');
  const msg = $('msg'), stateEl = $('state'), srcEl = $('src');
  const peakEl = $('peak'), levelEl = $('level'), vuEl = $('vu');
  const DASH = '—';

  // Frequency axis labels on a log scale matching the bands.
  [100, 1000, 10000].forEach((f) => {
    const s = document.createElement('span');
    s.textContent = f >= 1000 ? (f / 1000) + 'k' : f;
    s.style.left = (Math.log(f / FMIN) / Math.log(FMAX / FMIN) * 100) + '%';
    $('axis').appendChild(s);
  });

  let audioCtx = null, analyser = null, stream = null, raf = 0, starting = false;
  let freq, wave, edges;
  const levels = new Array(BANDS).fill(0), caps = new Array(BANDS).fill(0);
  let colors = {};
  let w = 0, h = 0;

  function setState(text, cls) { stateEl.textContent = text; stateEl.className = 'wg-badge' + (cls ? ' ' + cls : ''); }

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = {
      accent: cs.getPropertyValue('--wg-accent').trim() || '#00f5d4',
      accent2: cs.getPropertyValue('--wg-accent-2').trim() || '#3a86ff',
      track: cs.getPropertyValue('--wg-surface-hover').trim() || 'rgba(255,255,255,0.1)'
    };
  }

  function fit() {
    const r = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    w = Math.max(40, Math.round(r.width)); h = Math.max(40, Math.round(r.height));
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function showMessage(title, detail) {
    msg.hidden = false;
    msg.textContent = '';
    const t = document.createElement('div');
    t.textContent = title; t.style.color = 'var(--wg-muted)'; t.style.fontWeight = '600';
    const d = document.createElement('div');
    d.textContent = detail; d.style.fontSize = '11px';
    const b = document.createElement('button');
    b.className = 'wg-btn primary sm no-drag'; b.textContent = 'Try again';
    b.onclick = start;
    msg.append(t, d, b);
  }

  function bandEdges(sampleRate, bins) {
    const hz = sampleRate / 2 / bins, out = [];
    for (let i = 0; i <= BANDS; i++) {
      const f = FMIN * Math.pow(FMAX / FMIN, i / BANDS);
      out.push(Math.min(bins, Math.max(1, Math.round(f / hz))));
    }
    return out;
  }

  function analyse() {
    analyser.getByteFrequencyData(freq);
    analyser.getFloatTimeDomainData(wave);
    for (let b = 0; b < BANDS; b++) {
      const a = edges[b], z = Math.max(edges[b + 1], a + 1);
      let max = 0;
      for (let i = a; i < z; i++) if (freq[i] > max) max = freq[i];
      const v = max / 255;
      levels[b] = v > levels[b] ? v : levels[b] * 0.86 + v * 0.14; // fast attack, slow release
      caps[b] = levels[b] > caps[b] ? levels[b] : Math.max(levels[b], caps[b] - 0.012);
    }
    let sq = 0;
    for (let i = 0; i < wave.length; i++) sq += wave[i] * wave[i];
    const rms = Math.sqrt(sq / wave.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    let maxV = 0, maxI = 0;
    for (let i = 1; i < freq.length; i++) if (freq[i] > maxV) { maxV = freq[i]; maxI = i; }
    return { db: db, peak: maxV > 60 ? maxI * audioCtx.sampleRate / analyser.fftSize : 0 };
  }

  function fmtHz(f) { return f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' kHz' : Math.round(f) + ' Hz'; }

  function draw() {
    ctx2d.clearRect(0, 0, w, h);
    const gap = 3, bw = (w - gap * (BANDS - 1)) / BANDS;
    const grad = ctx2d.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, colors.accent2 || '#3a86ff');
    grad.addColorStop(1, colors.accent || '#00f5d4');
    for (let b = 0; b < BANDS; b++) {
      const x = b * (bw + gap);
      ctx2d.fillStyle = colors.track;
      ctx2d.fillRect(x, h - 2, bw, 2);
      const bh = Math.max(0, levels[b] * (h - 6));
      if (bh > 0.5) {
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(x, h - 2 - bh, bw, bh);
        const cy = h - 2 - caps[b] * (h - 6) - 3;
        ctx2d.fillStyle = colors.accent;
        ctx2d.fillRect(x, Math.max(0, cy), bw, 2);
      }
    }
  }

  function frame() {
    raf = 0;
    if (!analyser) return;
    const m = analyse();
    draw();
    peakEl.textContent = m.peak ? fmtHz(m.peak) : DASH;
    levelEl.textContent = isFinite(m.db) && m.db > -90 ? Math.round(m.db) + ' dB' : DASH;
    const pct = isFinite(m.db) ? Math.max(0, Math.min(100, (m.db + 60) / 60 * 100)) : 0;
    vuEl.style.width = pct + '%';
    vuEl.className = 'wg-fill' + (m.db > -3 ? ' bad' : m.db > -12 ? ' warn' : '');
    if (!document.hidden) raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (audioCtx) audioCtx.close().catch(() => {});
    stream = audioCtx = analyser = null;
  }

  async function start() {
    if (starting) return;
    starting = true;
    stop();
    setState('Starting');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const err = new Error('Audio capture is not supported here.'); err.name = 'NotSupportedError'; throw err;
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.6;
      analyser.minDecibels = -90; analyser.maxDecibels = -20;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Float32Array(analyser.fftSize);
      edges = bandEdges(audioCtx.sampleRate, analyser.frequencyBinCount);
      const track = stream.getAudioTracks()[0];
      srcEl.textContent = (track && track.label) || 'Default audio input';
      msg.hidden = true;
      setState('Listening', 'good');
      if (!raf) raf = requestAnimationFrame(frame);
    } catch (e) {
      stop();
      levels.fill(0); caps.fill(0); draw();
      peakEl.textContent = levelEl.textContent = DASH;
      vuEl.style.width = '0';
      srcEl.textContent = 'Default audio input';
      const name = e && e.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('Blocked', 'warn');
        showMessage('Allow microphone access', 'Enable audio input for Widgeter in Windows privacy settings, then retry.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setState('No input', 'warn');
        showMessage('No audio input available', 'Connect a microphone or enable a line-in / Stereo Mix device.');
      } else {
        setState('Error', 'bad');
        showMessage('Could not open the audio input', (e && e.message) || String(e));
      }
    } finally { starting = false; }
  }

  function resumeLoop() { if (analyser && !raf && !document.hidden) raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', resumeLoop);
  if (window.widgeter && window.widgeter.onVisible) {
    window.widgeter.onVisible((v) => { if (v) resumeLoop(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } });
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => { if (!stream && !starting) start(); });
  }
  window.addEventListener('pagehide', stop);
  new ResizeObserver(fit).observe(canvas.parentElement);

  readColors();
  fit();
  start();
})();
