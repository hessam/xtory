import { describe, it, expect } from 'vitest';
import { wrapLines } from './card';

const m = (s: string) => s.length * 10;
describe('wrapLines', () => {
  it('wraps greedily inside the width', () => {
    expect(wrapLines(m, 'aaa bbb ccc ddd', 70)).toEqual(['aaa bbb', 'ccc ddd']);
  });
  it('never drops a word longer than the line', () => {
    expect(wrapLines(m, 'supercalifragilistic ok', 50)).toEqual(['supercalifragilistic', 'ok']);
  });
  it('truncates with an ellipsis at maxLines', () => {
    const l = wrapLines(m, 'one two three four five six', 40, 2);
    expect(l).toHaveLength(2); expect(l[1].endsWith('…')).toBe(true);
  });
  it('handles Persian text and empty input', () => {
    expect(wrapLines(m, 'یزدگرد سوم هنگام مرگ', 100).length).toBeGreaterThan(1);
    expect(wrapLines(m, '   ', 100)).toEqual([]);
  });
});
