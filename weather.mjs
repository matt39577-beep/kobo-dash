// Weather: Open-Meteo first, MET Norway (yr.no) as a backup, then the last good copy.
// All free, no API keys.

import { zonedParts } from './time.mjs';

const why = (e) => `${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`;

export async function getWeather(loc, units, tz, cacheUrl) {
  const imperial = units === 'imperial';
  const errors = [];
  for (const [name, fn] of [['Open-Meteo', openMeteo], ['MET Norway', metNorway]]) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await fn(loc, imperial, tz);
      } catch (e) {
        console.error(`[weather] ${name} attempt ${attempt}: ${why(e)}`);
        errors.push(`${name}: ${why(e)}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  // Both services failed: reuse the last good weather if it's under 6 hours old.
  if (cacheUrl) {
    try {
      const res = await fetch(`${cacheUrl}?t=${Date.now()}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const c = await res.json();
        if (Date.now() - new Date(c.fetchedAt) < 6 * 3600 * 1000) {
          console.error('[weather] using cached weather from', c.fetchedAt);
          return { ...c, staleAt: c.fetchedAt };
        }
      }
    } catch (e) { console.error(`[weather] cache: ${why(e)}`); }
  }
  throw new Error(errors[0] || 'unavailable');
}

async function openMeteo(loc, imperial, tz) {
  const q = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, timezone: tz, forecast_days: '5',
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    temperature_unit: imperial ? 'fahrenheit' : 'celsius',
    wind_speed_unit: imperial ? 'mph' : 'kmh',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, {
    signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'kobo-dash (github.com)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return shapeWeather(await res.json(), imperial);
}

// MET Norway symbol codes -> the WMO-style codes the icons use
function metCode(sym = '') {
  const s = sym.replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 95;
  if (s.includes('sleet')) return 66;
  if (s.includes('snowshowers')) return 85;
  if (s.includes('snow')) return s.startsWith('heavy') ? 75 : s.startsWith('light') ? 71 : 73;
  if (s.includes('rainshowers')) return s.startsWith('heavy') ? 82 : 80;
  if (s.includes('rain')) return s.startsWith('heavy') ? 65 : s.startsWith('light') ? 61 : 63;
  return { fog: 45, cloudy: 3, partlycloudy: 2, fair: 1, clearsky: 0 }[s] ?? 3;
}

async function metNorway(loc, imperial, tz) {
  const res = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${(+loc.lat).toFixed(4)}&lon=${(+loc.lon).toFixed(4)}`,
    { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'kobo-dash github.com/kobo-dash' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ts = (await res.json()).properties.timeseries;
  const T = (c) => Math.round(imperial ? c * 9 / 5 + 32 : c);
  const local = (iso) => { const p = zonedParts(new Date(iso), tz); return { ...p, key: `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` }; };
  const sym = (e) => e.data.next_1_hours?.summary?.symbol_code || e.data.next_6_hours?.summary?.symbol_code || '';

  const cur = ts[0]; const d0 = cur.data.instant.details;
  const kmh = d0.wind_speed * 3.6;
  // Wind chill (Environment Canada formula) when cold and windy
  const feelsC = d0.air_temperature <= 10 && kmh > 4.8
    ? 13.12 + 0.6215 * d0.air_temperature - 11.37 * kmh ** 0.16 + 0.3965 * d0.air_temperature * kmh ** 0.16
    : d0.air_temperature;

  const hourly = [];
  for (let i = 1; i < ts.length && hourly.length < 5; i += 3) {
    const l = local(ts[i].time);
    hourly.push({ hour: l.hh, temp: T(ts[i].data.instant.details.air_temperature), code: metCode(sym(ts[i])), pop: null, isDay: !sym(ts[i]).endsWith('_night') });
  }
  const days = new Map();
  for (const e of ts) {
    const l = local(e.time);
    if (!days.has(l.key)) days.set(l.key, { date: l.key, temps: [], code: null, noonDist: 99 });
    const d = days.get(l.key);
    d.temps.push(e.data.instant.details.air_temperature);
    const s6 = e.data.next_6_hours?.summary?.symbol_code || sym(e);
    if (s6 && Math.abs(l.hh - 12) < d.noonDist) { d.noonDist = Math.abs(l.hh - 12); d.code = metCode(s6); }
  }
  const daily = [...days.values()].filter((d) => d.temps.length >= 4 || d === [...days.values()][0])
    .map((d) => ({ date: d.date, code: d.code ?? 3, hi: T(Math.max(...d.temps)), lo: T(Math.min(...d.temps)), pop: null }));
  return {
    temp: T(d0.air_temperature), feels: T(feelsC), code: metCode(sym(cur)), isDay: !sym(cur).endsWith('_night'),
    wind: Math.round(imperial ? d0.wind_speed * 2.237 : kmh), humidity: Math.round(d0.relative_humidity ?? 0),
    windUnit: imperial ? 'mph' : 'km/h',
    today: daily[0], hourly, daily: daily.slice(1, 5),
  };
}

/** Turn the raw Open-Meteo response into what the template needs. */
export function shapeWeather(j, imperial) {
  const c = j.current;
  // Hourly: next 5 slots, every 3 hours, starting from the next full hour
  const nowKey = c.time.slice(0, 13); // "YYYY-MM-DDTHH"
  let i0 = j.hourly.time.findIndex((t) => t.slice(0, 13) > nowKey);
  if (i0 < 0) i0 = 0;
  const hourly = [];
  for (let i = i0; i < j.hourly.time.length && hourly.length < 5; i += 3) {
    hourly.push({
      hour: +j.hourly.time[i].slice(11, 13),
      temp: Math.round(j.hourly.temperature_2m[i]),
      code: j.hourly.weather_code[i],
      pop: j.hourly.precipitation_probability?.[i] ?? null,
      isDay: !!j.hourly.is_day?.[i],
    });
  }
  const daily = j.daily.time.map((t, i) => ({
    date: t,
    code: j.daily.weather_code[i],
    hi: Math.round(j.daily.temperature_2m_max[i]),
    lo: Math.round(j.daily.temperature_2m_min[i]),
    pop: j.daily.precipitation_probability_max?.[i] ?? null,
    sunrise: j.daily.sunrise?.[i], sunset: j.daily.sunset?.[i],
  }));
  return {
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    code: c.weather_code,
    isDay: !!c.is_day,
    wind: Math.round(c.wind_speed_10m),
    humidity: Math.round(c.relative_humidity_2m),
    windUnit: imperial ? 'mph' : 'km/h',
    today: daily[0],
    hourly,
    daily: daily.slice(1, 5),
  };
}

export function describe(code) {
  const map = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Freezing fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail',
  };
  return map[code] || 'Weather';
}
