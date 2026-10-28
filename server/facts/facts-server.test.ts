import { describe, it, expect, vi } from 'vitest';
import { handleDig, handleReport, handleAdmin } from './handler';
import { loadConfig } from '../ai/config';
import { MemoryStore } from '../ai/store';
import { handleUsage, type Deps } from '../ai/handler';
import { isVisible, type Fact } from '../../src/facts/model';
import { FactStore } from './store';

const ENV = { AI_ENABLED: 'true', OPENROUTER_API_KEY: 'sk-or-test-1234567890', AI_HASH_SALT: 'salt', AI_ADMIN_TOKEN: 'admin', AI_CHECKER_MODEL: 'google/checker-model' };
const IP = '198.51.100.9';
const WRITER = 'deepseek/deepseek-v4.1-flash-1017';

const cand = (over: Record<string, unknown> = {}) => ({ hookEn: 'A striking hook', hookFa: 'قلاب', claimEn: 'The vizier owned 400 camels.', claimFa: 'وزیر ۴۰۰ شتر داشت.', year: 1000, confidence: 'medium', sources: ['Tabari, Tarikh'], ...over });
const orBody = (c: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(c) } }], usage: { prompt_tokens: 200, completion_tokens: 100 }, model: 'm' }), { status: 200 });

interface Script { writer?: unknown[]; checker?: (n: number, body: any) => unknown }
function setup(script: Script = {}, env: Record<string, string | undefined> = {}) {
  let t = Date.UTC(2026, 0, 10, 12);
  const store = new MemoryStore(() => t);
  const calls: { model: string; prompt: string }[] = [];
  let writerN = 0, checkerN = 0;
  const fetchImpl = vi.fn(async (_u: any, init: any) => {
    const b = JSON.parse(init.body); calls.push({ model: b.model, prompt: b.messages[1].content });
    if (b.model === WRITER) { const facts = script.writer?.[Math.min(writerN, (script.writer?.length ?? 1) - 1)] ?? [cand()]; writerN++; return orBody({ facts }); }
    const v = script.checker ? script.checker(checkerN++, b) : { verdict: 'supported', persianMatches: true, reason: 'ok' };
    return orBody(v);
  }) as unknown as typeof fetch;
  const config = loadConfig({ ...ENV, ...env });
  const logs: any[] = [];
  const deps: Deps = { config, store, fetchImpl, now: () => t, log: l => logs.push(l) };
  const facts = new FactStore(store, () => t);
  return { deps, store, facts, calls, logs, fetchImpl, advance: (ms: number) => { t += ms; }, writerCalls: () => calls.filter(c => c.model === WRITER).length, checkerCalls: () => calls.filter(c => c.model !== WRITER).length };
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://xtory.sbs/api/facts/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, 'x-xtory-device': 'device-aaaaaaaaaaaaaaaa', origin: 'https://xtory.sbs', ...headers }, body: JSON.stringify(body) });
const dig = (d: Deps, name = 'Nizam al-Mulk', extra: Record<string, unknown> = {}, headers?: Record<string, string>) => handleDig(post('dig', { kind: 'ruler', name, ...extra }, headers), d);
const admin = (d: Deps, init: { method?: string; query?: string; body?: unknown; token?: string } = {}) =>
  handleAdmin(new Request(`https://xtory.sbs/api/facts/admin${init.query ?? ''}`, { method: init.method ?? 'GET', headers: { authorization: `Bearer ${init.token ?? 'admin'}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined }), d);

describe('dig deeper → checks → visibility', () => {
  it('a checked fact is shown with the AI badge, and stored for the next person (no second model call)', async () => {
    const s = setup();
    const a = await (await dig(s.deps)).json();
    expect(a.ok).toBe(true); expect(a.facts).toHaveLength(1);
    expect(a.facts[0]).toMatchObject({ badge: 'ai_checked', kind: 'ai', sources: ['Tabari, Tarikh'] });
    expect(a.facts[0].checks).toBeUndefined(); expect(a.facts[0].history).toBeUndefined(); expect(a.facts[0].firstDiscoverer).toBeUndefined(); // internals stay private
    expect(s.writerCalls()).toBe(1); expect(s.checkerCalls()).toBe(1);
    const b = await (await dig(s.deps, 'Nizam al-Mulk', {}, { 'x-xtory-device': 'device-bbbbbbbbbbbbbbbb' })).json();
    expect(b.facts).toHaveLength(1); expect(b.meta.fromStore).toBe(1);
    expect(s.writerCalls()).toBe(1); // served from the store
    const stored = (await s.facts.byEntity('ruler:nizam_al_mulk'))[0];
    expect(stored.found).toBe(2); // created (1) + rediscovered by the second person (+1)
  });

  it('PLANTED WRONG AGE is rejected before the model judge is even asked, and never shown', async () => {
    const s = setup({ writer: [[cand({ claimEn: 'Yazdgerd III was 35 years old when he died.', claimFa: 'یزدگرد سوم هنگام مرگ ۳۵ ساله بود.', year: 651 })]] });
    const r = await (await dig(s.deps, 'Yazdgerd III')).json();
    expect(r.facts).toHaveLength(0); expect(r.pending).toBe(0);
    expect(s.checkerCalls()).toBe(0);
    const f = (await s.facts.byEntity('ruler:yazdgerd_iii'))[0];
    expect(f.status).toBe('rejected'); expect(f.checks!.deterministic.some(c => !c.ok)).toBe(true);
  });

  it('a correct age passes the arithmetic check and goes on to the judge', async () => {
    const s = setup({ writer: [[cand({ claimEn: 'Yazdgerd III was 27 years old when he died.', claimFa: 'یزدگرد سوم هنگام مرگ ۲۷ ساله بود.', year: 651 })]] });
    const r = await (await dig(s.deps, 'Yazdgerd III')).json();
    expect(r.facts).toHaveLength(1); expect(s.checkerCalls()).toBe(1);
  });

  it('judge verdicts: unsupported → rejected; uncertain / Persian mismatch → held for a human', async () => {
    const s1 = setup({ checker: () => ({ verdict: 'unsupported', persianMatches: true, reason: 'contradicted' }) });
    expect((await (await dig(s1.deps)).json()).facts).toHaveLength(0);
    expect((await s1.facts.byEntity('ruler:nizam_al_mulk'))[0].status).toBe('rejected');
    const s2 = setup({ checker: () => ({ verdict: 'uncertain', persianMatches: true, reason: 'not sure' }) });
    const r2 = await (await dig(s2.deps)).json(); expect(r2.facts).toHaveLength(0); expect(r2.pending).toBe(1);
    const s3 = setup({ checker: () => ({ verdict: 'supported', persianMatches: false, reason: 'numbers differ' }) });
    const r3 = await (await dig(s3.deps)).json(); expect(r3.facts).toHaveLength(0); expect(r3.pending).toBe(1);
    expect((await s3.facts.byEntity('ruler:nizam_al_mulk'))[0].status).toBe('unverified');
  });

  it('fails closed: without a usable checker nothing AI-written is shown', async () => {
    const none = setup({}, { AI_CHECKER_MODEL: undefined });
    const r = await (await dig(none.deps)).json();
    expect(r.facts).toHaveLength(0); expect(r.pending).toBe(1); expect(r.meta.checker).toBe('not_configured');
    const same = setup({}, { AI_CHECKER_MODEL: 'deepseek/another-model' });
    const r2 = await (await dig(same.deps)).json();
    expect(r2.facts).toHaveLength(0); expect(r2.meta.checker).toBe('same_family'); expect(same.checkerCalls()).toBe(0);
  });

  it('a failing judge never promotes a fact', async () => {
    const s = setup({ checker: () => { throw new Error('boom'); } });
    // fetchImpl throws → UpstreamError('http') inside judge → fact stays unverified
    const r = await (await dig(s.deps)).json();
    expect(r.ok).toBe(true); expect(r.facts).toHaveLength(0); expect(r.pending).toBe(1);
  });

  it('sensitive era (1900+): even a fully checked fact waits for a human', async () => {
    const s = setup({ writer: [[cand({ year: 1953 })]] });
    const r = await (await dig(s.deps, 'Some 1953 Event')).json();
    expect(r.facts).toHaveLength(0); expect(r.pending).toBe(1);
    const f = (await s.facts.byEntity('ruler:some_1953_event'))[0];
    expect(f.status).toBe('ai_checked'); expect(f.sensitive).toBe(true); expect(isVisible(f)).toBe(false);
  });

  it('dedupes identical and near-identical claims (and counts them as rediscoveries)', async () => {
    const s = setup({ writer: [[cand()], [cand({ claimEn: 'The vizier owned 400 camels' }), cand({ claimEn: 'The vizier owned about 400 camels.' })]] });
    await dig(s.deps);
    s.advance(25 * 3600 * 1000); // the once-a-day writer attempt window passes
    await dig(s.deps, 'Nizam al-Mulk', {}, { 'x-xtory-device': 'device-cccccccccccccccc' });
    const all = await s.facts.byEntity('ruler:nizam_al_mulk');
    expect(all).toHaveLength(1); expect(all[0].found).toBeGreaterThanOrEqual(3);
  });

  it('asks the writer at most once per entity per day while it has few facts', async () => {
    const s = setup({ writer: [[]] });
    await dig(s.deps); await dig(s.deps, 'Nizam al-Mulk', {}, { 'x-xtory-device': 'device-dddddddddddddddd' });
    expect(s.writerCalls()).toBe(1);
  });

  it('validates input, honours the kill switch and the paid limits', async () => {
    const s = setup();
    expect((await handleDig(post('dig', { kind: 'nonsense', name: 'x' }), s.deps)).status).toBe(400);
    expect((await handleDig(post('dig', { kind: 'ruler', name: 'x', prompt: 'hi' }), s.deps)).status).toBe(400);
    expect((await dig(setup({}, { AI_ENABLED: undefined }).deps)).status).toBe(503);
    const lim = setup({}, { AI_RL_DEVICE_MIN: '1' });
    expect((await dig(lim.deps, 'A One')).status).toBe(200);
    const r = await dig(lim.deps, 'B Two');
    expect(r.status).toBe(429);
  });

  it('records usage for the writer and the judge; stores only hashed identities', async () => {
    const s = setup();
    await dig(s.deps);
    const u = await (await handleUsage(new Request('https://xtory.sbs/api/ai/usage?day=2026-01-10', { headers: { authorization: 'Bearer admin' } }), s.deps)).json();
    expect(u.usage.tasks.dig_deeper).toMatchObject({ requests: 1, tokensIn: 200, tokensOut: 100 });
    expect(u.usage.tasks.fact_check).toMatchObject({ requests: 1 });
    const f = (await s.facts.byEntity('ruler:nizam_al_mulk'))[0];
    expect(JSON.stringify(f)).not.toContain(IP); expect(JSON.stringify(f)).not.toContain('device-aaaa');
    expect(f.firstDiscoverer).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('human review queue & export', () => {
  async function seed(n = 3) {
    const s = setup({ checker: () => ({ verdict: 'uncertain', persianMatches: true, reason: 'unsure' }) });
    for (let i = 0; i < n; i++) {
      s.advance(25 * 3600 * 1000);
      s.deps.fetchImpl = vi.fn(async (_u: any, init: any) => { const b = JSON.parse(init.body); return orBody(b.model === WRITER ? { facts: [cand({ claimEn: `Claim number ${i} about camels and vizier ${i}.`, claimFa: `ادعا ${i}` })] } : { verdict: 'uncertain', persianMatches: true, reason: 'unsure' }); }) as unknown as typeof fetch;
      await dig(s.deps, `Entity ${i}`);
    }
    return s;
  }

  it('is owner-only', async () => {
    const s = setup();
    expect((await admin(s.deps, { token: 'nope' })).status).toBe(401);
    expect((await admin({ ...s.deps, config: { ...s.deps.config, adminToken: undefined } })).status).toBe(404);
  });

  it('queue is ordered by how many people found each fact', async () => {
    const s = await seed(3);
    const f2 = (await s.facts.byEntity('ruler:entity_2'))[0];
    await s.facts.bump(f2.id); await s.facts.bump(f2.id);
    const q = await (await admin(s.deps, { query: '?action=queue&status=unverified' })).json();
    expect(q.facts.map((f: Fact) => f.entityKey)[0]).toBe('ruler:entity_2');
    expect(q.counts.unverified).toBe(3);
    expect(q.facts[0].checks).toBeDefined(); // the owner sees the checks and history
  });

  it('approve → verified and shown without a badge; a fact with no source cannot be approved', async () => {
    const s = await seed(1);
    const f = (await s.facts.byEntity('ruler:entity_0'))[0];
    const ok = await (await admin(s.deps, { method: 'POST', body: { action: 'review', factId: f.id, verdict: 'approve', notes: 'checked Tabari' } })).json();
    expect(ok.fact.status).toBe('verified');
    const shown = await (await dig(s.deps, 'Entity 0')).json();
    expect(shown.facts[0].badge).toBe('none');
    const s2 = await seed(1);
    const g = (await s2.facts.byEntity('ruler:entity_0'))[0];
    const stripped = await admin(s2.deps, { method: 'POST', body: { action: 'review', factId: g.id, verdict: 'approve', edits: { sources: [] } } });
    expect(stripped.status).toBe(409);
  });

  it('edit changes the text/hash; reject after verified records a points revocation; reopen works', async () => {
    const s = await seed(1);
    const f = (await s.facts.byEntity('ruler:entity_0'))[0];
    const edited = await (await admin(s.deps, { method: 'POST', body: { action: 'review', factId: f.id, verdict: 'approve', edits: { claim: { en: 'Corrected claim 400 camels.' }, sources: ['Tabari, Tarikh, vol. 3'] } } })).json();
    expect(edited.fact.claim.en).toBe('Corrected claim 400 camels.'); expect(edited.fact.hash).not.toBe(f.hash);
    const rej = await (await admin(s.deps, { method: 'POST', body: { action: 'review', factId: f.id, verdict: 'reject', notes: 'later found wrong' } })).json();
    expect(rej.fact.status).toBe('rejected');
    expect(rej.fact.history.some((h: any) => h.event === 'points_revoked')).toBe(true);
    const re = await (await admin(s.deps, { method: 'POST', body: { action: 'review', factId: f.id, verdict: 'reopen' } })).json();
    expect(re.fact.status).toBe('unverified');
    expect((await admin(s.deps, { method: 'POST', body: { action: 'review', factId: f.id, verdict: 'bogus' } })).status).toBe(400);
  });

  it('export returns only verified AI facts, ready for data/facts/verified/', async () => {
    const s = await seed(2);
    const [a, b] = [(await s.facts.byEntity('ruler:entity_0'))[0], (await s.facts.byEntity('ruler:entity_1'))[0]];
    await admin(s.deps, { method: 'POST', body: { action: 'review', factId: a.id, verdict: 'approve' } });
    await admin(s.deps, { method: 'POST', body: { action: 'review', factId: b.id, verdict: 'reject' } });
    const ex = await (await admin(s.deps, { query: '?action=export' })).json();
    expect(ex.facts.map((f: Fact) => f.id)).toEqual([a.id]);
    expect(ex.facts[0].status).toBe('verified'); expect(ex.facts[0].sources.length).toBeGreaterThan(0);
  });
});

describe('user reports', () => {
  it('one report per device per fact; enough distinct reports pull a visible fact back to review', async () => {
    const s = setup(); // threshold 2
    const shown = (await (await dig(s.deps)).json()).facts[0];
    const rep = (device: string) => handleReport(post('report', { factId: shown.id, reason: 'wrong' }, { 'x-xtory-device': device }), s.deps).then(r => r.json());
    expect((await rep('device-eeeeeeeeeeeeeeee')).counted).toBe(true);
    expect((await rep('device-eeeeeeeeeeeeeeee')).counted).toBe(false); // same device again
    expect((await s.facts.get(shown.id))!.status).toBe('ai_checked');
    const second = await rep('device-ffffffffffffffff');
    expect(second.pulledForReview).toBe(true);
    const f = (await s.facts.get(shown.id))!;
    expect(f.status).toBe('disputed'); expect(isVisible(f)).toBe(false);
    const q = await (await admin(s.deps, { query: '?action=reported' })).json();
    expect(q.reported[0]).toMatchObject({ id: shown.id, reports: 2 });
  });

  it('reports on static (computed) facts are recorded for the owner too; junk is refused', async () => {
    const s = setup();
    const r = await (await handleReport(post('report', { factId: 'c_reign_0123456789', reason: 'misleading' }), s.deps)).json();
    expect(r.counted).toBe(true);
    expect((await admin(s.deps, { query: '?action=reported' }).then(x => x.json())).reported[0].id).toBe('c_reign_0123456789');
    expect((await handleReport(post('report', { factId: '../etc/passwd', reason: 'wrong' }), s.deps)).status).toBe(400);
    expect((await handleReport(post('report', { factId: 'c_reign_0123456789', reason: 'lol' }), s.deps)).status).toBe(400);
  });
});
