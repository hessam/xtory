/**
 * POST /api/ai/ask — typed-task AI endpoint. Pure Web `Request → Response`, all I/O injected (testable offline).
 *
 * Order of checks (cheapest and safest first):
 *   method → kill switch/config → origin → body size/shape → task + params (strict) → shared cache →
 *   per-device/IP limits → global token budget → model call (+1 repair retry) → validate → post-guards → cache → usage.
 */
import { TASKS, isTaskId, ParamError, type Lang } from '../../src/ai/tasks.js';
import type { AiConfig } from './config.js';
import { loadConfig } from './config.js';
import { identify, utcDay } from './identity.js';
import { checkBudget, checkHitLimit, checkPaidLimits, type LimitDenied } from './limits.js';
import { UpstreamError } from './openrouter.js';
import { runStructured, InvalidOutputError } from './run.js';
import { recordUsage, readUsage } from './usage.js';
import type { Store } from './store.js';
import { MemoryStore, UpstashStore } from './store.js';
import { createHash, timingSafeEqual } from 'node:crypto';

export interface Deps {
  config: AiConfig;
  store: Store;
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: (line: Record<string, unknown>) => void;
}

const CACHE_TTL = 30 * 86400;
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => json(status, { ok: false, error, ...extra }, headers);

const inflight = new Map<string, Promise<{ data: unknown; model: string; tokensIn: number; tokensOut: number }>>();

function originAllowed(req: Request, cfg: AiConfig): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin fetches from some browsers omit it; non-browser callers are bounded by the limits anyway
  let host: string;
  try { host = new URL(origin).host; } catch { return false; }
  const own = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  if (host === own) return true;
  if (cfg.allowedOrigins.some(o => { try { return new URL(o).host === host; } catch { return o === host; } })) return true;
  return !cfg.isProduction && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

function denied(d: LimitDenied) {
  const budget = d.scope === 'daily_budget';
  return fail(budget ? 503 : 429, budget ? 'budget_exhausted' : 'rate_limited', { scope: d.scope, retryAfterSec: d.retryAfterSec }, { 'Retry-After': String(d.retryAfterSec) });
}

export async function handleAsk(req: Request, deps: Deps): Promise<Response> {
  const { config: cfg, store } = deps;
  const now = (deps.now ?? Date.now)();
  const log = deps.log ?? (line => console.log(JSON.stringify(line)));
  const t0 = performance.now();

  if (req.method !== 'POST') return fail(405, 'method_not_allowed', {}, { Allow: 'POST' });
  if (!cfg.enabled) return fail(503, 'ai_disabled');
  if (!cfg.apiKey || !cfg.hashSalt) return fail(503, 'ai_misconfigured');
  // Rate limits are meaningless on per-instance memory: in production refuse to run without a shared store.
  if (cfg.isProduction && !store.durable) return fail(503, 'store_unavailable');
  if (!originAllowed(req, cfg)) return fail(403, 'forbidden_origin');

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > cfg.maxBodyBytes) return fail(413, 'body_too_large');
  let body: any;
  try { body = JSON.parse(raw); } catch { return fail(400, 'invalid_request', { detail: 'body is not JSON' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'invalid_request');
  for (const k of Object.keys(body)) if (!['task', 'params', 'lang'].includes(k)) return fail(400, 'invalid_request', { detail: `unknown field "${k}"` });
  if (!isTaskId(body.task)) return fail(400, 'unknown_task');
  const lang: Lang = body.lang === 'fa' ? 'fa' : 'en';
  const def = TASKS[body.task];
  let params: any;
  try { params = def.parse(body.params ?? {}); } catch (e) {
    if (e instanceof ParamError) return fail(400, 'invalid_params', { detail: e.message });
    throw e;
  }

  const id = identify(req.headers, cfg.hashSalt, now);
  const day = utcDay(now), hour = new Date(now).getUTCHours();
  const key = def.cacheKey(params, lang);
  const cacheId = key ? `ai:c:${createHash('sha256').update(key).digest('hex').slice(0, 40)}` : null;
  const record = (cache: 'hit' | 'miss', tokensIn: number, tokensOut: number, ok: boolean, status: string) => {
    log({ evt: 'ai_request', task: body.task, cache, status, tokensIn, tokensOut, ms: Math.round(performance.now() - t0), dev: id.deviceHash.slice(0, 8), ip: id.ipHash.slice(0, 8) });
    return recordUsage(store, { day, hour, task: body.task, cache, tokensIn, tokensOut, ok, deviceHash: id.deviceHash }).catch(() => { /* accounting must never break a response */ });
  };

  try {
    // 1) shared cache: the first user pays, everyone after gets it for free
    if (cacheId) {
      const hit = await store.get(cacheId);
      if (hit) {
        const lim = await checkHitLimit(store, id, cfg.limits, now);
        if (!lim.ok) return denied(lim as LimitDenied);
        await record('hit', 0, 0, true, 'ok');
        return json(200, { ok: true, data: JSON.parse(hit), meta: { cache: 'hit', task: body.task } });
      }
    }

    // 2) paid path: limits, then the global breaker
    const paid = await checkPaidLimits(store, id, cfg.limits, now);
    if (!paid.ok) return denied(paid as LimitDenied);
    const budget = await checkBudget(store, cfg.limits, now);
    if (!budget.ok) return denied(budget as LimitDenied);

    // 3) model call, de-duplicated per instance so a burst of identical misses pays once
    const run = async () => {
      const built = def.build(params, lang);
      const r = await runStructured(cfg, built, { model: cfg.models[body.task as keyof typeof cfg.models], maxTokens: def.maxTokens, fetchImpl: deps.fetchImpl });
      return { data: def.post ? def.post(r.data, params) : r.data, model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    };
    let promise = cacheId ? inflight.get(cacheId) : undefined;
    const leader = !promise;
    if (!promise) { promise = run(); if (cacheId) { inflight.set(cacheId, promise); promise.finally(() => inflight.delete(cacheId)).catch(() => {}); } }
    const out = await promise;
    if (cacheId && leader) await store.set(cacheId, JSON.stringify(out.data), CACHE_TTL);
    await record('miss', leader ? out.tokensIn : 0, leader ? out.tokensOut : 0, true, 'ok');
    return json(200, { ok: true, data: out.data, meta: { cache: 'miss', task: body.task, model: out.model } });
  } catch (e: any) {
    if (e instanceof UpstreamError) {
      await record('miss', 0, 0, false, `upstream_${e.kind}`);
      // 429/402 from the provider is OUR capacity problem, not the user's: tell the client to back off / fall back to BYOK.
      return e.kind === 'rate_limited' || e.kind === 'payment' ? fail(503, 'ai_busy', {}, { 'Retry-After': '30' }) : fail(502, 'upstream_error', { kind: e.kind });
    }
    if (e instanceof InvalidOutputError) {
      await record('miss', e.tokensIn ?? 0, e.tokensOut ?? 0, false, 'invalid_output');
      return fail(422, 'invalid_model_output');
    }
    log({ evt: 'ai_internal_error', message: String(e?.message ?? e).slice(0, 200) });
    return fail(500, 'internal_error');
  }
}

/** GET /api/ai/status — lets the UI know whether to enable AI buttons without a user key. No secrets, no counters. */
export async function handleStatus(deps: Deps): Promise<Response> {
  const c = deps.config;
  const ready = c.enabled && !!c.apiKey && !!c.hashSalt && (!c.isProduction || deps.store.durable);
  return json(200, { ok: true, enabled: ready }, { 'Cache-Control': 'public, max-age=60' });
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** GET /api/ai/usage?day=YYYY-MM-DD — owner-only aggregates used to choose real limits. */
export async function handleUsage(req: Request, deps: Deps): Promise<Response> {
  const cfg = deps.config;
  if (!cfg.adminToken) return fail(404, 'not_found');
  const auth = req.headers.get('authorization') || '';
  if (!safeEq(auth, `Bearer ${cfg.adminToken}`)) return fail(401, 'unauthorized');
  const day = new URL(req.url).searchParams.get('day') || utcDay((deps.now ?? Date.now)());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(400, 'invalid_day');
  return json(200, { ok: true, usage: await readUsage(deps.store, day), limits: cfg.limits, models: cfg.models });
}

let singleton: Deps | undefined;

/**
 * Production wiring: env → config, Upstash if configured, else memory (dev only; the handler refuses to serve
 * in production without a durable store). Built once per function instance so the memory store actually persists
 * across requests and the shared cache / limits behave the same in dev as in production.
 */
export function depsFromEnv(env: Record<string, string | undefined> = process.env): Deps {
  if (!singleton) {
    const config = loadConfig(env);
    singleton = { config, store: config.upstash ? new UpstashStore(config.upstash.url, config.upstash.token) : new MemoryStore() };
  }
  return singleton;
}
