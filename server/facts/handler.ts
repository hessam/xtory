import { timingSafeEqual } from 'node:crypto';
import { ParamError, TASKS, type DigParams } from '../../src/ai/tasks.js';
import { factHash, type Fact, type FactStatus } from '../../src/facts/model.js';
import { UpstreamError } from '../ai/openrouter.js';
import { InvalidOutputError } from '../ai/run.js';
import { identify, utcDay } from '../ai/identity.js';
import { checkBudget, checkHitLimit, checkPaidLimits, type LimitDenied } from '../ai/limits.js';
import { recordUsage } from '../ai/usage.js';
import type { Deps } from '../ai/handler.js';
import type { RichStore } from '../ai/store.js';
import { digDeeper, needsWriter, storedFor } from './pipeline.js';
import { FactStore, STATUSES } from './store.js';

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => json(status, { ok: false, error, ...extra }, headers);

const richStore = (deps: Deps): RichStore => deps.store as RichStore;
const factStoreOf = (deps: Deps) => new FactStore(richStore(deps), deps.now ?? Date.now);

function sameOrigin(req: Request, deps: Deps): boolean {
  const origin = req.headers.get('origin'); if (!origin) return true;
  let host: string; try { host = new URL(origin).host; } catch { return false; }
  const own = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  const c = deps.config;
  return host === own || c.allowedOrigins.some(o => { try { return new URL(o).host === host; } catch { return o === host; } }) || (!c.isProduction && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host));
}
const denied = (d: LimitDenied) => fail(d.scope === 'daily_budget' ? 503 : 429, d.scope === 'daily_budget' ? 'budget_exhausted' : 'rate_limited', { scope: d.scope, retryAfterSec: d.retryAfterSec }, { 'Retry-After': String(d.retryAfterSec) });

/** Shared front door for the two public endpoints. */
async function gate(req: Request, deps: Deps, maxBody = 2048) {
  const c = deps.config;
  if (req.method !== 'POST') return { res: fail(405, 'method_not_allowed', {}, { Allow: 'POST' }) };
  if (!c.enabled) return { res: fail(503, 'ai_disabled') };
  if (!c.apiKey || !c.hashSalt) return { res: fail(503, 'ai_misconfigured') };
  if (c.isProduction && !deps.store.durable) return { res: fail(503, 'store_unavailable') };
  if (!sameOrigin(req, deps)) return { res: fail(403, 'forbidden_origin') };
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > maxBody) return { res: fail(413, 'body_too_large') };
  let body: any; try { body = JSON.parse(raw); } catch { return { res: fail(400, 'invalid_request') }; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { res: fail(400, 'invalid_request') };
  return { body };
}

/** POST /api/facts/dig  { kind, name, year?, context? } → facts that are allowed to be shown, plus how many are still pending review. */
export async function handleDig(req: Request, deps: Deps): Promise<Response> {
  const g = await gate(req, deps); if ('res' in g) return g.res;
  const now = (deps.now ?? Date.now)();
  let input: DigParams;
  try {
    for (const k of Object.keys(g.body)) if (!['kind', 'name', 'year', 'context'].includes(k)) throw new ParamError(`unknown field "${k}"`);
    input = TASKS.dig_deeper.parse(g.body) as DigParams;
  } catch (e) { if (e instanceof ParamError) return fail(400, 'invalid_params', { detail: e.message }); throw e; }

  const id = identify(req.headers, deps.config.hashSalt!, now);
  const facts = factStoreOf(deps), store = richStore(deps);
  try {
    const { entityKey, visible } = await storedFor({ facts }, input);
    const paid = await needsWriter({ kv: store }, entityKey, visible.length);
    // free path (stored facts only) gets the loose anti-scrape limit; the paid path the real limits and the global breaker
    const lim = paid ? await checkPaidLimits(store, id, deps.config.limits, now) : await checkHitLimit(store, id, deps.config.limits, now);
    if (!lim.ok) return denied(lim as LimitDenied);
    if (paid) { const b = await checkBudget(store, deps.config.limits, now); if (!b.ok) return denied(b as LimitDenied); }

    const out = await digDeeper({ cfg: deps.config, facts, kv: store, fetchImpl: deps.fetchImpl, now: () => now, discoverer: id.deviceHash }, input);
    const day = utcDay(now), hour = new Date(now).getUTCHours();
    for (const u of out.usage) await recordUsage(store, { day, hour, task: u.task, cache: 'miss', tokensIn: u.tokensIn, tokensOut: u.tokensOut, ok: u.ok, deviceHash: id.deviceHash }).catch(() => {});
    if (!out.usage.length) await recordUsage(store, { day, hour, task: 'dig_deeper', cache: 'hit', tokensIn: 0, tokensOut: 0, ok: true, deviceHash: id.deviceHash }).catch(() => {});
    return json(200, { ok: true, facts: out.facts, pending: out.pending, meta: { fromStore: out.fromStore, checker: out.checker } });
  } catch (e: any) {
    if (e instanceof UpstreamError) return e.kind === 'rate_limited' || e.kind === 'payment' ? fail(503, 'ai_busy', {}, { 'Retry-After': '30' }) : fail(502, 'upstream_error', { kind: e.kind });
    if (e instanceof InvalidOutputError) return fail(422, 'invalid_model_output');
    (deps.log ?? console.log)({ evt: 'facts_internal_error', message: String(e?.message ?? e).slice(0, 200) });
    return fail(500, 'internal_error');
  }
}

export const REPORT_REASONS = ['wrong', 'misleading', 'offensive', 'other'] as const;
const REPORTS_PER_DEVICE_DAY = 30;

/** POST /api/facts/report  { factId, reason } — one report per device per fact; enough distinct reports pull a visible AI fact back to review. */
export async function handleReport(req: Request, deps: Deps): Promise<Response> {
  const g = await gate(req, deps, 512); if ('res' in g) return g.res;
  const { factId, reason } = g.body;
  if (typeof factId !== 'string' || !/^[ac]_[a-z0-9_]{6,80}$/.test(factId)) return fail(400, 'invalid_params', { detail: 'factId' });
  if (!REPORT_REASONS.includes(reason)) return fail(400, 'invalid_params', { detail: 'reason' });
  for (const k of Object.keys(g.body)) if (!['factId', 'reason'].includes(k)) return fail(400, 'invalid_request');
  const now = (deps.now ?? Date.now)();
  const id = identify(req.headers, deps.config.hashSalt!, now);
  const store = richStore(deps), facts = factStoreOf(deps);
  if ((await store.incr(`rl:rep:${id.deviceHash}:${utcDay(now)}`, 90000)) > REPORTS_PER_DEVICE_DAY) return fail(429, 'rate_limited', { scope: 'device_day' });
  const r = await facts.report(factId, id.deviceHash);
  let pulled = false;
  const f = await facts.get(factId);
  if (f && r.counted && f.kind === 'ai' && r.total >= deps.config.factReportThreshold && (f.status === 'ai_checked' || f.status === 'verified')) {
    pulled = (await facts.transition(factId, 'disputed', `reports:${r.total}`, `reason: ${reason}`)).ok;
  }
  return json(200, { ok: true, counted: r.counted, pulledForReview: pulled });
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Owner-only review API (Bearer AI_ADMIN_TOKEN).
 *   GET  ?action=queue&status=unverified|ai_checked|disputed|rejected|verified&limit=50   (ordered by times found)
 *   GET  ?action=reported                                                                  (ids with report counts)
 *   GET  ?action=export                                                                    (verified AI facts for data/facts/verified/)
 *   POST {action:'review', factId, verdict:'approve'|'reject'|'dispute'|'reopen', notes?, edits?:{hook,claim,context,sources}}
 */
export async function handleAdmin(req: Request, deps: Deps): Promise<Response> {
  const c = deps.config;
  if (!c.adminToken) return fail(404, 'not_found');
  if (!safeEq(req.headers.get('authorization') || '', `Bearer ${c.adminToken}`)) return fail(401, 'unauthorized');
  const facts = factStoreOf(deps), url = new URL(req.url);

  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || 'queue';
    if (action === 'queue') {
      const status = (url.searchParams.get('status') || 'unverified') as FactStatus;
      if (!STATUSES.includes(status)) return fail(400, 'invalid_status');
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const counts = Object.fromEntries(await Promise.all(STATUSES.map(async s => [s, await facts.count(s)])));
      return json(200, { ok: true, status, counts, facts: await facts.queue(status, limit) });
    }
    if (action === 'reported') return json(200, { ok: true, reported: await facts.reported() });
    if (action === 'export') return json(200, { ok: true, exportedAt: (deps.now ?? Date.now)(), facts: await facts.exportVerified() });
    return fail(400, 'unknown_action');
  }
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  let body: any; try { body = JSON.parse(await req.text()); } catch { return fail(400, 'invalid_request'); }
  if (body?.action !== 'review' || typeof body.factId !== 'string') return fail(400, 'invalid_request');
  const fact = await facts.get(body.factId);
  if (!fact) return fail(404, 'not_found');
  const by = 'owner';
  if (body.edits) {
    const e = body.edits, patch: any = {};
    for (const k of ['hook', 'claim', 'context'] as const) if (e[k]) patch[k] = { ...fact[k], ...e[k] };
    if (Array.isArray(e.sources)) patch.sources = e.sources.map((s: unknown) => String(s).slice(0, 300)).filter(Boolean).slice(0, 8);
    await facts.edit(fact.id, patch, f => factHash(f.entityKey, f.claim.en), by);
  }
  const verdict = body.verdict;
  const to: FactStatus | null = verdict === 'approve' ? 'verified' : verdict === 'reject' ? 'rejected' : verdict === 'dispute' ? 'disputed' : verdict === 'reopen' ? 'unverified' : null;
  if (!to) return body.edits ? json(200, { ok: true, fact: await facts.get(fact.id) }) : fail(400, 'invalid_verdict');
  const t = await facts.transition(fact.id, to, by, typeof body.notes === 'string' ? body.notes.slice(0, 500) : undefined);
  if (!t.ok) return fail(409, 'invalid_transition', { reason: (t as { reason: string }).reason });
  if (to === 'verified' || to === 'rejected') await facts.clearReports(fact.id);
  return json(200, { ok: true, fact: (t as { fact: Fact }).fact });
}
