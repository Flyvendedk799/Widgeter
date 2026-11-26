(async function () {
  const TECHNIQUES = {
    '4-7-8': {
      id: '4-7-8',
      label: 'Relax (4-7-8)',
      phases: [
        { name: 'Inhale', duration: 4, action: 'inhale', guide: 'Breathe in slowly' },
        { name: 'Hold', duration: 7, action: 'hold', guide: 'Hold your breath' },
        { name: 'Exhale', duration: 8, action: 'exhale', guide: 'Release gently' }
      ]
    },
    'box': {
      id: 'box',
      label: 'Box (4-4-4-4)',
      phases: [
        { name: 'Inhale', duration: 4, action: 'inhale', guide: 'Inhale deeply' },
        { name: 'Hold', duration: 4, action: 'hold', guide: 'Hold breath' },
        { name: 'Exhale', duration: 4, action: 'exhale', guide: 'Exhale fully' },
        { name: 'Hold', duration: 4, action: 'hold', guide: 'Rest and hold' }
      ]
    },
    'energize': {
      id: 'energize',
      label: 'Awake (4-2-4-2)',
      phases: [
        { name: 'Inhale', duration: 4, action: 'inhale', guide: 'Quick deep inhale' },
        { name: 'Hold', duration: 2, action: 'hold', guide: 'Brief pause' },
        { name: 'Exhale', duration: 4, action: 'exhale', guide: 'Brisk exhale' },
        { name: 'Hold', duration: 2, action: 'hold', guide: 'Brief pause' }
      ]
    }
  };

  const CIRC = 2 * Math.PI * 56; // 351.858...

  // DOM Elements
  const patternEl = document.getElementById('zb-pattern');
  const cyclesEl = document.getElementById('zb-cycles');
  const ringWrap = document.getElementById('zb-ring-wrap');
  const haloEl = document.getElementById('zb-halo');
  const arcEl = document.getElementById('zb-arc');
  const phaseEl = document.getElementById('zb-phase');
  const timeEl = document.getElementById('zb-time');
  const guideEl = document.getElementById('zb-guide');
  const toggleBtn = document.getElementById('zb-toggle');
  const toggleIcon = document.getElementById('zb-toggle-icon');
  const toggleLbl = document.getElementById('zb-toggle-lbl');
  const resetBtn = document.getElementById('zb-reset');
  const soundBtn = document.getElementById('zb-sound');
  const soundIcon = document.getElementById('zb-sound-icon');

  // Load config & initial state
  const hasWidgeter = typeof widgeter !== 'undefined';
  let initialTech = '4-7-8';
  let soundCue = false;
  let cycleCount = 0;

  if (hasWidgeter) {
    try {
      const cfgTech = await widgeter.getConfig('technique');
      if (cfgTech && TECHNIQUES[cfgTech]) initialTech = cfgTech;
      const cfgSound = await widgeter.getConfig('sound_cue');
      if (typeof cfgSound === 'boolean') soundCue = cfgSound;
      const savedCycles = await widgeter.getConfig('zb_cycles');
      if (savedCycles && !isNaN(Number(savedCycles))) cycleCount = Math.max(0, parseInt(savedCycles, 10));
    } catch (e) {
      // Ignore config read failures
    }
  }

  let currentTechKey = initialTech;
  let phaseIdx = 0;
  let running = true;
  let phaseStartTime = Date.now();
  let pausedElapsed = 0;
  let lastActivity = Date.now();

  function onActivity() {
    lastActivity = Date.now();
  }
  window.addEventListener('mousemove', onActivity, { passive: true });
  window.addEventListener('click', onActivity, { passive: true });
  window.addEventListener('keydown', onActivity, { passive: true });

  // Web Audio chime
  let audioCtx = null;
  function chime(freq) {
    if (!soundCue) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 1.1);
    } catch (e) {
      // Audio blocked or headless environment
    }
  }

  function updateCyclesBadge() {
    cyclesEl.textContent = `${cycleCount} cycle${cycleCount === 1 ? '' : 's'}`;
  }

  function updateControls() {
    if (running) {
      toggleIcon.innerHTML = '<rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" />';
      toggleLbl.textContent = 'Pause';
    } else {
      toggleIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4" />';
      toggleLbl.textContent = 'Resume';
    }

    if (soundCue) {
      soundIcon.innerHTML = '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />';
      soundBtn.title = 'Sound cue on (click to mute)';
      soundBtn.style.color = 'var(--wg-accent)';
    } else {
      soundIcon.innerHTML = '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /><line x1="2" y1="2" x2="22" y2="22" />';
      soundBtn.title = 'Sound cue off (click to unmute)';
      soundBtn.style.color = 'var(--wg-muted)';
    }

    patternEl.textContent = TECHNIQUES[currentTechKey].label;
  }

  function setTechnique(key) {
    if (!TECHNIQUES[key]) return;
    currentTechKey = key;
    phaseIdx = 0;
    phaseStartTime = Date.now();
    pausedElapsed = 0;
    updateControls();
    if (hasWidgeter && widgeter.setConfig) {
      widgeter.setConfig('technique', key).catch(() => {});
    }
    renderPhase(0);
  }

  function cycleTechnique() {
    const keys = Object.keys(TECHNIQUES);
    const nextIdx = (keys.indexOf(currentTechKey) + 1) % keys.length;
    setTechnique(keys[nextIdx]);
  }

  function pause() {
    if (!running) return;
    running = false;
    pausedElapsed = Date.now() - phaseStartTime;
    document.body.classList.add('is-paused');
    updateControls();
    guideEl.textContent = 'Session paused';
  }

  function resume() {
    if (running) return;
    running = true;
    lastActivity = Date.now();
    phaseStartTime = Date.now() - pausedElapsed;
    document.body.classList.remove('is-paused');
    updateControls();
  }

  function toggle() {
    if (running) pause();
    else resume();
  }

  function reset() {
    phaseIdx = 0;
    pausedElapsed = 0;
    cycleCount = 0;
    phaseStartTime = Date.now();
    lastActivity = Date.now();
    updateCyclesBadge();
    if (hasWidgeter && widgeter.setConfig) {
      widgeter.setConfig('zb_cycles', 0).catch(() => {});
    }
    renderPhase(0);
    if (!running) resume();
  }

  function renderPhase(progress) {
    const tech = TECHNIQUES[currentTechKey];
    const phase = tech.phases[phaseIdx];
    const phaseDurationMs = phase.duration * 1000;
    const elapsed = running ? Date.now() - phaseStartTime : pausedElapsed;
    const remainingSec = Math.max(1, Math.ceil((phaseDurationMs - elapsed) / 1000));

    phaseEl.textContent = phase.name;
    timeEl.textContent = remainingSec + 's';
    if (running) guideEl.textContent = phase.guide;

    // A hold that follows an exhale is "lungs empty": contracted halo, empty arc.
    const prevPhase = tech.phases[(phaseIdx - 1 + tech.phases.length) % tech.phases.length];
    const holdEmpty = phase.action === 'hold' && prevPhase.action === 'exhale';

    ringWrap.classList.remove('phase-inhale', 'phase-hold', 'phase-exhale', 'phase-hold-empty');
    ringWrap.classList.add('phase-' + phase.action);
    if (holdEmpty) ringWrap.classList.add('phase-hold-empty');

    // Halo expansion / contraction
    let scale = 1.0;
    if (phase.action === 'inhale') {
      scale = 0.85 + (0.30 * progress);
    } else if (phase.action === 'exhale') {
      scale = 1.15 - (0.30 * progress);
    } else if (phase.action === 'hold') {
      scale = holdEmpty ? 0.85 : 1.15;
    }
    haloEl.style.transform = `scale(${scale.toFixed(3)})`;

    // SVG arc stroke-dashoffset
    let offset;
    if (phase.action === 'inhale') {
      offset = CIRC * (1 - progress);
    } else if (phase.action === 'exhale') {
      offset = CIRC * progress;
    } else {
      offset = holdEmpty ? CIRC : 0;
    }
    arcEl.style.strokeDashoffset = String(Math.max(0, Math.min(CIRC, offset)));
  }

  function tick() {
    if (!running) return;

    // Automatic pause when hidden or idle
    const isHidden = document.hidden || (hasWidgeter && typeof widgeter.isVisible === 'function' && !widgeter.isVisible());
    const isIdle = Date.now() - lastActivity > 300000; // 5 min idle
    if (isHidden || isIdle) {
      pause();
      return;
    }

    const tech = TECHNIQUES[currentTechKey];
    const currentPhase = tech.phases[phaseIdx];
    const phaseDurationMs = currentPhase.duration * 1000;
    const elapsed = Date.now() - phaseStartTime;

    if (elapsed >= phaseDurationMs) {
      phaseIdx++;
      if (phaseIdx >= tech.phases.length) {
        phaseIdx = 0;
        cycleCount++;
        updateCyclesBadge();
        if (hasWidgeter && widgeter.setConfig) {
          widgeter.setConfig('zb_cycles', cycleCount).catch(() => {});
        }
      }
      phaseStartTime = Date.now();
      const nextPhase = tech.phases[phaseIdx];

      if (nextPhase.action === 'inhale') chime(528);
      else if (nextPhase.action === 'hold') chime(660);
      else if (nextPhase.action === 'exhale') chime(396);

      renderPhase(0);
    } else {
      renderPhase(Math.min(1, Math.max(0, elapsed / phaseDurationMs)));
    }
  }

  // Event listeners
  ringWrap.addEventListener('click', toggle);
  toggleBtn.addEventListener('click', toggle);
  resetBtn.addEventListener('click', reset);
  patternEl.addEventListener('click', cycleTechnique);

  soundBtn.addEventListener('click', () => {
    soundCue = !soundCue;
    updateControls();
    if (soundCue) chime(528);
    if (hasWidgeter && widgeter.setConfig) {
      widgeter.setConfig('sound_cue', soundCue).catch(() => {});
    }
  });

  // Pause when visibility changes
  if (hasWidgeter && widgeter.onVisible) {
    widgeter.onVisible((visible) => {
      if (!visible) pause();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  // Initial draw
  updateCyclesBadge();
  updateControls();
  renderPhase(0);
  setInterval(tick, 60);
})();
