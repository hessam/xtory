import { describe, it, expect } from 'vitest';
import { chapters, challengesFor, hashFor, parseHash, regionsHeld } from './data';
import { historianCards } from '../data/historianCards';
import { getDynasty } from '../data/registry';
import { geometry } from '../board/model';
import { project } from '../board/projection';
import { isUnlocked, starsFor } from './progress';
import { _resetStage, getStage, setScene, tapRegion } from './stage';

const inRing = ([x, y]: [number, number], ring: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const regionOf = (lat: number, lng: number) => {
  const p = project(lat, lng) as [number, number];
  return Object.entries(geometry.regions).find(([, r]) => r.rings.some(ring => inRing(p, ring as [number, number][])))?.[0] ?? null;
};

describe('journey content', () => {
  it('every historian era has a chapter, in history order, with 5–7 beats', () => {
    expect(chapters.map(c => c.eraId)).toEqual(historianCards.map(c => c.eraId));
    for (const c of chapters) { expect(c.beats.length, c.eraId).toBeGreaterThanOrEqual(5); expect(c.beats.length, c.eraId).toBeLessThanOrEqual(7); }
  });
  it('beats fall within the chapter years, in order, bilingual', () => {
    for (const c of chapters) c.beats.forEach((b, i) => {
      expect(b.year, `${c.eraId} ${i}`).toBeGreaterThanOrEqual(c.yearRange.start);
      expect(b.year, `${c.eraId} ${i}`).toBeLessThanOrEqual(c.yearRange.end);
      if (i) expect(b.year).toBeGreaterThanOrEqual(c.beats[i - 1].year);
      expect(b.text.en.length).toBeGreaterThan(20); expect(b.text.fa.length).toBeGreaterThan(10);
    });
  });
  it('every beat does something on the map, and every spotlit realm really holds land on the board that year', () => {
    for (const c of chapters) c.beats.forEach((b, i) => {
      expect(!!(b.lens || b.pins?.length || b.focus?.length || b.ask), `${c.eraId} beat ${i + 1} has no map action`).toBe(true);
      if (b.lens) { expect(getDynasty(b.lens), b.lens).toBeTruthy(); expect(regionsHeld(b.lens, b.year).length, `${c.eraId} ${b.lens} @ ${b.year}`).toBeGreaterThan(0); }
      for (const r of [...(b.focus ?? []), ...(b.ask?.regions ?? [])]) expect(geometry.regions[r], r).toBeTruthy();
    });
  });
  it('a "tap the region" question is answered by the region its pin actually sits in', () => {
    for (const c of chapters) for (const b of c.beats) if (b.ask && b.pins?.length) {
      const where = regionOf(b.pins[0].lat, b.pins[0].lng);
      expect(b.ask.regions, `${c.eraId} ${b.pins[0].label.en} is in ${where}`).toContain(where);
    }
  });
  it('each chapter yields three map challenges whose answers come from the realm data', () => {
    for (const c of chapters) {
      const ch = challengesFor(c);
      expect(ch.length, c.eraId).toBe(3);
      for (const q of ch) { expect(q.regions.length).toBeGreaterThan(0); expect(q.regions.length).toBeLessThan(Object.keys(geometry.regions).length); expect(q.name.fa).toBeTruthy(); }
    }
  });
});

describe('deep links, stars, stage', () => {
  it('deep links resolve to the exact beat or the challenge, and reject bad ones', () => {
    const c = chapters[0];
    expect(parseHash(`#/journey/${c.eraId}/2`)).toEqual({ chapter: c, step: { kind: 'beat', index: 1 } });
    expect(parseHash(`#/journey/${c.eraId}/challenge`)?.step).toEqual({ kind: 'challenge' });
    expect(parseHash(`#/journey/${c.eraId}/99`)).toBeNull();
    expect(parseHash(`#/journey/nope/1`)).toBeNull();
    expect(hashFor(c.eraId, { kind: 'beat', index: 2 })).toBe(`#/journey/${c.eraId}/3`);
  });
  it('chapters unlock in order; stars from first-try answers', () => {
    expect(isUnlocked(0, {})).toBe(true); expect(isUnlocked(1, {})).toBe(false);
    expect(isUnlocked(1, { [chapters[0].eraId]: 1 })).toBe(true);
    expect([starsFor(0), starsFor(1), starsFor(2), starsFor(3)]).toEqual([1, 1, 2, 3]);
  });
  it('the map only hands taps to the journey while it is asking', () => {
    _resetStage();
    expect(tapRegion('fars')).toBe(false);
    setScene({ year: 0, lens: null, pins: [], focus: [], expect: ['fars'] });
    expect(tapRegion('jibal')).toBe(true); expect(getStage().feedback).toMatchObject({ regionId: 'jibal', ok: false });
    expect(tapRegion('fars')).toBe(true); expect(getStage().feedback?.ok).toBe(true);
    setScene({ year: 0, lens: null, pins: [], focus: [], expect: null });
    expect(tapRegion('fars')).toBe(false);
  });
});
