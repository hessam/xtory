/**
 * Journey mode (ff_journey): the atlas tells the story. Chapters = the historianCards eras, in order. Every beat is a
 * scene on the board: a year (the timeline sweeps there), a realm to spotlight (`lens`), places to pin, regions to frame
 * and, sometimes, a question answered by tapping the map. Each chapter ends with a map challenge built from the realm
 * data itself ("tap a region ruled by …"), so answers are always consistent with what the board shows.
 */
import { historianCards } from '../data/historianCards';
import { getDynasty, getRealmsByRegion } from '../data/registry';
import { geometry } from '../board/model';

export interface Bi { en: string; fa: string }
export interface Pin { lat: number; lng: number; label: Bi }
export interface Ask { prompt: Bi; regions: string[] }
export interface Beat { year: number; text: Bi; lens?: string; pins?: Pin[]; focus?: string[]; ask?: Ask }
export interface RawChapter { eraId: string; title: Bi; sources: string[]; beats: Beat[]; status: string }
export interface Chapter extends RawChapter { index: number; yearRange: { start: number; end: number }; name: Bi }
export interface Challenge { year: number; dynastyId: string; name: Bi; regions: string[] }

const files = import.meta.glob('/data/journey/*.json', { eager: true, import: 'default' }) as Record<string, RawChapter>;
const byEra = new Map<string, RawChapter>(Object.values(files).map(c => [c.eraId, c]));

export const chapters: Chapter[] = historianCards
  .filter(card => byEra.has(card.eraId))
  .map((card, index) => ({ ...byEra.get(card.eraId)!, index, yearRange: card.yearRange, name: card.eraName }));

export const chapterById = (eraId: string) => chapters.find(c => c.eraId === eraId) ?? null;

/** Board regions a dynasty holds in a year (only the playable board regions). */
export function regionsHeld(dynastyId: string, year: number): string[] {
  return [...getRealmsByRegion(year)].filter(([id, rs]) => geometry.regions[id] && rs.some(r => r.dynastyId === dynastyId)).map(([id]) => id).sort();
}

const BOARD_REGIONS = Object.keys(geometry.regions).length;
/**
 * Three map questions per chapter, derived from the realm data: a named dynasty that holds some — not all — board regions
 * at one of the chapter's beat years. Beat spotlights come first (the story just showed them), then the biggest rivals.
 */
export function challengesFor(ch: Chapter, n = 3): Challenge[] {
  const out: Challenge[] = [], seen = new Set<string>();
  const add = (dynastyId: string, year: number) => {
    const d = getDynasty(dynastyId); if (!d || seen.has(dynastyId) || /^local_|_culture$|_tribal|tribe/.test(dynastyId)) return;
    const regions = regionsHeld(dynastyId, year);
    if (regions.length < 1 || regions.length > BOARD_REGIONS - 3) return;
    seen.add(dynastyId); out.push({ year, dynastyId, name: d.name, regions });
  };
  for (const b of ch.beats) if (b.lens) add(b.lens, b.year);
  for (const b of ch.beats) {
    if (out.length >= n) break;
    const counts = new Map<string, number>();
    for (const [id, rs] of getRealmsByRegion(b.year)) if (geometry.regions[id]) for (const r of rs) counts.set(r.dynastyId, (counts.get(r.dynastyId) ?? 0) + 1);
    [...counts].sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0])).forEach(([id]) => add(id, b.year));
  }
  return out.slice(0, n);
}

/** `#/journey/<eraId>/<n>` (n = 1-based beat) or `#/journey/<eraId>/challenge`. */
export type Step = { kind: 'beat'; index: number } | { kind: 'challenge' };
export function parseHash(hash: string): { chapter: Chapter; step: Step } | null {
  const m = /^#\/journey\/([a-z_]+)(?:\/([a-z0-9]+))?$/.exec(hash);
  if (!m) return null;
  const chapter = chapterById(m[1]);
  if (!chapter) return null;
  const s = m[2];
  if (!s) return { chapter, step: { kind: 'beat', index: 0 } };
  if (s === 'challenge') return { chapter, step: { kind: 'challenge' } };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > chapter.beats.length) return null;
  return { chapter, step: { kind: 'beat', index: n - 1 } };
}
export const hashFor = (eraId: string, step: Step) => `#/journey/${eraId}/${step.kind === 'beat' ? step.index + 1 : 'challenge'}`;
