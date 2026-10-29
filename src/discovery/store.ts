/**
 * Discovery state (ff_discovery): the facts this device has found (localStorage, works offline), the sparkles
 * currently hidden on the map, and the fact card that is open. A tiny external store so the map renderer and the
 * HUD stay decoupled (the map never needs new props — same pattern as lensStore).
 */
import { useSyncExternalStore } from 'react';
import type { Fact } from '../facts/model';

const KEY = 'xtory_found';
export interface Sparkle { factId: string; regionId: string }

interface State { found: Record<string, number>; sparkles: Sparkle[]; openId: string | null }
const listeners = new Set<() => void>();

function load(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}
let state: State = { found: load(), sparkles: [], openId: null };
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };

export const getState = () => state;
export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export const useDiscovery = () => useSyncExternalStore(subscribe, getState, getState);

export const isFound = (id: string) => id in state.found;
export function markFound(id: string) {
  if (isFound(id)) return;
  const found = { ...state.found, [id]: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(found)); } catch { /* private mode: still counts for this session */ }
  set({ found });
}
export const openFact = (id: string | null) => { if (id) markFound(id); set({ openId: id }); };
export function setSparkles(next: Sparkle[]) {
  const same = next.length === state.sparkles.length && next.every((s, i) => s.factId === state.sparkles[i].factId && s.regionId === state.sparkles[i].regionId);
  if (!same) set({ sparkles: next });
}
/** test helper */
export function _reset(found: Record<string, number> = {}) { state = { found, sparkles: [], openId: null }; listeners.forEach(l => l()); }

export const progress = (all: Pick<Fact, 'id'>[], found: Record<string, number>) => {
  const n = all.filter(f => f.id in found).length;
  return { found: n, total: all.length, ratio: all.length ? n / all.length : 0 };
};
