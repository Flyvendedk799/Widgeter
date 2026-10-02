(async function () {
  const h24 = !!(await widgeter.getConfig('dc_24h'));
  const showSeconds = !!(await widgeter.getConfig('dc_seconds'));
  const showDate = !!(await widgeter.getConfig('dc_date'));

  const hmEl = document.getElementById('dc-hm');
  const secEl = document.getElementById('dc-sec');
  const ampmEl = document.getElementById('dc-ampm');
  const dateEl = document.getElementById('dc-date');
  const weekEl = document.getElementById('dc-week');
  const pad = (n) => String(n).padStart(2, '0');

  if (!showDate) { dateEl.style.display = 'none'; weekEl.style.display = 'none'; }

  // ISO 8601 week number (weeks start on Monday, week 1 contains the first Thursday).
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
    return { week: Math.ceil(((t - yearStart) / 86400000 + 1) / 7), year: t.getUTCFullYear() };
  }

  let lastDay = '';
  function update() {
    const n = new Date();
    let h = n.getHours();
    let suffix = '';
    if (!h24) { suffix = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
    hmEl.textContent = (h24 ? pad(h) : String(h)) + ':' + pad(n.getMinutes());
    secEl.textContent = showSeconds ? ':' + pad(n.getSeconds()) : '';
    ampmEl.textContent = suffix;
    const day = n.toDateString();
    if (showDate && day !== lastDay) {
      lastDay = day;
      dateEl.textContent = n.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const w = isoWeek(n);
      weekEl.textContent = 'Week ' + w.week + ' of ' + w.year;
    }
  }
  update();
  setInterval(update, 1000);
})();
