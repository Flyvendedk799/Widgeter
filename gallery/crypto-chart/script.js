(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = 'https://api.binance.com/api/v3';
  const QUOTES = ['FDUSD', 'USDT', 'USDC', 'BUSD', 'TUSD', 'USDP', 'DAI', 'EUR', 'TRY', 'GBP', 'BRL', 'BTC', 'ETH', 'BNB'];
  const canvas = $('chart');
  const ctx = canvas.getContext('2d');

  let symbol = 'BTCUSDT';
  let interval = '1h';
  let candles = []; // { t, c }
  let hoverIdx = -1;
  let busy = false;
  let hasData = false;
  let loadSeq = 0;
  let again = false;

  function cleanSymbol(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT'; }
  function prettyPair(s) {
    for (const q of QUOTES) if (s.length > q.length && s.endsWith(q)) return s.slice(0, -q.length) + ' / ' + q;
    return s;
  }
  function decimals(v) { v = Math.abs(v); return v >= 1000 ? 2 : v >= 1 ? 3 : v >= 0.1 ? 4 : v >= 0.01 ? 5 : 6; }
  function fmt(v, d) { return Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function price(v) { return fmt(v, decimals(v)); }
  function compact(v) { return Number(v).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 }); }
  function qty(v) { v = Number(v); return v >= 100 ? fmt(v, 1) : v >= 1 ? fmt(v, 3) : fmt(v, 4); }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function timeLabel(t) {
    const d = new Date(t);
    return interval === '1d' ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function api(path) {
    const res = await widgeter.fetch(API + path, { ttl: 20 });
    if (res.status === 400) throw new Error('Unknown pair "' + symbol + '" on Binance');
    if (res.status === 451 || res.status === 403) throw new Error('Binance is not available from this location (HTTP ' + res.status + ')');
    if (!res.ok) throw new Error('Binance returned HTTP ' + res.status);
    return res.json();
  }

  // ---- chart ----------------------------------------------------------------
  function draw() {
    const wrap = $('wrap');
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (candles.length < 2) return;

    const closes = candles.map((c) => c.c);
    let min = Math.min.apply(null, closes), max = Math.max.apply(null, closes);
    if (max === min) { max += max * 0.001 || 1; min -= min * 0.001 || 1; }
    const pad = (max - min) * 0.08;
    min -= pad; max += pad;
    const left = 2, right = 50, top = 14, bottom = 14;
    const cw = w - left - right, ch = h - top - bottom;
    const x = (i) => left + (i / (closes.length - 1)) * cw;
    const y = (v) => top + (1 - (v - min) / (max - min)) * ch;
    const up = closes[closes.length - 1] >= closes[0];
    const color = css(up ? '--wg-good' : '--wg-bad');
    const muted = css('--wg-faint');
    const border = css('--wg-border');

    // grid + y labels
    ctx.font = '9.5px ' + css('--wg-mono');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < 3; k++) {
      const v = max - ((max - min) * (k + 0.5)) / 3;
      const yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(w - right, yy); ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillText(v >= 1000 ? fmt(v, 0) : price(v), w - right + 5, yy);
    }

    // x labels
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    ctx.fillText(timeLabel(candles[0].t), left, h - 2);
    ctx.textAlign = 'right';
    ctx.fillText(timeLabel(candles[candles.length - 1].t), w - right, h - 2);

    // area
    const grad = ctx.createLinearGradient(0, top, 0, top + ch);
    grad.addColorStop(0, color.startsWith('#') ? color + '44' : color);
    grad.addColorStop(1, color.startsWith('#') ? color + '00' : 'transparent');
    ctx.beginPath();
    closes.forEach((v, i) => { if (i === 0) ctx.moveTo(x(i), y(v)); else ctx.lineTo(x(i), y(v)); });
    ctx.lineTo(x(closes.length - 1), top + ch);
    ctx.lineTo(x(0), top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    closes.forEach((v, i) => { if (i === 0) ctx.moveTo(x(i), y(v)); else ctx.lineTo(x(i), y(v)); });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // last price marker
    const li = closes.length - 1;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x(li), y(closes[li]), 2.6, 0, Math.PI * 2); ctx.fill();

    // hover crosshair
    if (hoverIdx >= 0 && hoverIdx < closes.length) {
      const hx = x(hoverIdx), hy = y(closes[hoverIdx]);
      ctx.strokeStyle = muted;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx, top + ch); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css('--wg-fg');
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function setHover(i) {
    hoverIdx = i;
    const el = $('hover');
    if (i >= 0 && candles[i]) el.innerHTML = timeLabel(candles[i].t) + ' &nbsp;<b>' + esc(price(candles[i].c)) + '</b>';
    else el.innerHTML = '';
    draw();
  }

  canvas.addEventListener('mousemove', (e) => {
    if (candles.length < 2) return;
    const r = canvas.getBoundingClientRect();
    const cw = r.width - 2 - 50;
    const i = Math.round(((e.clientX - r.left - 2) / cw) * (candles.length - 1));
    setHover(Math.max(0, Math.min(candles.length - 1, i)));
  });
  canvas.addEventListener('mouseleave', () => setHover(-1));
  new ResizeObserver(draw).observe($('wrap'));
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });

  // ---- ticker / book ---------------------------------------------------------
  function renderTicker(t) {
    const last = Number(t.lastPrice), pct = Number(t.priceChangePercent);
    $('price').textContent = price(last);
    const chg = $('chg');
    chg.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    chg.className = 'wg-badge ' + (pct >= 0 ? 'good' : 'bad');
    $('hi').textContent = price(t.highPrice);
    $('lo').textContent = price(t.lowPrice);
    $('vol').textContent = compact(t.quoteVolume);
  }

  function renderBook(d) {
    const bids = d.bids.slice(0, 5), asks = d.asks.slice(0, 5);
    const maxQ = Math.max.apply(null, bids.concat(asks).map((l) => Number(l[1]))) || 1;
    const row = (l) => '<div class="lv"><i style="width:' + Math.max(4, (Number(l[1]) / maxQ) * 100).toFixed(0) + '%"></i><span class="p">' + esc(price(l[0])) + '</span><span class="q">' + esc(qty(l[1])) + '</span></div>';
    $('bids').innerHTML = bids.map(row).join('');
    $('asks').innerHTML = asks.map(row).join('');
    if (bids[0] && asks[0]) {
      const sp = Number(asks[0][0]) - Number(bids[0][0]);
      $('spread').textContent = 'Spread ' + Number(sp.toPrecision(3)).toLocaleString(undefined, { maximumFractionDigits: 8 });
    }
  }

  // ---- loading -----------------------------------------------------------------
  async function load() {
    if (busy) { again = true; return; }
    busy = true;
    const seq = ++loadSeq;
    const err = $('err');
    try {
      symbol = cleanSymbol(await widgeter.getConfig('symbol'));
      $('pair').textContent = prettyPair(symbol);
      const [ticker, kl, book] = await Promise.all([
        api('/ticker/24hr?symbol=' + symbol),
        api('/klines?symbol=' + symbol + '&interval=' + interval + '&limit=96'),
        api('/depth?symbol=' + symbol + '&limit=5')
      ]);
      if (seq !== loadSeq) return;
      candles = kl.map((k) => ({ t: k[0], c: Number(k[4]) }));
      renderTicker(ticker);
      renderBook(book);
      hasData = true;
      err.hidden = true;
      $('sub').textContent = 'Binance spot · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      $('sub').style.color = '';
      draw();
    } catch (e) {
      if (hasData) {
        $('sub').textContent = 'Binance · stale: ' + (e.message || 'offline');
        $('sub').style.color = 'var(--wg-warn)';
      } else {
        err.textContent = 'Could not load market data: ' + e.message;
        err.hidden = false;
      }
    } finally { busy = false; if (again) { again = false; load(); } }
  }

  function markTabs() {
    document.querySelectorAll('#tabs .wg-btn').forEach((b) => b.classList.toggle('on', b.dataset.i === interval));
  }
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.i === interval) return;
    interval = b.dataset.i;
    markTabs();
    try { widgeter.setConfig('interval', interval); } catch (x) { /* optional */ }
    hoverIdx = -1;
    load();
  });

  (async function init() {
    const iv = await widgeter.getConfig('interval');
    if (['15m', '1h', '4h', '1d'].includes(iv)) interval = iv;
    markTabs();
    load();
    setInterval(load, 30000);
  })();
})();
