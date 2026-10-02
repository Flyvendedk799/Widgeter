(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = 'https://api.frankfurter.dev/v1';
  let last = null;
  let busy = false;

  function codes(raw) {
    return Array.from(new Set(String(raw || '').toUpperCase().split(/[^A-Z]+/).filter((c) => c.length === 3)));
  }
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function fmtRate(v) {
    const d = v >= 100 ? 2 : v >= 1 ? 4 : v >= 0.01 ? 5 : 7;
    return v.toLocaleString(undefined, { minimumFractionDigits: Math.min(d, 4), maximumFractionDigits: d });
  }

  function spark(vals) {
    if (vals.length < 2) return '<svg class="spark"></svg>';
    const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), range = max - min || 1;
    const pts = vals.map((v, i) => (i / (vals.length - 1) * 60).toFixed(1) + ',' + (20 - ((v - min) / range) * 18).toFixed(1)).join(' ');
    return '<svg class="spark" viewBox="0 0 60 22" preserveAspectRatio="none"><polyline points="' + pts + '"/></svg>';
  }

  function render(stale) {
    const d = last;
    if (!d) return;
    $('title').textContent = d.amount === 1 ? d.base + ' rates' : d.amount.toLocaleString() + ' ' + d.base;
    $('list').innerHTML = d.rows.map((r) => {
      const up = r.change >= 0;
      return '<div class="wg-item rate">' +
        '<div class="left"><div class="code">' + esc(r.code) + '</div><div class="nm wg-truncate">' + esc(r.name) + '</div></div>' +
        spark(r.series) +
        '<div class="right"><div class="val-n">' + esc(fmtRate(r.rate)) + '</div>' +
        '<div class="chg ' + (r.change == null ? 'wg-muted' : up ? 'wg-good' : 'wg-bad') + '">' + (r.change == null ? '–' : (up ? '+' : '') + r.change.toFixed(2) + '%') + '</div></div></div>';
    }).join('');
    $('note').textContent = d.unknown.length ? 'Not available from the ECB: ' + d.unknown.join(', ') : '';
    $('sub').textContent = 'ECB · ' + d.date + (stale ? ' · offline, showing saved rates' : '');
    $('sub').style.color = stale ? 'var(--wg-warn)' : '';
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      const base = codes(await widgeter.getConfig('base'))[0] || 'EUR';
      let amount = Number(await widgeter.getConfig('amount'));
      if (!(amount > 0)) amount = 1;
      const wanted = codes(await widgeter.getConfig('targets')).filter((c) => c !== base).slice(0, 10);
      if (!wanted.length) { $('list').innerHTML = '<div class="wg-empty">Add at least one target currency in settings.</div>'; return; }

      const names = await widgeter.fetchJson(API + '/currencies', { ttl: 86400 }).catch(() => ({}));
      const start = ymd(new Date(Date.now() - 32 * 86400000));
      const symbols = wanted.filter((c) => !Object.keys(names).length || names[c]);
      const unknown = wanted.filter((c) => !symbols.includes(c));
      if (Object.keys(names).length && !names[base]) throw new Error('Unknown base currency "' + base + '"');
      if (!symbols.length) throw new Error('None of the target currencies are available');
      const data = await widgeter.fetchJson(API + '/' + start + '..?base=' + base + '&symbols=' + symbols.join(','), { ttl: 1800 });
      const dates = Object.keys(data.rates).sort();
      if (!dates.length) throw new Error('No rates returned');
      const latest = data.rates[dates[dates.length - 1]];
      const before = dates.length > 1 ? data.rates[dates[dates.length - 2]] : null;
      const rows = symbols.filter((c) => latest[c] != null).map((c) => ({
        code: c,
        name: names[c] || '',
        rate: latest[c] * amount,
        change: before && before[c] ? (latest[c] / before[c] - 1) * 100 : null,
        series: dates.map((dt) => data.rates[dt][c]).filter((v) => v != null)
      }));
      last = { base, amount, rows, unknown, date: dates[dates.length - 1] };
      render(false);
    } catch (e) {
      if (last) render(true);
      else $('list').innerHTML = '<div class="wg-err">Could not load rates: ' + esc(e.message) + '</div>';
    } finally { busy = false; }
  }

  $('refresh').addEventListener('click', load);
  load();
  setInterval(load, 1800000);
})();
