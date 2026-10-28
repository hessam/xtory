/**
 * Static facts the browser can use with NO backend: generated computed facts + owner-approved AI facts.
 * Only facts that pass `isVisible` are returned (verified, or ai_checked and not sensitive).
 */
import computed from './generated/facts.computed.json';
import { isVisible, type Fact } from '../facts/model';

const curatedFiles = import.meta.glob('/data/facts/verified/*.json', { eager: true, import: 'default' }) as Record<string, { facts?: Fact[] }>;

let cache: Fact[] | null = null;

/** All shippable static facts, de-duplicated by id (curated wins over computed), newest-first stable order by id. */
export function staticFacts(): Fact[] {
  if (cache) return cache;
  const byId = new Map<string, Fact>();
  for (const f of computed as unknown as Fact[]) byId.set(f.id, f);
  for (const file of Object.values(curatedFiles)) for (const f of file.facts ?? []) byId.set(f.id, f);
  cache = [...byId.values()].filter(isVisible).sort((a, b) => a.id.localeCompare(b.id));
  return cache;
}

export const factsForEntity = (entityKey: string) => staticFacts().filter(f => f.entityKey === entityKey);
export const factsForYear = (year: number, span = 25) => staticFacts().filter(f => f.year != null && Math.abs(f.year - year) <= span);
export const factById = (id: string) => staticFacts().find(f => f.id === id) ?? null;
