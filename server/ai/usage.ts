/**
 * Usage accounting for the "measure first" phase: before choosing per-user / per-minute limits we need to see real
 * numbers. Everything is a plain counter under `u:<day>:…` (90-day TTL), readable via GET /api/ai/usage.
 * Unique users are never stored: instead, each device's daily token total is tracked and a histogram bucket is
 * bumped exactly once when that total crosses a threshold ("how many devices used more than 25k tokens today").
 */
import type { Store } from './store.js';
import { TASK_IDS } from '../../src/ai/tasks.js';

export const TOKEN_THRESHOLDS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000] as const;
const TTL = 90 * 86400;

export interface UsageEvent {
  day: string; hour: number; task: string; cache: 'hit' | 'miss';
  tokensIn: number; tokensOut: number; ok: boolean; deviceHash?: string;
}

export async function recordUsage(store: Store, e: UsageEvent): Promise<void> {
  const k = (s: string) => `u:${e.day}:${s}`;
  const ops: Promise<unknown>[] = [
    store.incr(k(`${e.task}:req`), TTL),
    store.incr(k(`h:${String(e.hour).padStart(2, '0')}:req`), TTL),
  ];
  if (e.cache === 'hit') ops.push(store.incr(k(`${e.task}:hit`), TTL));
  if (!e.ok) ops.push(store.incr(k(`${e.task}:err`), TTL));
  const total = e.tokensIn + e.tokensOut;
  if (total > 0) {
    ops.push(store.incrBy(k(`${e.task}:in`), e.tokensIn, TTL), store.incrBy(k(`${e.task}:out`), e.tokensOut, TTL),
      store.incrBy(`tokens:${e.day}`, total, TTL), store.incrBy(k(`h:${String(e.hour).padStart(2, '0')}:tok`), total, TTL));
    if (e.deviceHash) {
      const after = await store.incrBy(`u:${e.day}:dev:${e.deviceHash}`, total, TTL);
      const before = after - total;
      for (const t of TOKEN_THRESHOLDS) if (before < t && after >= t) ops.push(store.incr(k(`hist:${t}`), TTL));
    }
  }
  await Promise.all(ops);
}

export interface UsageReport {
  day: string;
  totalTokens: number;
  tasks: Record<string, { requests: number; cacheHits: number; hitRate: number; errors: number; tokensIn: number; tokensOut: number; avgTokensPerMiss: number }>;
  devicesOverTokens: Record<string, number>;
  hours: { hour: number; requests: number; tokens: number }[];
}

export async function readUsage(store: Store, day: string): Promise<UsageReport> {
  const n = async (key: string) => Number((await store.get(key)) ?? 0);
  const tasks: UsageReport['tasks'] = {};
  for (const t of [...TASK_IDS, 'fact_check']) {
    const [requests, hits, errors, tin, tout] = await Promise.all([n(`u:${day}:${t}:req`), n(`u:${day}:${t}:hit`), n(`u:${day}:${t}:err`), n(`u:${day}:${t}:in`), n(`u:${day}:${t}:out`)]);
    if (!requests) continue;
    const misses = Math.max(1, requests - hits);
    tasks[t] = { requests, cacheHits: hits, hitRate: +(hits / requests).toFixed(3), errors, tokensIn: tin, tokensOut: tout, avgTokensPerMiss: Math.round((tin + tout) / misses) };
  }
  const devicesOverTokens: Record<string, number> = {};
  for (const th of TOKEN_THRESHOLDS) devicesOverTokens[String(th)] = await n(`u:${day}:hist:${th}`);
  const hours = await Promise.all(Array.from({ length: 24 }, async (_, h) => {
    const hh = String(h).padStart(2, '0');
    return { hour: h, requests: await n(`u:${day}:h:${hh}:req`), tokens: await n(`u:${day}:h:${hh}:tok`) };
  }));
  return { day, totalTokens: await n(`tokens:${day}`), tasks, devicesOverTokens, hours: hours.filter(h => h.requests > 0) };
}
