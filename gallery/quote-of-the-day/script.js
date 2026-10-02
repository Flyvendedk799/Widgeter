(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = 'https://dummyjson.com/quotes';
  const KEY = 'qotd-last';
  let current = null; // { text, author, at, day, manual }
  let busy = false;

  function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function store(q) { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) { /* storage unavailable */ } }
  function restore() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }

  function render(stale) {
    if (!current) return;
    $('q').innerHTML = '<div class="qt-text' + (current.text.length > 140 ? ' long' : '') + '">' + esc(current.text) + '</div><div class="qt-author">' + esc(current.author || 'Unknown') + '</div>';
    $('sub').textContent = stale ? 'Offline, showing last quote' : (current.manual ? 'Random pick' : new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));
    $('sub').style.color = stale ? 'var(--wg-warn)' : '';
  }

  async function fetchQuote(random, seed) {
    if (random) return widgeter.fetchJson(API + '/random');
    const meta = await widgeter.fetchJson(API + '?limit=1&select=id', { ttl: 86400 });
    const total = meta.total || 1400;
    return widgeter.fetchJson(API + '/' + ((hash(seed) % total) + 1), { ttl: 86400 });
  }

  async function load(manual) {
    if (busy) return;
    busy = true;
    try {
      const mode = (await widgeter.getConfig('mode')) === 'hourly' ? 'hourly' : 'daily';
      const day = today();
      const stamp = mode === 'hourly' ? day + 'T' + new Date().getHours() : day;
      if (!manual && current && current.stamp === stamp) { render(false); return; }
      const q = await fetchQuote(!!manual || mode === 'hourly', stamp);
      if (!q || !q.quote) throw new Error('Unexpected response');
      current = { text: q.quote, author: q.author, stamp, manual: !!manual };
      store(current);
      render(false);
    } catch (e) {
      if (current) render(true);
      else $('q').innerHTML = '<div class="wg-err">Could not load a quote: ' + esc(e.message) + '</div>';
    } finally { busy = false; }
  }

  $('new').addEventListener('click', () => load(true));
  $('copy').addEventListener('click', () => {
    if (!current) return;
    try { navigator.clipboard.writeText('“' + current.text + '” — ' + (current.author || 'Unknown')); $('copy').textContent = '✓'; setTimeout(() => { $('copy').textContent = '⧉'; }, 1200); } catch (e) { /* ignore */ }
  });

  // Show the last quote immediately (also the offline fallback), then refresh.
  const saved = restore();
  if (saved && saved.text) { current = saved; render(true); $('sub').textContent = 'Refreshing...'; $('sub').style.color = ''; }
  load(false);
  setInterval(() => load(false), 900000);
})();
