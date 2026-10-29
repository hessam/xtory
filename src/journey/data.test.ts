import { describe, it, expect } from 'vitest';
import { chapters, hashFor, parseHash } from './data';
import { historianCards } from '../data/historianCards';
import { isUnlocked, starsFor } from './progress';

describe('journey content', () => {
  it('every historian era has a chapter, in history order, with 5–7 beats and 3 quiz questions', () => {
    expect(chapters.map(c => c.eraId)).toEqual(historianCards.map(c => c.eraId));
    for (const c of chapters) {
      expect(c.beats.length, c.eraId).toBeGreaterThanOrEqual(5);
      expect(c.beats.length, c.eraId).toBeLessThanOrEqual(7);
      expect(c.quiz, c.eraId).toHaveLength(3);
    }
  });
  it('beats fall within the chapter\'s years, in order, and every text is bilingual', () => {
    for (const c of chapters) {
      c.beats.forEach((b, i) => {
        expect(b.year, `${c.eraId} beat ${i}`).toBeGreaterThanOrEqual(c.yearRange.start);
        expect(b.year, `${c.eraId} beat ${i}`).toBeLessThanOrEqual(c.yearRange.end);
        if (i) expect(b.year).toBeGreaterThanOrEqual(c.beats[i - 1].year);
        expect(b.text.en.trim().length).toBeGreaterThan(20); expect(b.text.fa.trim().length).toBeGreaterThan(10);
      });
      for (const q of c.quiz) { expect(q.statement.fa && q.why.fa && q.statement.en && q.why.en).toBeTruthy(); expect(typeof q.reality).toBe('boolean'); }
    }
  });
  it('deep links resolve to the exact beat, quiz, or reject bad ones', () => {
    const c = chapters[0];
    expect(parseHash(`#/journey/${c.eraId}/2`)).toEqual({ chapter: c, step: { kind: 'beat', index: 1 } });
    expect(parseHash(`#/journey/${c.eraId}/quiz`)?.step).toEqual({ kind: 'quiz' });
    expect(parseHash(`#/journey/${c.eraId}`)?.step).toEqual({ kind: 'beat', index: 0 });
    expect(parseHash(`#/journey/${c.eraId}/99`)).toBeNull();
    expect(parseHash(`#/journey/nope/1`)).toBeNull();
    expect(parseHash(`#/journey/${c.eraId}/1;drop`)).toBeNull();
    expect(hashFor(c.eraId, { kind: 'beat', index: 2 })).toBe(`#/journey/${c.eraId}/3`);
  });
  it('chapters unlock in order, and stars map from correct answers', () => {
    expect(isUnlocked(0, {})).toBe(true); expect(isUnlocked(1, {})).toBe(false);
    expect(isUnlocked(1, { [chapters[0].eraId]: 1 })).toBe(true);
    expect([starsFor(0), starsFor(1), starsFor(2), starsFor(3)]).toEqual([1, 1, 2, 3]);
  });
});
