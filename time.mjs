// Time-zone helpers built only on Intl (no dependencies).

const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    }));
  }
  return dtfCache.get(tz);
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of `date` in `tz`. */
export function zonedParts(date, tz) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(date)) p[type] = value;
  return {
    y: +p.year, m: +p.month, d: +p.day,
    hh: +p.hour % 24, mm: +p.minute, ss: +p.second,
    wd: WD[p.weekday],
  };
}

/** Offset (ms) of tz from UTC at instant `ms`. */
function tzOffset(ms, tz) {
  const p = zonedParts(new Date(ms), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to a UTC Date. */
export function zonedToUtc(y, m, d, hh = 0, mm = 0, ss = 0, tz = 'UTC') {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let ms = guess - tzOffset(guess, tz);
  const off2 = tzOffset(ms, tz);
  ms = guess - off2;
  return new Date(ms);
}

export function isValidTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Civil-date arithmetic helpers (y, m, d) using UTC math so DST never interferes. */
export const civil = {
  toDays: (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000),
  fromDays(n) {
    const dt = new Date(n * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
  },
  daysInMonth: (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(),
};

export function fmtTime(date, tz, opts = {}) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true, ...opts })
    .format(date).replace(/\s?a\.m\./i, ' AM').replace(/\s?p\.m\./i, ' PM');
}

export function fmtDate(date, tz, opts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...opts }).format(date);
}
