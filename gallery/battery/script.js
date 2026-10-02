// Battery status from the Chromium Battery Status API. On Windows the API cannot tell
// "desktop without a battery" from "full laptop on AC", so presence is checked once via CIM.
(function () {
  const { execFile } = require('child_process');
  const fs = require('fs');
  const $ = (id) => document.getElementById(id);
  const DASH = '—';
  let battery = null;
  let hasBattery = null; // null = unknown, true/false once detected

  function detectBattery() {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', '@(Get-CimInstance Win32_Battery).Count'],
          { windowsHide: true, timeout: 15000 }, (err, out) => {
            const n = parseInt(String(out || '').trim(), 10);
            resolve(err || isNaN(n) ? null : n > 0);
          });
      } else if (process.platform === 'linux') {
        try { resolve(fs.readdirSync('/sys/class/power_supply').some((n) => /^BAT/i.test(n))); } catch (e) { resolve(null); }
      } else {
        resolve(null);
      }
    });
  }

  function fmtDuration(sec) {
    if (!isFinite(sec) || sec <= 0) return null;
    const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    if (h && m === 60) return (h + 1) + ' h';
    return h ? h + ' h ' + m + ' min' : m + ' min';
  }

  function set(o) {
    $('icon').textContent = o.icon; $('sub').textContent = o.sub;
    const b = $('badge'); b.textContent = o.badge; b.className = 'wg-badge' + (o.cls ? ' ' + o.cls : '');
    $('pct').textContent = o.pct; $('cap').textContent = o.cap;
    $('fill').style.width = o.width + '%'; $('fill').className = 'wg-fill' + (o.fill ? ' ' + o.fill : '');
    $('src').textContent = o.src; $('tlbl').textContent = o.tlbl; $('time').textContent = o.time;
  }

  function render() {
    $('barwrap').hidden = hasBattery === false || !battery;
    if (hasBattery === false || !battery) {
      set({ icon: '🔌', sub: 'Powered by mains', badge: 'AC power', cls: 'accent', pct: 'AC', cap: 'No battery detected',
        width: 100, fill: 'good', src: 'AC adapter', tlbl: 'Battery', time: 'Not present' });
      return;
    }
    const pct = Math.round(battery.level * 100);
    const charging = battery.charging;
    const full = charging && pct >= 100;
    const low = !charging && pct <= 20;
    let tlbl, time;
    if (charging) { tlbl = 'Time to full'; time = full ? 'Fully charged' : (fmtDuration(battery.chargingTime) || 'Calculating…'); }
    else { tlbl = 'Time remaining'; time = fmtDuration(battery.dischargingTime) || 'Calculating…'; }
    set({
      icon: charging ? '⚡' : '🔋',
      sub: full ? 'Fully charged' : charging ? 'Connected to power' : 'Running on battery',
      badge: full ? 'Full' : charging ? 'Charging' : low ? 'Low' : 'On battery',
      cls: full || charging ? 'good' : low ? 'bad' : '',
      pct: pct + '%', cap: 'Charge level',
      width: pct, fill: low ? 'bad' : (!charging && pct <= 40) ? 'warn' : 'good',
      src: charging ? 'AC adapter' : 'Battery', tlbl: tlbl, time: time
    });
  }

  async function init() {
    set({ icon: '🔋', sub: 'Reading power status…', badge: '…', pct: DASH, cap: ' ', width: 0, src: DASH, tlbl: 'Time remaining', time: DASH });
    const [present] = await Promise.all([detectBattery(), (async () => {
      try {
        battery = await navigator.getBattery();
        ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((ev) => battery.addEventListener(ev, render));
      } catch (e) { battery = null; }
    })()]);
    hasBattery = present;
    if (hasBattery === null && !battery) hasBattery = false;
    render();
    setInterval(render, 30000);
  }
  init();
})();
