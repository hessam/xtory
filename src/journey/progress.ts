/** Stars per chapter, kept on this device (localStorage). Chapter n unlocks when chapter n-1 has at least one star. */
import { useSyncExternalStore } from 'react';
import { chapters } from './data';

const KEY = 'xtory_journey';
export type Stars = Record<string, number>;
const listeners = new Set<() => void>();

function load(): Stars {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}
let stars: Stars = load();
export const getStars = () => stars;
export const useStars = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, getStars, getStars);

/** keeps the best result per chapter */
export function recordStars(eraId: string, n: number) {
  if ((stars[eraId] ?? 0) >= n) return;
  stars = { ...stars, [eraId]: n };
  try { localStorage.setItem(KEY, JSON.stringify(stars)); } catch { /* private mode: lasts for this session */ }
  listeners.forEach(l => l());
}

export const isUnlocked = (index: number, s: Stars = stars) => index === 0 || (s[chapters[index - 1]?.eraId] ?? 0) > 0;
/** 1–3 stars from correct answers out of three: 3 → three stars, 2 → two, otherwise one (finishing the chapter always counts) */
export const starsFor = (correct: number) => (correct >= 3 ? 3 : correct === 2 ? 2 : 1);
