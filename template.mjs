// Builds the dashboard HTML. Designed for a 600x800 grayscale e-ink screen:
// black on white, big type, thin rules, nothing that relies on colour.

import { weatherIcon } from './icons.mjs';
import { describe } from './weather.mjs';
import { fmtTime, fmtDate, zonedParts } from './time.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
const ago = (date, now) => {
  if (!date || isNaN(date)) return '';
  const m = Math.round((now - date) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
};

function section(title, inner, cls = '') {
  return `<section class="${cls}"><h2><span>${esc(title)}</span></h2>${inner}</section>`;
}
const note = (t) => `<p class="note">${esc(t)}</p>`;

function weatherBlock(w, tz) {
  if (w.error) return section('Weather', note(`Weather unavailable: ${w.error}`), 'weather');
  const hourly = w.hourly.map((h) => `
    <div class="slot">
      <div class="lbl">${hourLabel(h.hour)}</div>
      ${weatherIcon(h.code, h.isDay, 40, 4.5)}
      <div class="t">${h.temp}°</div>
      <div class="pop">${h.pop != null && h.pop >= 20 ? `${h.pop}%` : '&nbsp;'}</div>
    </div>`).join('');
  const daily = w.daily.slice(0, 3).map((d) => {
    const [y, m, dd] = d.date.split('-').map(Number);
    const name = new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString('en-CA', { weekday: 'short', timeZone: 'UTC' });
    return `<div class="day">
      <div class="lbl">${name}</div>
      ${weatherIcon(d.code, true, 34, 5)}
      <div class="hl"><b>${d.hi}°</b> ${d.lo}°</div>
    </div>`;
  }).join('');
  const sunset = w.today?.sunset ? fmtTime(new Date(w.today.sunset + ':00Z'), 'UTC') : '';
  return `<section class="weather">
    <div class="now">
      ${weatherIcon(w.code, w.isDay, 118, 3.2)}
      <div class="temp">${w.temp}<span>°</span></div>
      <div class="facts">
        <div class="cond">${esc(describe(w.code))}</div>
        <div>High <b>${w.today.hi}°</b> · Low <b>${w.today.lo}°</b></div>
        <div>Feels like ${w.feels}° · ${w.wind} ${w.windUnit}</div>
        <div>${w.today.pop != null ? `Precip ${w.today.pop}%` : ''}${w.today.pop != null && sunset ? ' · ' : ''}${sunset ? `Sunset ${sunset}` : ''}</div>
        ${w.staleAt ? `<div><i>As of ${fmtTime(new Date(w.staleAt), tz)}</i></div>` : ''}
      </div>
    </div>
    <div class="forecast">
      <div class="hourly">${hourly}</div>
      <div class="daily">${daily}</div>
    </div>
  </section>`;
}

function commuteBlock(c, tz) {
  if (c.error) return section('Commute', note(`Traffic unavailable: ${c.error}`), 'commute');
  if (!c.configured) return section('Commute', note('Add a TomTom key and a route in Settings.'), 'commute');
  const rows = c.routes.map((r) => {
    if (r.error) return `<div class="route"><div class="name">${esc(r.label)}</div><div class="sub">${esc(r.error)}</div></div>`;
    const total = Math.max(r.minutes, 1);
    const typicalPct = Math.min(100, Math.round((Math.min(r.typicalMin, total) / total) * 100));
    const status = r.delayMin >= 10 ? 'Heavy traffic' : r.delayMin >= 4 ? 'Some delays' : 'Clear roads';
    return `<div class="route">
      <div class="top">
        <div class="name">${esc(r.label)}</div>
        <div class="mins">${r.minutes}<small> min</small></div>
      </div>
      <div class="bar"><i style="width:${typicalPct}%"></i><s style="width:${100 - typicalPct}%"></s></div>
      <div class="sub">${status}${r.delayMin > 0 ? ` · +${r.delayMin} min` : ''} <span class="km">· ${r.km.toFixed(1)} km</span>${r.arrival ? ` · arrive ${fmtTime(r.arrival, tz)}` : ''}</div>
    </div>`;
  }).join('');
  return section('Commute', `<div class="routes">${rows}</div>`, 'commute');
}

function calendarBlock(c, cfg, tz, now) {
  if (c.error) return section('Calendar', note(`Calendar unavailable: ${c.error}`), 'calendar flex');
  if (!c.configured) return section('Calendar', note('Add your calendar link in Settings.'), 'calendar flex');
  const todayKey = (() => { const p = zonedParts(now, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; })();
  const tomorrow = new Date(now.getTime() + 86400000);
  const tomKey = (() => { const p = zonedParts(tomorrow, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; })();
  const events = c.events.slice(0, cfg.maxEvents || 8);
  if (!events.length) return section('Calendar', note('Nothing scheduled. Enjoy the free time.'), 'calendar flex');
  let html = ''; let lastDay = '';
  for (const e of events) {
    if (e.startDay !== lastDay) {
      lastDay = e.startDay;
      const [y, m, d] = e.startDay.split('-').map(Number);
      const label = e.startDay === todayKey ? 'Today' : e.startDay === tomKey ? 'Tomorrow'
        : new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-CA', { weekday: 'long', timeZone: 'UTC' });
      html += `<li class="dayhead">${label}</li>`;
    }
    const ongoing = !e.allDay && e.start <= now && e.end > now;
    const time = e.allDay ? 'All day' : ongoing ? 'Now' : fmtTime(e.start, tz);
    html += `<li class="ev"><span class="when">${time}</span><span class="what">${esc(e.title)}${e.location ? `<em> · ${esc(e.location.split(',')[0])}</em>` : ''}</span></li>`;
  }
  return section('Calendar', `<ul class="list trim">${html}</ul>`, 'calendar flex');
}

function newsBlock(n, now) {
  if (n.error) return section('News', note(`News unavailable: ${n.error}`), 'news flex');
  if (!n.configured) return section('News', note('Add news feeds in Settings.'), 'news flex');
  const items = n.items.map((i) => `<li><span class="hd">${esc(i.title)}</span><span class="src">${esc(i.source)}${i.date ? ` · ${ago(i.date, now)}` : ''}</span></li>`).join('');
  return section('News', `<ul class="list news-list trim">${items}</ul>`, 'news flex');
}

export function renderHtml({ config, data, now }) {
  const tz = config.timezone;
  const render = (w) => {
    switch (w.type) {
      case 'weather': return data.weather ? weatherBlock(data.weather, tz) : '';
      case 'commute': return data.commute ? commuteBlock(data.commute, tz) : '';
      case 'calendar': return data.calendar ? calendarBlock(data.calendar, config.calendar || {}, tz, now) : '';
      case 'news': return data.news ? newsBlock(data.news, now) : '';
      default: return '';
    }
  };
  const on = config.widgets.filter((w) => w.enabled);

  // Landscape (800x600) is the Kobo Mini's natural screen; portrait (600x800) is optional.
  const landscape = (config.orientation || 'landscape') !== 'portrait';
  const W = landscape ? 800 : 600; const H = landscape ? 600 : 800;
  let body;
  if (landscape) {
    const left = on.filter((w) => w.type === 'weather' || w.type === 'commute').map(render).join('');
    const right = on.filter((w) => w.type === 'calendar' || w.type === 'news').map(render).join('');
    body = left && right
      ? `<div class="cols"><div class="col left">${left}</div><div class="col right">${right}</div></div>`
      : `<div class="col">${left || right}</div>`;
  } else {
    body = on.map(render).join('');
  }

  // Optional rotation of the whole picture, for screens that draw it turned.
  const rot = [0, 90, 180, 270].includes(+config.rotate) ? +config.rotate : 0;
  const turned = rot === 90 || rot === 270;
  const vw = turned ? H : W; const vh = turned ? W : H;
  const transform = rot === 0 ? 'none'
    : rot === 90 ? `translate(${H}px,0) rotate(90deg)`
      : rot === 180 ? `translate(${W}px,${H}px) rotate(180deg)`
        : `translate(0,${W}px) rotate(-90deg)`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=block" rel="stylesheet">
<style>
/* E-ink: everything is black or white. Greys look washed out on the Kobo Mini. */
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${vw}px;height:${vh}px;background:#fff;overflow:hidden}
#screen{width:${W}px;height:${H}px;padding:24px 30px 12px;display:flex;flex-direction:column;gap:12px;
  font-family:'Atkinson Hyperlegible','DejaVu Sans',Arial,sans-serif;color:#000;
  transform-origin:0 0;-webkit-font-smoothing:antialiased}
#screen.rot{transform:${transform}}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #000;padding-bottom:10px}
header h1{font-size:40px;line-height:1;font-weight:700;letter-spacing:-.5px}
header .date{font-size:21px;margin-top:4px}
header .meta{text-align:right;font-size:16px;line-height:1.35}
header .meta b{font-size:18px}
section{display:flex;flex-direction:column;min-height:0}
section.flex{flex:1 1 0}
section.news{flex-grow:1.25}
h2{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:8px}
h2::after{content:"";flex:1;height:2px;background:#000}
.note{font-size:17px}
/* weather */
.weather .now{display:flex;align-items:center;gap:6px}
.weather .temp{font-size:104px;font-weight:700;line-height:.9;letter-spacing:-4px;margin-right:8px}
.weather .temp span{font-size:64px;vertical-align:top;letter-spacing:0;position:relative;top:6px}
.weather .facts{font-size:17px;line-height:1.45;flex:1}
.weather .facts .cond{font-size:24px;font-weight:700;line-height:1.15;margin-bottom:2px}
.weather .forecast{display:flex;margin-top:10px;border-top:2px solid #000;border-bottom:2px solid #000;padding:8px 0}
.hourly{display:flex;flex:5;justify-content:space-around;border-right:2px solid #000}
.daily{display:flex;flex:3;justify-content:space-around;padding-left:6px}
.slot,.day{display:flex;flex-direction:column;align-items:center;font-size:16px;line-height:1.2}
.slot .lbl,.day .lbl{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.slot .t{font-size:20px;font-weight:700}
.slot .pop{font-size:14px}
.day .wx{margin:3px 0}
.day .hl{font-size:16px}
.day .hl b{font-size:19px}
/* commute */
.routes{display:flex;flex-direction:column;gap:10px}
.route .top{display:flex;justify-content:space-between;align-items:baseline}
.route .name{font-size:21px;font-weight:700}
.route .mins{font-size:34px;font-weight:700;line-height:1}
.route .mins small{font-size:17px;font-weight:400}
.route .bar{display:flex;height:10px;border:2px solid #000;margin:5px 0 4px}
.route .bar i{background:#000}
.route .bar s{background:repeating-linear-gradient(-45deg,#000 0 2px,#fff 2px 5px)}
.route .sub{font-size:16px}
/* lists */
.list{list-style:none;overflow:hidden;flex:1 1 0;min-height:0}
.dayhead{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:6px 0 2px}
.dayhead:first-child{margin-top:0}
.ev{display:flex;gap:10px;font-size:17px;line-height:1.25;padding:2px 0}
.ev .when{flex:0 0 96px;font-weight:700;white-space:nowrap}
.ev .what{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev em{font-style:italic}
.news-list li{padding:3px 0;border-bottom:1px solid #000;display:flex;flex-direction:column}
.news-list li:last-child{border-bottom:none}
.news-list .hd{font-size:17px;line-height:1.25;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.news-list .src{font-size:14px;margin-top:1px}
/* landscape: two columns */
.L #screen{padding:18px 24px 10px;gap:10px}
.L header{padding-bottom:8px}
.L header h1{font-size:34px}
.L header .date{font-size:19px}
.cols{display:flex;gap:26px;flex:1 1 0;min-height:0}
.col{display:flex;flex-direction:column;gap:12px;min-height:0;flex:1 1 0}
.col.left{flex:0 0 350px;width:350px;overflow:hidden}
.L .weather .now{gap:4px}
.L .weather .wx:first-child{width:92px;height:92px}
.L .weather .temp{font-size:92px}
.L .weather .temp span{font-size:56px}
.L .weather .facts{flex-basis:100%;font-size:16px;line-height:1.4;margin-top:6px}
.L .weather .facts .cond{font-size:22px}
.L .weather .now{flex-wrap:wrap}
.L .weather .forecast{flex-direction:column;padding:6px 0;margin-top:8px}
.L .hourly{border-right:none;border-bottom:1.5px solid #000;padding-bottom:6px}
.L .daily{padding:6px 0 0}
.L .slot .t{font-size:18px}
.L .day{flex-direction:row;gap:6px;align-items:center}
.L .day .lbl{font-size:13px}
.L .day .hl{white-space:nowrap;font-size:14px}
.L .day .hl b{font-size:17px}
.L .daily{justify-content:space-between;gap:4px}
.L .day .wx{margin:0;width:24px;height:24px}
.L .route .mins{font-size:30px}
.L .route .name{font-size:19px}
.L .route .sub{font-size:14px}
.L .slot .pop{font-size:13px}
.L .km{display:none}
</style></head><body class="${landscape ? 'L' : 'P'}"><div id="screen">
<header>
  <div><h1>${fmtDate(now, tz, { weekday: 'long' })}</h1><div class="date">${fmtDate(now, tz, { month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
  <div class="meta"><b>${esc(config.location?.name || '')}</b><br>Updated ${fmtTime(now, tz)}</div>
</header>
${body}
</div>
<script>
// Drop list items that don't fully fit, so nothing is cut in half. Called by render.mjs after fonts load.
window.__fit = () => {
for (const ul of document.querySelectorAll('ul.trim')) {
  const box = ul.getBoundingClientRect();
  const fits = (li) => li.getBoundingClientRect().bottom <= box.bottom + 0.5;
  const items = [...ul.children];
  for (let i = items.length - 1; i >= 0 && !fits(items[i]); i--) items[i].remove();
  while (ul.lastElementChild && ul.lastElementChild.classList.contains('dayhead')) ul.lastElementChild.remove();
}
document.getElementById('screen').classList.add('rot');
};
</script>
</body></html>`;
}
