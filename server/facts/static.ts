/** Server-side view of the static (bundled) facts: the computed set plus owner-approved AI facts. Mirrors src/data/facts.ts, which uses a Vite glob the API bundle cannot. */
import computed from '../../src/data/generated/facts.computed.json';
import curated from '../../data/facts/verified/ai.json';
import { isVisible, type Fact } from '../../src/facts/model.js';

let cache: Map<string, Fact> | null = null;
export function staticFactMap(): Map<string, Fact> {
  if (cache) return cache;
  const m = new Map<string, Fact>();
  for (const f of computed as unknown as Fact[]) m.set(f.id, f);
  for (const f of ((curated as { facts?: Fact[] }).facts ?? [])) m.set(f.id, f);
  for (const [id, f] of [...m]) if (!isVisible(f)) m.delete(id);
  return (cache = m);
}
