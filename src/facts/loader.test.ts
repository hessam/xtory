import { describe, it, expect } from 'vitest';
import { staticFacts, factById, factsForYear } from '../data/facts';
import { mergeVerified, forRepo } from './exportMerge';
import { validateFactRecord } from './validate';
import { factHash, isVisible, type Fact } from './model';

const sample = (over: Partial<Fact> = {}): Fact => {
  const claim = { en: 'The vizier owned 400 camels.', fa: 'وزیر ۴۰۰ شتر داشت.' };
  return { id: 'a_abcdef123456', kind: 'ai', entityType: 'ruler', entityKey: 'ruler:x', entityName: { en: 'X', fa: 'ایکس' }, year: 1000, hook: { en: 'h', fa: 'ه' }, claim, sources: ['Tabari, Tarikh'], confidence: 'high', status: 'verified', hash: factHash('ruler:x', claim.en), sensitive: false, found: 5, reports: 1, firstDiscoverer: 'abc', history: [], createdAt: 1, updatedAt: 1, ...over } as Fact;
};

describe('static facts (no backend)', () => {
  it('ships only visible facts: verified computed ones, never unconfirmed lives', () => {
    const all = staticFacts();
    expect(all.length).toBeGreaterThanOrEqual(150);
    expect(all.every(isVisible)).toBe(true);
    expect(all.some(f => f.entityKey === 'ruler:yazdgerd_iii')).toBe(false); // held back until its dates are confirmed
    expect(factById(all[0].id)).toEqual(all[0]);
    expect(factsForYear(1000, 50).every(f => Math.abs(f.year! - 1000) <= 50)).toBe(true);
  });
});

describe('verified-fact files', () => {
  it('validates records', () => {
    expect(validateFactRecord(sample())).toEqual([]);
    expect(validateFactRecord(sample({ sources: [] }))).toContain('at least one real source');
    expect(validateFactRecord(sample({ status: 'ai_checked' })).join()).toContain('status must be verified');
    expect(validateFactRecord(sample({ claim: { en: 'Edited text.', fa: 'ویرایش' } })).join()).toContain('hash must match');
    expect(validateFactRecord(sample({ claim: { en: 'The vizier owned 400 camels.', fa: 'no persian' }, hash: sample().hash })).join()).toContain('Persian');
  });
  it('merge: adds, updates, and removes facts that were withdrawn; sorted and stable', () => {
    const a = sample({ id: 'a_aaaaaaaaaaaa' }), b = sample({ id: 'a_bbbbbbbbbbbb' }), c = sample({ id: 'a_cccccccccccc' });
    const m = mergeVerified([a, b], [{ ...b, hook: { en: 'new', fa: 'نو' } }, c, { ...sample({ id: 'a_dddddddddddd' }), status: 'rejected' }]);
    expect(m.added).toEqual(['a_cccccccccccc']); expect(m.updated).toEqual(['a_bbbbbbbbbbbb']); expect(m.removed).toEqual(['a_aaaaaaaaaaaa']);
    expect(m.facts.map(f => f.id)).toEqual(['a_bbbbbbbbbbbb', 'a_cccccccccccc']);
  });
  it('repo copies carry no internal counters or discoverer ids', () => {
    const r = forRepo(sample());
    expect(r.firstDiscoverer).toBeUndefined(); expect(r.found).toBe(0); expect(r.reports).toBe(0);
  });
  it('the committed ai.json is valid', async () => {
    const fs = await import('node:fs');
    const j = JSON.parse(fs.readFileSync('data/facts/verified/ai.json', 'utf8'));
    for (const f of j.facts as Fact[]) expect(validateFactRecord(f), f.id).toEqual([]);
  });
});
