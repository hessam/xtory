/** Which hidden facts to show as sparkles / hand out next. Pure, so it is unit-tested. */
import type { Fact } from '../facts/model';
import { getRealmsByRegion } from '../data/registry';
import type { Sparkle } from './store';

export const MAX_SPARKLES = 3;
const NEAR = 60; // years either side of the timeline position

/** Rarer, more personal facts surface before the generic "N dynasties at once" ones. */
const RARITY: Record<string, number> = { pair: 0, person: 1, ruler: 2, dynasty: 3, region: 4, era: 5, jump: 6, year: 7 };
const rarity = (f: Fact) => RARITY[f.entityType] ?? 8;

const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

/** Facts not yet found, nearest to `year` first, ties broken by rarity then id (stable, no flicker while scrubbing). */
export function rankUnfound(all: Fact[], found: Record<string, number>, year: number): Fact[] {
  return all
    .filter(f => !(f.id in found))
    .map(f => ({ f, d: f.year == null ? Infinity : Math.abs(f.year - year) }))
    .sort((a, b) => a.d - b.d || rarity(a.f) - rarity(b.f) || a.f.id.localeCompare(b.f.id))
    .map(x => x.f);
}

/** The region a fact "lives" in on the map at `year`; falls back to a stable pick among regions that have realms. */
export function regionForFact(f: Fact, year: number): string | null {
  const byRegion = getRealmsByRegion(year);
  const [type, key] = f.entityKey.split(':');
  if (type === 'region' && byRegion.has(key)) return key;
  if (type === 'dynasty') for (const [id, list] of byRegion) if (list.some(r => r.dynastyId === key)) return id;
  const ids = [...byRegion.keys()].sort();
  return ids.length ? ids[hash(f.id) % ids.length] : null;
}

export function pickSparkles(all: Fact[], found: Record<string, number>, year: number, max = MAX_SPARKLES): Sparkle[] {
  const out: Sparkle[] = [], used = new Set<string>();
  for (const f of rankUnfound(all, found, year)) {
    if (out.length >= max) break;
    if (f.year == null || Math.abs(f.year - year) > NEAR) break; // sorted by distance → nothing nearer remains
    let regionId = regionForFact(f, year);
    if (!regionId) continue;
    if (used.has(regionId)) { // one sparkle per region so they never overlap
      const free = [...getRealmsByRegion(year).keys()].sort().find(r => !used.has(r));
      if (!free) continue;
      regionId = free;
    }
    used.add(regionId); out.push({ factId: f.id, regionId });
  }
  return out;
}

/** The "✦ Discover" button always has something to give: the nearest unfound fact, any distance. */
export const nextFact = (all: Fact[], found: Record<string, number>, year: number): Fact | null => rankUnfound(all, found, year)[0] ?? null;
