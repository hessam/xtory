/**
 * Realm cells for ANY year, computed at runtime (≈1 ms): each region is split among the realms ruling it
 * by a Voronoi diagram seeded at the region's anchor cities / interior seeds (baked at build time).
 * SCHEMATIC: the curated data has no internal borders, so cells approximate "who held which part".
 */
import { Delaunay } from 'd3-delaunay';
import { geometry, stats, placeLabels, type DrawCell, type Ring } from './model';
import { getDynasty, getRealmsByRegion, type Realm, type Family } from '../data/registry';

export interface BoardCell extends DrawCell {
  realm: Realm;
  family: Family;
  capital: { x: number; y: number; city: { en: string; fa: string } | null };
  lowConfidence: boolean;
}

const area2 = (r: Ring) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0);

/** Sutherland–Hodgman: clip `subject` to the convex polygon `clip` (any winding). */
export function clipConvex(subject: Ring, clip: Ring): Ring {
  const sign = Math.sign(area2(clip)) || 1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inside = (p: [number, number]) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
    const cross = (p: [number, number], q: [number, number]): [number, number] => {
      const dx = q[0] - p[0], dy = q[1] - p[1], ex = b[0] - a[0], ey = b[1] - a[1];
      const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / (dx * ey - dy * ex);
      return [p[0] + t * dx, p[1] + t * dy];
    };
    const input = out; out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(cross(prev, cur));
    }
  }
  return out.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10] as [number, number]);
}

const largest = (rings: Ring[]) => rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
const open = (r: Ring) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);

const cache = new Map<string, BoardCell[]>();

export function computeBoardCells(year: number, lang: 'en' | 'fa'): BoardCell[] {
  const key = `${year}|${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const out: BoardCell[] = [];
  for (const [regionId, list] of getRealmsByRegion(year)) {
    const region = geometry.regions[regionId];
    if (!region || region.rings.length === 0) continue; // periphery (satrapies outside the 12 regions) is not drawn
    const n = Math.min(list.length, region.seeds.length);
    const subject = open(largest(region.rings));
    const xs = subject.map(p => p[0]), ys = subject.map(p => p[1]);
    const voronoi = n > 1 ? Delaunay.from(region.seeds.slice(0, n).map(s => [s.x, s.y] as [number, number]))
      .voronoi([Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) + 2, Math.max(...ys) + 2]) : null;

    for (let i = 0; i < n; i++) {
      const realm = list[i];
      const d = getDynasty(realm.dynastyId);
      if (!d) continue;
      let rings: Ring[];
      if (!voronoi) rings = region.rings;
      else {
        const cell = voronoi.cellPolygon(i);
        const clipped = cell ? clipConvex(subject, open(cell as Ring)) : [];
        if (clipped.length < 3) continue;
        rings = [[...clipped, clipped[0]]];
      }
      const st = stats(rings);
      const perChar = lang === 'fa' ? 0.55 : 0.95;
      const name = d.name[lang];
      const size = st ? Math.max(8, Math.min(30, (0.72 * st.major) / (name.length * perChar))) : 0;
      const seed = region.seeds[i];
      out.push({
        key: `${regionId}:${d.id}`, regionId, dynastyId: d.id, color: d.color, name: d.name, rings,
        label: st ? { x: st.x, y: st.y, angle: st.angle, size } : { x: 0, y: 0, angle: 0, size: 0 },
        area: st?.area ?? 0, realm, family: d.family,
        capital: { x: seed.x, y: seed.y, city: seed.city },
        lowConfidence: realm.confidence === 'low',
      });
    }
  }
  placeLabels(out, lang);
  cache.set(key, out);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return out;
}
