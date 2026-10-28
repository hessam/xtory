/** Browser client for the fact engine (Slice 7 builds the UI on top). Same anonymous device id as the AI proxy. */
import { AiServerError, getDeviceId } from './aiTransport';
import type { Bi, Confidence } from '../facts/model';

export interface PublicFact {
  id: string; kind: 'computed' | 'ai' | 'curated'; entityName: Bi; year: number | null;
  hook: Bi; claim: Bi; context?: Partial<Bi>; sources: string[]; confidence: Confidence;
  /** "ai_checked" → show "AI · checked, not yet reviewed"; "none" → verified */
  badge: 'none' | 'ai_checked';
}
export type DigKind = 'ruler' | 'dynasty' | 'event' | 'figure' | 'region' | 'artifact';

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try { res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-xtory-device': getDeviceId() }, body: JSON.stringify(body) }); }
  catch { throw new AiServerError('network', 0); }
  let j: any = null; try { j = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !j?.ok) throw new AiServerError(j?.error ?? 'http_' + res.status, res.status, j?.retryAfterSec, j?.scope);
  return j as T;
}

/** Facts about one thing that are allowed to be shown, plus how many are still waiting for review. */
export const digDeeper = (kind: DigKind, name: string, year?: number) =>
  post<{ facts: PublicFact[]; pending: number }>('/api/facts/dig', { kind, name, ...(year !== undefined ? { year } : {}) });

export const reportFact = (factId: string, reason: 'wrong' | 'misleading' | 'offensive' | 'other') =>
  post<{ counted: boolean }>('/api/facts/report', { factId, reason });
