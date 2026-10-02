(async function () {
  const cfgName = String((await widgeter.getConfig('cd_name')) || '').trim();
  const cfgDate = String((await widgeter.getConfig('cd_date')) || '').trim();
  const cfgCreated = await widgeter.getConfig('cd_created'); // set by older versions
  const savedStart = (await widgeter.getConfig('cd_start')) || {};
  const notifiedKey = await widgeter.getConfig('cd_notified');

  const $ = (id) => document.getElementById(id);
  const titleEl = $('cd-title');
  const targetEl = $('cd-target');
  const gridEl = $('cd-grid');
  const badgeEl = $('cd-badge');
  const fillEl = $('cd-fill');
  const pctEl = $('cd-pct');
  const pad = (n) => String(n).padStart(2, '0');

  // "2026-12-31", "2026-12-31 18:00" or "2026-12-31T18:00", read as local time.
  function parseDate(text) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }

  let target = null;
  let start = null;
  let name = cfgName;
  let error = '';

  if (cfgDate) {
    target = parseDate(cfgDate);
    if (!target) error = 'Could not read the date "' + cfgDate + '". Use YYYY-MM-DD or YYYY-MM-DD HH:MM in the settings.';
  } else {
    const y = new Date().getFullYear();
    target = new Date(y + 1, 0, 1);
    start = new Date(y, 0, 1);
    if (!name) name = 'New Year ' + (y + 1);
  }

  const targetKey = target ? cfgDate + '|' + target.getTime() : '';
  if (target && !start) {
    // When did this countdown begin? Remembered per target so the progress bar survives reloads.
    if (savedStart.key === targetKey && Number(savedStart.at) > 0) start = new Date(Number(savedStart.at));
    else {
      const legacy = cfgCreated ? new Date(cfgCreated) : null;
      start = legacy && !isNaN(legacy.getTime()) && legacy < target ? legacy : new Date();
      widgeter.setConfig('cd_start', { key: targetKey, at: start.getTime() });
    }
  }

  titleEl.textContent = name || 'Countdown';
  if (target) {
    targetEl.textContent = target.toLocaleString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (error) {
    gridEl.insertAdjacentHTML('beforebegin', '<div class="cd-err"></div>');
    gridEl.previousElementSibling.textContent = error;
    targetEl.textContent = 'Check the settings';
  }

  let finished = false;
  function update() {
    if (!target) return;
    const now = Date.now();
    const diff = target.getTime() - now;
    if (diff <= 0) {
      if (!finished) {
        finished = true;
        gridEl.classList.add('done');
        badgeEl.hidden = false;
        badgeEl.className = 'wg-badge good';
        badgeEl.textContent = '🎉 Time\'s up';
        if (notifiedKey !== targetKey && diff > -6 * 3600000) {
          widgeter.notify('Countdown finished', (name || 'Your countdown') + ' has arrived.');
          widgeter.setConfig('cd_notified', targetKey);
        }
      }
      $('cd-d').textContent = '0';
      $('cd-h').textContent = '00';
      $('cd-m').textContent = '00';
      $('cd-s').textContent = '00';
      fillEl.style.width = '100%';
      pctEl.textContent = '100% of the time has passed';
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    $('cd-d').textContent = d;
    $('cd-h').textContent = pad(h);
    $('cd-m').textContent = pad(m);
    $('cd-s').textContent = pad(s);
    const total = target.getTime() - start.getTime();
    const pct = total > 0 ? Math.max(0, Math.min(100, ((now - start.getTime()) / total) * 100)) : 0;
    fillEl.style.width = pct.toFixed(1) + '%';
    pctEl.textContent = Math.floor(pct) + '% of the time has passed';
  }

  update();
  setInterval(update, 1000);
})();
