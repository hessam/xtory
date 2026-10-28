/**
 * Structured "known facts" the deterministic checker compares AI claims against.
 * Built from data the owner curates (rulers.ts reigns, data/facts/lives.json). Wikidata cross-checks upgrade `confirmed`.
 */
import { rulers } from '../data/rulers';
import livesJson from '../../data/facts/lives.json';

export interface Life {
  id: string;
  name: { en: string; fa: string };
  aliases?: string[];
  rulerId?: string;
  born: number | null;
  died: number | null;
  /** birth year only approximately known (e.g. "c. 550 BC") → wider tolerance, never an exact-age fact */
  approximate?: boolean;
  reignStart?: number;
  reignEnd?: number;
  sources: string[];
  provenance: 'assistant_seed' | 'wikidata' | 'owner';
  /** set by the owner after checking, or automatically when Wikidata agrees (±1 year) */
  confirmedBy?: 'owner' | 'wikidata';
  note?: string;
}
export const lives: Life[] = (livesJson as { lives: Life[] }).lives;

export interface KnownEntity {
  id: string;
  names: string[];
  ageAtDeath?: number;
  ageAtAccession?: number;
  reignLength?: number;
  born?: number; died?: number;
  tolerance: number;
}

/** years elapsed between two signed years (there is no year 0) */
export const yearsBetween = (from: number, to: number) => to - from - (from < 0 && to > 0 ? 1 : 0);

export function buildKnown(): KnownEntity[] {
  const out = new Map<string, KnownEntity>();
  for (const l of lives) {
    const reignStart = l.reignStart ?? (l.rulerId ? rulers[l.rulerId]?.startDate : undefined);
    const reignEnd = l.reignEnd ?? (l.rulerId ? rulers[l.rulerId]?.endDate : undefined);
    out.set(l.id, {
      id: l.id, names: [l.name.en, l.name.fa, ...(l.aliases ?? [])],
      born: l.born ?? undefined, died: l.died ?? undefined,
      ageAtDeath: l.born != null && l.died != null ? yearsBetween(l.born, l.died) : undefined,
      ageAtAccession: l.born != null && reignStart != null ? yearsBetween(l.born, reignStart) : undefined,
      reignLength: reignStart != null && reignEnd != null ? yearsBetween(reignStart, reignEnd) : undefined,
      tolerance: l.approximate ? 3 : 1,
    });
  }
  for (const r of Object.values(rulers)) {
    if (out.has(r.id) || [...out.values()].some(e => e.names.includes(r.name.en))) continue;
    out.set(r.id, { id: r.id, names: [r.name.en, r.name.fa], reignLength: yearsBetween(r.startDate, r.endDate), tolerance: 1 });
  }
  return [...out.values()];
}
