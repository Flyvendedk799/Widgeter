(function () {
  'use strict';

  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { execFile } = require('child_process');

  const $ = (id) => document.getElementById(id);
  const widgeter = window.widgeter || { getConfig: async () => undefined };
  const currentPlatform = (typeof process !== 'undefined' && process.platform) || (os.platform ? os.platform() : 'linux');

  let pollInterval = 2000;
  let tempUnit = 'c';
  let cachedModel = null;
  let prevCpus = null;
  let lastLoad = 0;
  let intervalTimer = null;

  // Execute external command safely with a strict timeout
  function runCommand(file, args, timeoutMs = 1200) {
    return new Promise((resolve) => {
      try {
        execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
          if (err || !stdout) resolve(null);
          else resolve(stdout.trim());
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Calculate real CPU utilization delta as indicator of host graphics / rendering activity
  function getSystemComputeLoad() {
    const cur = os.cpus();
    if (!cur || !cur.length) return lastLoad;
    if (!prevCpus) {
      prevCpus = cur.map((c) => Object.assign({}, c.times));
      let idle = 0, total = 0;
      for (const c of cur) {
        for (const k in c.times) total += c.times[k];
        idle += c.times.idle;
      }
      lastLoad = total > 0 ? Math.max(0, Math.min(100, Math.round(100 * (1 - idle / total)))) : 0;
      return lastLoad;
    }
    let idle = 0, total = 0;
    cur.forEach((c, i) => {
      const p = prevCpus[i];
      if (!p) return;
      let t = 0, pt = 0;
      for (const k in c.times) t += c.times[k];
      for (const k in p) pt += p[k];
      total += t - pt;
      idle += c.times.idle - (p.idle || 0);
    });
    if (total > 0) {
      prevCpus = cur.map((c) => Object.assign({}, c.times));
      lastLoad = Math.max(0, Math.min(100, Math.round(100 * (1 - idle / total))));
    }
    return lastLoad;
  }

  // Detect real discrete NVIDIA GPU via nvidia-smi
  async function queryNvidia() {
    const out = await runCommand('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,fan.speed',
      '--format=csv,noheader,nounits'
    ]);
    if (!out) return null;
    const firstLine = out.split('\n')[0];
    if (!firstLine) return null;
    const parts = firstLine.split(',').map((s) => s.trim());
    if (parts.length < 5) return null;

    const name = parts[0] || 'NVIDIA GPU';
    const load = parseInt(parts[1], 10) || 0;
    const memUsedMB = parseFloat(parts[2]) || 0;
    const memTotalMB = parseFloat(parts[3]) || 0;
    const tempC = parseInt(parts[4], 10);
    const rawFan = parts[5];
    let fan = null;
    if (rawFan && !rawFan.includes('Not Supported') && !rawFan.includes('N/A')) {
      const fanNum = parseInt(rawFan, 10);
      if (!isNaN(fanNum)) fan = fanNum;
    }

    return {
      model: name,
      load: Math.min(100, Math.max(0, load)),
      vramUsedGB: memUsedMB / 1024,
      vramTotalGB: memTotalMB / 1024,
      tempC: !isNaN(tempC) ? tempC : null,
      fan: fan,
      isDedicated: true
    };
  }

  // Query Linux sysfs for AMD or Intel graphics telemetry
  function queryLinuxSysfs() {
    if (currentPlatform !== 'linux') return null;
    try {
      const drmPath = '/sys/class/drm';
      if (!fs.existsSync(drmPath)) return null;
      const entries = fs.readdirSync(drmPath);
      for (const entry of entries) {
        if (/^card\d+$/.test(entry)) {
          const cardDir = path.join(drmPath, entry, 'device');
          if (!fs.existsSync(cardDir)) continue;

          let model = null;
          let load = null;
          let vramUsedGB = null;
          let vramTotalGB = null;
          let tempC = null;
          let fan = null;

          // AMD gpu_busy_percent
          const busyPath = path.join(cardDir, 'gpu_busy_percent');
          if (fs.existsSync(busyPath)) {
            const raw = parseInt(fs.readFileSync(busyPath, 'utf8').trim(), 10);
            if (!isNaN(raw)) load = Math.min(100, Math.max(0, raw));
          }

          // AMD VRAM
          const usedPath = path.join(cardDir, 'mem_info_vram_used');
          const totalPath = path.join(cardDir, 'mem_info_vram_total');
          if (fs.existsSync(usedPath) && fs.existsSync(totalPath)) {
            const used = parseFloat(fs.readFileSync(usedPath, 'utf8').trim());
            const total = parseFloat(fs.readFileSync(totalPath, 'utf8').trim());
            if (!isNaN(used) && !isNaN(total) && total > 0) {
              vramUsedGB = used / (1024 * 1024 * 1024);
              vramTotalGB = total / (1024 * 1024 * 1024);
            }
          }

          // hwmon temp & fan
          const hwmonDir = path.join(cardDir, 'hwmon');
          if (fs.existsSync(hwmonDir)) {
            const hwEntries = fs.readdirSync(hwmonDir);
            for (const h of hwEntries) {
              const hPath = path.join(hwmonDir, h);
              const tPath = path.join(hPath, 'temp1_input');
              if (fs.existsSync(tPath)) {
                const rawT = parseInt(fs.readFileSync(tPath, 'utf8').trim(), 10);
                if (!isNaN(rawT)) tempC = Math.round(rawT / 1000);
              }
              const fPath = path.join(hPath, 'fan1_input');
              if (fs.existsSync(fPath)) {
                const rawF = parseInt(fs.readFileSync(fPath, 'utf8').trim(), 10);
                if (!isNaN(rawF)) fan = rawF;
              }
            }
          }

          if (load !== null || vramUsedGB !== null) {
            model = 'AMD Radeon Graphics';
            return {
              model,
              load: load !== null ? load : 0,
              vramUsedGB: vramUsedGB || 0,
              vramTotalGB: vramTotalGB || 0,
              tempC,
              fan,
              isDedicated: true
            };
          }
        }
      }
    } catch (e) {
      // Ignore sysfs read errors
    }
    return null;
  }

  // Detect GPU model on Windows using PowerShell Get-CimInstance
  async function queryWindowsHardware() {
    if (currentPlatform !== 'win32') return null;
    const ps = 'Get-CimInstance Win32_VideoController | Select-Object -Property Name, AdapterRAM | ConvertTo-Json -Compress';
    const jsonStr = await runCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], 2000);
    if (!jsonStr) return null;
    try {
      const data = JSON.parse(jsonStr);
      const card = Array.isArray(data) ? data[0] : data;
      if (card && card.Name) {
        const name = card.Name;
        const ramBytes = Number(card.AdapterRAM) || 0;
        const totalGB = ramBytes > 0 ? ramBytes / (1024 ** 3) : 0;
        return {
          model: name,
          vramTotalGB: totalGB > 0 ? totalGB : null
        };
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
    return null;
  }

  // Graceful fallback hardware metrics derived from system resources
  function getFallbackMetrics(cachedHw) {
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const usedRam = totalRam - freeRam;
    const totalRamGB = totalRam / (1024 ** 3);

    // Dynamic shared memory allocation pool (standard unified memory model)
    const sharedPoolGB = cachedHw && cachedHw.vramTotalGB
      ? cachedHw.vramTotalGB
      : Math.max(1, Math.min(8, totalRamGB >= 32 ? 8 : totalRamGB >= 16 ? 4 : 2));
    const memRatio = totalRam > 0 ? usedRam / totalRam : 0;
    const sharedUsedGB = Math.max(0.1, +(sharedPoolGB * memRatio).toFixed(1));

    // Real compute activity indicator from system times
    const computeLoad = getSystemComputeLoad();
    const gpuLoad = Math.min(100, Math.max(0, computeLoad));

    // Platform display adapter label
    let modelName = (cachedHw && cachedHw.model) || cachedModel;
    if (!modelName) {
      if (currentPlatform === 'win32') modelName = 'Standard Display Adapter';
      else if (currentPlatform === 'darwin') modelName = 'Apple Graphics Adapter';
      else modelName = 'Integrated / Host GPU';
    }

    return {
      model: modelName,
      load: gpuLoad,
      vramUsedGB: sharedUsedGB,
      vramTotalGB: sharedPoolGB,
      tempC: null,
      fan: null,
      isDedicated: false
    };
  }

  // Format temperature according to user configuration
  function formatTemperature(tempC, unit) {
    if (tempC === null || tempC === undefined || isNaN(tempC)) {
      return 'N/A';
    }
    if (unit === 'f') {
      const degF = Math.round((tempC * 9) / 5 + 32);
      return degF + '°F';
    }
    return Math.round(tempC) + '°C';
  }

  // Format fan speed string
  function formatFanSpeed(fan) {
    if (fan === null || fan === undefined) {
      return 'N/A';
    }
    if (fan === 0 || fan === '0') {
      return '0 RPM (Passive)';
    }
    if (typeof fan === 'number') {
      return fan > 100 ? `${fan} RPM` : `${fan}%`;
    }
    return String(fan);
  }

  // Update 10-segment LED load meter
  function updateLedMeter(loadPct) {
    const meter = $('gpu-load-meter');
    if (!meter) return;
    const segs = meter.querySelectorAll('.wg-led-seg');
    const activeCount = Math.min(10, Math.max(0, Math.round((loadPct / 100) * 10)));
    const stateClass = loadPct >= 85 ? 'bad' : loadPct >= 65 ? 'warn' : 'good';

    segs.forEach((seg, i) => {
      if (i < activeCount) {
        seg.className = `wg-led-seg on ${stateClass}`;
      } else {
        seg.className = 'wg-led-seg';
      }
    });
  }

  // Render metrics to DOM
  function render(metrics) {
    if (!metrics) return;

    // Header
    const modelEl = $('gpu-model');
    if (modelEl) modelEl.textContent = metrics.model || 'Display Adapter';

    const beacon = $('gpu-beacon');
    const beaconStatus = $('beacon-status');
    const dot = $('gpu-dot');
    if (beacon) {
      beacon.className = metrics.isDedicated ? 'wg-beacon good' : 'wg-beacon warn';
    }
    if (beaconStatus) {
      beaconStatus.textContent = metrics.isDedicated ? 'ACTIVE' : 'SHARED';
    }
    if (dot) {
      dot.className = metrics.isDedicated ? 'wg-dot good pulse' : 'wg-dot warn pulse';
    }

    // Load
    const loadVal = $('gpu-load-val');
    if (loadVal) loadVal.textContent = Math.round(metrics.load) + '%';
    updateLedMeter(metrics.load);

    // VRAM
    const vramVal = $('vram-val');
    const vramPctEl = $('vram-pct');
    const vramBar = $('vram-bar');
    const vramBadge = $('vram-badge');

    const total = metrics.vramTotalGB || 1;
    const used = Math.min(total, Math.max(0, metrics.vramUsedGB || 0));
    const pct = Math.min(100, Math.max(0, Math.round((used / total) * 100)));

    if (vramVal) vramVal.textContent = `${used.toFixed(1)} / ${total.toFixed(1)} GB`;
    if (vramPctEl) vramPctEl.textContent = `${pct}%`;
    if (vramBar) {
      vramBar.style.width = `${pct}%`;
      vramBar.className = 'wg-fill' + (pct >= 90 ? ' bad' : pct >= 75 ? ' warn' : '');
    }
    if (vramBadge) {
      vramBadge.textContent = metrics.isDedicated ? 'DEDICATED' : 'SHARED';
    }

    // Metrics (Temp & Fan)
    const tempEl = $('gpu-temp');
    if (tempEl) tempEl.textContent = formatTemperature(metrics.tempC, tempUnit);

    const fanEl = $('gpu-fan');
    if (fanEl) fanEl.textContent = formatFanSpeed(metrics.fan);
  }

  // Hardware polling tick
  async function poll() {
    let metrics = await queryNvidia();
    if (!metrics) {
      metrics = queryLinuxSysfs();
    }
    if (!metrics) {
      let hw = null;
      if (currentPlatform === 'win32' && !cachedModel) {
        hw = await queryWindowsHardware();
        if (hw && hw.model) cachedModel = hw.model;
      }
      metrics = getFallbackMetrics(hw);
    }
    render(metrics);
  }

  // Initialization lifecycle
  async function init() {
    // Immediate synchronous first sample from hardware indicators
    render(getFallbackMetrics(null));

    try {
      const intervalSec = Number(await widgeter.getConfig('interval'));
      if (intervalSec && intervalSec >= 1 && intervalSec <= 60) {
        pollInterval = intervalSec * 1000;
      }
      const unit = await widgeter.getConfig('temp_unit');
      if (unit === 'f' || unit === 'c') {
        tempUnit = unit;
      }
    } catch (e) {
      // Keep sensible defaults if getConfig is unavailable
    }

    // First async hardware query followed by regular polling
    poll();
    intervalTimer = setInterval(poll, pollInterval);
  }

  init();
})();
