import type { Fact } from './model';

export interface MergeResult { facts: Fact[]; added: string[]; updated: string[]; removed: string[] }

/**
 * Merge an admin export into the committed file. The export is the full set of currently verified AI facts, so
 * anything in the file that is no longer in it (rejected/disputed after verification) is removed: git always reflects
 * what the owner has approved right now, and `git log` shows when and why a fact left.
 */
export function mergeVerified(existing: Fact[], incoming: Fact[]): MergeResult {
  const have = new Map(existing.map(f => [f.id, f]));
  const want = new Map(incoming.filter(f => f.status === 'verified').map(f => [f.id, f]));
  const added: string[] = [], updated: string[] = [], removed: string[] = [];
  for (const [id, f] of want) { if (!have.has(id)) added.push(id); else if (JSON.stringify(have.get(id)) !== JSON.stringify(f)) updated.push(id); }
  for (const id of have.keys()) if (!want.has(id)) removed.push(id);
  return { facts: [...want.values()].sort((a, b) => a.id.localeCompare(b.id)), added, updated, removed };
}

/** Public shape for the repo: no internal counters or discoverer ids. */
export function forRepo(f: Fact): Fact {
  const copy: Fact = { ...f, found: 0, reports: 0 };
  delete copy.firstDiscoverer;
  return copy;
}
