(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let last = null;
  let blur = false;
  let busy = false;
  let copied = false;

  function localTime(tz) {
    try { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz }); } catch (e) { return ''; }
  }

  function render(stale) {
    const d = last;
    if (!d) return;
    const place = [d.city, d.country].filter(Boolean).join(', ');
    const tz = d.timezone || {};
    $('body').innerHTML =
      '<div class="wg-card ipcard"><div style="min-width:0"><div class="ip no-drag' + (blur ? ' blur' : '') + '" id="ip" title="Click to copy">' + esc(d.ip) + '</div>' +
      '<div class="hint" id="hint">' + (copied ? 'Copied to clipboard' : 'Click to copy') + '</div></div>' +
      '<span class="wg-badge accent">' + esc(d.type || 'IP') + '</span></div>' +
      '<div class="wg-card">' +
      row('Location', place || 'Unknown', 'long') +
      (d.region ? row('Region', d.region, 'long') : '') +
      row('ISP', (d.connection && (d.connection.isp || d.connection.org)) || 'Unknown', 'long') +
      (d.connection && d.connection.asn ? row('ASN', 'AS' + d.connection.asn) : '') +
      row('Timezone', tz.id || '–', 'long') + (tz.id ? row('Local time', localTime(tz.id) + (tz.abbr ? ' ' + tz.abbr : '')) : '') +
      (d.latitude != null ? row('Coordinates', Number(d.latitude).toFixed(2) + ', ' + Number(d.longitude).toFixed(2), 'link', 'map') : '') +
      '</div>';
    $('sub').textContent = stale ? 'Offline, showing last lookup' : 'Updated ' + new Date(d.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('sub').style.color = stale ? 'var(--wg-warn)' : '';
  }
  function row(label, value, cls, act) {
    return '<div class="wg-row"><span class="wg-lbl">' + esc(label) + '</span><span class="wg-val ' + (cls || '') + (act ? ' no-drag' : '') + '"' + (act ? ' data-act="' + act + '" title="Open in map"' : ' title="' + esc(value) + '"') + '>' + esc(value) + '</span></div>';
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      blur = !!(await widgeter.getConfig('blur_ip'));
      const d = await widgeter.fetchJson('https://ipwho.is/', { ttl: 300 });
      if (d.success === false) throw new Error(d.message || 'Lookup failed');
      last = Object.assign({}, d, { at: Date.now() });
      render(false);
    } catch (e) {
      if (last) render(true);
      else $('body').innerHTML = '<div class="wg-err">Could not look up your IP: ' + esc(e.message) + '</div>';
    } finally { busy = false; }
  }

  $('body').addEventListener('click', (e) => {
    if (e.target.closest('#ip') && last) {
      try { navigator.clipboard.writeText(last.ip); copied = true; $('hint').textContent = 'Copied to clipboard'; setTimeout(() => { copied = false; const h = $('hint'); if (h) h.textContent = 'Click to copy'; }, 1500); } catch (x) { /* ignore */ }
    } else if (e.target.closest('[data-act="map"]') && last) {
      widgeter.openExternal('https://www.openstreetmap.org/?mlat=' + last.latitude + '&mlon=' + last.longitude + '#map=10/' + last.latitude + '/' + last.longitude);
    }
  });
  $('refresh').addEventListener('click', load);
  load();
  setInterval(load, 600000);
})();
