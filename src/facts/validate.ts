import { factHash, type Fact } from './model';

/** Problems with a fact record destined for data/facts/verified/ (or the static bundle). Empty = valid. */
export function validateFactRecord(f: Fact): string[] {
  const p: string[] = [];
  const need = (ok: boolean, msg: string) => { if (!ok) p.push(msg); };
  need(typeof f.id === 'string' && /^[ac]_[a-z0-9_]+$/.test(f.id), 'id');
  need(f.status === 'verified', `status must be verified, got ${f.status}`);
  need(Array.isArray(f.sources) && f.sources.length > 0 && f.sources.every(s => typeof s === 'string' && s.trim().length > 2), 'at least one real source');
  for (const [k, v] of [['hook', f.hook], ['claim', f.claim]] as const) { need(!!v?.en?.trim(), `${k}.en`); need(!!v?.fa?.trim(), `${k}.fa`); need(/[؀-ۿ]/.test(v?.fa ?? ''), `${k}.fa must be Persian text`); }
  need(!!f.entityKey, 'entityKey');
  need(f.hash === factHash(f.entityKey, f.claim?.en ?? ''), 'hash must match entityKey + English claim (re-run after editing)');
  need(f.year === null || Number.isInteger(f.year), 'year');
  return p;
}
