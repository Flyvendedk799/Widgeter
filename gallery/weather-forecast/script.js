(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let last = null;
  let busy = false;

  const WMO = {
    0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
    51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
    61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
    71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
    80: ['Light showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm, hail', '⛈️'], 99: ['Thunderstorm, hail', '⛈️']
  };
  const wmo = (code) => WMO[code] || ['Unknown', '🌡️'];
  const deg = (v) => Math.round(v) + '°';

  async function locate(query) {
    const parts = String(query).split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) throw new Error('No city set');
    const data = await widgeter.fetchJson('https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=' + encodeURIComponent(parts[0]), { ttl: 604800 });
    let res = data.results || [];
    if (parts.length > 1) {
      const hint = parts[parts.length - 1].toLowerCase();
      const m = res.filter((r) => [r.country_code, r.country, r.admin1].some((v) => v && v.toLowerCase() === hint));
      if (m.length) res = m;
    }
    if (!res.length) throw new Error('City "' + query + '" not found');
    return res[0];
  }

  function render(stale) {
    const d = last;
    if (!d) return;
    const dl = d.forecast.daily;
    const n = Math.min(d.days, dl.time.length);
    const lows = dl.temperature_2m_min.slice(0, n), highs = dl.temperature_2m_max.slice(0, n);
    const min = Math.min.apply(null, lows), max = Math.max.apply(null, highs), span = max - min || 1;
    $('city').textContent = d.place.name;
    $('sub').textContent = [d.place.admin1, d.place.country].filter(Boolean).join(', ') + (stale ? ' · offline, showing saved' : '');
    $('sub').style.color = stale ? 'var(--wg-warn)' : '';
    let html = '';
    for (let i = 0; i < n; i++) {
      const w = wmo(dl.weather_code[i]);
      const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(dl.time[i] + 'T12:00').toLocaleDateString([], { weekday: 'short' });
      const p = dl.precipitation_probability_max[i];
      const left = ((lows[i] - min) / span) * 100, width = Math.max(6, ((highs[i] - lows[i]) / span) * 100);
      html += '<div class="wg-item day" title="' + esc(w.text) + '"><span class="dn">' + esc(name) + '</span><span class="di">' + w[1] + '</span>' +
        '<span class="dp">' + (p >= 20 ? p + '%' : '') + '</span><span class="lo">' + deg(lows[i]) + '</span>' +
        '<span class="range"><i style="left:' + left.toFixed(1) + '%;width:' + Math.min(width, 100 - left).toFixed(1) + '%"></i></span>' +
        '<span class="hi">' + deg(highs[i]) + '</span></div>';
    }
    $('body').innerHTML = html;
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      const query = String((await widgeter.getConfig('owm_city')) || '').trim();
      const units = (await widgeter.getConfig('units')) === 'imperial' ? 'imperial' : 'metric';
      const days = Math.max(3, Math.min(7, Number(await widgeter.getConfig('days')) || 5));
      if (!query) { $('body').innerHTML = '<div class="wg-empty">Set a city in this widget\'s settings.</div>'; $('sub').textContent = 'Needs setup'; return; }
      const place = await locate(query);
      // Same request as the Weather widget, so the engine's shared cache serves both.
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover,is_day' +
        '&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=7' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max' +
        '&forecast_days=7&timezone=auto' + (units === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '');
      const forecast = await widgeter.fetchJson(url, { ttl: 600 });
      last = { place, forecast, days, at: Date.now() };
      render(false);
    } catch (e) {
      if (last) render(true);
      else { $('body').innerHTML = '<div class="wg-err">Could not load the forecast: ' + esc(e.message) + '</div>'; $('sub').textContent = 'Open-Meteo'; }
    } finally { busy = false; }
  }

  $('refresh').addEventListener('click', load);
  load();
  setInterval(load, 1800000);
})();
