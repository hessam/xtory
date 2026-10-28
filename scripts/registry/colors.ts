/** Deterministic, distinct per-dynasty colours: a hue band per family, spread inside the band. */
export const FAMILIES = ['persian', 'arab', 'turkic', 'greek', 'nomadic', 'foreign', 'semitic'] as const;
export type Family = (typeof FAMILIES)[number];

// [hueStart, hueEnd] in degrees. Bands are disjoint so family stays readable at a glance.
const BANDS: Record<Family, [number, number]> = {
  persian: [255, 325],   // violets / magentas
  arab:    [95, 165],    // greens
  turkic:  [8, 38],      // red-oranges
  greek:   [185, 225],   // cyans / blues
  nomadic: [40, 62],     // ambers / yellows
  foreign: [335, 358],   // crimsons
  semitic: [20, 34],     // browns (low saturation, handled below)
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export const BOARD_BG = '#0b1020';
export function contrastAgainstBoard(hex: string): number {
  const [a, b] = [luminance(hex), luminance(BOARD_BG)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

function rgbDistance(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export const MIN_COLOR_DISTANCE = 22;

export function colorForDynasty(id: string, family: Family, taken: { hex: string }[]): string {
  const [h0, h1] = BANDS[family];
  const seed = hash(id);
  let best = '';
  let bestDist = -1;
  // Try a deterministic sequence of candidates; accept the first far enough from all taken, else the farthest.
  for (let i = 0; i < 64; i++) {
    const t = ((seed >>> 3) + i * 0.6180339887 * 1000) % 1000 / 1000;
    const hue = h0 + (h1 - h0) * ((((seed % 997) / 997) + i * 0.618) % 1);
    const sat = family === 'semitic' ? 38 + 12 * t : 62 + 24 * ((i * 37 + seed) % 100) / 100;
    let light = 48 + 18 * (((seed >>> 8) + i * 53) % 100) / 100;
    let hex = hslToHex(hue, sat, light);
    while (contrastAgainstBoard(hex) < 3 && light < 80) { light += 2; hex = hslToHex(hue, sat, light); }
    const dist = taken.length ? Math.min(...taken.map(o => rgbDistance(hex, o.hex))) : 999;
    if (dist >= MIN_COLOR_DISTANCE) return hex;
    if (dist > bestDist) { bestDist = dist; best = hex; }
  }
  return best;
}
