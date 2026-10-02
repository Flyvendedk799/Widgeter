(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SEEN_KEY = 'rss-seen';
  let last = null; // { items, failed, at }
  let seen = new Set();
  let busy = false;

  try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { /* storage unavailable */ }
  function saveSeen() { try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-600))); } catch (e) { /* ignore */ } }

  function ago(ms) {
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd';
    return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function plain(html) { return new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.replace(/\s+/g, ' ').trim(); }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function text(el, tag) { const n = el.getElementsByTagName(tag)[0]; return n ? n.textContent : ''; }

  function parseFeed(xml, feedUrl) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Not a valid feed');
    const root = doc.documentElement;
    const out = [];
    if (root.localName === 'feed') { // Atom
      const src = plain(text(root, 'title')) || host(feedUrl);
      Array.from(root.getElementsByTagName('entry')).forEach((en) => {
        const links = Array.from(en.getElementsByTagName('link'));
        const alt = links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate') || links[0];
        const date = Date.parse(text(en, 'published') || text(en, 'updated'));
        out.push({ title: plain(text(en, 'title')), link: alt ? alt.getAttribute('href') : '', time: isNaN(date) ? 0 : date, source: src });
      });
    } else { // RSS / RDF
      const ch = root.getElementsByTagName('channel')[0] || root;
      const src = plain(text(ch, 'title')) || host(feedUrl);
      Array.from(root.getElementsByTagName('item')).forEach((it) => {
        const date = Date.parse(text(it, 'pubDate') || text(it, 'dc:date') || text(it, 'date'));
        out.push({ title: plain(text(it, 'title')), link: (text(it, 'link') || '').trim(), time: isNaN(date) ? 0 : date, source: src });
      });
    }
    return out.filter((i) => i.title && /^https?:\/\//i.test(i.link));
  }

  async function loadFeed(url) {
    const res = await widgeter.fetch(url, { ttl: 300, headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseFeed(res.text, url);
  }

  function render(stale) {
    const d = last;
    if (!d) return;
    if (!d.items.length) { $('list').innerHTML = '<div class="wg-empty">No headlines found in these feeds.</div>'; }
    else {
      $('list').innerHTML = d.items.map((it) => {
        const unread = !seen.has(it.link);
        return '<div class="wg-item post no-drag' + (unread ? ' unread' : '') + '" data-link="' + esc(it.link) + '">' +
          '<span class="mark"></span><div class="body"><div class="ttl">' + esc(it.title) + '</div>' +
          '<div class="meta"><span class="src wg-truncate">' + esc(it.source) + '</span><span class="when">' + (it.time ? ago(it.time) : '') + '</span></div></div></div>';
      }).join('');
    }
    const unreadCount = d.items.filter((i) => !seen.has(i.link)).length;
    $('sub').textContent = (unreadCount ? unreadCount + ' unread · ' : '') + d.feeds + (d.feeds === 1 ? ' feed' : ' feeds') + (stale ? ' · offline, showing saved' : '');
    $('sub').style.color = stale ? 'var(--wg-warn)' : '';
    $('note').textContent = d.failed.length ? 'Could not load: ' + d.failed.map(host).join(', ') : '';
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      const raw = (await widgeter.getConfig('rss_url')) || '';
      const urls = Array.from(new Set(String(raw).split(/[\r\n]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s)))).slice(0, 10);
      const max = Math.max(3, Math.min(40, Number(await widgeter.getConfig('max_items')) || 12));
      if (!urls.length) {
        $('list').innerHTML = '<div class="wg-empty">No feeds set.<br>Add RSS or Atom feed URLs in this widget\'s settings.</div>';
        $('sub').textContent = 'Needs setup';
        return;
      }
      const results = await Promise.all(urls.map((u) => loadFeed(u).then((items) => ({ u, items }), (err) => ({ u, err }))));
      const ok = results.filter((r) => r.items);
      const failed = results.filter((r) => r.err).map((r) => r.u);
      if (!ok.length) throw new Error(results[0].err.message);
      const seenLinks = new Set();
      const items = [].concat.apply([], ok.map((r) => r.items))
        .sort((a, b) => b.time - a.time)
        .filter((i) => !seenLinks.has(i.link) && seenLinks.add(i.link))
        .slice(0, max);
      last = { items, failed, feeds: urls.length, at: Date.now() };
      render(false);
    } catch (e) {
      if (last) render(true);
      else $('list').innerHTML = '<div class="wg-err">Could not load feeds: ' + esc(e.message) + '</div>';
    } finally { busy = false; }
  }

  $('list').addEventListener('click', (e) => {
    const row = e.target.closest('.post');
    if (!row) return;
    seen.add(row.dataset.link);
    saveSeen();
    row.classList.remove('unread');
    render(false);
    widgeter.openExternal(row.dataset.link);
  });
  $('readall').addEventListener('click', () => {
    if (!last) return;
    last.items.forEach((i) => seen.add(i.link));
    saveSeen();
    render(false);
  });
  $('refresh').addEventListener('click', load);
  load();
  setInterval(load, 600000);
})();
