(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let last = null;
  let busy = false;

  const WMO = {
    0: ['Clear sky', '☀️', '🌙'], 1: ['Mainly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
    51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
    61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
    71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
    80: ['Light showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm, hail', '⛈️'], 99: ['Thunderstorm, hail', '⛈️']
  };
  function wmo(code, day) { const w = WMO[code] || ['Unknown', '🌡️']; return { text: w[0], icon: day === 0 && w[2] ? w[2] : w[1] }; }
  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const dir = (deg) => COMPASS[Math.round(deg / 45) % 8];
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
    const f = d.forecast, c = f.current, dl = f.daily, imp = d.units === 'imperial';
    const tU = imp ? '°F' : '°C', wU = imp ? 'mph' : 'km/h';
    const cond = wmo(c.weather_code, c.is_day);
    const loc = d.place;
    $('city').textContent = loc.name;
    $('sub').textContent = [loc.admin1, loc.country].filter(Boolean).join(', ') + (stale ? ' · offline, showing saved' : '');
    $('sub').style.color = stale ? 'var(--wg-warn)' : '';

    // next hours (index 0 is the current hour)
    const hr = f.hourly;
    const hours = hr.time.slice(1, 7).map((t, i) => {
      const k = i + 1;
      const hour = new Date(t).toLocaleTimeString([], { hour: 'numeric' });
      const p = hr.precipitation_probability ? hr.precipitation_probability[k] : null;
      return '<div><div class="h">' + esc(hour) + '</div><div class="hi">' + wmo(hr.weather_code[k], 1).icon + '</div><div class="ht">' + deg(hr.temperature_2m[k]) + '</div><div class="hp">' + (p >= 20 ? p + '%' : '') + '</div></div>';
    }).join('');

    const press = imp ? (c.pressure_msl * 0.02953).toFixed(2) + ' inHg' : Math.round(c.pressure_msl) + ' hPa';
    const stat = (l, v) => '<div><div class="wg-caption">' + l + '</div><div class="wg-val" style="text-align:left">' + esc(v) + '</div></div>';
    const time = (s) => (s ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–');

    $('body').innerHTML =
      '<div class="now"><div class="ico">' + cond.icon + '</div>' +
      '<div class="temp"><div class="wg-big">' + Math.round(c.temperature_2m) + tU + '</div><div class="desc wg-truncate">' + esc(cond.text) + '</div><div class="feel">Feels like ' + deg(c.apparent_temperature) + '</div></div>' +
      '<div class="hl"><div>H <b>' + deg(dl.temperature_2m_max[0]) + '</b></div><div>L <b>' + deg(dl.temperature_2m_min[0]) + '</b></div></div></div>' +
      '<div class="wg-card hours">' + hours + '</div>' +
      '<div class="wg-card"><div class="stats">' +
      stat('Humidity', Math.round(c.relative_humidity_2m) + '%') +
      stat('Wind', Math.round(c.wind_speed_10m) + ' ' + wU + ' ' + dir(c.wind_direction_10m)) +
      stat('Pressure', press) +
      stat('Rain', (dl.precipitation_probability_max[0] != null ? dl.precipitation_probability_max[0] : 0) + '%') +
      stat('UV', dl.uv_index_max[0] != null ? Math.round(dl.uv_index_max[0]) : '–') +
      stat('Clouds', Math.round(c.cloud_cover) + '%') +
      '</div><div class="sun"><span>🌅 ' + time(dl.sunrise[0]) + '</span><span>🌇 ' + time(dl.sunset[0]) + '</span></div></div>';
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      const query = String((await widgeter.getConfig('owm_city')) || '').trim();
      const units = (await widgeter.getConfig('units')) === 'imperial' ? 'imperial' : 'metric';
      if (!query) { $('body').innerHTML = '<div class="wg-empty">Set a city in this widget\'s settings.</div>'; $('sub').textContent = 'Needs setup'; return; }
      const place = await locate(query);
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover,is_day' +
        '&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=7' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max' +
        '&forecast_days=7&timezone=auto' + (units === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '');
      const forecast = await widgeter.fetchJson(url, { ttl: 300 });
      last = { place, forecast, units, at: Date.now() };
      render(false);
    } catch (e) {
      if (last) render(true);
      else { $('body').innerHTML = '<div class="wg-err">Could not load the weather: ' + esc(e.message) + '</div>'; $('sub').textContent = 'Open-Meteo'; }
    } finally { busy = false; }
  }

  $('refresh').addEventListener('click', load);
  load();
  setInterval(load, 600000);
})();
