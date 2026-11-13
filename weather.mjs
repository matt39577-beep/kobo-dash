// Weather from Open-Meteo (free, no API key).

export async function getWeather(loc, units, tz) {
  const imperial = units === 'imperial';
  const q = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, timezone: tz, forecast_days: '5',
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    temperature_unit: imperial ? 'fahrenheit' : 'celsius',
    wind_speed_unit: imperial ? 'mph' : 'kmh',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return shapeWeather(await res.json(), imperial);
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
