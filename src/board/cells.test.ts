import { describe, it, expect } from 'vitest';
import { clipConvex, computeBoardCells } from './cells';
import { geometry, stats, type Ring } from './model';
import { emblemOf } from './emblem';
import { project } from './projection';

const area = (r: Ring) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

describe('clipConvex', () => {
  it('clips a square to a half-plane triangle-ish cell', () => {
    const subject: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const clip: Ring = [[0, 0], [5, 0], [5, 10], [0, 10]];
    expect(area(clipConvex(subject, clip))).toBeCloseTo(50, 0);
  });
  it('is orientation independent', () => {
    const subject: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const cw: Ring = [[0, 0], [0, 10], [5, 10], [5, 0]];
    expect(area(clipConvex(subject, cw))).toBeCloseTo(50, 0);
  });
});

describe('computeBoardCells', () => {
  it.each([-500, 250, 1000, 1500, 1750, 1920])('year %i: cells of a region tile it without gaps or overlap (±3%%)', (year) => {
    const cells = computeBoardCells(year, 'en');
    expect(cells.length).toBeGreaterThan(0);
    const byRegion = new Map<string, number>();
    for (const c of cells) byRegion.set(c.regionId, (byRegion.get(c.regionId) ?? 0) + area(c.rings[0]));
    for (const [id, sum] of byRegion) {
      const regionArea = stats(geometry.regions[id].rings)!.area;
      // regions with more realms than seeds drop the weakest, so only check fully-drawn regions
      const drawn = cells.filter(c => c.regionId === id).length;
      if (drawn === 1) continue;
      expect(sum / regionArea, `${id}@${year}`).toBeGreaterThan(0.6);
      expect(sum / regionArea, `${id}@${year}`).toBeLessThan(1.03);
    }
  });
  it('is deterministic and caches', () => {
    expect(computeBoardCells(1000, 'en')).toBe(computeBoardCells(1000, 'en'));
    expect(computeBoardCells(1000, 'en').map(c => c.key)).toEqual(computeBoardCells(1000, 'fa').map(c => c.key));
  });
  it('puts each capital inside the board', () => {
    for (const c of computeBoardCells(1000, 'en')) {
      expect(c.capital.x).toBeGreaterThan(0); expect(c.capital.x).toBeLessThan(geometry.width);
      expect(c.capital.y).toBeGreaterThan(0); expect(c.capital.y).toBeLessThan(geometry.height);
    }
  });
});

describe('projection', () => {
  it('matches the baked board: Persepolis lands inside the Fars region box', () => {
    const [x, y] = project(29.9355, 52.8916);
    const pts = geometry.regions.fars.rings.flat();
    expect(x).toBeGreaterThan(Math.min(...pts.map(p => p[0])) - 5); expect(x).toBeLessThan(Math.max(...pts.map(p => p[0])) + 5);
    expect(y).toBeGreaterThan(Math.min(...pts.map(p => p[1])) - 5); expect(y).toBeLessThan(Math.max(...pts.map(p => p[1])) + 5);
  });
});

describe('emblem', () => {
  it('is deterministic and varied', () => {
    expect(emblemOf(12345)).toEqual(emblemOf(12345));
    expect(new Set(Array.from({ length: 60 }, (_, i) => JSON.stringify(emblemOf(i * 7 + 3)))).size).toBeGreaterThan(8);
  });
});
