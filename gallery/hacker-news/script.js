(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = 'https://hacker-news.firebaseio.com/v0';
  const LABELS = { topstories: 'Top stories', newstories: 'New stories', beststories: 'Best stories', askstories: 'Ask HN', showstories: 'Show HN' };
  let last = null; // { stories, at, feed }
  let busy = false;

  function ago(ts) {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }
  function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  // Fetch items with at most `limit` requests in flight.
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        try { out[i] = await fn(items[i]); } catch (e) { out[i] = null; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  function render(stale) {
    const d = last;
    if (!d) return;
    if (!d.stories.length) { $('list').innerHTML = '<div class="wg-empty">No stories right now.</div>'; return; }
    $('list').innerHTML = d.stories.map((s, i) => {
      const dom = s.url ? domain(s.url) : '';
      return '<div class="wg-item story no-drag" data-url="' + esc(s.url || '') + '" data-id="' + s.id + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<div class="body"><div class="ttl">' + esc(s.title) + '</div>' +
        '<div class="meta"><span class="pts">▲ ' + (s.score || 0) + '</span>' +
        '<span class="cm no-drag" data-cm="1" title="Open discussion">💬 ' + (s.descendants || 0) + '</span>' +
        (dom ? '<span class="dom wg-truncate">' + esc(dom) + '</span>' : '') +
        '<span>' + esc(s.by || '') + ' · ' + ago(s.time) + '</span></div></div></div>';
    }).join('');
    $('title').textContent = LABELS[d.feed] || 'Hacker News';
    $('sub').textContent = 'news.ycombinator.com · ' + (stale ? 'offline, showing saved list' : new Date(d.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    $('sub').style.color = stale ? 'var(--wg-warn)' : '';
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      let feed = await widgeter.getConfig('feed');
      if (!LABELS[feed]) feed = 'topstories';
      const count = Math.max(3, Math.min(30, Number(await widgeter.getConfig('count')) || 10));
      const ids = (await widgeter.fetchJson(API + '/' + feed + '.json', { ttl: 120 })).slice(0, count);
      const items = await mapLimit(ids, 5, (id) => widgeter.fetchJson(API + '/item/' + id + '.json', { ttl: 300 }));
      const stories = items.filter((s) => s && !s.dead && !s.deleted && s.title);
      if (!stories.length) throw new Error('Could not load any stories');
      last = { stories, at: Date.now(), feed };
      render(false);
    } catch (e) {
      if (last) render(true);
      else $('list').innerHTML = '<div class="wg-err">Could not load Hacker News: ' + esc(e.message) + '</div>';
    } finally { busy = false; }
  }

  $('list').addEventListener('click', (e) => {
    const row = e.target.closest('.story');
    if (!row) return;
    const hn = 'https://news.ycombinator.com/item?id=' + row.dataset.id;
    widgeter.openExternal(e.target.closest('[data-cm]') || !row.dataset.url ? hn : row.dataset.url);
  });
  $('refresh').addEventListener('click', load);
  load();
  setInterval(load, 300000);
})();
