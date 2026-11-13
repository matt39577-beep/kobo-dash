// Live drive times from the TomTom Routing API (free tier: 2,500 requests/day).

/** "$HOME_ADDRESS" -> value of that GitHub secret, so private addresses stay out of the public repo. */
export function resolveSecret(v) {
  if (typeof v === 'string' && /^\$[A-Z0-9_]+$/.test(v.trim())) return process.env[v.trim().slice(1)] || '';
  return v || '';
}

async function geocode(query, key, country) {
  const ll = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (ll) return { lat: +ll[1], lon: +ll[2] };
  const q = new URLSearchParams({ key, limit: '1' });
  if (country) q.set('countrySet', country);
  const res = await fetch(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?${q}`,
    { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`TomTom geocode HTTP ${res.status}`);
  const pos = (await res.json()).results?.[0]?.position;
  if (!pos) throw new Error(`Address not found: ${query.slice(0, 30)}`);
  return pos;
}

export async function getCommutes(cfg) {
  const key = process.env.TOMTOM_API_KEY;
  const routes = (cfg.routes || []).filter((r) => r.enabled !== false);
  if (!key || !routes.length) return { configured: false };
  const out = [];
  for (const r of routes.slice(0, 3)) {
    const from = resolveSecret(r.from); const to = resolveSecret(r.to);
    if (!from || !to) { out.push({ label: r.label, error: 'Missing address' }); continue; }
    try {
      const [a, b] = await Promise.all([geocode(from, key, cfg.country), geocode(to, key, cfg.country)]);
      const q = new URLSearchParams({
        key, traffic: 'true', travelMode: r.mode || 'car', routeType: 'fastest', computeTravelTimeFor: 'all',
      });
      const res = await fetch(
        `https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json?${q}`,
        { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`TomTom route HTTP ${res.status}`);
      const s = (await res.json()).routes[0].summary;
      out.push({
        label: r.label || 'Commute',
        minutes: Math.round(s.travelTimeInSeconds / 60),
        delayMin: Math.round((s.trafficDelayInSeconds || 0) / 60),
        typicalMin: Math.round((s.noTrafficTravelTimeInSeconds || s.travelTimeInSeconds) / 60),
        km: s.lengthInMeters / 1000,
        arrival: s.arrivalTime ? new Date(s.arrivalTime) : null,
      });
    } catch (e) {
      out.push({ label: r.label, error: e.message });
    }
  }
  return { configured: true, routes: out };
}
