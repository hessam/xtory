import { describe, it, expect, beforeEach } from 'vitest';
import { describeReach, counterLabel } from './reachText';
import { getLens, setLens, toggleLens } from './lensStore';
import { getRealmsByRegion, rankRealms, getRealmsAt, countDynastiesAt } from '../data/registry';

describe('describeReach', () => {
  it('says how many of the 12 regions a dynasty held, and who ruled alongside', () => {
    const t = describeReach('ghaznavid', 1020, 'en');
    expect(t).toMatch(/Ghaznavid Empire held \d+ of 12 regions in 1020 AD/);
    expect(t).toContain('alongside');
  });
  it('speaks Persian with Persian digits', () => {
    const t = describeReach('ghaznavid', 1020, 'fa');
    expect(t).toContain('امپراتوری غزنوی');
    expect(t).toMatch(/[۰-۹]/);
    expect(t).not.toMatch(/[0-9]/);
  });
  it('handles a dynasty that was not active', () => {
    expect(describeReach('ghaznavid', -500, 'en')).toBe('Ghaznavid Empire was not active in 500 BC.');
  });
});

describe('counterLabel', () => {
  it('localises numbers', () => {
    expect(counterLabel(14, 1000, 'en')).toEqual({ big: '14', small: 'dynasties ruling · 1000 AD' });
    expect(counterLabel(14, 1000, 'fa').big).toBe('۱۴');
    expect(counterLabel(1, 1000, 'en').small).toMatch(/^dynasty ruling/);
  });
});

describe('lensStore', () => {
  beforeEach(() => setLens(null));
  it('toggles', () => {
    toggleLens('buyid'); expect(getLens()).toBe('buyid');
    toggleLens('buyid'); expect(getLens()).toBeNull();
    toggleLens('buyid'); toggleLens('ziyarid'); expect(getLens()).toBe('ziyarid');
  });
});

describe('getRealmsByRegion', () => {
  it('is deterministic and has one entry per dynasty, strongest first', () => {
    const a = getRealmsByRegion(1000);
    expect(getRealmsByRegion(1000)).toBe(a); // cached
    for (const [, list] of a) {
      expect(new Set(list.map(r => r.dynastyId)).size).toBe(list.length);
      expect(list).toEqual(rankRealms(list));
    }
  });
  it('shows several realms in at least one region in 1000 AD', () => {
    const max = Math.max(...[...getRealmsByRegion(1000).values()].map(l => l.length));
    expect(max).toBeGreaterThanOrEqual(3);
  });
  it('counter agrees with the realms on the map for sampled years', () => {
    for (const y of [-500, 0, 500, 1000, 1500, 1750]) {
      const onMap = new Set(getRealmsAt(y).map(r => r.dynastyId)).size;
      expect(countDynastiesAt(y)).toBe(onMap);
    }
  });
});
