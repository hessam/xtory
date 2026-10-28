import { describe, it, expect } from 'vitest';
import { parseYearRange, parseYearRanges, DATA_HORIZON } from './yearRange';

describe('parseYearRange', () => {
  const cases: [string, [number, number]][] = [
    ['750–873', [750, 873]],
    ['550–330 BC', [-550, -330]],
    ['550 BC', [-550, -550]],
    ['c. 390s BC', [-399, -390]],
    ['880s–1045', [880, 1045]],
    ['1335–1370+', [1335, 1370]],
    ['791–11th century', [791, 1099]],
    ['13th century–1335', [1200, 1335]],
    ['15th century', [1400, 1499]],
    ['1520s–1598 (intermittent)', [1520, 1598]],
    ['1501–16th century', [1501, 1599]],
    ['1747–late 18th century', [1747, 1799]],
    ['262–6th Century AD', [262, 599]],
    ['6th–7th Century AD', [500, 699]],
    ['1947–present', [1947, DATA_HORIZON]],
  ];
  it.each(cases)('%s', (raw, [start, end]) => {
    expect(parseYearRange(raw)).toEqual({ start, end });
  });

  it('keeps BC and AD on each side of a mixed range (was inverted before)', () => {
    expect(parseYearRange('c. 140 BC – 224 AD')).toEqual({ start: -140, end: 224 });
    expect(parseYearRange('148 BC – 224 AD')).toEqual({ start: -148, end: 224 });
    expect(parseYearRange('c. 147 BC – c. 76 AD')).toEqual({ start: -147, end: 76 });
    expect(parseYearRange('6th century BC–11th century AD')).toEqual({ start: -600, end: 1099 });
    expect(parseYearRange('c. 1st Century BC – 224 AD')).toEqual({ start: -100, end: 224 });
  });

  it('returns null for text without years', () => {
    expect(parseYearRange('Intermittent')).toBeNull();
    expect(parseYearRange('')).toBeNull();
    expect(parseYearRange(undefined)).toBeNull();
  });
});

describe('parseYearRanges', () => {
  it('splits disjoint spans instead of claiming the gap', () => {
    expect(parseYearRanges('525–404 BC; 343–330 BC')).toEqual([
      { start: -525, end: -404 },
      { start: -343, end: -330 },
    ]);
  });
  it('shares a trailing era across a comma list', () => {
    expect(parseYearRanges('283, 298–363, 624–628 AD')).toEqual([
      { start: 283, end: 283 },
      { start: 298, end: 363 },
      { start: 624, end: 628 },
    ]);
  });
});
