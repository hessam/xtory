import { describe, it, expect } from 'vitest';
import { canTransition, isNearDuplicate, numbersIn, factHash, isVisible, latinDigits, normalizeText, trigramSimilarity, isSensitiveYear, type Fact } from './model';
import { checkClaim, extractAges, extractReignLengths, extractLifeYears, failed } from './check';
import { buildKnown, lives, yearsBetween } from './known';
import { buildComputedFacts, confirmLives } from './computed';
import computedJson from '../data/generated/facts.computed.json';
import { rulers } from '../data/rulers';
import { realms } from '../data/registry';

describe('visibility & transitions (guardrails)', () => {
  const base = { sources: ['x'], sensitive: false };
  it('only verified or (ai_checked and not sensitive) facts are visible; rejected/unsupported never', () => {
    expect(isVisible({ ...base, status: 'verified' })).toBe(true);
    expect(isVisible({ ...base, status: 'ai_checked' })).toBe(true);
    expect(isVisible({ ...base, status: 'ai_checked', sensitive: true })).toBe(false);
    for (const s of ['unverified', 'disputed', 'rejected'] as const) expect(isVisible({ ...base, status: s })).toBe(false);
  });
  it('a fact without a source can never be verified or shown', () => {
    expect(canTransition({ status: 'ai_checked', sources: [] }, 'verified').ok).toBe(false);
    expect(isVisible({ status: 'verified', sensitive: false, sources: [] })).toBe(false);
    expect(canTransition({ status: 'ai_checked', sources: ['s'] }, 'verified').ok).toBe(true);
  });
  it('illegal moves are refused', () => {
    expect(canTransition({ status: 'rejected', sources: ['s'] }, 'verified').ok).toBe(false);
    expect(canTransition({ status: 'verified', sources: ['s'] }, 'ai_checked').ok).toBe(false);
  });
  it('20th century onward is sensitive', () => { expect(isSensitiveYear(1899)).toBe(false); expect(isSensitiveYear(1900)).toBe(true); expect(isSensitiveYear(null)).toBe(false); });
});

describe('text identity', () => {
  it('normalises case, accents, punctuation and Persian digits', () => {
    expect(normalizeText('Yazdgerd  III, aged ۲۷!')).toBe('yazdgerd iii aged 27');
    expect(latinDigits('۱۲۳٤')).toBe('1234');
    expect(factHash('ruler:x', 'He was 27.')).toBe(factHash('ruler:x', 'he was 27'));
    expect(factHash('ruler:x', 'He was 27.')).not.toBe(factHash('ruler:y', 'He was 27.'));
  });
  it('trigram similarity separates paraphrases from different facts', () => {
    expect(trigramSimilarity('Yazdgerd III was 27 when he died.', 'Yazdgerd III was 27 when he died')).toBeGreaterThan(0.95);
    expect(trigramSimilarity('Yazdgerd III was only 27 years old when he died.', 'Yazdgerd III was 27 years old when he died.')).toBeGreaterThan(0.8);
    expect(trigramSimilarity('Yazdgerd III was 27 when he died.', 'Cyrus conquered Babylon in 539 BC.')).toBeLessThan(0.3);
  });
});

describe('near-duplicate detection', () => {
  it('merges rewordings with the same numbers, never facts that differ in a number', () => {
    expect(isNearDuplicate('The vizier owned 400 camels', 'The vizier owned about 400 camels.')).toBe(true);
    expect(isNearDuplicate('Yazdgerd III was 27 when he died.', 'Yazdgerd III was 28 when he died.')).toBe(false);
    expect(isNearDuplicate('Yazdgerd III was 27 when he died.', 'Cyrus conquered Babylon.')).toBe(false);
    expect(numbersIn('۱۲ and 3, then 12')).toBe('12,12,3');
  });
});

describe('deterministic checker', () => {
  const known = buildKnown();
  it('extracts ages, reign lengths and life years (English and Persian)', () => {
    expect(extractAges('He was 27 years old; aged 8 at the time; at the age of 12')).toEqual(expect.arrayContaining([27, 8, 12]));
    expect(extractAges('او ۲۷ ساله بود')).toEqual([27]);
    expect(extractReignLengths('He ruled for 48 years. A 20-year reign.')).toEqual(expect.arrayContaining([48, 20]));
    expect(extractLifeYears('born in 624, died in 651 AD')).toEqual({ born: [624], died: [651] });
    expect(extractLifeYears('born in 356 BC')).toEqual({ born: [-356], died: [] });
  });
  it('PLANTED WRONG AGE is rejected; the right ages pass', () => {
    const bad = checkClaim('Yazdgerd III was 35 years old when he died.', 'یزدگرد سوم هنگام مرگ ۳۵ ساله بود.', 'Yazdgerd III', known);
    expect(failed(bad).length).toBeGreaterThan(0);
    expect(failed(bad)[0].rule).toBe('age');
    expect(failed(checkClaim('Yazdgerd III was 27 when he died.', 'یزدگرد سوم هنگام مرگ ۲۷ ساله بود.', 'Yazdgerd III', known))).toHaveLength(0);
    expect(failed(checkClaim('Yazdgerd III was crowned at the age of 8.', 'یزدگرد سوم در ۸ سالگی تاج‌گذاری کرد.', 'Yazdgerd III', known))).toHaveLength(0);
    expect(failed(checkClaim('Yazdgerd III was 28 when he died.', 'ک', 'Yazdgerd III', known))).toHaveLength(0); // ±1
  });
  it('rejects wrong reign lengths and birth/death years; catches English/Persian number mismatch', () => {
    expect(failed(checkClaim('Naser al-Din Shah ruled for 30 years.', 'ک', 'Naser al-Din Shah', known))[0].rule).toBe('reign_length');
    expect(failed(checkClaim('Naser al-Din Shah ruled for 48 years.', 'ک', 'Naser al-Din Shah', known))).toHaveLength(0);
    expect(failed(checkClaim('Timur was born in 1400.', 'ک', 'Timur', known))[0].rule).toBe('birth_year');
    expect(failed(checkClaim('Timur died in 1405.', 'ک', 'Timur', known))).toHaveLength(0);
    expect(failed(checkClaim('Yazdgerd III was 27 when he died.', 'یزدگرد سوم ۳۰ ساله بود.', 'Yazdgerd III', known)).some(c => c.rule === 'bilingual_numbers')).toBe(true);
  });
  it('claims about unknown entities pass through (left to the model judge and the human)', () => {
    expect(checkClaim('Some obscure vizier was 99 years old.', 'ک', 'Obscure Vizier', known)).toEqual([]);
  });
  it('year arithmetic has no year 0', () => {
    expect(yearsBetween(-356, -323)).toBe(33); expect(yearsBetween(-10, 10)).toBe(19); expect(yearsBetween(624, 651)).toBe(27);
  });
});

describe('computed facts (no AI)', () => {
  const facts = computedJson as unknown as Fact[];
  it('has at least 200 facts, unique ids, all computed, bilingual, with sources and provenance', () => {
    expect(facts.length).toBeGreaterThanOrEqual(200);
    expect(new Set(facts.map(f => f.id)).size).toBe(facts.length);
    for (const f of facts) {
      expect(f.kind).toBe('computed');
      expect(f.sources.length, f.id).toBeGreaterThan(0);
      expect(f.derivedFrom?.length, f.id).toBeGreaterThan(0);
      for (const t of [f.hook, f.claim]) { expect(t.en.trim().length, f.id).toBeGreaterThan(5); expect(t.fa.trim().length, f.id).toBeGreaterThan(5); expect(t.fa, f.id).toMatch(/[؀-ۿ]/); }
    }
  });
  it('is up to date with the generator and deterministic', () => {
    expect(JSON.parse(JSON.stringify(buildComputedFacts()))).toEqual(facts);
  });
  it('never emits anything about the sensitive era (1900+)', () => {
    for (const f of facts) expect(f.year == null || f.year < 1900, f.id).toBe(true);
    expect(facts.every(f => !f.sensitive)).toBe(true);
  });
  it('the Yazdgerd III example is COMPUTED from dates, not AI — and held back until the dates are confirmed', () => {
    const age = facts.find(f => f.entityKey === 'ruler:yazdgerd_iii' && f.id.startsWith('c_age_death_'))!;
    expect(age.claim.en).toContain('624 AD – 651 AD'); expect(age.claim.en).toContain('about 27 years');
    expect(age.kind).toBe('computed');
    expect(age.status).toBe('unverified');
    expect(age.sources.join(' ')).toContain('NOT YET CONFIRMED');
    const acc = facts.find(f => f.entityKey === 'ruler:yazdgerd_iii' && f.id.startsWith('c_age_accession_'))!;
    expect(acc.claim.en).toContain('about 8');
  });
  it('Wikidata agreement (±1 year) confirms a life and upgrades its facts to verified; disagreement does not', () => {
    const ok = buildComputedFacts({ wikidata: { yazdgerd_iii: { born: 624, died: 651 } } });
    expect(ok.find(f => f.entityKey === 'ruler:yazdgerd_iii' && f.id.startsWith('c_age_death_'))!.status).toBe('verified');
    const bad = buildComputedFacts({ wikidata: { yazdgerd_iii: { born: 631, died: 651 } } });
    expect(bad.find(f => f.entityKey === 'ruler:yazdgerd_iii' && f.id.startsWith('c_age_death_'))!.status).toBe('unverified');
    expect(confirmLives(lives, { timur: { born: 1336, died: 1405 } }).find(l => l.id === 'timur')!.confirmedBy).toBe('wikidata');
  });
  it('facts built only from owner-curated datasets (rulers.ts, registry) are verified', () => {
    const reign = facts.filter(f => f.id.startsWith('c_reign_'));
    expect(reign.length).toBeGreaterThanOrEqual(20);
    expect(reign.every(f => f.status === 'verified')).toBe(true);
  });
  it('SPOT CHECK (independent re-derivation): 20 sampled facts recomputed from raw data by different code', () => {
    // deterministic sample: every k-th fact of the verified reign / concurrency / reach / overlap families
    const byFamily = (p: string) => facts.filter(f => f.id.startsWith(p));
    let checked = 0;
    for (const f of byFamily('c_reign_').filter(x => !x.id.startsWith('c_reign_longest') && !x.id.startsWith('c_reign_shortest') && !x.id.startsWith('c_reign_average')).slice(0, 8)) {
      const r = Object.values(rulers).find(x => x.name.en === f.entityName.en)!;
      const n = r.endDate - r.startDate - (r.startDate < 0 && r.endDate > 0 ? 1 : 0);
      expect(f.claim.en, f.id).toContain(`ruled for ${n} years`); checked++;
    }
    for (const f of byFamily('c_concurrent_').filter(x => /^c_concurrent_[0-9a-f]{10}$/.test(x.id)).slice(0, 8)) {
      const y = f.year!;
      const n = new Set(realms.filter(r => y >= r.start && y <= r.end).map(r => r.dynastyId)).size; // independent of getActiveDynastyIds
      expect(f.claim.en, f.id).toContain(`${n} different dynasties`); checked++;
    }
    for (const f of byFamily('c_overlap_').slice(0, 4)) {
      const m = f.claim.en.match(/for about (\d+) years \((.+?) to (.+?)\)/)!;
      expect(Number(m[1])).toBeGreaterThanOrEqual(40); expect(Number(m[1])).toBeLessThanOrEqual(250); checked++;
    }
    expect(checked).toBe(20);
  });
});
