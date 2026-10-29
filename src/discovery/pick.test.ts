import { describe, it, expect } from 'vitest';
import { pickSparkles, nextFact, rankUnfound } from './pick';
import { progress } from './store';
import type { Fact } from '../facts/model';

const f = (id: string, year: number | null, entityType = 'person', entityKey = `person:${id}`): Fact => ({
  id, kind: 'computed', entityType, entityKey, entityName: { en: id, fa: id }, year, hook: { en: id, fa: id }, claim: { en: id, fa: id },
  sources: ['s'], confidence: 'high', status: 'verified', hash: id, sensitive: false, found: 0, reports: 0, history: [], createdAt: 0, updatedAt: 0,
});
const all = [f('a', 1000), f('b', 1010), f('c', 1020), f('d', 1030), f('far', -500), f('nodate', null), f('yr', 1000, 'year', 'year:1000')];

describe('discovery picking', () => {
  it('shows at most 3 sparkles, nearest first, one per region, never found ones', () => {
    const s = pickSparkles(all, {}, 1000);
    expect(s.length).toBe(3);
    expect(new Set(s.map(x => x.regionId)).size).toBe(3);
    expect(s.map(x => x.factId)).not.toContain('far');
    expect(pickSparkles(all, { a: 1 }, 1000).map(x => x.factId)).not.toContain('a');
  });
  it('is stable for the same year (no flicker)', () => {
    expect(pickSparkles(all, {}, 1000)).toEqual(pickSparkles(all, {}, 1000));
  });
  it('prefers a personal fact over the generic year fact at equal distance', () => {
    expect(rankUnfound(all, {}, 1000)[0].id).toBe('a');
  });
  it('the Discover button always has a fact until everything is found, undated last', () => {
    expect(nextFact(all, {}, -480)!.id).toBe('far');
    expect(nextFact(all, Object.fromEntries(all.filter(x => x.year != null).map(x => [x.id, 1])), 0)!.id).toBe('nodate');
    expect(nextFact(all, Object.fromEntries(all.map(x => [x.id, 1])), 0)).toBeNull();
  });
  it('computes progress', () => {
    expect(progress(all, { a: 1, b: 2, zzz: 3 })).toMatchObject({ found: 2, total: all.length });
  });
});
