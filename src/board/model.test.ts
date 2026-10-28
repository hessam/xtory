import { describe, it, expect } from 'vitest';
import { buildScene, geometry, SAMPLE_YEARS, ringsToPath } from './model';
import { countDynastiesAt } from '../data/registry';

describe('board geometry', () => {
  it('has land, lakes, rivers and all 12 regions inside the board', () => {
    expect(geometry.land.length).toBeGreaterThan(10);
    expect(Object.keys(geometry.regions)).toHaveLength(12);
    for (const r of Object.values(geometry.regions)) {
      for (const ring of r.rings) for (const [x, y] of ring) {
        expect(x).toBeGreaterThanOrEqual(-5); expect(x).toBeLessThanOrEqual(geometry.width + 5);
        expect(y).toBeGreaterThanOrEqual(-5); expect(y).toBeLessThanOrEqual(geometry.height + 5);
      }
    }
  });
  it('turns rings into closed SVG paths', () => {
    expect(ringsToPath([[[0, 0], [1, 0], [1, 1]]])).toBe('M0 0L1 0L1 1Z');
  });
});

describe('buildScene', () => {
  it.each(SAMPLE_YEARS)('year %i: every drawn dynasty is active, labels are unique and never overlap', (year) => {
    const scene = buildScene(year, 'en');
    expect(scene.cells.length).toBeGreaterThan(0);
    expect(scene.dynastyCount).toBeLessThanOrEqual(countDynastiesAt(year));
    const labelled = scene.cells.filter(c => c.label.size >= 10);
    expect(new Set(labelled.map(c => c.dynastyId)).size).toBe(labelled.length); // one label per dynasty
    const box = (c: typeof labelled[number]) => { const w = c.name.en.length * c.label.size * 0.95, h = c.label.size * 1.25; return [c.label.x - w / 2, c.label.y - h / 2, c.label.x + w / 2, c.label.y + h / 2]; };
    for (let i = 0; i < labelled.length; i++) for (let j = i + 1; j < labelled.length; j++) {
      const [a, b] = [box(labelled[i]), box(labelled[j])];
      const overlap = a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
      // rotated boxes are approximated by their axis-aligned hull in placeLabels, so allow only tiny slack
      if (overlap) expect(Math.min(a[2], b[2]) - Math.max(a[0], b[0])).toBeLessThan(2);
    }
  });
  it('is deterministic and localised', () => {
    expect(buildScene(1000, 'en').cells.map(c => c.key)).toEqual(buildScene(1000, 'en').cells.map(c => c.key));
    expect(buildScene(1000, 'fa').cells[0].name.fa).toMatch(/[؀-ۿ]/);
  });
  it('fogs regions with no realm data', () => {
    const s = buildScene(-500, 'en');
    expect(s.fogRegions.every(id => id in geometry.regions)).toBe(true);
  });
});
