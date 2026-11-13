// Sample data for previewing the layout without network or API keys.
// Runs the real parsers on fake inputs so the preview exercises the same code paths.

import { shapeWeather } from './weather.mjs';
import { parseIcs, expandEvents } from './calendar.mjs';
import { parseFeed } from './news.mjs';
import { zonedParts, zonedToUtc } from './time.mjs';

const pad = (n) => String(n).padStart(2, '0');

export function demoData(now, config) {
  const tz = config.timezone;
  const p = zonedParts(now, tz);

  // Weather: fake Open-Meteo response
  const hours = []; const temps = []; const codes = []; const pops = []; const isDay = [];
  for (let i = 0; i < 48; i++) {
    const d = new Date(Date.UTC(p.y, p.m - 1, p.d, i));
    const h = i % 24;
    hours.push(`${d.toISOString().slice(0, 10)}T${pad(h)}:00`);
    temps.push(4 + 4 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
    codes.push([2, 3, 61, 3, 2, 0][Math.floor(i / 4) % 6]);
    pops.push([10, 30, 70, 40, 10, 0][Math.floor(i / 4) % 6]);
    isDay.push(h >= 7 && h < 17 ? 1 : 0);
  }
  const days = [0, 1, 2, 3, 4].map((k) => new Date(Date.UTC(p.y, p.m - 1, p.d + k)).toISOString().slice(0, 10));
  const weather = shapeWeather({
    current: {
      time: `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:00`, temperature_2m: 6.2, apparent_temperature: 2.4,
      weather_code: 2, is_day: p.hh >= 7 && p.hh < 17 ? 1 : 0, wind_speed_10m: 19, relative_humidity_2m: 71,
    },
    hourly: { time: hours, temperature_2m: temps, weather_code: codes, precipitation_probability: pops, is_day: isDay },
    daily: {
      time: days, weather_code: [2, 61, 71, 0, 3], temperature_2m_max: [8, 6, 1, 3, 5], temperature_2m_min: [1, 2, -4, -3, 0],
      precipitation_probability_max: [30, 80, 60, 0, 10], sunrise: days.map((d) => `${d}T07:05`), sunset: days.map((d) => `${d}T16:52`),
    },
  }, false);

  // Calendar: a small ICS with a weekly recurring event, an all-day event and one-offs
  // one-off events are placed relative to "now" so the preview always has upcoming items
  const at = (dayOffset, hh, mm) => {
    const base = new Date(now.getTime() + dayOffset * 86400000 + (hh * 60 + mm) * 60000);
    base.setUTCMinutes(Math.floor(base.getUTCMinutes() / 15) * 15, 0, 0);
    return base.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  };
  const dateOnly = (off) => new Date(Date.UTC(p.y, p.m - 1, p.d + off)).toISOString().slice(0, 10).replace(/-/g, '');
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:a
SUMMARY:Team standup
DTSTART;TZID=America/Toronto:${dateOnly(-14)}T093000
DTEND;TZID=America/Toronto:${dateOnly(-14)}T094500
RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR
END:VEVENT
BEGIN:VEVENT
UID:b
SUMMARY:Dentist
LOCATION:Bloor St W, Toronto
DTSTART:${at(0, 1, 0)}
DTEND:${at(0, 2, 0)}
END:VEVENT
BEGIN:VEVENT
UID:c
SUMMARY:Raptors game
DTSTART:${at(0, 3, 30)}
DTEND:${at(0, 6, 0)}
END:VEVENT
BEGIN:VEVENT
UID:d
SUMMARY:Recycling day
DTSTART;VALUE=DATE:${dateOnly(1)}
DTEND;VALUE=DATE:${dateOnly(2)}
END:VEVENT
BEGIN:VEVENT
UID:e
SUMMARY:Lunch with Sam
DTSTART:${at(0, 14, 0)}
DTEND:${at(0, 15, 0)}
END:VEVENT
END:VCALENDAR`;
  const startOfDay = now;
  const end = zonedToUtc(p.y, p.m, p.d + (config.calendar?.days || 2), 0, 0, 0, tz);
  const calendar = { configured: true, events: expandEvents(parseIcs(ics), startOfDay, end, tz) };

  // News: sample RSS (placeholder headlines, not real news)
  const rss = `<rss><channel>${[
    'Sample headline: City council debates new transit funding plan',
    'Sample headline: Snow expected across the region this weekend',
    'Sample headline: Local library extends weekend hours',
    'Sample headline: Leafs take on rivals in tonight\'s matchup',
    'Sample headline: New bike lanes open along major downtown corridor',
    'Sample headline: Province announces changes to school calendar',
  ].map((t, i) => `<item><title><![CDATA[${t}]]></title><pubDate>${new Date(now - (i + 1) * 47 * 60000).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
  const news = { configured: true, items: parseFeed(rss, 'Example') };

  const commute = {
    configured: true,
    routes: [{ label: 'To work', minutes: 34, delayMin: 9, typicalMin: 25, km: 18.4, arrival: new Date(now.getTime() + 34 * 60000) }],
  };
  return { weather, commute, calendar, news };
}
