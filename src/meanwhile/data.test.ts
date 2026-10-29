import { describe, it, expect } from 'vitest';
import { BUCKET, CITIES, FIRST_YEAR, IRAN, LAST_YEAR, NEIGHBOURS, bucketOf, periodAt, snapshotAt } from './data';

const ALL = [...NEIGHBOURS, IRAN];
describe('meanwhile dataset', () => {
  it('every 25-year bucket from 700 BC to 1979 has an entry for every civilisation and for Iran', () => {
    let n = 0;
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y += BUCKET) {
      n++;
      for (const c of ALL) expect(periodAt(c, y), `${c.id} @ ${y}`).not.toBeNull();
      expect(snapshotAt(y).neighbours).toHaveLength(NEIGHBOURS.length);
    }
    expect(n).toBeGreaterThan(105);
  });
  it('periods are contiguous, ordered and cover the whole range', () => {
    for (const c of ALL) {
      expect(c.periods[0].from, c.id).toBe(FIRST_YEAR);
      expect(c.periods[c.periods.length - 1].to, c.id).toBeGreaterThan(LAST_YEAR);
      c.periods.forEach((p, i) => { expect(p.to, `${c.id} ${p.from}`).toBeGreaterThan(p.from); if (i) expect(p.from, `${c.id} gap`).toBe(c.periods[i - 1].to); });
    }
  });
  it('every metric has a source, and every text is bilingual and non-empty', () => {
    for (const c of ALL) for (const p of c.periods) {
      expect(p.sources.length, `${c.id} ${p.from}`).toBeGreaterThan(0);
      for (const l of ['en', 'fa'] as const) { expect(p.title[l].trim().length).toBeGreaterThan(2); if (p.line) expect(p.line[l].trim().length).toBeGreaterThan(5); }
      if (p.sizeMkm2 != null) { expect(p.sizeMkm2).toBeGreaterThan(0); expect(p.sizeMkm2).toBeLessThan(40); }
    }
    for (const c of NEIGHBOURS) for (const p of c.periods) expect(p.line, `${c.id} ${p.from} needs a line`).toBeTruthy();
    for (const c of CITIES) { expect(c.sources.length).toBeGreaterThan(0); expect(c.pop).toBeGreaterThan(0); expect(c.name.fa.length).toBeGreaterThan(1); }
    expect(CITIES[0].from).toBeLessThanOrEqual(FIRST_YEAR);
  });
  it('buckets floor towards the past and snapshots clamp outside the range', () => {
    expect(bucketOf(-1)).toBe(-25); expect(bucketOf(651)).toBe(650); expect(bucketOf(-700)).toBe(-700);
    expect(snapshotAt(-2000).bucket).toBe(-700); expect(snapshotAt(2024).bucket).toBe(1975);
  });
  it('Tang China vs Sasanian Iran sanity', () => {
    const s = snapshotAt(630);
    expect(s.iran?.title.en).toMatch(/Sasanian/); expect(s.neighbours.find(n => n.civ.id === 'china')?.period.title.en).toMatch(/Tang/);
    expect(s.maxSize).toBeGreaterThanOrEqual(5.4);
  });
});
