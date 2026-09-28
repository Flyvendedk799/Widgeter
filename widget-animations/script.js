/**
 * WIDGETER SHOWCASE — 52 PURPOSEFUL DESKTOP WIDGETS
 * High-performance 60FPS animation loops, simulated live data feeds,
 * canvas renderers, and interactive code inspector.
 */

// Global State
const state = {
  isSimActive: true,
  currentCategory: 'all',
  currentBlockCategory: 'all',
  searchQuery: '',
  selectedWidgetId: null,
  activeCodeTab: 'html',
  mode: 'widgets'
};

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Global Showcase Controls & Mode Switcher
  initGlobalControls();
  
  // Initialize Modular Restyling Block Library
  initBlockLibrary();
  
  // Initialize All 52 Purposeful Widgets
  initCpuHeartbeat();
  initRamFluid();
  initGpuMatrix();
  initNetworkRadar();
  initBatteryCharge();
  initDiskIo();
  initThermalProfile();
  initServerUptime();

  initVinylPlayer();
  initAudioSpectrum();
  initLyricStream();
  initAudioWaveform();
  initCassetteTape();
  initPodcastScrubber();

  initRainGlass();
  initWindStream();
  initSolarTracker();
  initAirQuality();
  initAuroraSky();
  initTideWave();
  initUvRadiation();

  initLiveTickerFlash();
  initOrderBookDepth();
  initCandlestickSpark();
  initGasTracker();
  initPortfolioBubble();
  initCurrencyConverter();
  initWhaleAlert();

  initCicdPipeline();
  initK8sPodCluster();
  initTerminalMatrix();
  initGitCommitGraph();
  initApiLatencyJitter();
  initDatabaseQueries();
  initDnsPropagation();

  initMechanicalTourbillon();
  initWorldTimezoneRing();
  initSplitFlipClock();
  initLunarPhase();
  initPomodoroBreathing();
  initIssSatelliteOrbit();

  initSmartThermostat();
  initAmbientLightOrb();
  initPowerGridMeter();
  initSmartLock();
  initCameraSecurity();
  initSoundLevelMeter();

  initTaskVelocity();
  initHabitStreakFlame();
  initDownloadHub();
  initSocialFollowerPulse();
  initAiTokenStream();

  // Initialize Advanced Widgets 53 - 77
  initQuantumTesseract();
  initJwstSpectrometer();
  initNeuralSynapse();
  initSonarWaterfall();
  initFusionTokamak();
  initBlackholeLens();
  initLigoChirp();

  initNixieClock();
  initReelToReel();
  initCymaticsPlate();

  initCryoCooler();
  initWifi7Spectrum();
  initUsbcPower();

  initDopplerRadar();
  initSeismographDrum();
  initTornadoVortex();

  initOptionsSurface();
  initMempoolWeight();
  initCommoditiesTicker();

  initDockerTopology();
  initHexDump();

  initKeyboardSwitch();
  initRetroCrt();

  initEvCluster();
  initRubiksCube();

  // Code Inspector Modal Handler
  initCodeModal();
});

/* ==========================================================================
   GLOBAL SHOWCASE CONTROLS & FILTERING
   ========================================================================== */
function initGlobalControls() {
  const searchInput = document.getElementById('widget-search');
  const clearBtn = document.getElementById('clear-search');
  const simBtn = document.getElementById('toggle-sim-btn');
  const burstBtn = document.getElementById('burst-data-btn');
  const viewBtns = document.querySelectorAll('.view-btn');
  const mainGrid = document.getElementById('main-grid');
  const blockGrid = document.getElementById('block-grid');
  const modeWidgetsBtn = document.getElementById('mode-widgets');
  const modeBlocksBtn = document.getElementById('mode-blocks');
  const widgetNav = document.getElementById('widget-nav');
  const blockNav = document.getElementById('block-nav');

  // Mode Switcher (Full Widgets vs Block Library)
  function switchMode(newMode) {
    state.mode = newMode;
    if (newMode === 'widgets') {
      modeWidgetsBtn?.classList.add('active');
      modeBlocksBtn?.classList.remove('active');
      if (mainGrid) mainGrid.style.display = 'grid';
      if (blockGrid) blockGrid.style.display = 'none';
      if (widgetNav) widgetNav.style.display = 'flex';
      if (blockNav) blockNav.style.display = 'none';
      filterWidgets();
    } else {
      modeBlocksBtn?.classList.add('active');
      modeWidgetsBtn?.classList.remove('active');
      if (mainGrid) mainGrid.style.display = 'none';
      if (blockGrid) blockGrid.style.display = 'grid';
      if (widgetNav) widgetNav.style.display = 'none';
      if (blockNav) blockNav.style.display = 'flex';
      filterBlocks();
    }
  }

  modeWidgetsBtn?.addEventListener('click', () => switchMode('widgets'));
  modeBlocksBtn?.addEventListener('click', () => switchMode('blocks'));

  // Search input filter
  searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    if (clearBtn) clearBtn.style.display = state.searchQuery ? 'block' : 'none';
    if (state.mode === 'widgets') {
      filterWidgets();
    } else {
      filterBlocks();
    }
  });

  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearBtn.style.display = 'none';
    if (state.mode === 'widgets') {
      filterWidgets();
    } else {
      filterBlocks();
    }
  });

  // Widget Category filter pills
  const widgetNavPills = widgetNav ? widgetNav.querySelectorAll('.nav-pill') : [];
  widgetNavPills.forEach(pill => {
    pill.addEventListener('click', () => {
      widgetNavPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.currentCategory = pill.dataset.cat || 'all';
      filterWidgets();
    });
  });

  // Block Category filter pills
  const blockNavPills = blockNav ? blockNav.querySelectorAll('.nav-pill') : [];
  blockNavPills.forEach(pill => {
    pill.addEventListener('click', () => {
      blockNavPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.currentBlockCategory = pill.dataset.bcat || 'all';
      filterBlocks();
    });
  });

  // Toggle Live Ticker Simulation
  simBtn?.addEventListener('click', () => {
    state.isSimActive = !state.isSimActive;
    simBtn.classList.toggle('active', state.isSimActive);
    simBtn.querySelector('.btn-text').textContent = state.isSimActive ? 'Live Ticker: Active' : 'Live Ticker: Paused';
    simBtn.querySelector('.status-indicator').style.background = state.isSimActive ? '#06d6a0' : '#ef233c';
  });

  // Burst Spike Simulation
  burstBtn?.addEventListener('click', () => {
    triggerDataSpike();
    burstBtn.style.transform = 'scale(0.94)';
    setTimeout(() => burstBtn.style.transform = '', 150);
  });

  // Grid compact / normal view
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isCompact = btn.dataset.grid === 'compact';
      mainGrid?.classList.toggle('compact', isCompact);
      blockGrid?.classList.toggle('compact', isCompact);
    });
  });
}

function filterWidgets() {
  const cards = document.querySelectorAll('.widget-card');
  cards.forEach(card => {
    const cardCat = card.dataset.cat;
    const cardTitle = card.querySelector('.w-title')?.textContent.toLowerCase() || '';
    const cardSub = card.querySelector('.w-sub')?.textContent.toLowerCase() || '';
    const cardId = card.dataset.id || '';

    const matchesCat = (state.currentCategory === 'all' || cardCat === state.currentCategory);
    const matchesSearch = !state.searchQuery || 
                          cardTitle.includes(state.searchQuery) || 
                          cardSub.includes(state.searchQuery) ||
                          cardId.includes(state.searchQuery);

    if (matchesCat && matchesSearch) {
      card.style.display = 'block';
      card.style.opacity = '1';
    } else {
      card.style.display = 'none';
      card.style.opacity = '0';
    }
  });
}

function filterBlocks() {
  const cards = document.querySelectorAll('.block-card');
  cards.forEach(card => {
    const cardCat = card.dataset.bcat;
    const cardTitle = card.querySelector('.b-title')?.textContent.toLowerCase() || '';
    const cardClass = card.querySelector('.b-class')?.textContent.toLowerCase() || '';
    const cardId = card.dataset.id || '';

    const matchesCat = (state.currentBlockCategory === 'all' || cardCat === state.currentBlockCategory);
    const matchesSearch = !state.searchQuery || 
                          cardTitle.includes(state.searchQuery) || 
                          cardClass.includes(state.searchQuery) ||
                          cardId.includes(state.searchQuery);

    if (matchesCat && matchesSearch) {
      card.style.display = 'block';
      card.style.opacity = '1';
    } else {
      card.style.display = 'none';
      card.style.opacity = '0';
    }
  });
}

function triggerDataSpike() {
  // CPU spike
  const cpuPct = document.getElementById('cpu-total-pct');
  if (cpuPct) cpuPct.textContent = '96%';
  // Crypto spike
  const btcPrice = document.getElementById('btc-live-price');
  const btcPill = document.getElementById('btc-price-pill');
  if (btcPrice && btcPill) {
    btcPrice.textContent = '71,450.00';
    btcPill.classList.add('tick-up');
    setTimeout(() => btcPill.classList.remove('tick-up'), 600);
  }
  // Audio spike
  const waveBars = document.querySelectorAll('.spec-bar');
  waveBars.forEach(b => b.style.height = `${80 + Math.random() * 20}%`);
}

/* ==========================================================================
   CATEGORY 1: SYSTEM & HARDWARE WIDGETS
   ========================================================================== */

// 1. CPU Multi-Core
function initCpuHeartbeat() {
  const canvas = document.getElementById('canvas-cpu-wave');
  const coreGrid = document.getElementById('cpu-core-grid');
  const pctEl = document.getElementById('cpu-total-pct');
  if (!canvas || !coreGrid) return;

  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 80;

  // Build 8 core bars
  coreGrid.innerHTML = '';
  const coreBars = [];
  for (let i = 1; i <= 8; i++) {
    const col = document.createElement('div');
    col.className = 'core-col';
    col.innerHTML = `
      <div class="core-bar-track">
        <div class="core-bar-fill" style="height: ${30 + Math.random() * 40}%"></div>
      </div>
      <span class="core-num-tag">C${i}</span>
    `;
    coreGrid.appendChild(col);
    coreBars.push(col.querySelector('.core-bar-fill'));
  }

  // Smooth oscilloscope wave buffer
  const history = new Array(60).fill(40);
  let step = 0;

  function render() {
    if (state.isSimActive) {
      step += 0.05;
      const targetLoad = 40 + Math.sin(step) * 25 + Math.random() * 8;
      history.shift();
      history.push(targetLoad);

      if (pctEl && Math.random() < 0.1) {
        pctEl.textContent = `${Math.round(targetLoad)}%`;
      }

      // Update core bars
      if (Math.random() < 0.15) {
        coreBars.forEach(bar => {
          bar.style.height = `${Math.min(98, Math.max(15, targetLoad + (Math.random() * 30 - 15)))}%`;
        });
      }
    }

    ctx.clearRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Draw bezier curve
    ctx.beginPath();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 2.5;

    const dx = w / (history.length - 1);
    for (let i = 0; i < history.length; i++) {
      const y = h - (history[i] / 100) * h;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * dx, y);
    }
    ctx.stroke();

    // Fill underneath
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0, 245, 212, 0.25)');
    grad.addColorStop(1, 'rgba(0, 245, 212, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    requestAnimationFrame(render);
  }
  render();
}

// 2. RAM Fluid Tank
function initRamFluid() {
  const tank = document.getElementById('ram-tank');
  const pctEl = document.getElementById('ram-pct');
  if (!tank) return;

  let basePct = 68.4;
  setInterval(() => {
    if (!state.isSimActive) return;
    basePct += (Math.random() - 0.5) * 1.2;
    basePct = Math.max(50, Math.min(88, basePct));
    if (pctEl) pctEl.textContent = `${basePct.toFixed(1)}%`;
  }, 2000);
}

// 3. GPU Matrix
function initGpuMatrix() {
  const arc = document.getElementById('gpu-load-arc');
  const num = document.getElementById('gpu-load-num');
  const rpm = document.getElementById('gpu-rpm');
  if (!arc) return;

  const circumference = 2 * Math.PI * 40; // r=40 -> 251.3
  setInterval(() => {
    if (!state.isSimActive) return;
    const val = 70 + Math.floor(Math.random() * 25);
    const offset = circumference * (1 - val / 100);
    arc.style.strokeDashoffset = offset;
    if (num) num.textContent = `${val}%`;
    if (rpm) rpm.textContent = `${(1800 + val * 6).toLocaleString()} RPM`;
  }, 2200);
}

// 4. Network Radar
function initNetworkRadar() {
  const downEl = document.getElementById('net-down');
  const upEl = document.getElementById('net-up');
  const pingEl = document.getElementById('net-ping');

  setInterval(() => {
    if (!state.isSimActive) return;
    if (downEl) downEl.innerHTML = `${(800 + Math.random() * 95).toFixed(1)} <small>Mbps</small>`;
    if (upEl) upEl.innerHTML = `${(110 + Math.random() * 15).toFixed(1)} <small>Mbps</small>`;
    if (pingEl) pingEl.innerHTML = `${Math.floor(3 + Math.random() * 4)} <small>ms</small>`;
  }, 1800);
}

// 5. Battery Charge
function initBatteryCharge() {
  const fill = document.getElementById('batt-fill-bar');
  const text = document.getElementById('batt-pct-text');
  if (!fill) return;

  let pct = 82;
  setInterval(() => {
    if (!state.isSimActive) return;
    pct = (pct >= 99) ? 80 : pct + 1;
    fill.style.width = `${pct}%`;
    if (text) text.textContent = `${pct}%`;
  }, 8000);
}

// 6. NVMe Disk I/O
function initDiskIo() {
  const speedEl = document.getElementById('disk-speed-val');
  setInterval(() => {
    if (!state.isSimActive || !speedEl) return;
    speedEl.textContent = `${(3.8 + Math.random() * 1.1).toFixed(1)} GB/s`;
  }, 1500);
}

// 7. Thermal Heatmap
function initThermalProfile() {
  const grid = document.getElementById('thermal-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const cell = document.createElement('div');
    cell.className = 'thermal-cell';
    grid.appendChild(cell);
  }

  function update() {
    if (state.isSimActive) {
      grid.querySelectorAll('.thermal-cell').forEach((cell, idx) => {
        // Higher heat near center
        const centerDist = Math.abs(idx % 6 - 2.5) + Math.abs(Math.floor(idx / 6) - 1.5);
        const heat = Math.max(0.1, 1 - centerDist * 0.25) + (Math.random() * 0.2 - 0.1);
        if (heat > 0.7) {
          cell.style.background = `rgba(255, 93, 115, ${heat})`;
        } else if (heat > 0.4) {
          cell.style.background = `rgba(255, 190, 11, ${heat})`;
        } else {
          cell.style.background = `rgba(0, 245, 212, ${heat})`;
        }
      });
    }
  }
  update();
  setInterval(update, 1200);
}

// 8. Server SLA Reliability
function initServerUptime() {
  const strip = document.getElementById('uptime-strip');
  if (!strip) return;
  strip.innerHTML = '';
  for (let i = 0; i < 45; i++) {
    const tick = document.createElement('div');
    tick.className = 'uptime-tick';
    if (i === 18 || i === 34) tick.classList.add('incident');
    strip.appendChild(tick);
  }
}

/* ==========================================================================
   CATEGORY 2: AUDIO & MEDIA WIDGETS
   ========================================================================== */

// 9. Spinning Vinyl Player
function initVinylPlayer() {
  const disc = document.getElementById('vinyl-disc');
  disc?.addEventListener('click', () => {
    disc.classList.toggle('spinning');
  });
}

// 10. 24-Band Audio Spectrum
function initAudioSpectrum() {
  const container = document.getElementById('spectrum-bars-container');
  if (!container) return;
  container.innerHTML = '';
  const bars = [];

  for (let i = 0; i < 24; i++) {
    const bar = document.createElement('div');
    bar.className = 'spec-bar';
    const peak = document.createElement('div');
    peak.className = 'spec-peak';
    bar.appendChild(peak);
    container.appendChild(bar);
    bars.push({ el: bar, peakEl: peak, height: 40, peak: 40 });
  }

  function tick() {
    if (state.isSimActive) {
      bars.forEach((b, i) => {
        // Simulated rhythmic audio beat
        const harmonic = Math.sin(Date.now() * 0.005 + i * 0.3) * 30 + 50;
        const noise = Math.random() * 20;
        const target = Math.max(8, Math.min(100, harmonic + noise));
        b.height = target;
        b.el.style.height = `${b.height}%`;

        if (b.height > b.peak) {
          b.peak = b.height;
        } else {
          b.peak = Math.max(b.height, b.peak - 1.5);
        }
        b.peakEl.style.top = `-${Math.round((b.peak - b.height) * 0.8 + 4)}px`;
      });
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// 11. Lyric Teleprompter
function initLyricStream() {
  const lines = document.querySelectorAll('.w-lyric-stream .lyric-line');
  let current = 1;
  setInterval(() => {
    if (!state.isSimActive || !lines.length) return;
    lines.forEach(l => {
      l.className = 'lyric-line future';
      l.innerHTML = l.textContent;
    });
    current = (current + 1) % lines.length;
    lines[current].className = 'lyric-line active';
    lines[current].innerHTML = `<span class="highlight-sweep">${lines[current].textContent}</span>`;
    if (current > 0) lines[current - 1].className = 'lyric-line past';
  }, 4000);
}

// 12. Stereo Oscilloscope
function initAudioWaveform() {
  const canvas = document.getElementById('canvas-oscilloscope');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 110;
  let phase = 0;

  function draw() {
    if (state.isSimActive) phase += 0.08;
    ctx.clearRect(0, 0, w, h);

    // Left channel (cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x++) {
      const y = h / 2 + Math.sin(x * 0.05 + phase) * 28 * Math.cos(x * 0.01);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Right channel (pink)
    ctx.beginPath();
    ctx.strokeStyle = '#ff006e';
    ctx.lineWidth = 1.5;
    for (let x = 0; x < w; x++) {
      const y = h / 2 + Math.sin(x * 0.045 - phase * 0.8) * 22 * Math.sin(x * 0.02);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
}

// 13. Cyber Cassette Player
function initCassetteTape() {
  // Spools animated via CSS keyframes
}

// 14. DJ Jog Wheel
function initPodcastScrubber() {
  const wheel = document.getElementById('jog-wheel');
  if (!wheel) return;
  let isDragging = false;
  let angle = 0;

  wheel.addEventListener('mousedown', () => isDragging = true);
  window.addEventListener('mouseup', () => isDragging = false);
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    angle += (e.movementX + e.movementY) * 1.5;
    wheel.style.transform = `rotate(${angle}deg)`;
  });
}

/* ==========================================================================
   CATEGORY 3: WEATHER & NATURE WIDGETS
   ========================================================================== */

// 15. Rain on Frosted Glass
function initRainGlass() {
  const canvas = document.getElementById('canvas-rain-glass');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 130;

  const drops = [];
  for (let i = 0; i < 45; i++) {
    drops.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 3 + 1,
      speed: Math.random() * 2 + 1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';

    drops.forEach(d => {
      if (state.isSimActive) {
        d.y += d.speed;
        if (d.y > h) { d.y = 0; d.x = Math.random() * w; }
      }
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 16. Wind Isobar Streamlines
function initWindStream() {
  const canvas = document.getElementById('canvas-wind-stream');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 110;

  const particles = [];
  for (let i = 0; i < 35; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 15 + Math.random() * 25,
      speed: 2 + Math.random() * 3
    });
  }

  function draw() {
    ctx.fillStyle = 'rgba(10, 15, 25, 0.25)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0, 245, 212, 0.7)';
    ctx.lineWidth = 1.5;

    particles.forEach(p => {
      if (state.isSimActive) {
        p.x += p.speed;
        p.y += Math.sin(p.x * 0.02) * 1.2;
        if (p.x > w + 40) { p.x = -40; p.y = Math.random() * h; }
      }

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.len, p.y - Math.sin(p.x * 0.02) * 3);
      ctx.stroke();
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 17. Solar Celestial Arc
function initSolarTracker() {
  const orb = document.getElementById('solar-sun-orb');
  if (!orb) return;
  let progress = 0.55;
  setInterval(() => {
    if (!state.isSimActive) return;
    progress = (progress + 0.01) % 1;
    // Map along quadratic bezier curve (M 20,85 Q 120,5 220,85)
    const t = progress;
    const x = (1 - t) * (1 - t) * 20 + 2 * (1 - t) * t * 120 + t * t * 220;
    const y = (1 - t) * (1 - t) * 85 + 2 * (1 - t) * t * 5 + t * t * 85;
    orb.setAttribute('cx', x);
    orb.setAttribute('cy', y);
  }, 1000);
}

// 18. Air Quality Index
function initAirQuality() {
  // SVG arc static with clean numbers
}

// 19. Northern Lights Aurora
function initAuroraSky() {
  const stars = document.getElementById('aurora-stars');
  if (!stars) return;
  stars.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const star = document.createElement('div');
    star.style.position = 'absolute';
    star.style.width = '2px';
    star.style.height = '2px';
    star.style.borderRadius = '50%';
    star.style.background = '#fff';
    star.style.top = `${Math.random() * 100}%`;
    star.style.left = `${Math.random() * 100}%`;
    star.style.opacity = Math.random() * 0.8 + 0.2;
    stars.appendChild(star);
  }
}

// 20. Ocean Tide & Buoy
function initTideWave() {
  // CSS sinusoidal animation
}

// 21. UV Solar Corona
function initUvRadiation() {
  // CSS burst animation
}

/* ==========================================================================
   CATEGORY 4: CRYPTO & FINANCE WIDGETS
   ========================================================================== */

// 22. Real-time Crypto Price Flasher
function initLiveTickerFlash() {
  const canvas = document.getElementById('canvas-btc-tick');
  const priceEl = document.getElementById('btc-live-price');
  const pillEl = document.getElementById('btc-price-pill');
  if (!canvas || !priceEl) return;

  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 75;

  let currentPrice = 68420.50;
  const history = new Array(40).fill(currentPrice);

  setInterval(() => {
    if (!state.isSimActive) return;
    const delta = (Math.random() - 0.48) * 85;
    currentPrice += delta;
    priceEl.textContent = currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    pillEl.classList.remove('tick-up', 'tick-down');
    void pillEl.offsetWidth; // trigger reflow
    pillEl.classList.add(delta >= 0 ? 'tick-up' : 'tick-down');

    history.shift();
    history.push(currentPrice);
  }, 1600);

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = (max - min) || 1;

    ctx.beginPath();
    ctx.strokeStyle = '#06d6a0';
    ctx.lineWidth = 2;

    const dx = w / (history.length - 1);
    history.forEach((val, i) => {
      const y = h - ((val - min) / range) * (h - 20) - 10;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * dx, y);
    });
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
}

// 23. Order Book Depth
function initOrderBookDepth() {
  const bids = document.getElementById('book-bids');
  const asks = document.getElementById('book-asks');
  if (!bids || !asks) return;

  function renderRows() {
    bids.innerHTML = '<div class="side-title">BIDS (BUY)</div>';
    asks.innerHTML = '<div class="side-title">ASKS (SELL)</div>';

    for (let i = 0; i < 4; i++) {
      const bPrice = (3420.50 - i * 0.4).toFixed(2);
      const bAmt = (1.2 + Math.random() * 3).toFixed(2);
      const bPct = Math.round(Math.random() * 80 + 20);
      bids.innerHTML += `
        <div class="book-row">
          <div class="book-bar" style="width: ${bPct}%"></div>
          <span style="color: #06d6a0">${bPrice}</span>
          <span>${bAmt}</span>
        </div>
      `;

      const aPrice = (3420.55 + i * 0.4).toFixed(2);
      const aAmt = (1.5 + Math.random() * 3).toFixed(2);
      const aPct = Math.round(Math.random() * 80 + 20);
      asks.innerHTML += `
        <div class="book-row">
          <div class="book-bar" style="width: ${aPct}%"></div>
          <span style="color: #ff5d73">${aPrice}</span>
          <span>${aAmt}</span>
        </div>
      `;
    }
  }
  renderRows();
  setInterval(() => {
    if (state.isSimActive) renderRows();
  }, 2500);
}

// 24. Dynamic Candlestick Chart
function initCandlestickSpark() {
  const canvas = document.getElementById('canvas-candlestick');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 110;

  const candles = [];
  let lastClose = 50;
  for (let i = 0; i < 20; i++) {
    const open = lastClose;
    const close = open + (Math.random() - 0.48) * 16;
    const high = Math.max(open, close) + Math.random() * 8;
    const low = Math.min(open, close) - Math.random() * 8;
    candles.push({ open, close, high, low });
    lastClose = close;
  }

  setInterval(() => {
    if (!state.isSimActive) return;
    candles.shift();
    const open = lastClose;
    const close = open + (Math.random() - 0.48) * 16;
    const high = Math.max(open, close) + Math.random() * 8;
    const low = Math.min(open, close) - Math.random() * 8;
    candles.push({ open, close, high, low });
    lastClose = close;
  }, 2000);

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...candles.map(c => c.low));
    const max = Math.max(...candles.map(c => c.high));
    const range = (max - min) || 1;

    const candleWidth = (w / candles.length) * 0.65;
    const step = w / candles.length;

    candles.forEach((c, i) => {
      const isUp = c.close >= c.open;
      ctx.strokeStyle = ctx.fillStyle = isUp ? '#06d6a0' : '#ff5d73';

      const x = i * step + step / 2;
      const yHigh = h - ((c.high - min) / range) * (h - 20) - 10;
      const yLow = h - ((c.low - min) / range) * (h - 20) - 10;
      const yOpen = h - ((c.open - min) / range) * (h - 20) - 10;
      const yClose = h - ((c.close - min) / range) * (h - 20) - 10;

      // Draw wick
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Draw body
      const top = Math.min(yOpen, yClose);
      const height = Math.max(2, Math.abs(yClose - yOpen));
      ctx.fillRect(x - candleWidth / 2, top, candleWidth, height);
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 25. Gas Fee Flame
function initGasTracker() {
  const gweiEl = document.getElementById('live-gwei-num');
  setInterval(() => {
    if (!state.isSimActive || !gweiEl) return;
    const gwei = 12 + Math.floor(Math.random() * 6);
    gweiEl.textContent = gwei;
  }, 3000);
}

// 26. Asset Allocation Bubbles (2D Physics)
function initPortfolioBubble() {
  const canvas = document.getElementById('canvas-bubbles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 120;

  const bubbles = [
    { name: 'BTC', r: 36, x: 60, y: 60, vx: 0.4, vy: 0.3, color: '#f7931a' },
    { name: 'ETH', r: 28, x: 140, y: 50, vx: -0.3, vy: 0.4, color: '#627eea' },
    { name: 'SOL', r: 20, x: 210, y: 70, vx: 0.5, vy: -0.3, color: '#14f195' },
    { name: 'USDC', r: 16, x: 260, y: 40, vx: -0.4, vy: -0.4, color: '#2775ca' }
  ];

  function draw() {
    ctx.clearRect(0, 0, w, h);

    bubbles.forEach(b => {
      if (state.isSimActive) {
        b.x += b.vx;
        b.y += b.vy;
        if (b.x - b.r < 0 || b.x + b.r > w) b.vx *= -1;
        if (b.y - b.r < 0 || b.y + b.r > h) b.vy *= -1;
      }

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.name, b.x, b.y);
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 27. FX Currency Matrix
function initCurrencyConverter() {
  const eur = document.getElementById('fx-eur');
  setInterval(() => {
    if (!state.isSimActive || !eur) return;
    eur.textContent = (1.0840 + (Math.random() - 0.5) * 0.002).toFixed(4);
  }, 2000);
}

// 28. Whale Sonar Alert
function initWhaleAlert() {
  const feed = document.getElementById('whale-feed');
  if (!feed) return;

  const sampleWhales = [
    { coin: 'BTC', amt: '1,850 BTC ($126.8M)', route: 'Binance ➔ Unknown' },
    { coin: 'ETH', amt: '25,000 ETH ($87.5M)', route: 'Unknown ➔ Coinbase' },
    { coin: 'SOL', amt: '450,000 SOL ($67.2M)', route: 'FTX Liquidator ➔ Kraken' }
  ];

  setInterval(() => {
    if (!state.isSimActive) return;
    const w = sampleWhales[Math.floor(Math.random() * sampleWhales.length)];
    const row = document.createElement('div');
    row.className = 'whale-tx-row new-tx';
    row.innerHTML = `
      <span class="tx-badge" style="background: rgba(0, 245, 212, 0.2); color: #00f5d4;">${w.coin}</span>
      <span class="tx-amt">${w.amt}</span>
      <span class="tx-route">${w.route}</span>
    `;
    feed.prepend(row);
    if (feed.children.length > 3) feed.removeChild(feed.lastChild);
    setTimeout(() => row.classList.remove('new-tx'), 1000);
  }, 6000);
}

/* ==========================================================================
   CATEGORY 5: DEVOPS & DEVELOPER WIDGETS
   ========================================================================== */

// 29. CI/CD Pipeline Pulse
function initCicdPipeline() {
  // CSS pulsing glow on active node
}

// 30. Kubernetes Hex Pod Cluster
function initK8sPodCluster() {
  const mesh = document.getElementById('k8s-pod-mesh');
  if (!mesh) return;
  mesh.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const pod = document.createElement('div');
    pod.className = 'k8s-pod pulse';
    pod.style.animationDelay = `${(i * 0.15).toFixed(2)}s`;
    pod.textContent = `p${i + 1}`;
    mesh.appendChild(pod);
  }
}

// 31. Cyber Terminal Matrix
function initTerminalMatrix() {
  const box = document.getElementById('term-box');
  if (!box) return;

  const logs = [
    '<span class="term-ts">[21:12:01]</span> <span class="term-info">INFO</span> Synced edge cache in 3.4ms',
    '<span class="term-ts">[21:12:04]</span> <span class="term-succ">SUCCESS</span> Worker pool scale +2 pods',
    '<span class="term-ts">[21:12:08]</span> <span class="term-info">INFO</span> Ingress HTTP/3 200 OK GET /api/v1/stream',
    '<span class="term-ts">[21:12:12]</span> <span class="term-warn">DEBUG</span> Garbage collector cleaned 42MB'
  ];

  setInterval(() => {
    if (!state.isSimActive) return;
    const l = logs[Math.floor(Math.random() * logs.length)];
    const div = document.createElement('div');
    div.className = 'term-line';
    div.innerHTML = l;
    box.appendChild(div);
    if (box.children.length > 5) box.removeChild(box.firstChild);
  }, 2500);
}

// 32. Git Branch Tree
function initGitCommitGraph() {
  // SVG animated branch
}

// 33. API Latency Jitter
function initApiLatencyJitter() {
  const canvas = document.getElementById('canvas-latency-jitter');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 80;

  const history = new Array(35).fill(16);

  setInterval(() => {
    if (!state.isSimActive) return;
    const isSpike = Math.random() < 0.12;
    const ms = isSpike ? (45 + Math.random() * 30) : (12 + Math.random() * 8);
    history.shift();
    history.push(ms);
  }, 500);

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = '#3a86ff';
    ctx.lineWidth = 2;

    const dx = w / (history.length - 1);
    history.forEach((val, i) => {
      const y = h - (val / 90) * h;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * dx, y);
    });
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
}

// 34. Database Query Throughput
function initDatabaseQueries() {
  // Animated via CSS
}

// 35. Global DNS Node Tracer
function initDnsPropagation() {
  // CSS pulsing circles
}

/* ==========================================================================
   CATEGORY 6: TIME & ASTRONOMY WIDGETS
   ========================================================================== */

// 36. Skeleton Tourbillon Chronometer (60 FPS Sweeping Hands)
function initMechanicalTourbillon() {
  const hourHand = document.getElementById('tourb-hour');
  const minHand = document.getElementById('tourb-min');
  const secHand = document.getElementById('tourb-sec');
  const digital = document.getElementById('tourb-digital');

  function tick() {
    const now = new Date();
    const ms = now.getMilliseconds();
    const s = now.getSeconds() + ms / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;

    if (hourHand) hourHand.style.transform = `rotate(${h * 30}deg)`;
    if (minHand) minHand.style.transform = `rotate(${m * 6}deg)`;
    if (secHand) secHand.style.transform = `rotate(${s * 6}deg)`;

    if (digital) {
      digital.textContent = now.toLocaleTimeString('en-GB');
    }

    requestAnimationFrame(tick);
  }
  tick();
}

// 37. 24h World Timezone Ring
function initWorldTimezoneRing() {
  const lon = document.getElementById('tz-lon');
  const tok = document.getElementById('tz-tok');
  const nyc = document.getElementById('tz-nyc');
  const syd = document.getElementById('tz-syd');

  function update() {
    const now = new Date();
    const fmt = (tz) => now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    try {
      if (lon) lon.textContent = fmt('Europe/London');
      if (tok) tok.textContent = fmt('Asia/Tokyo');
      if (nyc) nyc.textContent = fmt('America/New_York');
      if (syd) syd.textContent = fmt('Australia/Sydney');
    } catch { /* fallback */ }
  }
  update();
  setInterval(update, 1000);
}

// 38. Split-Flap Airport Flip Clock
function initSplitFlipClock() {
  const h1 = document.getElementById('flip-h1');
  const h2 = document.getElementById('flip-h2');
  const m1 = document.getElementById('flip-m1');
  const m2 = document.getElementById('flip-m2');
  const s1 = document.getElementById('flip-s1');
  const s2 = document.getElementById('flip-s2');

  function setTile(tile, char) {
    if (!tile) return;
    const top = tile.querySelector('.f-top');
    const bot = tile.querySelector('.f-bot');
    if (top && top.textContent !== char) {
      top.textContent = char;
      bot.textContent = char;
    }
  }

  function update() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());

    setTile(h1, hh[0]); setTile(h2, hh[1]);
    setTile(m1, mm[0]); setTile(m2, mm[1]);
    setTile(s1, ss[0]); setTile(s2, ss[1]);
  }
  update();
  setInterval(update, 1000);
}

// 39. 3D Moon Phase
function initLunarPhase() {
  // CSS spherical moon
}

// 40. Zen Meditation Breathing Ring
function initPomodoroBreathing() {
  const text = document.getElementById('zen-instruction');
  if (!text) return;
  const states = ['Inhale...', 'Hold...', 'Exhale...', 'Rest...'];
  let idx = 0;
  setInterval(() => {
    if (!state.isSimActive) return;
    idx = (idx + 1) % states.length;
    text.textContent = states[idx];
  }, 2000);
}

// 41. ISS Satellite Tracker
function initIssSatelliteOrbit() {
  const dot = document.getElementById('iss-dot-marker');
  if (!dot) return;
  let t = 0.5;
  setInterval(() => {
    if (!state.isSimActive) return;
    t = (t + 0.005) % 1;
    // Track along Q curve
    const x = 10 + t * 260;
    const y = 40 + Math.sin(t * Math.PI * 2) * 20;
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
  }, 200);
}

/* ==========================================================================
   CATEGORY 7: SMART HOME & IOT WIDGETS
   ========================================================================== */

// 42. Smart Thermostat Climate Dial
function initSmartThermostat() {
  const temp = document.getElementById('thermo-temp-display');
  const buttons = document.querySelectorAll('.w-smart-thermostat .t-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.classList.contains('eco') && temp) temp.textContent = '19.0°';
      else if (temp) temp.textContent = '22.5°';
    });
  });
}

// 43. Fluid Ambient Lighting Orb
function initAmbientLightOrb() {
  const orb = document.getElementById('ambient-orb');
  const dots = document.querySelectorAll('.hue-dot');
  if (!orb) return;

  const colorMap = {
    cyber: 'radial-gradient(circle, #00f5d4 0%, #3a86ff 70%, transparent 100%)',
    sunset: 'radial-gradient(circle, #fb5607 0%, #ffbe0b 70%, transparent 100%)',
    neon: 'radial-gradient(circle, #ff006e 0%, #8338ec 70%, transparent 100%)',
    nature: 'radial-gradient(circle, #06d6a0 0%, #00f5d4 70%, transparent 100%)',
    calm: 'radial-gradient(circle, #8338ec 0%, #3a86ff 70%, transparent 100%)'
  };

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const hue = dot.dataset.hue;
      if (colorMap[hue]) {
        orb.style.background = colorMap[hue];
      }
    });
  });
}

// 44. Solar Power Grid Balance
function initPowerGridMeter() {
  // CSS beam animations
}

// 45. Biometric Smart Lock
function initSmartLock() {
  // Laser sweep animation
}

// 46. Surveillance Security HUD
function initCameraSecurity() {
  const ts = document.getElementById('cam-timestamp');
  function update() {
    if (ts) ts.textContent = new Date().toLocaleTimeString('en-GB');
  }
  update();
  setInterval(update, 1000);
}

// 47. Acoustic Decibel VU Needle
function initSoundLevelMeter() {
  const needle = document.getElementById('vu-needle');
  const val = document.getElementById('spl-db-val');
  const redLed = document.getElementById('vu-red-led');
  if (!needle) return;

  setInterval(() => {
    if (!state.isSimActive) return;
    const db = 52 + Math.floor(Math.random() * 22);
    const deg = -25 + ((db - 40) / 45) * 50;
    needle.style.transform = `rotate(${deg}deg)`;
    if (val) val.textContent = `${db} dB`;
    if (redLed) redLed.classList.toggle('on', db > 70);
  }, 120);
}

/* ==========================================================================
   CATEGORY 8: PRODUCTIVITY & SOCIAL WIDGETS
   ========================================================================== */

// 48. Sprint Velocity Burndown
function initTaskVelocity() {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;

  taskList.addEventListener('change', (e) => {
    const row = e.target.closest('.task-row');
    if (row) {
      row.classList.toggle('done', e.target.checked);
      row.querySelector('.custom-check').textContent = e.target.checked ? '✓' : '';
    }
  });
}

// 49. Habit Streak Flame
function initHabitStreakFlame() {
  // CSS flame pulse
}

// 50. Multi-Stream Download Hub
function initDownloadHub() {
  // CSS progress bars
}

// 51. Milestone Follower Pulse
function initSocialFollowerPulse() {
  const odo = document.getElementById('odo-stars');
  setInterval(() => {
    if (!state.isSimActive || !odo) return;
    const curr = parseInt(odo.textContent.replace(',', ''));
    odo.textContent = (curr + 1).toLocaleString();
  }, 9000);
}

// 52. AI LLM Token Velocity Stream
function initAiTokenStream() {
  const canvas = document.getElementById('canvas-token-speed');
  const tps = document.getElementById('live-tps-val');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 70;

  const buffer = new Array(30).fill(80);

  setInterval(() => {
    if (!state.isSimActive) return;
    const cur = 75 + Math.random() * 22;
    buffer.shift();
    buffer.push(cur);
    if (tps) tps.textContent = cur.toFixed(1);
  }, 300);

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 2;

    const dx = w / (buffer.length - 1);
    buffer.forEach((val, i) => {
      const y = h - ((val - 60) / 50) * h;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * dx, y);
    });
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
}

/* ==========================================================================
   ADVANCED WIDGETS 53 - 77 ANIMATION ENGINES
   ========================================================================== */

// 53. Quantum 4D Tesseract (3D/4D Mathematical Canvas Projection)
function initQuantumTesseract() {
  const canvas = document.getElementById('canvas-tesseract');
  const cohEl = document.getElementById('q-coherence');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 130;

  // Generate 16 4D vertices
  const vertices = [];
  for (let i = 0; i < 16; i++) {
    vertices.push([
      (i & 1) ? 1 : -1,
      (i & 2) ? 1 : -1,
      (i & 4) ? 1 : -1,
      (i & 8) ? 1 : -1
    ]);
  }

  // 32 Edges connecting vertices that differ by 1 bit
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      let diff = i ^ j;
      if ((diff & (diff - 1)) === 0) edges.push([i, j]);
    }
  }

  let angleXY = 0, angleZW = 0;

  function draw() {
    if (state.isSimActive) {
      angleXY += 0.015;
      angleZW += 0.012;
      if (cohEl && Math.random() < 0.05) {
        cohEl.textContent = `${(99.95 + Math.random() * 0.04).toFixed(2)}%`;
      }
    }

    ctx.clearRect(0, 0, w, h);
    const projected = [];
    const scale = 38;
    const distance4D = 2.4;

    vertices.forEach(v => {
      // 4D Rotation in XW and YZ
      let x = v[0] * Math.cos(angleXY) - v[3] * Math.sin(angleXY);
      let w4 = v[0] * Math.sin(angleXY) + v[3] * Math.cos(angleXY);
      let y = v[1] * Math.cos(angleZW) - v[2] * Math.sin(angleZW);
      let z = v[1] * Math.sin(angleZW) + v[2] * Math.cos(angleZW);

      // Stereographic projection from 4D to 3D
      let factor = 1 / (distance4D - w4);
      let x3 = x * factor;
      let y3 = y * factor;

      // Project to 2D canvas
      projected.push({
        x: w / 2 + x3 * scale * 2.2,
        y: h / 2 + y3 * scale * 2.2,
        alpha: Math.max(0.2, (w4 + 1) / 2)
      });
    });

    // Draw Edges
    edges.forEach(e => {
      const p1 = projected[e[0]];
      const p2 = projected[e[1]];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = `rgba(0, 245, 212, ${(p1.alpha + p2.alpha) * 0.4})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    // Draw Vertices
    projected.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(58, 134, 255, ${p.alpha})`;
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 54. Deep-Space JWST Star Spectrometer
function initJwstSpectrometer() {
  const canvas = document.getElementById('canvas-jwst-field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 100;

  const stars = [];
  for (let i = 0; i < 40; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2 + 0.5,
      isBright: i < 3
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Draw stars
    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.isBright ? '#ffbe0b' : 'rgba(255, 255, 255, 0.7)';
      ctx.fill();

      // Iconic JWST 6-spike diffraction on bright stars
      if (s.isBright) {
        ctx.strokeStyle = 'rgba(255, 190, 11, 0.35)';
        ctx.lineWidth = 1;
        for (let a = 0; a < 6; a++) {
          const rad = (a * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + Math.cos(rad) * 16, s.y + Math.sin(rad) * 16);
          ctx.stroke();
        }
      }
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 55. AI Synaptic Neural Network
function initNeuralSynapse() {
  const canvas = document.getElementById('canvas-neural-mesh');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 110;

  const layers = [
    [{ x: 30, y: 25 }, { x: 30, y: 55 }, { x: 30, y: 85 }],
    [{ x: w / 2, y: 20 }, { x: w / 2, y: 45 }, { x: w / 2, y: 70 }, { x: w / 2, y: 95 }],
    [{ x: w - 30, y: 35 }, { x: w - 30, y: 75 }]
  ];

  const pulses = [];

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Draw synapse connections
    for (let l = 0; l < layers.length - 1; l++) {
      layers[l].forEach(n1 => {
        layers[l + 1].forEach(n2 => {
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.strokeStyle = 'rgba(131, 56, 236, 0.2)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      });
    }

    // Spawn pulses
    if (state.isSimActive && Math.random() < 0.15) {
      const fromLayer = Math.random() < 0.5 ? 0 : 1;
      const n1 = layers[fromLayer][Math.floor(Math.random() * layers[fromLayer].length)];
      const n2 = layers[fromLayer + 1][Math.floor(Math.random() * layers[fromLayer + 1].length)];
      pulses.push({ x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y, t: 0, speed: 0.04 });
    }

    // Update and draw pulses
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += p.speed;
      const curX = p.x1 + (p.x2 - p.x1) * p.t;
      const curY = p.y1 + (p.y2 - p.y1) * p.t;

      ctx.beginPath();
      ctx.arc(curX, curY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#00f5d4';
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (p.t >= 1) pulses.splice(i, 1);
    }

    // Draw nodes
    layers.forEach(layer => {
      layer.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#3a86ff';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      });
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 56. Submarine Waterfall Sonogram
function initSonarWaterfall() {
  const canvas = document.getElementById('canvas-sonar-waterfall');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 110;

  const rows = [];
  for (let y = 0; y < h; y += 4) {
    const row = [];
    for (let x = 0; x < w; x += 6) {
      row.push(Math.random() * 0.4);
    }
    rows.push(row);
  }

  setInterval(() => {
    if (!state.isSimActive) return;
    const newRow = [];
    for (let x = 0; x < w; x += 6) {
      const isTarget = x > w * 0.6 && x < w * 0.68;
      newRow.push(isTarget ? (0.7 + Math.random() * 0.3) : Math.random() * 0.35);
    }
    rows.pop();
    rows.unshift(newRow);
  }, 100);

  function draw() {
    ctx.clearRect(0, 0, w, h);
    rows.forEach((row, ry) => {
      row.forEach((val, rx) => {
        ctx.fillStyle = val > 0.6 ? `rgba(255, 93, 115, ${val})` : `rgba(0, 245, 212, ${val * 0.6})`;
        ctx.fillRect(rx * 6, ry * 4, 5, 3);
      });
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// 57. Nuclear Fusion Tokamak Chamber
function initFusionTokamak() {
  // Driven by CSS spinning torus and plasma streams
}

// 58. Black Hole Gravitational Accretion Disk
function initBlackholeLens() {
  const canvas = document.getElementById('canvas-blackhole');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 120;
  let angle = 0;

  function draw() {
    if (state.isSimActive) angle += 0.03;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;

    // Outer accretion disk (warped above and below)
    ctx.save();
    ctx.translate(cx, cy);

    // Accretion halo
    const grad = ctx.createRadialGradient(0, 0, 18, 0, 0, 52);
    grad.addColorStop(0, '#ffbe0b');
    grad.addColorStop(0.4, '#fb5607');
    grad.addColorStop(0.8, '#ff006e');
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 22, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Event Horizon (Pitch Black Sphere)
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // Photon Ring (Bright Edge)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
    requestAnimationFrame(draw);
  }
  draw();
}

// 59. LIGO Gravitational Wave Chirp
function initLigoChirp() {
  const canvas = document.getElementById('canvas-chirp-wave');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 90;
  let offset = 0;

  function draw() {
    if (state.isSimActive) offset += 0.05;
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 2;

    for (let x = 0; x < w; x++) {
      // Frequency and amplitude ramp up across width (chirp)
      const p = x / w;
      const freq = 0.02 + Math.pow(p, 2.5) * 0.35;
      const amp = Math.pow(p, 2) * (h * 0.42);
      const y = h / 2 + Math.sin(x * freq - offset * (1 + p * 2)) * amp;

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
}

// 60. Vintage Nixie Tube Vacuum Clock
function initNixieClock() {
  function update() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());

    const setFilament = (id, char) => {
      const el = document.getElementById(id);
      const fil = el?.querySelector('.nx-filament');
      if (fil && fil.textContent !== char) fil.textContent = char;
    };

    setFilament('nx-h1', hh[0]); setFilament('nx-h2', hh[1]);
    setFilament('nx-m1', mm[0]); setFilament('nx-m2', mm[1]);
    setFilament('nx-s1', ss[0]); setFilament('nx-s2', ss[1]);
  }
  update();
  setInterval(update, 1000);
}

// 61. Analog Reel-to-Reel Studio Deck
function initReelToReel() {
  // Driven by CSS spinning reel flanges
}

// 62. Chladni Cymatics Acoustic Resonance Plate
function initCymaticsPlate() {
  const canvas = document.getElementById('canvas-cymatics');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 120;

  // 150 Sand particles settling into modal curves
  const grains = [];
  for (let i = 0; i < 180; i++) {
    grains.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffbe0b';

    grains.forEach(g => {
      if (state.isSimActive) {
        // Nodal sand equation pull
        const nx = (g.x / w) * Math.PI * 4;
        const ny = (g.y / h) * Math.PI * 4;
        const force = Math.cos(nx) * Math.cos(ny * 1.5) - Math.cos(nx * 1.5) * Math.cos(ny);
        g.vx += force * 0.1;
        g.vy += force * 0.1;
        g.x += g.vx;
        g.y += g.vy;
        g.vx *= 0.92;
        g.vy *= 0.92;

        if (g.x < 0) g.x = w; if (g.x > w) g.x = 0;
        if (g.y < 0) g.y = h; if (g.y > h) g.y = 0;
      }

      ctx.fillRect(g.x, g.y, 2, 2);
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 63. Cryogenic Liquid Nitrogen Cooler
function initCryoCooler() {
  const degEl = document.getElementById('cryo-degrees');
  setInterval(() => {
    if (!state.isSimActive || !degEl) return;
    degEl.textContent = `${(-195.8 + (Math.random() - 0.5) * 0.4).toFixed(1)}°C`;
  }, 1400);
}

// 64. Wi-Fi 7 Multi-Link Spectral Waterfall
function initWifi7Spectrum() {
  const canvas = document.getElementById('canvas-wifi-spectrum');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 90;
  let t = 0;

  function draw() {
    if (state.isSimActive) t += 0.04;
    ctx.clearRect(0, 0, w, h);

    // Draw 320MHz spectrum bell curves
    ctx.beginPath();
    ctx.strokeStyle = '#06d6a0';
    ctx.lineWidth = 2;

    for (let x = 0; x < w; x++) {
      const bell1 = Math.exp(-Math.pow((x - w * 0.3) / 25, 2)) * 50;
      const bell2 = Math.exp(-Math.pow((x - w * 0.7) / 45, 2)) * 65;
      const noise = Math.sin(x * 0.2 + t) * 4;
      const y = h - (bell1 + bell2 + noise + 10);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
}

// 65. USB-C 240W EPR Power Negotiator
function initUsbcPower() {
  const vEl = document.getElementById('pd-volts');
  const aEl = document.getElementById('pd-amps');
  const wEl = document.getElementById('pd-watts');

  setInterval(() => {
    if (!state.isSimActive) return;
    const v = 47.8 + Math.random() * 0.2;
    const a = 4.9 + Math.random() * 0.08;
    if (vEl) vEl.innerHTML = `${v.toFixed(2)} <small>V</small>`;
    if (aEl) aEl.innerHTML = `${a.toFixed(2)} <small>A</small>`;
    if (wEl) wEl.innerHTML = `${(v * a).toFixed(1)} <small>W</small>`;
  }, 1200);
}

// 66. Doppler Meteorology Radar Velocity Scan
function initDopplerRadar() {
  const canvas = document.getElementById('canvas-doppler');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let size = canvas.width = canvas.height = 120;
  let angle = 0;

  function draw() {
    if (state.isSimActive) angle += 0.04;
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2;

    // Simulated storm cell
    ctx.beginPath();
    ctx.arc(cx + 18, cy - 12, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 35, 60, 0.75)'; // High dBZ red core
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + 14, cy - 10, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 190, 11, 0.4)'; // Yellow periphery
    ctx.fill();

    // Rotating Radar Sweep Beam
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, size / 2, 0, 0.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 245, 212, 0.3)';
    ctx.fill();

    ctx.restore();

    requestAnimationFrame(draw);
  }
  draw();
}

// 67. Seismograph Richter Wave Drum
function initSeismographDrum() {
  const canvas = document.getElementById('canvas-seismograph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 85;

  const points = new Array(50).fill(h / 2);

  setInterval(() => {
    if (!state.isSimActive) return;
    const isTremor = Math.random() < 0.08;
    const val = h / 2 + (isTremor ? (Math.random() - 0.5) * 45 : (Math.random() - 0.5) * 4);
    points.shift();
    points.push(val);
  }, 100);

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = '#06d6a0';
    ctx.lineWidth = 1.8;

    const dx = w / (points.length - 1);
    points.forEach((y, i) => {
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * dx, y);
    });
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
}

// 68. Tornado Rotational Vorticity Cone
function initTornadoVortex() {
  // Driven by CSS wobble and spinning debris ring
}

// 69. Options Volatility Smile
function initOptionsSurface() {
  const canvas = document.getElementById('canvas-iv-smile');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 90;

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = '#3a86ff';
    ctx.lineWidth = 2.5;

    // Parabolic volatility smile curve
    for (let x = 0; x < w; x++) {
      const norm = (x - w / 2) / (w / 2);
      const iv = Math.pow(norm, 2) * 40 + 20;
      const y = h - (iv / 70) * (h - 20) - 10;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // At the money (ATM) mark
    ctx.fillStyle = '#ff006e';
    ctx.beginPath();
    ctx.arc(w / 2, h - (20 / 70) * (h - 20) - 10, 4, 0, Math.PI * 2);
    ctx.fill();

    requestAnimationFrame(draw);
  }
  draw();
}

// 70. Bitcoin Mempool Queue
function initMempoolWeight() {
  // Driven by clean CSS blocks
}

// 71. Commodities Spot
function initCommoditiesTicker() {
  const gold = document.getElementById('comm-gold');
  setInterval(() => {
    if (!state.isSimActive || !gold) return;
    gold.textContent = `$${(2380 + Math.random() * 8).toFixed(2)}`;
  }, 2400);
}

// 72. Docker Microservices Topology
function initDockerTopology() {
  const canvas = document.getElementById('canvas-docker-topology');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 110;

  const nodes = [
    { name: 'Gateway', x: 40, y: 55, color: '#00f5d4' },
    { name: 'Auth', x: w * 0.45, y: 25, color: '#3a86ff' },
    { name: 'Postgres', x: w * 0.45, y: 85, color: '#8338ec' },
    { name: 'Redis', x: w - 40, y: 55, color: '#ff006e' }
  ];

  const packet = { from: 0, to: 1, t: 0 };

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Draw lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y); ctx.lineTo(nodes[1].x, nodes[1].y);
    ctx.moveTo(nodes[0].x, nodes[0].y); ctx.lineTo(nodes[2].x, nodes[2].y);
    ctx.moveTo(nodes[1].x, nodes[1].y); ctx.lineTo(nodes[3].x, nodes[3].y);
    ctx.stroke();

    // Packet
    if (state.isSimActive) {
      packet.t += 0.04;
      if (packet.t >= 1) {
        packet.t = 0;
        packet.from = Math.floor(Math.random() * 2);
        packet.to = packet.from === 0 ? (Math.random() < 0.5 ? 1 : 2) : 3;
      }
    }

    const n1 = nodes[packet.from];
    const n2 = nodes[packet.to];
    const px = n1.x + (n2.x - n1.x) * packet.t;
    const py = n1.y + (n2.y - n1.y) * packet.t;

    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#06d6a0';
    ctx.fill();

    // Draw node circles
    nodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// 73. Hex Dump Memory Inspector
function initHexDump() {
  const table = document.getElementById('hex-table');
  if (!table) return;

  function renderHex() {
    table.innerHTML = '';
    for (let r = 0; r < 4; r++) {
      const addr = `0x7FFE${(4200 + r * 16).toString(16).toUpperCase()}`;
      let bytes = '';
      let ascii = '';
      for (let b = 0; b < 8; b++) {
        const val = Math.floor(Math.random() * 256);
        bytes += val.toString(16).padStart(2, '0').toUpperCase() + ' ';
        ascii += (val >= 65 && val <= 122) ? String.fromCharCode(val) : '.';
      }
      table.innerHTML += `
        <div class="hex-row">
          <span class="hex-addr">${addr}</span>
          <span class="hex-bytes">${bytes}</span>
          <span class="hex-ascii">${ascii}</span>
        </div>
      `;
    }
  }
  renderHex();
  setInterval(() => {
    if (state.isSimActive) renderHex();
  }, 1800);
}

// 74. Mechanical Keyboard Switch Curve
function initKeyboardSwitch() {
  const canvas = document.getElementById('canvas-switch-curve');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.parentElement.clientWidth;
  let h = canvas.height = 90;
  let travel = 0;

  function draw() {
    if (state.isSimActive) travel = (travel + 0.02) % 1;
    ctx.clearRect(0, 0, w, h);

    // Tactile bump force curve
    ctx.beginPath();
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = 2.5;

    for (let x = 0; x < w; x++) {
      const p = x / w;
      // Tactile bump at p = 0.45
      const bump = Math.exp(-Math.pow((p - 0.45) / 0.15, 2)) * 32;
      const linear = p * 30;
      const y = h - (bump + linear + 15);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Actuation point ball indicator
    const curX = travel * w;
    const p = travel;
    const curBump = Math.exp(-Math.pow((p - 0.45) / 0.15, 2)) * 32;
    const curY = h - (curBump + p * 30 + 15);

    ctx.beginPath();
    ctx.arc(curX, curY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff006e';
    ctx.shadowColor = '#ff006e';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    requestAnimationFrame(draw);
  }
  draw();
}

// 75. Retro Cyber Phosphor CRT
function initRetroCrt() {
  // Driven by CSS CRT scanline layers and jumping sprite
}

// 76. EV Hypercar Digital Cockpit
function initEvCluster() {
  const spd = document.getElementById('ev-speed-val');
  const bar = document.getElementById('ev-power-bar');

  let curSpd = 128;
  setInterval(() => {
    if (!state.isSimActive) return;
    curSpd = 120 + Math.floor(Math.sin(Date.now() * 0.002) * 25);
    if (spd) spd.textContent = curSpd;
    if (bar) bar.style.width = `${Math.min(95, curSpd * 0.65)}%`;
  }, 600);
}

// 77. Interactive 3D Rubik's Cube Solver
function initRubiksCube() {
  // Driven by 3D CSS isometric rotation
}

/* ==========================================================================
   CODE INSPECTOR MODAL IMPLEMENTATION
   ========================================================================== */
function initCodeModal() {
  const modal = document.getElementById('code-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  const copyBtn = document.getElementById('copy-code-btn');
  const copyText = document.getElementById('copy-btn-text');
  const titleEl = document.getElementById('modal-title');
  const subEl = document.getElementById('modal-sub');
  const iconEl = document.getElementById('modal-icon');
  const codeEl = document.getElementById('modal-code-snippet');
  const tabs = document.querySelectorAll('.m-tab');

  // Open modal on clicking any widget's </> button
  document.querySelectorAll('.widget-card').forEach(card => {
    const btn = card.querySelector('.code-btn');
    const id = card.dataset.id;
    const title = card.querySelector('.w-title')?.textContent || 'Widget';
    const sub = card.querySelector('.w-sub')?.textContent || '';
    const icon = card.querySelector('.w-icon')?.textContent || '⚙️';
    const content = card.querySelector('.widget-content');

    btn?.addEventListener('click', () => {
      state.selectedWidgetId = id;
      if (titleEl) titleEl.textContent = `${title} Source Code`;
      if (subEl) subEl.textContent = sub;
      if (iconEl) iconEl.textContent = icon;

      updateModalCodeSnippet(content?.outerHTML || '');
      modal?.classList.add('open');
    });
  });

  closeBtn?.addEventListener('click', () => modal?.classList.remove('open'));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  // Tab switching (HTML / CSS / JS)
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeCodeTab = tab.dataset.tab;
      const card = document.querySelector(`[data-id="${state.selectedWidgetId}"]`);
      const content = card?.querySelector('.widget-content');
      updateModalCodeSnippet(content?.outerHTML || '');
    });
  });

  // Copy button
  copyBtn?.addEventListener('click', () => {
    if (codeEl) {
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        if (copyText) copyText.textContent = 'Copied! ✓';
        setTimeout(() => { if (copyText) copyText.textContent = 'Copy Code'; }, 2000);
      });
    }
  });

  function updateModalCodeSnippet(htmlMarkup) {
    if (!codeEl) return;
    const wid = state.selectedWidgetId;

    if (state.activeCodeTab === 'html') {
      codeEl.textContent = htmlMarkup.trim();
    } else if (state.activeCodeTab === 'css') {
      codeEl.textContent = `/* CSS for ${wid} (From styles.css) */\n.widget-shell {\n  background: rgba(18, 21, 34, 0.72);\n  backdrop-filter: blur(24px);\n  border-radius: 22px;\n  border: 1px solid rgba(255, 255, 255, 0.08);\n}\n\n/* Refer to styles.css for full class rules */`;
    } else {
      codeEl.textContent = `// Widgeter JS snippet for ${wid}\n// Place inside widget.js or your Electron renderer script\nconsole.log("Widget initialized: ${wid}");`;
    }
  }
}

/* ==========================================================================
   MODULAR BLOCK LIBRARY INTERACTION & CLIPBOARD HANDLERS
   ========================================================================== */

const BLOCK_CSS_SNIPPETS = {
  'wb-glow-btn': `.wb-btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  width: 100%;
}
.wb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.wb-btn:active { transform: scale(0.96); }
.wb-btn-icon {
  font-size: 0.9rem;
  animation: wb-icon-pulse 1.8s infinite alternate ease-in-out;
}
@keyframes wb-icon-pulse {
  0% { transform: scale(1); filter: drop-shadow(0 0 0 transparent); }
  100% { transform: scale(1.22); filter: drop-shadow(0 0 6px var(--cyan)); }
}
.wb-btn-primary {
  background: linear-gradient(135deg, rgba(0, 245, 212, 0.2), rgba(58, 134, 255, 0.2));
  border-color: var(--cyan);
  color: var(--cyan);
  box-shadow: 0 0 12px rgba(0, 245, 212, 0.2);
  position: relative;
  overflow: hidden;
}
.wb-btn-primary::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -150%;
  width: 80%;
  height: 200%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  transform: rotate(25deg);
  animation: wb-btn-sweep 3.2s infinite ease-in-out;
}
@keyframes wb-btn-sweep {
  0%, 15% { left: -150%; }
  50%, 100% { left: 200%; }
}
.wb-btn-primary:hover {
  background: linear-gradient(135deg, rgba(0, 245, 212, 0.35), rgba(58, 134, 255, 0.35));
  box-shadow: 0 0 20px rgba(0, 245, 212, 0.5);
}
.wb-btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  color: var(--text-main);
  transition: all 0.2s ease;
}
.wb-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
}
.wb-btn-danger {
  background: rgba(255, 0, 110, 0.15);
  border-color: var(--coral);
  color: var(--coral);
  animation: wb-btn-danger-breathe 2.4s infinite alternate ease-in-out;
}
@keyframes wb-btn-danger-breathe {
  0% { box-shadow: 0 0 4px rgba(255, 0, 110, 0.2); border-color: rgba(255, 0, 110, 0.4); }
  100% { box-shadow: 0 0 14px rgba(255, 0, 110, 0.5); border-color: var(--coral); }
}`,

  'wb-segmented-tabs': `.wb-segmented {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.4);
  padding: 3px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.wb-seg-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}
.wb-seg-btn:hover { color: var(--text-main); }
.wb-seg-btn.active {
  background: rgba(0, 245, 212, 0.18);
  color: var(--cyan);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 12px rgba(0, 245, 212, 0.3);
  animation: wb-seg-glow 2s infinite alternate ease-in-out;
}
@keyframes wb-seg-glow {
  0% { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 8px rgba(0, 245, 212, 0.25); }
  100% { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 16px rgba(0, 245, 212, 0.6); }
}`,

  'wb-toggle-switch': `.wb-toggle-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.wb-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
}
.wb-toggle input { display: none; }
.wb-toggle-track {
  width: 40px;
  height: 22px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  position: relative;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  flex-shrink: 0;
}
.wb-toggle-thumb {
  width: 16px;
  height: 16px;
  background: var(--text-dim);
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.wb-toggle input:checked + .wb-toggle-track {
  background: rgba(0, 245, 212, 0.2);
  border-color: var(--cyan);
  animation: wb-toggle-pulse 2s infinite ease-in-out;
}
@keyframes wb-toggle-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(0, 245, 212, 0.35); border-color: rgba(0, 245, 212, 0.5); }
  50% { box-shadow: 0 0 16px rgba(0, 245, 212, 0.7); border-color: var(--cyan); }
}
.wb-toggle input:checked + .wb-toggle-track .wb-toggle-thumb {
  transform: translateX(18px);
  background: var(--cyan);
  box-shadow: 0 0 10px var(--cyan);
  animation: wb-thumb-breathe 1.5s infinite alternate ease-in-out;
}
@keyframes wb-thumb-breathe {
  0% { box-shadow: 0 0 6px var(--cyan); }
  100% { box-shadow: 0 0 14px var(--cyan); }
}
.wb-toggle-lbl {
  font-size: 0.82rem;
  color: var(--text-main);
  font-weight: 500;
}`,

  'wb-floating-dropdown': `.wb-dropdown {
  position: relative;
  width: 100%;
  max-width: 260px;
}
.wb-dropdown-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: rgba(18, 21, 34, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  animation: wb-dd-breathe 3.5s infinite alternate ease-in-out;
}
@keyframes wb-dd-breathe {
  0% { border-color: rgba(255, 255, 255, 0.12); box-shadow: 0 0 0 transparent; }
  100% { border-color: rgba(0, 245, 212, 0.35); box-shadow: 0 0 12px rgba(0, 245, 212, 0.15); }
}
.wb-dd-val {
  display: inline-flex;
  align-items: center;
}
.wb-dd-arrow {
  color: var(--cyan);
  font-size: 0.75rem;
  transition: transform 0.2s ease;
  animation: wb-caret-bob 1.8s infinite ease-in-out;
}
@keyframes wb-caret-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(2px); }
}
.wb-dropdown.open .wb-dd-arrow { transform: rotate(180deg); animation: none; }
.wb-dropdown-menu {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: rgba(18, 21, 34, 0.95);
  border: 1px solid rgba(0, 245, 212, 0.3);
  border-radius: 8px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.6);
  z-index: 50;
  overflow: hidden;
}
.wb-dropdown.open .wb-dropdown-menu { display: block; }
.wb-dd-opt {
  padding: 8px 14px;
  font-size: 0.8rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
}
.wb-dd-opt:hover {
  background: rgba(0, 245, 212, 0.12);
  color: var(--cyan);
}
.wb-dd-opt.active {
  color: var(--cyan);
  background: rgba(0, 245, 212, 0.18);
  font-weight: 700;
}`,

  'wb-glowing-slider': `.wb-slider-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wb-slider-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.wb-slider-header strong {
  color: var(--cyan);
  font-family: var(--font-mono);
  text-shadow: 0 0 8px rgba(0, 245, 212, 0.4);
}
.wb-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--cyan) 0%, rgba(0, 245, 212, 0.3) 75%, rgba(255, 255, 255, 0.1) 100%);
  outline: none;
  cursor: pointer;
  position: relative;
}
.wb-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--cyan);
  border: 2px solid #0c0f1d;
  box-shadow: 0 0 12px var(--cyan);
  cursor: grab;
  transition: transform 0.15s ease;
  animation: wb-thumb-halo 2s infinite ease-in-out;
}
@keyframes wb-thumb-halo {
  0%, 100% { box-shadow: 0 0 8px var(--cyan), 0 0 0 0 rgba(0, 245, 212, 0.4); }
  50% { box-shadow: 0 0 18px var(--cyan), 0 0 0 6px rgba(0, 245, 212, 0); }
}
.wb-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }`,

  'wb-micro-actions': `.wb-action-bar {
  display: flex;
  gap: 6px;
  background: rgba(0, 0, 0, 0.35);
  padding: 4px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.wb-icon-btn {
  background: transparent;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s ease;
}
.wb-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
  transform: translateY(-1px);
}
.wb-icon-btn.active {
  background: rgba(0, 245, 212, 0.16);
  color: var(--cyan);
}
.wb-pin-pulse {
  animation: wb-pin-pulse 2s infinite ease-in-out;
}
@keyframes wb-pin-pulse {
  0%, 100% { transform: rotate(0deg) scale(1); filter: drop-shadow(0 0 2px transparent); }
  50% { transform: rotate(-8deg) scale(1.15); filter: drop-shadow(0 0 6px var(--cyan)); }
}
.wb-spin-icon {
  animation: wb-spin-smooth 5s linear infinite;
  display: inline-block;
}
@keyframes wb-spin-smooth {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.wb-icon-btn.danger:hover {
  background: rgba(255, 0, 110, 0.2);
  color: var(--coral);
}
.wb-ic { font-size: 0.95rem; }`,

  'wb-stepper-counter': `.wb-stepper {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: rgba(18, 21, 34, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 4px 10px;
  border-radius: 8px;
}
.wb-step-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-main);
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-weight: 700;
  transition: all 0.15s ease;
  animation: wb-step-btn-glow 3s infinite alternate ease-in-out;
}
@keyframes wb-step-btn-glow {
  0% { border-color: rgba(255, 255, 255, 0.1); }
  100% { border-color: rgba(0, 245, 212, 0.3); }
}
.wb-step-btn:hover {
  background: rgba(0, 245, 212, 0.18);
  border-color: var(--cyan);
  color: var(--cyan);
}
.wb-step-val {
  font-family: var(--font-mono);
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--cyan);
  min-width: 24px;
  text-align: center;
  text-shadow: 0 0 10px rgba(0, 245, 212, 0.5);
  animation: wb-step-breathe 2s infinite alternate ease-in-out;
}
@keyframes wb-step-breathe {
  0% { text-shadow: 0 0 6px rgba(0, 245, 212, 0.3); }
  100% { text-shadow: 0 0 14px rgba(0, 245, 212, 0.8); }
}
.wb-step-unit {
  font-size: 0.76rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}`,

  'wb-rotary-knob': `.wb-knob-wrap {
  display: flex;
  align-items: center;
  gap: 16px;
}
.wb-knob {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #2a3148, #0e1220 70%);
  border: 2px solid rgba(0, 245, 212, 0.4);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.2);
  position: relative;
  cursor: pointer;
  transition: border-color 0.2s ease;
  transform: rotate(45deg);
  animation: wb-knob-glow 3s infinite alternate ease-in-out;
}
@keyframes wb-knob-glow {
  0% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6), 0 0 0 rgba(0, 245, 212, 0); }
  100% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6), 0 0 14px rgba(0, 245, 212, 0.35); }
}
.wb-knob-notch {
  width: 3px;
  height: 12px;
  background: var(--cyan);
  border-radius: 2px;
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 0 0 8px var(--cyan);
  animation: wb-notch-glow 1.5s infinite alternate ease-in-out;
}
@keyframes wb-notch-glow {
  0% { box-shadow: 0 0 4px var(--cyan); }
  100% { box-shadow: 0 0 12px var(--cyan); }
}
.wb-knob-meta {
  display: flex;
  flex-direction: column;
}
.wb-knob-val {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--cyan);
  text-shadow: 0 0 8px rgba(0, 245, 212, 0.4);
}
.wb-knob-lbl {
  font-size: 0.72rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}`,

  'wb-glass-well': `.wb-well {
  width: 100%;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
  border-radius: 10px;
  padding: 12px 14px;
}
.wb-well-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.wb-well-title {
  display: block;
  font-size: 0.68rem;
  font-family: var(--font-mono);
  color: var(--text-dim);
  letter-spacing: 1px;
}
.wb-well-content {
  font-size: 0.84rem;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wb-well-content strong { color: var(--text-main); }
.wb-well-meter {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}
.wb-well-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--blue), var(--cyan));
  box-shadow: 0 0 8px rgba(0, 245, 212, 0.5);
  transition: width 0.4s ease;
  animation: wb-bar-sweep 2.5s infinite linear;
}
@keyframes wb-bar-sweep {
  0% { filter: brightness(0.9); }
  50% { filter: brightness(1.3); }
  100% { filter: brightness(0.9); }
}`,

  'wb-kpi-block': `.wb-kpi-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wb-kpi-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-dim);
}
.wb-kpi-num {
  font-family: var(--font-mono);
  font-size: 1.85rem;
  font-weight: 800;
  color: var(--text-main);
  line-height: 1;
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.1);
  animation: wb-num-breathe 2.5s infinite alternate ease-in-out;
}
@keyframes wb-num-breathe {
  0% { opacity: 0.92; }
  100% { opacity: 1; text-shadow: 0 0 16px rgba(0, 245, 212, 0.3); }
}
.wb-kpi-num small {
  font-size: 0.95rem;
  color: var(--cyan);
  font-weight: 600;
}
.wb-kpi-trend {
  font-size: 0.76rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.wb-kpi-trend.up { color: var(--green); }
.wb-arrow-bounce {
  display: inline-block;
  animation: wb-arrow-bounce 1.5s infinite ease-in-out;
}
@keyframes wb-arrow-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}`,

  'wb-status-badges': `.wb-badge-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.wb-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: 0.8px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.wb-radar-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  position: relative;
}
.wb-status-badge.online {
  background: rgba(6, 214, 160, 0.12);
  border: 1px solid rgba(6, 214, 160, 0.4);
  color: var(--green);
}
.wb-status-badge.online .wb-radar-dot {
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
  animation: wb-dot-ping-green 1.6s infinite;
}
.wb-status-badge.deploy {
  background: rgba(58, 134, 255, 0.12);
  border: 1px solid rgba(58, 134, 255, 0.4);
  color: var(--blue);
}
.wb-status-badge.deploy .wb-radar-dot {
  background: var(--blue);
  box-shadow: 0 0 8px var(--blue);
  animation: pulse-ring 1.5s infinite;
}
.wb-status-badge.warning {
  background: rgba(255, 183, 3, 0.12);
  border: 1px solid rgba(255, 183, 3, 0.4);
  color: var(--yellow);
}
.wb-status-badge.warning .wb-radar-dot {
  background: var(--yellow);
  box-shadow: 0 0 8px var(--yellow);
  animation: wb-warn-heartbeat 1.4s infinite alternate ease-in-out;
}
@keyframes wb-warn-heartbeat {
  0% { transform: scale(0.85); opacity: 0.7; }
  100% { transform: scale(1.25); opacity: 1; box-shadow: 0 0 12px var(--yellow); }
}
.wb-status-badge.offline {
  background: rgba(255, 0, 110, 0.12);
  border: 1px solid rgba(255, 0, 110, 0.4);
  color: var(--coral);
}
.wb-status-badge.offline .wb-radar-dot {
  background: var(--coral);
  box-shadow: 0 0 8px var(--coral);
  animation: wb-distress-blink 2s infinite ease-in-out;
}
@keyframes wb-distress-blink {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; box-shadow: 0 0 12px var(--coral); }
}`,

  'wb-window-titlebar': `.wb-titlebar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}
.wb-titlebar::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
  animation: wb-titlebar-sheen 4s infinite ease-in-out;
}
@keyframes wb-titlebar-sheen {
  0%, 20% { left: -100%; }
  60%, 100% { left: 160%; }
}
.wb-mac-dots {
  display: flex;
  gap: 6px;
  position: relative;
  z-index: 1;
}
.wb-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transition: transform 0.15s ease;
}
.wb-dot:hover { transform: scale(1.25); }
.wb-dot.d-close {
  background: #ff5f56;
  box-shadow: 0 0 6px rgba(255, 95, 86, 0.4);
}
.wb-dot.d-min { background: #ffbd2e; }
.wb-dot.d-max { background: #27c93f; }
.wb-title-center {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
  z-index: 1;
}
.wb-win-icon { font-size: 0.85rem; }
.wb-win-title {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-muted);
}
.wb-drag-handle {
  color: var(--text-dim);
  font-size: 0.9rem;
  cursor: grab;
  position: relative;
  z-index: 1;
}`,

  'wb-tag-chips': `.wb-chip-cloud {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.wb-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.wb-chip:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-main);
  transform: translateY(-1px);
}
.wb-chip.active {
  background: rgba(0, 245, 212, 0.15);
  border-color: var(--cyan);
  color: var(--cyan);
  animation: wb-chip-float 3s infinite ease-in-out alternate;
}
@keyframes wb-chip-float {
  0% { transform: translateY(0); box-shadow: 0 0 8px rgba(0, 245, 212, 0.2); }
  100% { transform: translateY(-2px); box-shadow: 0 0 16px rgba(0, 245, 212, 0.45); }
}
.wb-chip small {
  opacity: 0.6;
  font-size: 0.7rem;
}
.wb-chip small:hover { opacity: 1; }`,

  'wb-smart-resize-corner': `.wb-resize-box {
  width: 100%;
  position: relative;
  background: rgba(18, 21, 34, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.wb-resize-ghost-frame {
  position: absolute;
  inset: 6px;
  border: 1px dashed rgba(0, 245, 212, 0.45);
  border-radius: 6px;
  animation: wb-ghost-resize 3s infinite ease-in-out;
  pointer-events: none;
}
@keyframes wb-ghost-resize {
  0%, 100% { inset: 6px; opacity: 0.4; }
  50% { inset: 12px; opacity: 0.9; border-color: var(--cyan); }
}
.wb-resize-tip {
  font-size: 0.78rem;
  color: var(--text-dim);
  font-style: italic;
  position: relative;
  z-index: 1;
}
.wb-resize-handle {
  position: absolute;
  bottom: 4px;
  right: 4px;
  color: var(--cyan);
  cursor: nwse-resize;
  opacity: 0.8;
  transition: opacity 0.2s ease;
  animation: wb-grip-pulse 2s infinite ease-in-out;
  z-index: 1;
}
@keyframes wb-grip-pulse {
  0%, 100% { transform: translate(0, 0); filter: drop-shadow(0 0 3px var(--cyan)); }
  50% { transform: translate(2px, 2px); filter: drop-shadow(0 0 8px var(--cyan)); }
}`,

  'wb-user-snippet': `.wb-user-pill {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(18, 21, 34, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 14px 6px 8px;
  border-radius: var(--radius-pill);
}
.wb-avatar-wrap {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--cyan), var(--blue));
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: 0 0 10px rgba(0, 245, 212, 0.35);
  animation: wb-avatar-orbit 6s linear infinite;
}
@keyframes wb-avatar-orbit {
  0% { box-shadow: 0 0 8px rgba(0, 245, 212, 0.4); }
  50% { box-shadow: 0 0 14px rgba(58, 134, 255, 0.5); }
  100% { box-shadow: 0 0 8px rgba(0, 245, 212, 0.4); }
}
.wb-avatar-text {
  font-weight: 800;
  font-size: 0.78rem;
  color: #0c0f1d;
}
.wb-user-online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--green);
  border: 2px solid #0c0f1d;
  box-shadow: 0 0 8px var(--green);
  animation: wb-avatar-sonar 1.6s infinite;
}
@keyframes wb-avatar-sonar {
  0% { box-shadow: 0 0 0 0 rgba(6, 214, 160, 0.8); }
  70% { box-shadow: 0 0 0 6px rgba(6, 214, 160, 0); }
  100% { box-shadow: 0 0 0 0 rgba(6, 214, 160, 0); }
}
.wb-user-info {
  display: flex;
  flex-direction: column;
}
.wb-user-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
}
.wb-user-role {
  font-size: 0.7rem;
  color: var(--text-dim);
}`,

  'wb-key-value-list': `.wb-kv-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.76rem;
}
.wb-kv-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 5px;
  position: relative;
  overflow: hidden;
  animation: wb-kv-scan 4s infinite ease-in-out;
}
@keyframes wb-kv-scan {
  0%, 100% { background: rgba(255, 255, 255, 0.03); }
  50% { background: rgba(0, 245, 212, 0.06); }
}
.wb-k { color: var(--text-dim); }
.wb-v {
  color: var(--cyan);
  font-weight: 600;
  text-shadow: 0 0 6px rgba(0, 245, 212, 0.3);
}`,

  'wb-split-row': `.wb-split-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.82rem;
}
.wb-si-left {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  white-space: nowrap;
}
.wb-rocket-pulse {
  display: inline-block;
  animation: wb-rocket-rumble 2s infinite ease-in-out;
}
@keyframes wb-rocket-rumble {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-2px) rotate(4deg); }
  75% { transform: translateY(1px) rotate(-3deg); }
}
.wb-si-icon { font-size: 0.9rem; }
.wb-dotted-line {
  flex: 1;
  height: 2px;
  background-image: radial-gradient(circle, rgba(0, 245, 212, 0.75) 1.5px, transparent 1.5px);
  background-size: 10px 2px;
  background-repeat: repeat-x;
  animation: wb-stream-dots 0.8s linear infinite;
}
@keyframes wb-stream-dots {
  from { background-position: 0 0; }
  to { background-position: 10px 0; }
}
.wb-si-val {
  font-family: var(--font-mono);
  color: var(--cyan);
  font-weight: 700;
  white-space: nowrap;
  text-shadow: 0 0 8px rgba(0, 245, 212, 0.4);
}`,

  'wb-dual-stat-split': `.wb-dual-split {
  width: 100%;
  display: flex;
  align-items: center;
  background: rgba(18, 21, 34, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 14px;
}
.wb-ds-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.wb-ds-divider {
  width: 1px;
  height: 34px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 12px;
}
.wb-ds-label {
  font-size: 0.68rem;
  color: var(--text-dim);
  text-transform: uppercase;
}
.wb-ds-val {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 700;
}
.wb-ds-val.cyan { color: var(--cyan); text-shadow: 0 0 6px rgba(0, 245, 212, 0.4); }
.wb-ds-val.pink { color: var(--coral); text-shadow: 0 0 6px rgba(255, 0, 110, 0.4); }
.wb-mini-track {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 2px;
}
.wb-mini-bar {
  height: 100%;
  transition: width 0.4s ease;
}
.wb-mini-bar.cyan-bar {
  background: var(--cyan);
  box-shadow: 0 0 6px var(--cyan);
  animation: wb-mini-flow 2.5s infinite alternate ease-in-out;
}
.wb-mini-bar.pink-bar {
  background: var(--coral);
  box-shadow: 0 0 6px var(--coral);
  animation: wb-mini-flow 3s infinite alternate ease-in-out;
}
@keyframes wb-mini-flow {
  0% { filter: brightness(0.9); }
  100% { filter: brightness(1.3); }
}`,

  'wb-quad-tile-grid': `.wb-quad-grid {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.wb-q-tile {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  position: relative;
  transition: all 0.2s ease;
  animation: wb-tile-breathe 3.5s infinite alternate ease-in-out;
}
@keyframes wb-tile-breathe {
  0% { border-color: rgba(255, 255, 255, 0.06); }
  100% { border-color: rgba(0, 245, 212, 0.2); }
}
.wb-qt-icon { font-size: 0.85rem; margin-bottom: 2px; }
.wb-qt-num {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-main);
  line-height: 1.1;
}
.wb-qt-lbl {
  font-size: 0.68rem;
  color: var(--text-dim);
  text-transform: uppercase;
}`,

  'wb-activity-feed-row': `.wb-feed-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.wb-feed-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
  margin-top: 5px;
  flex-shrink: 0;
  animation: wb-feed-sonar 2s infinite;
}
@keyframes wb-feed-sonar {
  0% { box-shadow: 0 0 0 0 rgba(0, 245, 212, 0.8); }
  70% { box-shadow: 0 0 0 8px rgba(0, 245, 212, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 245, 212, 0); }
}
.wb-feed-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wb-feed-msg {
  font-size: 0.8rem;
  color: var(--text-main);
  line-height: 1.3;
}
.wb-feed-msg strong { color: var(--cyan); }
.wb-feed-time {
  font-size: 0.7rem;
  color: var(--text-dim);
}`,

  'wb-accordion-panel': `.wb-accordion {
  width: 100%;
  background: rgba(18, 21, 34, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}
.wb-acc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-main);
  transition: background 0.15s ease;
}
.wb-acc-header:hover { background: rgba(255, 255, 255, 0.04); }
.wb-acc-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-acc-status-pill {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  background: rgba(6, 214, 160, 0.12);
  border: 1px solid rgba(6, 214, 160, 0.35);
  color: var(--green);
  padding: 1px 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
}
.wb-acc-arrow {
  color: var(--cyan);
  font-size: 0.75rem;
  transition: transform 0.25s ease;
  animation: wb-chevron-bounce 2s infinite ease-in-out;
}
@keyframes wb-chevron-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(2px); }
}
.wb-accordion.open .wb-acc-arrow { transform: rotate(180deg); animation: none; }
.wb-acc-body {
  padding: 8px 14px 10px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: none;
}
.wb-accordion.open .wb-acc-body { display: block; }
.wb-acc-line { margin: 2px 0; }`,

  'wb-banner-alert': `.wb-alert {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
}
.wb-alert.warning {
  background: repeating-linear-gradient(45deg, rgba(255, 183, 3, 0.12), rgba(255, 183, 3, 0.12) 10px, rgba(255, 183, 3, 0.05) 10px, rgba(255, 183, 3, 0.05) 20px);
  background-size: 28px 28px;
  border: 1px solid rgba(255, 183, 3, 0.4);
  color: var(--yellow);
  animation: wb-hazard-stripes 2.5s linear infinite;
}
@keyframes wb-hazard-stripes {
  0% { background-position: 0 0; }
  100% { background-position: 28px 0; }
}
.wb-alert-icon {
  font-size: 0.95rem;
  animation: wb-alert-pulse 1.3s infinite alternate ease-in-out;
}
@keyframes wb-alert-pulse {
  0% { transform: scale(1); filter: drop-shadow(0 0 2px transparent); }
  100% { transform: scale(1.22); filter: drop-shadow(0 0 8px var(--yellow)); }
}
.wb-alert-txt { flex: 1; color: var(--text-main); font-weight: 500; font-size: 0.78rem; }
.wb-alert-close {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.85rem;
}
.wb-alert-close:hover { color: var(--text-main); }`,

  'wb-sparkline-card': `.wb-spark-box {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wb-spark-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.76rem;
  color: var(--text-muted);
}
.wb-spark-header strong {
  font-family: var(--font-mono);
  text-shadow: 0 0 8px rgba(0, 245, 212, 0.4);
}
.wb-spark-canvas-wrap {
  width: 100%;
  height: 42px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(0, 245, 212, 0.3);
}
.wb-spark-canvas-wrap canvas {
  width: 100%;
  height: 100%;
  display: block;
}`,

  'wb-radial-meter-ring': `.wb-radial-wrap {
  position: relative;
  width: 76px;
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wb-radial-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.wb-rad-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 6;
}
.wb-rad-fill {
  fill: none;
  stroke: var(--cyan);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 201;
  stroke-dashoffset: 52;
  filter: drop-shadow(0 0 8px rgba(0, 245, 212, 0.7));
  animation: wb-rad-breathe 3s infinite ease-in-out alternate;
}
@keyframes wb-rad-breathe {
  0% { stroke-dashoffset: 52; filter: drop-shadow(0 0 6px rgba(0, 245, 212, 0.5)); }
  100% { stroke-dashoffset: 38; filter: drop-shadow(0 0 12px rgba(0, 245, 212, 0.9)); }
}
.wb-rad-center {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}
.wb-rad-center strong {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--text-main);
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
}
.wb-rad-center small {
  font-size: 0.55rem;
  color: var(--text-dim);
  letter-spacing: 0.5px;
}`,

  'wb-led-meter-bar': `.wb-led-ladder {
  display: flex;
  gap: 5px;
  align-items: center;
}
.wb-led {
  width: 8px;
  height: 24px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  transition: all 0.12s ease;
}
.wb-led.g.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
.wb-led.y.on { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
.wb-led.r.on { background: var(--coral); box-shadow: 0 0 8px var(--coral); }`,

  'wb-dual-fill-bar': `.wb-dual-bar {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wb-db-track {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  display: flex;
  overflow: hidden;
  position: relative;
}
.wb-db-track::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: wb-dual-bar-beam 2.8s infinite ease-in-out;
}
@keyframes wb-dual-bar-beam {
  0%, 15% { left: -100%; }
  50%, 100% { left: 200%; }
}
.wb-db-fill.f1 {
  background: var(--cyan);
  box-shadow: 0 0 8px rgba(0, 245, 212, 0.4);
  transition: width 0.4s ease;
}
.wb-db-fill.f2 {
  background: var(--purple);
  transition: width 0.4s ease;
}
.wb-db-legend {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
}`,

  'wb-micro-candlesticks': `.wb-candle-strip {
  display: flex;
  gap: 12px;
  align-items: center;
  height: 44px;
}
.wb-c-bar {
  width: 8px;
  position: relative;
  border-radius: 1px;
}
.wb-c-bar.up { background: var(--green); }
.wb-c-bar.down { background: var(--coral); }
.c-wick {
  position: absolute;
  width: 1.5px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: -1;
}
.wb-c-bar.up .c-wick { background: var(--green); }
.wb-c-bar.down .c-wick { background: var(--coral); }
.wb-c-bar.live-candle {
  animation: wb-candle-tick 1.8s infinite ease-in-out alternate;
  box-shadow: 0 0 8px var(--green);
}
@keyframes wb-candle-tick {
  0% { transform: scaleY(0.85); box-shadow: 0 0 4px var(--green); }
  100% { transform: scaleY(1.35); box-shadow: 0 0 12px var(--green); }
}`,

  'wb-mini-equalizer-bars': `.wb-mini-eq {
  display: flex;
  gap: 5px;
  align-items: flex-end;
  height: 36px;
}
.wb-eq-col {
  width: 6px;
  border-radius: 3px;
  background: linear-gradient(to top, var(--cyan), var(--blue));
  transform-origin: bottom;
  animation: eq-bounce 1.2s ease-in-out infinite alternate;
}
.wb-eq-col:nth-child(1) { height: 18px; animation-delay: 0.1s; }
.wb-eq-col:nth-child(2) { height: 32px; animation-delay: 0.35s; }
.wb-eq-col:nth-child(3) { height: 12px; animation-delay: 0.5s; }
.wb-eq-col:nth-child(4) { height: 28px; animation-delay: 0.2s; }
.wb-eq-col:nth-child(5) { height: 22px; animation-delay: 0.4s; }
.wb-eq-col:nth-child(6) { height: 14px; animation-delay: 0.65s; }
@keyframes eq-bounce {
  0% { transform: scaleY(0.35); opacity: 0.55; }
  100% { transform: scaleY(1.15); opacity: 1; filter: drop-shadow(0 0 8px var(--cyan)); }
}`,

  'wb-analog-gauge-arc': `.wb-semi-gauge {
  width: 110px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.wb-semi-gauge svg { width: 100%; overflow: visible; }
#wb-gauge-path {
  animation: wb-gauge-rev 3s infinite ease-in-out alternate;
  filter: drop-shadow(0 0 6px var(--coral));
}
@keyframes wb-gauge-rev {
  0% { stroke-dashoffset: 65; }
  50% { stroke-dashoffset: 20; }
  100% { stroke-dashoffset: 40; }
}
.wb-gauge-val {
  position: absolute;
  bottom: 0;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--coral);
  text-shadow: 0 0 8px rgba(255, 0, 110, 0.5);
}`,

  'wb-heatmap-streak-strip': `.wb-streak-dots {
  display: flex;
  gap: 6px;
}
.wb-sdot {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  transition: transform 0.15s ease;
  animation: wb-streak-scan 3.5s infinite ease-in-out;
}
.wb-sdot:nth-child(1) { animation-delay: 0.1s; }
.wb-sdot:nth-child(2) { animation-delay: 0.3s; }
.wb-sdot:nth-child(3) { animation-delay: 0.5s; }
.wb-sdot:nth-child(4) { animation-delay: 0.7s; }
.wb-sdot:nth-child(5) { animation-delay: 0.9s; }
.wb-sdot:nth-child(6) { animation-delay: 1.1s; }
.wb-sdot:nth-child(7) { animation-delay: 1.3s; }
@keyframes wb-streak-scan {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.18); filter: brightness(1.35) drop-shadow(0 0 6px #06d6a0); }
}
.wb-sdot:hover { transform: scale(1.3); }
.wb-sdot.l0 { background: rgba(255, 255, 255, 0.06); }
.wb-sdot.l1 { background: rgba(6, 214, 160, 0.25); }
.wb-sdot.l2 { background: rgba(6, 214, 160, 0.5); }
.wb-sdot.l3 { background: rgba(6, 214, 160, 0.75); }
.wb-sdot.l4 { background: #06d6a0; box-shadow: 0 0 8px rgba(6, 214, 160, 0.6); }`,

  'wb-shimmer-sweep': `.wb-shimmer-sample {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wb-shimmer-line {
  height: 10px;
  border-radius: 4px;
}
.wb-shimmer-line.l1 { width: 85%; }
.wb-shimmer-line.l2 { width: 60%; }
.wb-shimmer-line.l3 { width: 40%; }
.wb-shimmer {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.04) 20%, rgba(0, 245, 212, 0.25) 50%, rgba(255, 255, 255, 0.04) 80%);
  background-size: 200% 100%;
  animation: wb-shimmer-sweep 1.8s infinite linear;
}
@keyframes wb-shimmer-sweep {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}`,

  'wb-ambient-aura': `.wb-aura-box {
  padding: 10px 20px;
  border-radius: 10px;
  background: rgba(18, 21, 34, 0.9);
  border: 1px solid rgba(0, 245, 212, 0.4);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--cyan);
}
.wb-aura-icon {
  animation: wb-aura-spin 4s infinite ease-in-out;
}
@keyframes wb-aura-spin {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2) rotate(10deg); }
}
.wb-pulse-glow {
  animation: wb-ambient-pulse 3s infinite ease-in-out;
}
@keyframes wb-ambient-pulse {
  0%, 100% {
    box-shadow: 0 0 10px rgba(0, 245, 212, 0.2), inset 0 0 8px rgba(0, 245, 212, 0.1);
    border-color: rgba(0, 245, 212, 0.3);
  }
  50% {
    box-shadow: 0 0 28px rgba(0, 245, 212, 0.6), inset 0 0 16px rgba(0, 245, 212, 0.35);
    border-color: var(--cyan);
  }
}`,

  'wb-scanline-overlay': `.wb-scanline-box {
  width: 100%;
  padding: 14px;
  background: #050811;
  border: 1px solid rgba(0, 245, 212, 0.3);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--cyan);
  position: relative;
  overflow: hidden;
  text-align: center;
}
.wb-crt-beam {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 12px;
  background: linear-gradient(180deg, transparent, rgba(0, 245, 212, 0.3), transparent);
  animation: wb-crt-beam 2.8s linear infinite;
  pointer-events: none;
}
@keyframes wb-crt-beam {
  0% { top: -15px; opacity: 0.7; }
  100% { top: 100%; opacity: 0.7; }
}
.wb-crt-cursor {
  display: inline-block;
  animation: wb-crt-blink 1s infinite steps(2, start);
  color: var(--cyan);
}
@keyframes wb-crt-blink {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}
.wb-scanlines::after {
  content: " ";
  display: block;
  position: absolute;
  top: 0; left: 0; bottom: 0; right: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.05), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.05));
  z-index: 2;
  background-size: 100% 3px, 6px 100%;
  pointer-events: none;
}`,

  'wb-conic-glow-border': `.wb-conic-border {
  position: relative;
  padding: 2px;
  border-radius: 12px;
  overflow: hidden;
  display: inline-block;
}
.wb-conic-border::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: conic-gradient(transparent, #00f5d4, #3a86ff, #ff006e, transparent 50%);
  animation: wb-conic-spin 3s linear infinite;
  z-index: 0;
}
@keyframes wb-conic-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.wb-conic-inner {
  position: relative;
  z-index: 1;
  background: #0e1220;
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  box-shadow: 0 0 16px rgba(0, 245, 212, 0.2);
}`,

  'wb-floating-bob': `.wb-float-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.wb-float-chip {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  background: rgba(18, 21, 34, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-main);
  font-size: 0.84rem;
  font-weight: 600;
}
.wb-float {
  animation: wb-levitate 3.5s ease-in-out infinite alternate;
}
@keyframes wb-levitate {
  0% { transform: translateY(0) rotate(0deg); filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4)); }
  50% { transform: translateY(-7px) rotate(1.5deg); filter: drop-shadow(0 14px 16px rgba(0, 245, 212, 0.25)); }
  100% { transform: translateY(-11px) rotate(-1.5deg); filter: drop-shadow(0 18px 20px rgba(0, 245, 212, 0.35)); }
}
.wb-float-shadow {
  width: 60px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(0, 245, 212, 0.35), transparent 70%);
  animation: wb-shadow-pulse 3.5s ease-in-out infinite alternate;
}
@keyframes wb-shadow-pulse {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(0.65); opacity: 0.3; }
}`,

  'wb-radar-ping-ring': `.wb-beacon-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-main);
}
.wb-radar-beacon {
  width: 28px;
  height: 28px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wb-beacon-core {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 10px var(--cyan);
  position: relative;
  z-index: 2;
}
.wb-ping-wave {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 2px solid var(--cyan);
  border-radius: 50%;
  animation: wb-radar-ping 2.1s cubic-bezier(0, 0.2, 0.8, 1) infinite;
}
.wb-ping-wave.w2 { animation-delay: 0.7s; }
.wb-ping-wave.w3 { animation-delay: 1.4s; }
@keyframes wb-radar-ping {
  0% { transform: scale(0.25); opacity: 1; }
  100% { transform: scale(2.5); opacity: 0; }
}
.wb-radar-sweep-arm {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 1.5px;
  background: linear-gradient(90deg, var(--cyan), transparent);
  transform-origin: 0 50%;
  animation: wb-radar-sweep 2.5s linear infinite;
  box-shadow: 0 0 6px var(--cyan);
}
@keyframes wb-radar-sweep {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`
};

function initBlockLibrary() {
  // 1. Setup copy buttons (HTML / CSS)
  const copyButtons = document.querySelectorAll('.block-copy-btn');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const type = btn.dataset.copy; // 'html' or 'css'
      const card = btn.closest('.block-card');
      if (!card) return;
      const blockId = card.dataset.id;
      let textToCopy = '';

      if (type === 'html') {
        const stage = card.querySelector('.block-stage');
        if (stage) {
          textToCopy = stage.innerHTML.trim()
            .replace(/\n\s{12}/g, '\n')
            .replace(/\n\s{10}/g, '\n  ')
            .replace(/\n\s{8}/g, '\n');
        }
      } else if (type === 'css') {
        textToCopy = BLOCK_CSS_SNIPPETS[blockId] || `/* Refer to styles.css for .${blockId} */`;
      }

      if (textToCopy) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          const origText = btn.textContent;
          btn.textContent = 'Copied! ✓';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = origText;
            btn.classList.remove('copied');
          }, 1800);
        } catch (err) {
          console.warn('Clipboard write failed:', err);
        }
      }
    });
  });

  // 2. Interactive block components:
  // Segmented tabs demo
  const segWrap = document.getElementById('demo-segmented');
  if (segWrap) {
    const btns = segWrap.querySelectorAll('.wb-seg-btn');
    btns.forEach(b => {
      b.addEventListener('click', () => {
        btns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
  }

  // Floating Dropdown demo
  const dropdown = document.getElementById('demo-dropdown');
  if (dropdown) {
    const trigger = dropdown.querySelector('.wb-dropdown-trigger');
    const valText = dropdown.querySelector('.wb-dd-val');
    const opts = dropdown.querySelectorAll('.wb-dd-opt');

    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    opts.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        if (valText) valText.textContent = opt.textContent;
        dropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
    });
  }

  // Range Slider demo
  const slider = document.getElementById('demo-slider');
  const sliderVal = document.getElementById('slider-readout');
  if (slider && sliderVal) {
    slider.addEventListener('input', () => {
      sliderVal.textContent = `${slider.value}%`;
    });
  }

  // Stepper counter demo
  const stepMinus = document.getElementById('step-minus');
  const stepPlus = document.getElementById('step-plus');
  const stepVal = document.getElementById('step-val');
  if (stepMinus && stepPlus && stepVal) {
    let count = parseInt(stepVal.textContent, 10) || 4;
    stepMinus.addEventListener('click', () => {
      if (count > 1) {
        count--;
        stepVal.textContent = count;
      }
    });
    stepPlus.addEventListener('click', () => {
      if (count < 32) {
        count++;
        stepVal.textContent = count;
      }
    });
  }

  // Rotary knob demo
  const knob = document.getElementById('demo-knob');
  const knobTxt = document.getElementById('knob-val-txt');
  if (knob && knobTxt) {
    let angle = 45;
    let isDragging = false;
    let startY = 0;

    knob.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      document.body.style.cursor = 'ns-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaY = startY - e.clientY;
      startY = e.clientY;
      angle = Math.max(0, Math.min(270, angle + deltaY * 2));
      knob.style.transform = `rotate(${angle}deg)`;
      const db = Math.round((angle / 270) * 100);
      knobTxt.textContent = `${db} dB`;
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
      }
    });
  }

  // Accordion demo
  const acc = document.getElementById('demo-accordion');
  if (acc) {
    const head = acc.querySelector('.wb-acc-header');
    head?.addEventListener('click', () => {
      acc.classList.toggle('open');
    });
  }

  // Tag chip cloud demo
  const chips = document.querySelectorAll('.wb-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
    });
  });

  // Inline alert dismiss demo
  const alertClose = document.querySelector('.wb-alert-close');
  if (alertClose) {
    alertClose.addEventListener('click', (e) => {
      const banner = e.target.closest('.wb-alert');
      if (banner) {
        banner.style.opacity = '0';
        banner.style.transform = 'scale(0.95)';
        banner.style.transition = 'all 0.25s ease';
        setTimeout(() => banner.style.display = 'none', 250);
      }
    });
  }

  // Micro action bar icon active toggle
  const actionBtns = document.querySelectorAll('.wb-icon-btn');
  actionBtns.forEach(ab => {
    ab.addEventListener('click', () => {
      if (!ab.classList.contains('danger')) {
        ab.classList.toggle('active');
      }
    });
  });

  // 3. Real-Time Simulation Loops for Purposeful Animated Blocks:
  
  // A. 60FPS Fluid Waveform Sparkline (Block 23)
  const sparkCanvas = document.getElementById('wb-spark-canvas');
  const sparkVal = document.getElementById('wb-spark-val');
  if (sparkCanvas) {
    const ctx = sparkCanvas.getContext('2d');
    const w = sparkCanvas.width;
    const h = sparkCanvas.height;
    let sparkPhase = 0;

    function renderSpark() {
      if (state.isSimActive) {
        sparkPhase += 0.045;
      }
      ctx.clearRect(0, 0, w, h);

      // Subtle horizontal baseline grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.35); ctx.lineTo(w, h * 0.35);
      ctx.moveTo(0, h * 0.7);  ctx.lineTo(w, h * 0.7);
      ctx.stroke();

      // Calculate smooth harmonic curve points
      const points = [];
      const step = 6;
      for (let x = 0; x <= w; x += step) {
        const nx = x / w;
        const y = (h * 0.52)
          + Math.sin(nx * 5.2 + sparkPhase) * (h * 0.22)
          + Math.cos(nx * 11.4 - sparkPhase * 1.4) * (h * 0.12)
          + Math.sin(sparkPhase * 1.8) * (h * 0.06);
        points.push({ x, y });
      }

      // Draw gradient under-fill
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const mx = (prev.x + curr.x) / 2;
        const my = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      ctx.lineTo(w, points[points.length - 1].y);
      ctx.lineTo(w, h);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(0, 245, 212, 0.35)');
      grad.addColorStop(1, 'rgba(0, 245, 212, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw glowing stroke line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const mx = (prev.x + curr.x) / 2;
        const my = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      ctx.lineTo(w, points[points.length - 1].y);
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Leading live particle dot at right edge
      const lastPt = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(lastPt.x - 2, lastPt.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      requestAnimationFrame(renderSpark);
    }
    requestAnimationFrame(renderSpark);
  }

  // B. 10-Segment LED VU Ladder (Block 25)
  const ledLadder = document.getElementById('wb-led-ladder');
  if (ledLadder) {
    const leds = ledLadder.querySelectorAll('.wb-led');
    let currentLevel = 6;
    let targetLevel = 7;
    let ledTick = 0;

    setInterval(() => {
      if (!state.isSimActive) return;
      ledTick++;
      if (ledTick % 4 === 0) {
        // Pick new dynamic target with occasional high peak
        const isSpike = Math.random() < 0.22;
        targetLevel = isSpike ? (8 + Math.floor(Math.random() * 3)) : (3 + Math.floor(Math.random() * 5));
      }
      // Smooth decay / approach
      if (currentLevel < targetLevel) currentLevel += 1;
      else if (currentLevel > targetLevel) currentLevel -= 1;

      leds.forEach((led, idx) => {
        if (idx < currentLevel) {
          led.classList.add('on');
        } else {
          led.classList.remove('on');
        }
      });
    }, 110);
  }

  // C. 180° Tachometer Speedometer & Gauge Arc (Block 29)
  const gaugeNum = document.getElementById('wb-gauge-num');
  const gaugePath = document.getElementById('wb-gauge-path');
  if (gaugeNum && gaugePath) {
    let gaugeTime = 0;
    setInterval(() => {
      if (!state.isSimActive) return;
      gaugeTime += 0.08;
      // Oscillate speed smoothly between 68 and 114 km/h with rev bursts
      const spd = Math.round(84 + Math.sin(gaugeTime) * 18 + Math.sin(gaugeTime * 2.7) * 9);
      gaugeNum.textContent = `${spd} km/h`;
      // Arc path dasharray is 125. Map 60-120 km/h to offset 65 (low) down to 18 (high)
      const offset = Math.round(65 - ((spd - 60) / 60) * 47);
      gaugePath.style.strokeDashoffset = Math.max(15, Math.min(70, offset));
    }, 120);
  }

  // D. Concentric Radial Ring Load (Block 24)
  const radCircle = document.getElementById('wb-rad-fill-circle');
  const radPct = document.getElementById('wb-rad-pct');
  if (radCircle && radPct) {
    let radTime = 0;
    setInterval(() => {
      if (!state.isSimActive) return;
      radTime += 0.06;
      const pct = Math.round(74 + Math.sin(radTime) * 8 + (Math.random() - 0.5) * 2);
      radPct.textContent = `${pct}%`;
      // Circumference of r=32 circle = 201.06
      const offset = 201.06 * (1 - pct / 100);
      radCircle.style.strokeDashoffset = offset.toFixed(1);
    }, 250);
  }

  // E. Real-Time Financial Micro-Candlestick (Block 27)
  const liveCandle = document.getElementById('wb-live-candle');
  const liveWick = document.getElementById('wb-live-wick');
  if (liveCandle && liveWick) {
    setInterval(() => {
      if (!state.isSimActive) return;
      const isUp = Math.random() > 0.42;
      const h = 12 + Math.floor(Math.random() * 22);
      const wh = h + 10 + Math.floor(Math.random() * 12);
      liveCandle.style.height = `${h}px`;
      liveWick.style.height = `${wh}px`;
      liveCandle.className = isUp ? 'wb-c-bar up live-candle' : 'wb-c-bar down live-candle';
    }, 1500);
  }

  // F. Telemetry & Metric Fluctuations (Blocks 9, 10, 16, 18, 19, 21, 23, 26)
  const swapVal = document.getElementById('wb-swap-val');
  const swapBar = document.getElementById('wb-swap-bar');
  const kpiVal = document.getElementById('wb-kpi-val');
  const kpiPct = document.getElementById('wb-kpi-pct');
  const kvMem = document.getElementById('wb-kv-mem');
  const inVal = document.getElementById('wb-inbound-val');
  const inBar = document.getElementById('wb-inbound-bar');
  const outVal = document.getElementById('wb-outbound-val');
  const outBar = document.getElementById('wb-outbound-bar');
  const qPeers = document.getElementById('wb-q-peers');
  const qPower = document.getElementById('wb-q-power');
  const latVal = document.getElementById('wb-latency-val');
  const dbF1 = document.getElementById('wb-db-f1');
  const dbF2 = document.getElementById('wb-db-f2');
  const dbLbl1 = document.getElementById('wb-db-lbl1');
  const dbLbl2 = document.getElementById('wb-db-lbl2');

  setInterval(() => {
    if (!state.isSimActive) return;

    // Swap Well
    if (swapVal && swapBar) {
      const mb = Math.round(5800 + Math.random() * 2200);
      swapVal.textContent = `${mb.toLocaleString()} MB`;
      swapBar.style.width = `${Math.round((mb / 9000) * 100)}%`;
    }

    // KPI Hashrate
    if (kpiVal) kpiVal.textContent = (142.8 + (Math.random() - 0.48) * 1.4).toFixed(1);
    if (kpiPct) kpiPct.textContent = `${(8.4 + (Math.random() - 0.5) * 0.8).toFixed(1)}%`;

    // Spark Throughput Header
    if (sparkVal) sparkVal.textContent = `+${(14.2 + (Math.random() - 0.5) * 2.2).toFixed(1)}%`;

    // Key-Value Monospace Memory
    if (kvMem) kvMem.textContent = `${(4.12 + (Math.random() - 0.5) * 0.16).toFixed(2)} GB`;

    // Traffic Split Inbound / Outbound
    if (inVal && inBar) {
      const gb = (1.32 + Math.random() * 0.28).toFixed(2);
      inVal.textContent = `${gb} GB`;
      inBar.style.width = `${Math.round(62 + Math.random() * 16)}%`;
    }
    if (outVal && outBar) {
      const mb = Math.round(440 + Math.random() * 90);
      outVal.textContent = `${mb} MB`;
      outBar.style.width = `${Math.round(28 + Math.random() * 12)}%`;
    }

    // Quad Tile Grid Telemetry
    if (qPeers) qPeers.textContent = `${(2.4 + (Math.random() * 0.2 - 0.08)).toFixed(1)}k`;
    if (qPower) qPower.textContent = `${Math.round(94 + Math.random() * 4)}%`;

    // Accordion Latency Ping
    if (latVal) latVal.textContent = `${(12.4 + (Math.random() - 0.5) * 2.6).toFixed(1)} ms`;

    // Segmented Allocation Bar
    if (dbF1 && dbF2 && dbLbl1 && dbLbl2) {
      const used = Math.round(52 + Math.random() * 8);
      const cache = Math.round(24 + Math.random() * 6);
      dbF1.style.width = `${used}%`;
      dbF2.style.width = `${cache}%`;
      dbLbl1.textContent = `Used ${used}%`;
      dbLbl2.textContent = `Cache ${cache}%`;
    }
  }, 2200);
}
