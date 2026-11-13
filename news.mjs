// Headlines from RSS / Atom feeds. No dependencies.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}
function tag(block, names) {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i'));
    if (m) return decode(m[1]);
  }
  return '';
}

export function parseFeed(xml, source) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const date = tag(b, ['pubDate', 'published', 'updated', 'dc:date']);
    return { title: tag(b, ['title']), source, date: date ? new Date(date) : null };
  }).filter((x) => x.title);
}

export async function getNews(cfg) {
  const feeds = (cfg.feeds || []).filter((f) => f.enabled !== false && f.url);
  if (!feeds.length) return { configured: false };
  const results = await Promise.allSettled(feeds.map(async (f) => {
    const res = await fetch(f.url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (kobo-dash)' },
    });
    if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
    return parseFeed(await res.text(), f.name).slice(0, 10);
  }));
  const items = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  if (!items.length) throw new Error(results.find((r) => r.status === 'rejected')?.reason?.message || 'No headlines');
  // Interleave feeds so one source doesn't dominate, newest first within each feed
  const byFeed = feeds.map((f) => items.filter((i) => i.source === f.name)
    .sort((a, b) => (b.date || 0) - (a.date || 0)));
  const seen = new Set(); const merged = [];
  for (let i = 0; merged.length < 30 && byFeed.some((l) => l[i]); i++) {
    for (const l of byFeed) {
      const it = l[i];
      if (!it) continue;
      const k = it.title.toLowerCase().replace(/\W+/g, '').slice(0, 50);
      if (!seen.has(k)) { seen.add(k); merged.push(it); }
    }
  }
  return { configured: true, items: merged.slice(0, cfg.maxItems || 6) };
}
