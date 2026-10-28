import type { Store } from './store.js';
import type { Limits } from './config.js';
import type { Identity } from './identity.js';
import { utcDay } from './identity.js';

export interface LimitResult { ok: true }
export interface LimitDenied { ok: false; scope: 'device_minute' | 'device_day' | 'ip_minute' | 'ip_hit_minute' | 'daily_budget'; retryAfterSec: number }

const secondsToNextMinute = (now: number) => 60 - Math.floor((now / 1000) % 60);
const secondsToNextDay = (now: number) => 86400 - Math.floor((now / 1000) % 86400);

/** Counts one *paid* request (a cache miss). Fixed windows: simple, cheap, good enough for abuse control. */
export async function checkPaidLimits(store: Store, id: Identity, limits: Limits, now: number): Promise<LimitResult | LimitDenied> {
  const minute = Math.floor(now / 60000), day = utcDay(now);
  const [ipMin, devMin, devDay] = await Promise.all([
    store.incr(`rl:ipm:${id.ipHash}:${minute}`, 120),
    store.incr(`rl:devm:${id.deviceHash}:${minute}`, 120),
    store.incr(`rl:devd:${id.deviceHash}:${day}`, 90000),
  ]);
  if (devMin > limits.deviceMin) return { ok: false, scope: 'device_minute', retryAfterSec: secondsToNextMinute(now) };
  if (ipMin > limits.ipMin) return { ok: false, scope: 'ip_minute', retryAfterSec: secondsToNextMinute(now) };
  if (devDay > limits.deviceDay) return { ok: false, scope: 'device_day', retryAfterSec: secondsToNextDay(now) };
  return { ok: true };
}

/** Cache hits cost nothing, so only a loose per-IP ceiling (anti-scraping). */
export async function checkHitLimit(store: Store, id: Identity, limits: Limits, now: number): Promise<LimitResult | LimitDenied> {
  const minute = Math.floor(now / 60000);
  const n = await store.incr(`rl:iph:${id.ipHash}:${minute}`, 120);
  return n > limits.ipHitMin ? { ok: false, scope: 'ip_hit_minute', retryAfterSec: secondsToNextMinute(now) } : { ok: true };
}

/** Global circuit breaker on total tokens per UTC day. */
export async function checkBudget(store: Store, limits: Limits, now: number): Promise<LimitResult | LimitDenied> {
  const used = Number((await store.get(`tokens:${utcDay(now)}`)) ?? 0);
  return used >= limits.dailyTokenCap ? { ok: false, scope: 'daily_budget', retryAfterSec: secondsToNextDay(now) } : { ok: true };
}
