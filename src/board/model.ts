/**
 * Renderer-independent board scene: turns the generated geometry + realm cells into drawable shapes.
 * Both spike renderers (SVG, PixiJS) consume exactly this, so the comparison is like for like.
 */
import geometryJson from '../data/generated/board/geometry.json';
import cellsJson from '../data/generated/board/cells.json';
import { getDynasty } from '../data/registry';

export type Ring = [number, number][];
export interface BoardGeometry {
  width: number; height: number; bbox: number[];
  land: Ring[]; lakes: Ring[]; rivers: Ring[];
  regions: Record<string, { rings: Ring[]; centroid: [number, number]; name: { en: string; fa: string }; seeds: { x: number; y: number; city: { en: string; fa: string } | null }[] }>;
  neighbours: { id: string; name: { en: string; fa: string }; rings: Ring[]; centroid: [number, number] }[];
  cities: { regionId: string; name: { en: string; fa: string }; x: number; y: number; tier: number }[];
  overlays: { achaemenidMax: Ring[]; sasanianMax: Ring[]; iranModern: Ring[] };
  projection: { rotate: [number, number]; parallels: [number, number]; scale: number; translate: [number, number] };
}
export const geometry = geometryJson as unknown as BoardGeometry;
export const SAMPLE_YEARS: number[] = (cellsJson as any).years;

export interface DrawCell {
  key: string;
  regionId: string;
  dynastyId: string;
  color: string;
  name: { en: string; fa: string };
  rings: Ring[];
  /** where to put the label */
  label: { x: number; y: number; angle: number; size: number };
  area: number;
}

export interface Scene {
  year: number;
  cells: DrawCell[];
  /** regions with no realm data at this year: drawn as fog */
  fogRegions: string[];
  dynastyCount: number;
}

export const ringsToPath = (rings: Ring[]): string =>
  rings.map(r => 'M' + r.map(p => p[0] + ' ' + p[1]).join('L') + 'Z').join('');

export const linesToPath = (lines: Ring[]): string =>
  lines.map(r => 'M' + r.map(p => p[0] + ' ' + p[1]).join('L')).join('');

export function stats(rings: Ring[]) {
  // largest ring only: good enough for label placement
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0] ?? []);
  if (ring.length < 3) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1) return null;
  cx /= 6 * a; cy /= 6 * a;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of ring) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  sxx /= ring.length; syy /= ring.length; sxy /= ring.length;
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
  const lam1 = (sxx + syy) / 2 + Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2);
  angle = Math.max(-28, Math.min(28, angle));
  return { x: cx, y: cy, angle, major: 4 * Math.sqrt(lam1), area: Math.abs(a) };
}

export function buildScene(year: number, lang: 'en' | 'fa'): Scene {
  const yearCells = (cellsJson as any).cells[String(year)] as Record<string, { dynastyId: string; rings: Ring[] }[]> | undefined;
  const cells: DrawCell[] = [];
  const dyn = new Set<string>();
  const present = new Set<string>();
  if (yearCells) {
    for (const [regionId, list] of Object.entries(yearCells)) {
      present.add(regionId);
      list.forEach((c, i) => {
        const d = getDynasty(c.dynastyId);
        if (!d || c.rings.length === 0) return;
        dyn.add(d.id);
        const s = stats(c.rings);
        const name = d.name[lang];
        const perChar = lang === 'fa' ? 0.55 : 0.95; // approx. advance per character incl. letter-spacing
        const size = s ? Math.max(8, Math.min(30, (0.72 * s.major) / (name.length * perChar))) : 0;
        cells.push({
          key: `${regionId}:${d.id}:${i}`, regionId, dynastyId: d.id, color: d.color, name: d.name, rings: c.rings,
          label: s ? { x: s.x, y: s.y, angle: s.angle, size } : { x: 0, y: 0, angle: 0, size: 0 },
          area: s?.area ?? 0,
        } as DrawCell);
      });
    }
  }
  placeLabels(cells, lang);
  const fogRegions = Object.keys(geometry.regions).filter(id => !present.has(id));
  return { year, cells, fogRegions, dynastyCount: dyn.size };
}

export const THEME = {
  sea: '#0a1424', seaDeep: '#070e1b', land: '#1a2231', landEdge: '#2b3a52',
  coast: '#6fa3d8', river: '#4f7fa8', ink: '#e8eef7', halo: '#05080f',
  fog: '#05080f', neighbour: '#8a97ab',
};

/** Lighter tint for borders so territories read as lit from within. */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix).map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * One label per dynasty (on its largest cell), and no overlaps: biggest cells claim space first,
 * labels that collide or would be unreadably small are hidden (size = 0).
 */
export function placeLabels(cells: DrawCell[], lang: 'en' | 'fa') {
  const perChar = lang === 'fa' ? 0.55 : 0.95;
  const MIN = 10;
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const done = new Set<string>();
  for (const c of [...cells].sort((a, b) => b.area - a.area)) {
    const L = c.label;
    if (done.has(c.dynastyId) || L.size < MIN) { L.size = 0; continue; }
    const w = c.name[lang].length * L.size * perChar, h = L.size * 1.25;
    const rad = Math.abs(L.angle) * Math.PI / 180;
    const bw = w * Math.cos(rad) + h * Math.sin(rad), bh = w * Math.sin(rad) + h * Math.cos(rad);
    const box = { x0: L.x - bw / 2, y0: L.y - bh / 2, x1: L.x + bw / 2, y1: L.y + bh / 2 };
    if (placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) { L.size = 0; continue; }
    placed.push(box); done.add(c.dynastyId);
  }
}
