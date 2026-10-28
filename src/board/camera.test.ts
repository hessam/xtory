import { describe, it, expect } from 'vitest';
import { clampCam, camAt, camFitBox, fitScale, MIN_K, MAX_K } from './camera';
import { geometry } from './model';

const screenX = (c: { x: number; k: number }, px: number, cw: number, ch: number) => {
  const s = fitScale(cw, ch); const ox = (cw - geometry.width * s) / 2;
  return ox + c.x * s + s * c.k * px;
};
const screenY = (c: { y: number; k: number }, py: number, cw: number, ch: number) => {
  const s = fitScale(cw, ch); const oy = (ch - geometry.height * s) / 2;
  return oy + c.y * s + s * c.k * py;
};

describe('camera', () => {
  const [cw, ch] = [900, 600];
  it('clamps zoom to the allowed range', () => {
    expect(clampCam({ x: 0, y: 0, k: 99 }, cw, ch).k).toBe(MAX_K);
    expect(clampCam({ x: 0, y: 0, k: 0.01 }, cw, ch).k).toBe(MIN_K);
  });
  it('keeps the board covering the viewport when zoomed in', () => {
    for (const c of [{ x: 5000, y: 5000, k: 2 }, { x: -9000, y: -9000, k: 2 }]) {
      const r = clampCam(c, cw, ch);
      expect(screenX(r, 0, cw, ch)).toBeLessThanOrEqual(0.5);
      expect(screenX(r, geometry.width, cw, ch)).toBeGreaterThanOrEqual(cw - 0.5);
      expect(screenY(r, 0, cw, ch)).toBeLessThanOrEqual(0.5);
      expect(screenY(r, geometry.height, cw, ch)).toBeGreaterThanOrEqual(ch - 0.5);
    }
  });
  it('centres the board when it is smaller than the viewport', () => {
    const r = clampCam({ x: 300, y: 300, k: MIN_K }, cw, ch);
    const left = screenX(r, 0, cw, ch), right = screenX(r, geometry.width, cw, ch);
    if (right - left < cw) expect(left + right).toBeCloseTo(cw, 0);
  });
  it('camAt puts the chosen board point at the viewport centre', () => {
    const c = camAt(1500, 800, 2.5, cw, ch);
    expect(screenX(c, 1500, cw, ch)).toBeCloseTo(cw / 2, 0);
    expect(screenY(c, 800, cw, ch)).toBeCloseTo(ch / 2, 0);
  });
  it('camFitBox frames a box inside a portrait phone viewport', () => {
    const [pw, ph] = [390, 680];
    const box: [number, number, number, number] = [900, 170, 1920, 1130];
    const c = camFitBox(box, pw, ph, 0.05);
    for (const [bx, by] of [[box[0], box[1]], [box[2], box[3]]]) {
      expect(screenX(c, bx, pw, ph)).toBeGreaterThanOrEqual(-1);
      expect(screenX(c, bx, pw, ph)).toBeLessThanOrEqual(pw + 1);
      expect(screenY(c, by, pw, ph)).toBeGreaterThanOrEqual(-1);
      expect(screenY(c, by, pw, ph)).toBeLessThanOrEqual(ph + 1);
    }
  });
});
