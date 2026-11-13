// Fetches all data, renders the dashboard PNG, and writes the files the Kobo reads.
//
//   node render.mjs            -> live data, writes ./site
//   DEMO=1 node render.mjs     -> sample data (for previewing the layout offline)
//
// Env (GitHub secrets): TOMTOM_API_KEY, CALENDAR_ICS_URLS, HOME_ADDRESS, WORK_ADDRESS, SITE_KEY
// Env (workflow):       PAGES_URL, CHROME_PATH

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import dns from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWeather } from './weather.mjs';
import { getCommutes } from './commute.mjs';
import { getCalendar } from './calendar.mjs';
import { getNews } from './news.mjs';
import { renderHtml } from './template.mjs';

// GitHub's machines have no IPv6; prefer IPv4 so connections don't fail.
dns.setDefaultResultOrder('ipv4first');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'site');

async function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return (await import(name)).chromium; } catch { /* try next */ }
  }
  throw new Error('Install playwright-core (npm install)');
}

async function safe(name, fn) {
  try { return await fn(); } catch (e) {
    const why = e.cause ? ` (${e.cause.code || e.cause.message})` : '';
    console.error(`[${name}] ${e.message}${why}`);
    return { error: `${e.message}${why}`.slice(0, 80) };
  }
}

// Last good weather is published next to the image, so a failed fetch can fall back to it.
function cacheUrl() {
  const base = (process.env.PAGES_URL || '').replace(/\/$/, '');
  const key = (process.env.SITE_KEY || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return base ? `${base}${key ? `/${key}` : ''}/weather-cache.json` : null;
}

async function main() {
  const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));
  config.timezone ||= 'America/Toronto';
  const now = new Date();
  const enabled = new Set(config.widgets.filter((w) => w.enabled).map((w) => w.type));

  let data;
  if (process.env.DEMO) {
    data = (await import('./demo.mjs')).demoData(now, config);
  } else {
    const [weather, commute, calendar, news] = await Promise.all([
      enabled.has('weather') ? safe('weather', () => getWeather(config.location, config.units, config.timezone, cacheUrl())) : null,
      enabled.has('commute') ? safe('commute', () => getCommutes(config.commute || {})) : null,
      enabled.has('calendar') ? safe('calendar', () => getCalendar(config.calendar || {}, config.timezone, now)) : null,
      enabled.has('news') ? safe('news', () => getNews(config.news || {})) : null,
    ]);
    data = { weather, commute, calendar, news };
  }

  const html = renderHtml({ config, data, now });

  // Optional secret folder name so the image URL can't be guessed.
  const key = (process.env.SITE_KEY || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const dashDir = key ? path.join(OUT, key) : OUT;
  await rm(OUT, { recursive: true, force: true });
  await mkdir(dashDir, { recursive: true });

  const chromium = await loadPlaywright();
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const landscape = (config.orientation || 'landscape') !== 'portrait';
  const turned = [90, 270].includes(((landscape ? 90 : 0) + (+config.rotate || 0)) % 360);
  const [W, H] = landscape ? [800, 600] : [600, 800];
  const page = await browser.newPage({ viewport: turned ? { width: H, height: W } : { width: W, height: H } });
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => window.__fit()));
  await page.screenshot({ path: path.join(dashDir, 'dashboard.png') });
  await browser.close();
  await writeFile(path.join(dashDir, 'dashboard.html'), html);

  // The trmnl-kobo client calls  <TrmnlApiUrl>/display  and expects this JSON.
  const base = (process.env.PAGES_URL || '').replace(/\/$/, '');
  const prefix = base ? `${base}${key ? `/${key}` : ''}` : '.';
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const display = {
    status: 0,
    image_url: `${prefix}/dashboard.png?v=${stamp}`,
    filename: `dashboard-${stamp}`,
    refresh_rate: Math.max(300, Math.round((config.refreshMinutes || 15) * 60)),
    update_firmware: false,
    reset_firmware: false,
  };
  await writeFile(path.join(dashDir, 'display'), JSON.stringify(display));
  await writeFile(path.join(dashDir, 'display.json'), JSON.stringify(display));
  if (data.weather && !data.weather.error) {
    await writeFile(path.join(dashDir, 'weather-cache.json'),
      JSON.stringify({ ...data.weather, fetchedAt: data.weather.staleAt || now.toISOString(), staleAt: undefined }));
  }

  // Phone settings page lives at the site root.
  for (const f of ['settings.html', 'index.html']) {
    if (existsSync(path.join(ROOT, f))) await cp(path.join(ROOT, f), path.join(OUT, f));
  }
  await writeFile(path.join(OUT, '.nojekyll'), '');
  console.log(`Rendered ${path.relative(ROOT, path.join(dashDir, 'dashboard.png'))} at ${now.toISOString()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
