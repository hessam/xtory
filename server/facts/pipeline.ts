/**
 * "Dig deeper": writer model proposes candidate facts → deterministic checks → second-model judge → dedupe → store.
 * Nothing is shown to users unless `isVisible` says so (verified; or ai_checked and not a sensitive era).
 */
import { TASKS, buildFactCheck, FACT_CHECK_MAX_TOKENS, type DigParams } from '../../src/ai/tasks.js';
import { buildKnown } from '../../src/facts/known.js';
import { checkClaim, failed } from '../../src/facts/check.js';
import {
  entityKeyOf, factHash, isNearDuplicate, isSensitiveYear, isVisible, type Fact, type FactStatus, type ModelVerdict,
} from '../../src/facts/model.js';
import type { AiConfig } from './../ai/config.js';
import { checkerUsable } from '../ai/config.js';
import { runStructured } from '../ai/run.js';
import type { FactStore } from './store.js';

export interface PublicFact {
  id: string; kind: Fact['kind']; entityName: Fact['entityName']; year: number | null;
  hook: Fact['hook']; claim: Fact['claim']; context?: Fact['context']; sources: string[]; confidence: Fact['confidence'];
  /** "ai_checked" → show the "AI · checked, not yet reviewed" badge; "none" → verified */
  badge: 'none' | 'ai_checked';
}
export const toPublic = (f: Fact): PublicFact => ({
  id: f.id, kind: f.kind, entityName: f.entityName, year: f.year, hook: f.hook, claim: f.claim, context: f.context, sources: f.sources, confidence: f.confidence,
  badge: f.status === 'verified' ? 'none' : 'ai_checked',
});

export interface Usage { task: 'dig_deeper' | 'fact_check'; tokensIn: number; tokensOut: number; ok: boolean }
export interface DigResult { facts: PublicFact[]; pending: number; fromStore: number; usage: Usage[]; checker: 'ok' | 'not_configured' | 'same_family' }

const MIN_STORED = 3;
const ATTEMPT_TTL = 24 * 3600;
const KNOWN = buildKnown();

export interface PipelineDeps { cfg: AiConfig; facts: FactStore; kv: { get(k: string): Promise<string | null>; set(k: string, v: string, ttl: number): Promise<void> }; fetchImpl?: typeof fetch; now: () => number; discoverer: string }

/** Is the stored answer enough, or should the writer be asked again (bounded: once per entity per day)? */
export async function storedFor(deps: Pick<PipelineDeps, 'facts'>, input: DigParams) {
  const entityKey = entityKeyOf(input.kind, input.name);
  const visible = (await deps.facts.byEntity(entityKey)).filter(isVisible);
  return { entityKey, visible };
}
export async function needsWriter(deps: Pick<PipelineDeps, 'kv'>, entityKey: string, visibleCount: number) {
  if (visibleCount >= MIN_STORED) return false;
  return (await deps.kv.get(`fattempt:${entityKey}`)) === null;
}

export async function judge(deps: PipelineDeps, f: Pick<Fact, 'claim' | 'sources'> & { entity: string }): Promise<{ verdict: ModelVerdict | null; usage?: Usage }> {
  const usable = checkerUsable(deps.cfg);
  if (!usable.ok) return { verdict: null };
  try {
    const r = await runStructured(deps.cfg, buildFactCheck({ entity: f.entity, claimEn: f.claim.en, claimFa: f.claim.fa, sources: f.sources }), { model: usable.model, maxTokens: FACT_CHECK_MAX_TOKENS, fetchImpl: deps.fetchImpl });
    return { verdict: { verdict: r.data.verdict, persianMatches: !!r.data.persianMatches, reason: String(r.data.reason ?? ''), model: r.model }, usage: { task: 'fact_check', tokensIn: r.tokensIn, tokensOut: r.tokensOut, ok: true } };
  } catch (e: any) {
    // a failed judge never promotes a fact: it stays unverified for a human
    return { verdict: null, usage: { task: 'fact_check', tokensIn: e?.tokensIn ?? 0, tokensOut: e?.tokensOut ?? 0, ok: false } };
  }
}

export async function digDeeper(deps: PipelineDeps, input: DigParams): Promise<DigResult> {
  const { entityKey, visible: stored } = await storedFor(deps, input);
  const usage: Usage[] = [];
  const usable = checkerUsable(deps.cfg);
  const checker: DigResult['checker'] = usable.ok ? 'ok' : (usable as { reason: 'not_configured' | 'same_family' }).reason;
  const result = new Map<string, Fact>();
  for (const f of stored) result.set(f.id, f);
  let pending = 0;

  if (await needsWriter(deps, entityKey, stored.length)) {
    await deps.kv.set(`fattempt:${entityKey}`, '1', ATTEMPT_TTL);
    const def = TASKS.dig_deeper;
    let written;
    try {
      written = await runStructured(deps.cfg, def.build(input, 'en'), { model: deps.cfg.models.dig_deeper, maxTokens: def.maxTokens, fetchImpl: deps.fetchImpl });
      usage.push({ task: 'dig_deeper', tokensIn: written.tokensIn, tokensOut: written.tokensOut, ok: true });
    } catch (e: any) {
      usage.push({ task: 'dig_deeper', tokensIn: e?.tokensIn ?? 0, tokensOut: e?.tokensOut ?? 0, ok: false });
      throw e;
    }
    const candidates = def.post!(written.data, input).facts as any[];
    const existing = await deps.facts.byEntity(entityKey);
    for (const c of candidates) {
      const hash = factHash(entityKey, c.claimEn);
      // dedupe: identical text, or near-identical wording of a fact we already hold for this entity
      const dup = (await deps.facts.byHash(hash)) ?? existing.find(e => isNearDuplicate(e.claim.en, c.claimEn));
      if (dup) { const bumped = await deps.facts.bump(dup.id); if (bumped && isVisible(bumped)) result.set(bumped.id, bumped); continue; }

      const year = typeof c.year === 'number' ? c.year : input.year ?? null;
      const checks = checkClaim(c.claimEn, c.claimFa, input.name, KNOWN);
      const now = deps.now();
      const fact: Fact = {
        id: `a_${hash}`, kind: 'ai', entityType: input.kind, entityKey, entityName: { en: input.name, fa: input.name }, year,
        hook: { en: c.hookEn, fa: c.hookFa }, claim: { en: c.claimEn, fa: c.claimFa },
        context: c.contextEn || c.contextFa ? { en: c.contextEn, fa: c.contextFa } : undefined,
        sources: c.sources, confidence: c.confidence, status: 'unverified', hash, sensitive: isSensitiveYear(year),
        firstDiscoverer: deps.discoverer, found: 1, reports: 0, checks: { deterministic: checks, model: null },
        history: [{ at: now, event: 'created', by: 'writer' }], createdAt: now, updatedAt: now,
      };
      let status: FactStatus = 'unverified';
      if (failed(checks).length) {
        status = 'rejected';
        fact.history.push({ at: now, event: 'deterministic_reject', by: 'checker', note: failed(checks).map(x => x.detail).join('; ') });
      } else {
        const j = await judge(deps, { entity: input.name, claim: fact.claim, sources: fact.sources });
        if (j.usage) usage.push(j.usage);
        fact.checks!.model = j.verdict;
        if (j.verdict?.verdict === 'unsupported') { status = 'rejected'; fact.history.push({ at: now, event: 'model_reject', by: j.verdict.model, note: j.verdict.reason }); }
        else if (j.verdict?.verdict === 'supported' && j.verdict.persianMatches) { status = 'ai_checked'; fact.history.push({ at: now, event: 'model_supported', by: j.verdict.model, note: j.verdict.reason }); }
        // uncertain / Persian mismatch / no checker configured / checker failed → stays unverified for a human
      }
      fact.status = status;
      await deps.facts.create(fact);
      existing.push(fact);
      if (isVisible(fact)) result.set(fact.id, fact); else if (fact.status !== 'rejected') pending += 1; // rejected facts are not "pending": nobody will see them
    }
  }

  const visible = [...result.values()].filter(isVisible);
  // finding an already-stored fact counts as a discovery (drives the review order)
  await Promise.all(stored.map(f => deps.facts.bump(f.id)));
  return { facts: visible.map(toPublic), pending, fromStore: stored.length, usage, checker };
}
