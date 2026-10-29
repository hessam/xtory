/**
 * The journey's hold on the board: what the map should show for the current beat (spotlit realm, pins, framing) and
 * whether it is waiting for the player to tap a region. MapBoard subscribes; nothing is passed through props
 * (same pattern as lensStore / discovery store).
 */
import { useSyncExternalStore } from 'react';
import type { Pin } from './data';

export interface Feedback { regionId: string; ok: boolean; at: number }
export interface Stage {
  active: boolean;
  /** bumps on every new scene so the map re-frames even if the content repeats */
  seq: number;
  year: number | null;
  lens: string | null;
  pins: Pin[];
  focus: string[];
  /** regions that count as a correct tap; null = not asking */
  expect: string[] | null;
  feedback: Feedback | null;
}
const IDLE: Stage = { active: false, seq: 0, year: null, lens: null, pins: [], focus: [], expect: null, feedback: null };
let state: Stage = IDLE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const getStage = () => state;
export const useStage = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, getStage, getStage);

/** keepFeedback: leave the last answer flash on the map (used right after an answer, to show where the truth is) */
export function setScene(s: Pick<Stage, 'year' | 'lens' | 'pins' | 'focus' | 'expect'>, keepFeedback = false) {
  state = { ...s, active: true, seq: state.seq + 1, feedback: keepFeedback ? state.feedback : null };
  emit();
}
export const clearStage = () => { state = { ...IDLE, seq: state.seq + 1 }; emit(); };

/** Called by the map on a region tap. Returns true when the journey consumed the tap (so no detail panel opens). */
export function tapRegion(regionId: string): boolean {
  if (!state.active || !state.expect) return false;
  state = { ...state, feedback: { regionId, ok: state.expect.includes(regionId), at: Date.now() } };
  emit();
  return true;
}
/** test helper */
export const _resetStage = () => { state = IDLE; emit(); };
