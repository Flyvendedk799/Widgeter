(async function () {
  const raw = String((await widgeter.getConfig('wc_zones')) || '');
  const h24 = !!(await widgeter.getConfig('wc_24h'));
  const showSeconds = !!(await widgeter.getConfig('wc_seconds'));
  const listEl = document.getElementById('wc');
  const subEl = document.getElementById('wc-sub');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // "Name = Zone", "Name | Zone" or just "Zone" (the city is taken from the zone name).
  function parseZones(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12).map((line) => {
      const m = line.split(/\s*[=|]\s*/);
      const tz = (m.length > 1 ? m[m.length - 1] : m[0]).trim();
      const city = m.length > 1 ? m.slice(0, -1).join(' ').trim() : tz.split('/').pop().replace(/_/g, ' ');
      let fmt = null;
      let wall = null;
      try {
        fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
        wall = (d) => {
          const p = {};
          fmt.formatToParts(d).forEach((x) => { p[x.type] = Number(x.value); });
          return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
        };
      } catch (e) { /* invalid time zone */ }
      return { city: city || tz, tz, wall };
    });
  }

  const zones = parseZones(raw);
  const localFmt = (d) => ({ y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() });
  const wallMs = (w) => Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function offsetLabel(diffMin) {
    if (diffMin === 0) return 'Same time';
    const sign = diffMin > 0 ? '+' : '−';
    const a = Math.abs(diffMin);
    const h = Math.floor(a / 60);
    const m = a % 60;
    return sign + h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function update() {
    const now = new Date();
    const here = localFmt(now);
    subEl.textContent = 'Your time ' + pad(here.h) + ':' + pad(here.mi);
    if (!zones.length) {
      listEl.innerHTML = '<div class="wg-empty">No cities configured.<br>Add some in the widget settings.</div>';
      return;
    }
    const hereDay = Date.UTC(here.y, here.mo - 1, here.d);
    listEl.innerHTML = zones.map((z) => {
      if (!z.wall) {
        return '<div class="wg-item tz bad"><div class="wg-grow"><div class="tz-city wg-truncate">' + escapeHtml(z.city) +
          '</div><div class="tz-note">Unknown time zone "' + escapeHtml(z.tz) + '"</div></div></div>';
      }
      const w = z.wall(now);
      const diffMin = Math.round((wallMs(w) - wallMs(here)) / 60000);
      const dayDiff = Math.round((Date.UTC(w.y, w.mo - 1, w.d) - hereDay) / 86400000);
      const rel = dayDiff === 0 ? 'Today' : dayDiff > 0 ? 'Tomorrow' : 'Yesterday';
      const isDay = w.h >= 6 && w.h < 20;
      let hh = w.h;
      let suffix = '';
      if (!h24) { suffix = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12; }
      const time = (h24 ? pad(hh) : hh) + ':' + pad(w.mi) + (showSeconds ? ':' + pad(w.s) : '');
      const dow = DAYS[new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay()];
      return '<div class="wg-item tz">' +
        '<span class="tz-sun" title="' + (isDay ? 'Daytime' : 'Night') + '">' + (isDay ? '☀️' : '🌙') + '</span>' +
        '<div class="wg-grow"><div class="tz-city wg-truncate">' + escapeHtml(z.city) + '</div>' +
        '<div class="tz-note wg-truncate">' + rel + ' · ' + offsetLabel(diffMin) + '</div></div>' +
        '<div class="tz-right"><div class="tz-time">' + time + (suffix ? '<span class="tz-ampm">' + suffix + '</span>' : '') + '</div>' +
        '<div class="tz-date">' + dow + ', ' + MONTHS[w.mo - 1] + ' ' + w.d + '</div></div></div>';
    }).join('');
  }

  update();
  setInterval(update, 1000);
})();
