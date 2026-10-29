/**
 * Journey mode (ff_journey): chapters = the historianCards eras, in their order. Each chapter has story beats (one year
 * each: tapping a beat moves the timeline there) and a three-question myth-or-reality quiz. Authored in data/journey/*.json.
 */
import { historianCards } from '../data/historianCards';

export interface Bi { en: string; fa: string }
export interface Beat { year: number; text: Bi }
export interface Question { statement: Bi; reality: boolean; why: Bi }
export interface RawChapter { eraId: string; title: Bi; sources: string[]; beats: Beat[]; quiz: Question[]; status: string }
export interface Chapter extends RawChapter { index: number; yearRange: { start: number; end: number }; name: Bi }

const files = import.meta.glob('/data/journey/*.json', { eager: true, import: 'default' }) as Record<string, RawChapter>;
const byEra = new Map<string, RawChapter>(Object.values(files).map(c => [c.eraId, c]));

/** Chapters in history order. A card without authored content is left out, so the path never shows an empty chapter. */
export const chapters: Chapter[] = historianCards
  .filter(card => byEra.has(card.eraId))
  .map((card, index) => ({ ...byEra.get(card.eraId)!, index, yearRange: card.yearRange, name: card.eraName }));

export const chapterById = (eraId: string) => chapters.find(c => c.eraId === eraId) ?? null;

/** `#/journey/<eraId>/<n>` (n = 1-based beat) or `#/journey/<eraId>/quiz`. */
export type Step = { kind: 'beat'; index: number } | { kind: 'quiz' };
export function parseHash(hash: string): { chapter: Chapter; step: Step } | null {
  const m = /^#\/journey\/([a-z_]+)(?:\/([a-z0-9]+))?$/.exec(hash);
  if (!m) return null;
  const chapter = chapterById(m[1]);
  if (!chapter) return null;
  const s = m[2];
  if (!s) return { chapter, step: { kind: 'beat', index: 0 } };
  if (s === 'quiz') return { chapter, step: { kind: 'quiz' } };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > chapter.beats.length) return null;
  return { chapter, step: { kind: 'beat', index: n - 1 } };
}
export const hashFor = (eraId: string, step: Step) => `#/journey/${eraId}/${step.kind === 'beat' ? step.index + 1 : step.kind}`;
