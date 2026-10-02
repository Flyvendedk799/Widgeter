(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let last = null; // last good { coins, missing, cur, at }
  let prev = {};
  let busy = false;

  function money(v, cur) {
    const digits = v >= 1000 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits }).format(v);
    } catch (e) { return v.toFixed(digits) + ' ' + cur.toUpperCase(); }
  }

  function spark(prices, up) {
    if (!prices || prices.length < 2) return '<svg class="spark"></svg>';
    const step = Math.max(1, Math.floor(prices.length / 42));
    const pts = prices.filter((_, i) => i % step === 0);
    const min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), range = max - min || 1;
    const d = pts.map((p, i) => (i / (pts.length - 1) * 60).toFixed(1) + ',' + (20 - ((p - min) / range) * 18).toFixed(1)).join(' ');
    return '<svg class="spark ' + (up ? 'good' : 'bad') + '" viewBox="0 0 60 22" preserveAspectRatio="none"><polyline points="' + d + '"/></svg>';
  }

  function render(stale) {
    const d = last;
    if (!d) return;
    if (!d.coins.length) {
      $('list').innerHTML = '<div class="wg-empty">No matching coins.<br>Check the coin IDs in settings.</div>';
    } else {
      $('list').innerHTML = d.coins.map((c) => {
        const chg = c.price_change_percentage_24h;
        const up = (chg || 0) >= 0;
        const p = prev[c.id];
        const flash = p !== undefined && p !== c.current_price ? (c.current_price > p ? ' flash-up' : ' flash-down') : '';
        const sp = c.sparkline_in_7d && c.sparkline_in_7d.price;
        const weekUp = sp && sp.length ? sp[sp.length - 1] >= sp[0] : up;
        return '<div class="wg-item coin no-drag' + flash + '" data-id="' + esc(c.id) + '" title="Open on CoinGecko">' +
          '<div class="left"><div class="sym">' + esc(String(c.symbol).toUpperCase()) + '</div><div class="nm wg-truncate">' + esc(c.name) + '</div></div>' +
          spark(sp, weekUp) +
          '<div class="right"><div class="price">' + esc(money(c.current_price, d.cur)) + '</div>' +
          '<div class="chg ' + (chg == null ? 'wg-muted' : up ? 'wg-good' : 'wg-bad') + '">' + (chg == null ? '–' : (up ? '+' : '') + chg.toFixed(2) + '%') + '</div></div></div>';
      }).join('');
      d.coins.forEach((c) => { prev[c.id] = c.current_price; });
    }
    $('note').textContent = d.missing.length ? 'Unknown coin ID: ' + d.missing.join(', ') : '';
    $('sub').textContent = 'CoinGecko · ' + d.cur.toUpperCase() + ' · ' + (stale ? 'offline, showing ' : '') + new Date(d.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('sub').style.color = stale ? 'var(--wg-warn)' : '';
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      const raw = (await widgeter.getConfig('coins')) || '';
      const cur = String((await widgeter.getConfig('currency')) || 'usd').toLowerCase();
      const ids = Array.from(new Set(String(raw).toLowerCase().split(/[\s,;]+/).filter(Boolean))).slice(0, 12);
      if (!ids.length) { $('list').innerHTML = '<div class="wg-empty">Add at least one coin in settings.</div>'; return; }
      const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=' + encodeURIComponent(cur) +
        '&ids=' + encodeURIComponent(ids.join(',')) + '&order=market_cap_desc&sparkline=true&price_change_percentage=24h';
      const data = await widgeter.fetchJson(url, { ttl: 60 });
      const byId = {};
      data.forEach((c) => { byId[c.id] = c; });
      last = { coins: ids.filter((i) => byId[i]).map((i) => byId[i]), missing: ids.filter((i) => !byId[i]), cur, at: Date.now() };
      render(false);
    } catch (e) {
      if (last) render(true);
      else $('list').innerHTML = '<div class="wg-err">Could not load prices: ' + esc(e.message) + '</div>';
    } finally { busy = false; }
  }

  $('list').addEventListener('click', (e) => {
    const row = e.target.closest('.coin');
    if (row) widgeter.openExternal('https://www.coingecko.com/en/coins/' + encodeURIComponent(row.dataset.id));
  });
  $('refresh').addEventListener('click', load);
  load();
  setInterval(load, 60000);
})();
