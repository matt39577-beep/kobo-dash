// Simple line-art weather icons, drawn for e-ink (pure black strokes, no gradients).

const CLOUD = 'M18 50h28a11 11 0 0 0 1-22 15 15 0 0 0-29-3 12 12 0 0 0 0 25z';
const CLOUD_HI = 'M18 42h28a11 11 0 0 0 1-22 15 15 0 0 0-29-3 12 12 0 0 0 0 25z';
const SMALL_CLOUD = 'M24 54h24a9 9 0 0 0 1-18 13 13 0 0 0-25-2 10 10 0 0 0 0 20z';

function sun(cx = 32, cy = 32, r = 11, ray = 7) {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 5), y1 = cy + Math.sin(a) * (r + 5);
    const x2 = cx + Math.cos(a) * (r + 5 + ray), y2 = cy + Math.sin(a) * (r + 5 + ray);
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}"/>${rays}`;
}
const moon = (dx = 0, dy = 0, s = 1) =>
  `<path transform="translate(${dx} ${dy}) scale(${s})" d="M40 14a18 18 0 1 0 12 30 15 15 0 0 1-12-30z"/>`;

const drops = (n, dash = false) => {
  const xs = n === 2 ? [26, 38] : [22, 32, 42];
  return xs.map((x, i) => dash
    ? `<line x1="${x}" y1="${50 + (i % 2) * 2}" x2="${x - 3}" y2="${58 + (i % 2) * 2}"/>`
    : `<line x1="${x}" y1="${49 + (i % 2) * 3}" x2="${x - 4}" y2="${59 + (i % 2) * 3}"/>`).join('');
};
const flakes = () => [22, 32, 42].map((x, i) => {
  const y = 54 + (i % 2) * 4;
  return `<line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}"/><line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 3}"/>`;
}).join('');

function body(code, isDay) {
  if (code === 0) return isDay ? sun() : moon(-4, 0, 1);
  if (code === 1 || code === 2) {
    const back = isDay ? `<g>${sun(24, 22, 8, 5)}</g>` : `<g>${moon(-14, -6, 0.85)}</g>`;
    return `${back}<path d="${SMALL_CLOUD}" fill="#fff"/>`;
  }
  if (code === 3) return `<path d="${CLOUD}"/>`;
  if (code === 45 || code === 48) {
    return `<path d="${CLOUD_HI}"/><line x1="10" y1="50" x2="54" y2="50"/><line x1="14" y1="58" x2="50" y2="58"/>`;
  }
  if (code >= 51 && code <= 57) return `<path d="${CLOUD_HI}"/>${drops(2, true)}`;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return `<path d="${CLOUD_HI}"/>${drops(3)}`;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return `<path d="${CLOUD_HI}"/>${flakes()}`;
  if (code >= 95) return `<path d="${CLOUD_HI}"/><path d="M34 44l-7 10h8l-5 10" stroke-linejoin="round"/>`;
  return `<path d="${CLOUD}"/>`;
}

export function weatherIcon(code, isDay = true, size = 64, stroke = 3.5) {
  return `<svg class="wx" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="#000" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body(code, isDay)}</svg>`;
}
