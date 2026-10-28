/**
 * Tiny shared store for the "reach lens": which dynasty is currently spotlighted.
 * Shared by the map chips, the counter list and the legend without touching component props.
 */
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();

export const getLens = () => current;

export function setLens(dynastyId: string | null) {
  if (current === dynastyId) return;
  current = dynastyId;
  listeners.forEach(l => l());
}

export const toggleLens = (dynastyId: string) => setLens(current === dynastyId ? null : dynastyId);

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function useLens(): string | null {
  return useSyncExternalStore(subscribe, getLens, () => null);
}
