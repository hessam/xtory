/**
 * Builds board geometry for the strategy-game map (Slice 3 spike).
 *
 *   npx tsx scripts/board/build-board.ts
 *
 * Downloads Natural Earth 50m land/lakes/rivers (public domain) into .cache/ (git-ignored), clips to the atlas
 * bounding box, projects with a conic equal-area projection centred on Iran, simplifies, and writes
 * src/data/generated/board/{geometry,cells}.json. No tiles, no runtime projection.
 *
 * REALM CELLS ARE SCHEMATIC: the curated data says which dynasties ruled a region, not where their internal
 * borders ran. Cells are Voronoi splits seeded at the region's anchor cities and must be drawn as approximate.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as d3 from 'd3';
import * as turf from '@turf/turf';
import regionsGeo from '../../src/data/regions.json';
import achaemenidMax from '../../src/data/achaemenid_max.json';
import sasanianMax from '../../src/data/sasanian_max.json';
import iranModern from '../../src/data/iran_modern.json';
import neighboursGeo from '../../src/data/neighbours.json';
import { regions as regionData } from '../../src/data/regions';
import { getRealmsByRegion } from '../../src/data/registry';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CACHE = path.join(ROOT, '.cache/ne');
const OUT = path.join(ROOT, 'src/data/generated/board');
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const BBOX: [number, number, number, number] = [24, 10, 77, 45]; // minLon, minLat, maxLon, maxLat (same as MapLeaflet bounds)
const WIDTH = 2400;
export const SAMPLE_YEARS = [-500, 250, 1000, 1500, 1750];
const MAX_CELLS = 6;

async function ne(name: string): Promise<any> {
  const file = path.join(CACHE, `${name}.geojson`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true });
    const res = await fetch(`${BASE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// d3 reads polygon winding as "inside", and a lon/lat bbox ring has the wrong winding, so fit to sampled edge points instead.
const edge: [number, number][] = [];
for (let lon = BBOX[0]; lon <= BBOX[2]; lon++) { edge.push([lon, BBOX[1]], [lon, BBOX[3]]); }
for (let lat = BBOX[1]; lat <= BBOX[3]; lat++) { edge.push([BBOX[0], lat], [BBOX[2], lat]); }
const edgePoints: any = { type: 'MultiPoint', coordinates: edge };
const projection = d3.geoConicEqualArea().rotate([-53, 0]).parallels([20, 44]).fitWidth(WIDTH, edgePoints);
const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds(edgePoints);
const HEIGHT = Math.ceil(y1 - y0);
projection.translate([projection.translate()[0] - x0, projection.translate()[1] - y0]);

const r1 = (n: number) => Math.round(n * 10) / 10;
type Ring = [number, number][];

function project(coords: number[][]): Ring {
  const out: Ring = [];
  for (const c of coords) {
    const p = projection(c as [number, number]);
    if (p) out.push([r1(p[0]), r1(p[1])]);
  }
  return out;
}

/** Douglas-Peucker in projected px space, drops rings that collapse. */
function simplifyRing(ring: Ring, tol: number, closed: boolean): Ring {
  const line = turf.lineString(ring);
  const s = turf.simplify(line, { tolerance: tol, highQuality: false }).geometry.coordinates as Ring;
  return closed ? (s.length >= 4 ? s : []) : (s.length >= 2 ? s : []);
}

function polygonsOf(geom: any): number[][][][] {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function ringsOf(features: any[], tol: number): Ring[] {
  const out: Ring[] = [];
  for (const f of features) for (const poly of polygonsOf(f.geometry)) for (const ring of poly) {
    const r = simplifyRing(project(ring), tol, true);
    if (r.length) out.push(r);
  }
  return out;
}

function linesOf(features: any[], tol: number): Ring[] {
  const out: Ring[] = [];
  for (const f of features) {
    const g = f.geometry;
    const lines = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of lines) { const r = simplifyRing(project(l), tol, false); if (r.length) out.push(r); }
  }
  return out;
}

function clipToBbox(features: any[]): any[] {
  const out: any[] = [];
  for (const f of features) {
    try {
      const c = turf.bboxClip(f, BBOX);
      if (c.geometry.coordinates.length) out.push(c);
    } catch { /* skip degenerate */ }
  }
  return out;
}

const land = clipToBbox((await ne('ne_50m_land')).features);
const lakes = clipToBbox((await ne('ne_50m_lakes')).features.filter((f: any) => (f.properties.name ?? '').match(/Caspian|Aral|Van|Urmia|Sevan|Balkhash/i)));
const rivers = clipToBbox((await ne('ne_50m_rivers_lake_centerlines')).features.filter((f: any) => (f.properties.scalerank ?? 9) <= 6));

// NE land polygons are disjoint, so one MultiPolygon is enough for clipping (no union needed).
const landMulti: any = turf.multiPolygon(land.flatMap((f: any) => polygonsOf(f.geometry)));
let landUnion: any = landMulti;

const regionFeatures: any[] = (regionsGeo as any).features;
const regionOut: Record<string, { rings: Ring[]; centroid: [number, number]; name: { en: string; fa: string } }> = {};
for (const f of regionFeatures) {
  const id = f.properties.id as string;
  const meta = regionData.find(r => r.id === id);
  const rings = ringsOf([f], 0.4);
  const c = meta ? projection([meta.centroid.lng, meta.centroid.lat]) : null;
  regionOut[id] = { rings, centroid: c ? [r1(c[0]), r1(c[1])] : [0, 0], name: { en: meta?.displayName.en.full ?? id, fa: meta?.displayName.fa.full ?? id } };
}

// Seeds: where a realm's cell grows from inside each region. Anchor cities first (they double as capitals),
// then deterministic interior points so a region can always host up to MAX_SEEDS realms.
const MAX_SEEDS = 8;
const hash0 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
type Seed = { x: number; y: number; city: { en: string; fa: string } | null };
const seedsOut: Record<string, Seed[]> = {};
for (const f of regionFeatures) {
  const id = f.properties.id as string;
  const meta = regionData.find(r => r.id === id)!;
  const [minX, minY, maxX, maxY] = turf.bbox(f);
  const seeds: Seed[] = [];
  for (const c of meta.anchorCities) {
    if (!turf.booleanPointInPolygon([c.lng, c.lat], f)) continue;
    const p = projection([c.lng, c.lat])!;
    seeds.push({ x: r1(p[0]), y: r1(p[1]), city: { en: c.name, fa: c.nameFa } });
  }
  for (let i = 0; seeds.length < MAX_SEEDS && i < 400; i++) {
    const h = hash0(`${id}:${i}`);
    const ll: [number, number] = [minX + ((h & 0xffff) / 0xffff) * (maxX - minX), minY + (((h >>> 16) & 0xffff) / 0xffff) * (maxY - minY)];
    if (!turf.booleanPointInPolygon(ll, f)) continue;
    const p = projection(ll)!;
    // keep seeds apart so cells stay readable
    if (seeds.some(s => Math.hypot(s.x - p[0], s.y - p[1]) < 40)) continue;
    seeds.push({ x: r1(p[0]), y: r1(p[1]), city: null });
  }
  seedsOut[id] = seeds;
}

const citiesOut = regionData.flatMap(r => r.anchorCities.map((c, i) => {
  const p = projection([c.lng, c.lat])!;
  return { regionId: r.id, name: { en: c.name, fa: c.nameFa }, x: r1(p[0]), y: r1(p[1]), tier: i === 0 ? 1 : i === 1 ? 2 : 3 };
}));

const overlaysOut = {
  achaemenidMax: ringsOf((achaemenidMax as any).features, 0.5),
  sasanianMax: ringsOf((sasanianMax as any).features, 0.5),
  iranModern: ringsOf((iranModern as any).features, 0.5),
};

const neighbourOut = (neighboursGeo as any).features.map((f: any) => ({
  id: f.properties.id, name: { en: f.properties.name, fa: f.properties.nameFa ?? f.properties.name }, rings: ringsOf([f], 0.4),
  centroid: (() => { const c = turf.centerOfMass(f).geometry.coordinates; const p = projection(c as [number, number])!; return [r1(p[0]), r1(p[1])]; })(),
}));

// ── Realm cells (schematic) ──────────────────────────────────────────────────
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

function cellsFor(regionId: string, dynastyIds: string[]): { dynastyId: string; rings: Ring[] }[] {
  const feature = regionFeatures.find(f => f.properties.id === regionId);
  const meta = regionData.find(r => r.id === regionId);
  if (!feature || !meta) return [];
  const ids = dynastyIds.slice(0, MAX_CELLS);
  if (ids.length === 1) return [{ dynastyId: ids[0], rings: regionOut[regionId].rings }];

  const [minX, minY, maxX, maxY] = turf.bbox(feature);
  // seeds: anchor cities first, then deterministic points inside the region
  const seeds: [number, number][] = meta.anchorCities.map(c => [c.lng, c.lat] as [number, number]).filter(p => turf.booleanPointInPolygon(p, feature));
  for (let i = 0; seeds.length < ids.length && i < 200; i++) {
    const h = hash(`${regionId}:${i}`);
    const p: [number, number] = [minX + ((h & 0xffff) / 0xffff) * (maxX - minX), minY + (((h >>> 16) & 0xffff) / 0xffff) * (maxY - minY)];
    if (turf.booleanPointInPolygon(p, feature)) seeds.push(p);
  }
  const used = seeds.slice(0, ids.length);
  const vor = d3.Delaunay.from(used).voronoi([minX - 1, minY - 1, maxX + 1, maxY + 1]);
  const out: { dynastyId: string; rings: Ring[] }[] = [];
  ids.forEach((dynastyId, i) => {
    const cell = vor.cellPolygon(i);
    if (!cell) return;
    try {
      let piece: any = turf.intersect(turf.featureCollection([turf.polygon([cell]), feature]) as any);
      if (piece && landUnion) {
        try { piece = turf.intersect(turf.featureCollection([piece, landUnion]) as any) ?? piece; }
        catch { clipFailures++; } // keep the unclipped cell rather than lose it
      }
      if (piece) out.push({ dynastyId, rings: ringsOf([piece], 0.4) });
    } catch { /* skip */ }
  });
  return out;
}

let clipFailures = 0;
const cells: Record<string, Record<string, { dynastyId: string; rings: Ring[] }[]>> = {};
for (const y of SAMPLE_YEARS) {
  cells[y] = {};
  for (const [regionId, list] of getRealmsByRegion(y)) {
    if (!regionOut[regionId]) continue;
    cells[y][regionId] = cellsFor(regionId, list.map(r => r.dynastyId));
  }
}

fs.mkdirSync(OUT, { recursive: true });
const geometry = {
  width: WIDTH, height: HEIGHT, bbox: BBOX,
  land: ringsOf(land, 0.5), lakes: ringsOf(lakes, 0.5), rivers: linesOf(rivers, 0.6),
  regions: Object.fromEntries(Object.entries(regionOut).map(([id, r]) => [id, { ...r, seeds: seedsOut[id] }])),
  neighbours: neighbourOut, cities: citiesOut, overlays: overlaysOut,
  // must match runtime: d3.geoConicEqualArea().rotate(rotate).parallels(parallels).scale(scale).translate(translate)
  projection: { rotate: [-53, 0], parallels: [20, 44], scale: projection.scale(), translate: projection.translate().map(r1) },
};
fs.writeFileSync(path.join(OUT, 'geometry.json'), JSON.stringify(geometry) + '\n');
fs.writeFileSync(path.join(OUT, 'cells.json'), JSON.stringify({ years: SAMPLE_YEARS, cells }) + '\n');
for (const f of ['geometry.json', 'cells.json']) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1), 'KB');
console.log(`coast-clip failures (kept unclipped): ${clipFailures}`);
console.log(`board ${WIDTH}x${HEIGHT}; land rings ${geometry.land.length}, rivers ${geometry.rivers.length}, lakes ${geometry.lakes.length}`);
