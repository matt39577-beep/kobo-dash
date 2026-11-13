// Minimal iCalendar (.ics) reader with recurrence support. No dependencies.
// Handles: TZID / UTC / floating / all-day dates, DTEND or DURATION, RRULE
// (DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY,
// BYMONTH), EXDATE, RECURRENCE-ID overrides, and cancelled events.

import { zonedParts, zonedToUtc, isValidTz, civil } from './time.mjs';

// Common Windows (Outlook / Exchange) zone names -> IANA
const WINDOWS_TZ = {
  'Eastern Standard Time': 'America/Toronto', 'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
  'Atlantic Standard Time': 'America/Halifax', 'Newfoundland Standard Time': 'America/St_Johns',
  'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
};
const DAY_CODES = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function unescapeText(s) {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

export function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  let depth = 0; // ignore nested VALARM etc.
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { props: {} }; depth = 0; continue; }
    if (!cur) continue;
    if (line.startsWith('BEGIN:')) { depth++; continue; }
    if (line.startsWith('END:') && depth > 0) { depth--; continue; }
    if (line === 'END:VEVENT') { events.push(cur); cur = null; continue; }
    if (depth > 0) continue;
    const m = line.match(/^([A-Z0-9-]+)((?:;[^:]*)?):(.*)$/i);
    if (!m) continue;
    const name = m[1].toUpperCase();
    const params = {};
    for (const p of m[2].split(';').filter(Boolean)) {
      const [k, ...v] = p.split('=');
      params[k.toUpperCase()] = v.join('=').replace(/^"|"$/g, '');
    }
    (cur.props[name] ||= []).push({ params, value: m[3] });
  }
  return events;
}

/** Parse a DATE / DATE-TIME property into { allDay, y,m,d,hh,mm,ss, tz, utc:Date } */
function parseDateProp(prop, defaultTz) {
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, Y, M, D, h, mi, s, z] = m;
  const base = { y: +Y, m: +M, d: +D };
  if (prop.params.VALUE === 'DATE' || h === undefined) {
    return { ...base, allDay: true, hh: 0, mm: 0, ss: 0, tz: defaultTz, utc: zonedToUtc(+Y, +M, +D, 0, 0, 0, defaultTz) };
  }
  let tz = defaultTz;
  if (z) tz = 'UTC';
  else if (prop.params.TZID) {
    const t = WINDOWS_TZ[prop.params.TZID] || prop.params.TZID;
    tz = isValidTz(t) ? t : defaultTz;
  }
  const t = { ...base, hh: +h, mm: +mi, ss: +(s || 0), allDay: false, tz };
  t.utc = zonedToUtc(t.y, t.m, t.d, t.hh, t.mm, t.ss, tz);
  // Express wall-clock in the event's own zone (UTC events -> display tz for recurrence math)
  if (tz === 'UTC' && defaultTz !== 'UTC') {
    const p = zonedParts(t.utc, defaultTz);
    Object.assign(t, { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm, ss: p.ss, tz: defaultTz });
  }
  return t;
}

function parseDuration(s) {
  const m = s.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w, d, h, mi, se] = m;
  const ms = ((+w || 0) * 7 * 86400 + (+d || 0) * 86400 + (+h || 0) * 3600 + (+mi || 0) * 60 + (+se || 0)) * 1000;
  return sign === '-' ? -ms : ms;
}

function parseRrule(s) {
  const r = {};
  for (const part of s.split(';')) {
    const [k, v] = part.split('=');
    r[k.toUpperCase()] = v;
  }
  return {
    freq: r.FREQ, interval: +(r.INTERVAL || 1), count: r.COUNT ? +r.COUNT : null,
    until: r.UNTIL || null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((x) => {
      const mm = x.match(/^([+-]?\d+)?([A-Z]{2})$/);
      return mm ? { n: mm[1] ? +mm[1] : null, wd: DAY_CODES[mm[2]] } : null;
    }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null,
  };
}

/** Does civil day c match weekday spec {n, wd} within its month? */
function matchesNthWeekday(c, spec) {
  if (c.wd !== spec.wd) return false;
  if (spec.n == null) return true;
  const dim = civil.daysInMonth(c.y, c.m);
  if (spec.n > 0) return Math.ceil(c.d / 7) === spec.n;
  return Math.ceil((dim - c.d + 1) / 7) === -spec.n;
}

/** Yields civil start days for the rule, in order, from dtstart up to lastDay. */
function* ruleDays(start, rule, lastDay) {
  const startN = civil.toDays(start.y, start.m, start.d);
  const startWd = civil.fromDays(startN).wd;
  // weeks start Monday (RFC default WKST=MO)
  const weekStart = (n) => n - ((civil.fromDays(n).wd + 6) % 7);
  const startWeek = weekStart(startN);
  for (let n = startN; n <= lastDay; n++) {
    const c = civil.fromDays(n);
    let ok = false;
    switch (rule.freq) {
      case 'DAILY':
        ok = (n - startN) % rule.interval === 0
          && (!rule.byday || rule.byday.some((b) => b.wd === c.wd))
          && (!rule.bymonth || rule.bymonth.includes(c.m));
        break;
      case 'WEEKLY': {
        const weeks = Math.round((weekStart(n) - startWeek) / 7);
        const days = rule.byday ? rule.byday.map((b) => b.wd) : [startWd];
        ok = weeks % rule.interval === 0 && days.includes(c.wd);
        break;
      }
      case 'MONTHLY': {
        const months = (c.y - start.y) * 12 + (c.m - start.m);
        if (months % rule.interval !== 0) break;
        if (rule.bymonthday) {
          const dim = civil.daysInMonth(c.y, c.m);
          ok = rule.bymonthday.some((md) => (md > 0 ? md : dim + md + 1) === c.d);
        } else if (rule.byday) ok = rule.byday.some((b) => matchesNthWeekday(c, b));
        else ok = c.d === start.d;
        break;
      }
      case 'YEARLY': {
        if ((c.y - start.y) % rule.interval !== 0) break;
        const months = rule.bymonth || [start.m];
        if (!months.includes(c.m)) break;
        if (rule.bymonthday) ok = rule.bymonthday.includes(c.d);
        else if (rule.byday) ok = rule.byday.some((b) => matchesNthWeekday(c, b));
        else ok = c.d === start.d;
        break;
      }
      default:
        return;
    }
    if (ok) yield c;
  }
}

/**
 * Return event occurrences overlapping [from, to).
 * Each: { title, location, start: Date, end: Date, allDay, startDay: 'YYYY-MM-DD' }
 */
export function expandEvents(raw, from, to, tz) {
  const out = [];
  const overrides = new Map(); // uid -> Map(startMs -> event)
  const masters = [];

  const toEvent = (e) => {
    const P = e.props;
    const dtstart = P.DTSTART && parseDateProp(P.DTSTART[0], tz);
    if (!dtstart) return null;
    let durMs;
    if (P.DTEND) {
      const end = parseDateProp(P.DTEND[0], tz);
      durMs = end ? end.utc - dtstart.utc : 0;
    } else if (P.DURATION) durMs = parseDuration(P.DURATION[0].value);
    else durMs = dtstart.allDay ? 86400000 : 0;
    return {
      uid: P.UID?.[0]?.value || Math.random().toString(36),
      title: unescapeText(P.SUMMARY?.[0]?.value || '(No title)'),
      location: P.LOCATION ? unescapeText(P.LOCATION[0].value) : '',
      status: (P.STATUS?.[0]?.value || '').toUpperCase(),
      dtstart, durMs,
      rrule: P.RRULE ? parseRrule(P.RRULE[0].value) : null,
      exdates: (P.EXDATE || []).flatMap((x) => x.value.split(',').map((v) => parseDateProp({ params: x.params, value: v }, tz)))
        .filter(Boolean).map((d) => d.utc.getTime()),
      recurrenceId: P['RECURRENCE-ID'] ? parseDateProp(P['RECURRENCE-ID'][0], tz)?.utc.getTime() : null,
    };
  };

  for (const e of raw) {
    const ev = toEvent(e);
    if (!ev) continue;
    if (ev.recurrenceId != null) {
      if (!overrides.has(ev.uid)) overrides.set(ev.uid, new Map());
      overrides.get(ev.uid).set(ev.recurrenceId, ev);
    } else masters.push(ev);
  }

  const push = (ev, startUtc, endUtc) => {
    if (ev.status === 'CANCELLED') return;
    if (endUtc <= from || startUtc >= to) {
      // zero-length events at window start still count
      if (!(endUtc.getTime() === startUtc.getTime() && startUtc >= from && startUtc < to)) return;
    }
    const p = zonedParts(startUtc, tz);
    out.push({
      title: ev.title, location: ev.location, start: startUtc, end: endUtc, allDay: ev.dtstart.allDay,
      startDay: `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`,
    });
  };

  const lastDay = civil.toDays(...(() => { const p = zonedParts(to, tz); return [p.y, p.m, p.d]; })()) + 1;

  for (const ev of masters) {
    const ovr = overrides.get(ev.uid);
    if (!ev.rrule) {
      push(ev, ev.dtstart.utc, new Date(ev.dtstart.utc.getTime() + ev.durMs));
      continue;
    }
    const s = ev.dtstart;
    const untilUtc = ev.rrule.until ? parseDateProp({ params: {}, value: ev.rrule.until }, tz)?.utc : null;
    let count = 0;
    for (const c of ruleDays(s, ev.rrule, lastDay)) {
      const startUtc = s.allDay
        ? zonedToUtc(c.y, c.m, c.d, 0, 0, 0, tz)
        : zonedToUtc(c.y, c.m, c.d, s.hh, s.mm, s.ss, s.tz);
      if (startUtc < s.utc) continue; // BYDAY days before DTSTART in first period
      if (untilUtc && startUtc > untilUtc) break;
      count++;
      if (ev.rrule.count && count > ev.rrule.count) break;
      const ms = startUtc.getTime();
      if (ev.exdates.includes(ms)) continue;
      if (ovr?.has(ms)) continue; // handled below
      if (startUtc.getTime() + ev.durMs < from.getTime() - 86400000 * 2 && startUtc < from) continue;
      push(ev, startUtc, new Date(ms + ev.durMs));
    }
  }
  for (const map of overrides.values()) {
    for (const ev of map.values()) push(ev, ev.dtstart.utc, new Date(ev.dtstart.utc.getTime() + ev.durMs));
  }

  out.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1) || 0);
  out.sort((a, b) => a.startDay.localeCompare(b.startDay));
  return out;
}

export async function getCalendar(cfg, tz, now = new Date()) {
  const urls = (process.env.CALENDAR_ICS_URLS || '')
    .split(/[\s,]+/).map((u) => u.trim().replace(/^webcal:/i, 'https:')).filter(Boolean);
  if (!urls.length) return { configured: false };
  const days = Math.max(1, Math.min(7, cfg.days || 2));
  const p = zonedParts(now, tz);
  const end = zonedToUtc(p.y, p.m, p.d + days, 0, 0, 0, tz);
  const all = [];
  for (const url of urls) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Calendar HTTP ${res.status}`);
    all.push(...expandEvents(parseIcs(await res.text()), now, end, tz));
  }
  all.sort((a, b) => a.startDay.localeCompare(b.startDay) || (b.allDay - a.allDay) || (a.start - b.start));
  return { configured: true, events: all };
}
