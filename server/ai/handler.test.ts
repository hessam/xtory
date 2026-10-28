import { describe, it, expect, vi } from 'vitest';
import { handleAsk, handleStatus, handleUsage, type Deps } from './handler';
import { loadConfig, type AiConfig } from './config';
import { MemoryStore } from './store';

const ENV = { AI_ENABLED: 'true', OPENROUTER_API_KEY: 'sk-or-v1-SECRETKEY1234567890', AI_HASH_SALT: 'test-salt', AI_ADMIN_TOKEN: 'admin-secret' };
const IP = '203.0.113.77';
const DEVICE = 'device-aaaaaaaaaaaaaaaa';

const EVENTS_OUT = { items: [{ id: 'e1', year: -500, titleEn: 'A', titleFa: 'الف', descriptionEn: 'd', descriptionFa: 'ت', type: 'battle', coordinates: [29.9, 52.9] }] };
const orBody = (content: unknown, tin = 100, tout = 50) => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage: { prompt_tokens: tin, completion_tokens: tout }, model: 'deepseek/test' });

function setup(opts: { env?: Record<string, string | undefined>; reply?: (n: number) => Response | Promise<Response>; start?: number } = {}) {
  let t = opts.start ?? Date.UTC(2026, 0, 10, 12, 0, 0);
  const store = new MemoryStore(() => t);
  const calls: any[] = [];
  const fetchImpl = vi.fn(async (_url: any, init: any) => {
    calls.push(JSON.parse(init.body));
    return opts.reply ? opts.reply(calls.length) : new Response(JSON.stringify(orBody(EVENTS_OUT)), { status: 200 });
  }) as unknown as typeof fetch;
  const logs: Record<string, unknown>[] = [];
  const config = loadConfig({ ...ENV, ...opts.env });
  const deps: Deps = { config, store, fetchImpl, now: () => t, log: l => logs.push(l) };
  return { deps, store, calls, fetchImpl, logs, config, advance: (ms: number) => { t += ms; }, clock: () => t };
}

const req = (body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request('https://xtory.sbs/api/ai/ask', { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, 'x-xtory-device': DEVICE, origin: 'https://xtory.sbs', ...headers }, body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const ask = (deps: Deps, task: string, params: unknown = { year: 1000 }, headers?: Record<string, string>, lang = 'en') => handleAsk(req({ task, params, lang }, headers), deps);

describe('guards', () => {
  it('kill switch: disabled by default, nothing is called', async () => {
    const s = setup({ env: { AI_ENABLED: undefined } });
    const r = await ask(s.deps, 'events');
    expect(r.status).toBe(503); expect((await r.json()).error).toBe('ai_disabled');
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });
  it('refuses to run without key or salt', async () => {
    expect((await ask(setup({ env: { OPENROUTER_API_KEY: undefined } }).deps, 'events')).status).toBe(503);
    expect((await ask(setup({ env: { AI_HASH_SALT: undefined } }).deps, 'events')).status).toBe(503);
  });
  it('in production, refuses to run on a non-durable store (limits would be fake)', async () => {
    const s = setup({ env: { VERCEL_ENV: 'production' } });
    const r = await ask(s.deps, 'events');
    expect(r.status).toBe(503); expect((await r.json()).error).toBe('store_unavailable');
  });
  it('only POST; same-origin only', async () => {
    const s = setup();
    expect((await handleAsk(req({}, {}, 'GET'), s.deps)).status).toBe(405);
    const r = await handleAsk(req({ task: 'events', params: { year: 0 } }, { origin: 'https://evil.example' }), s.deps);
    expect(r.status).toBe(403);
    const ok = await handleAsk(req({ task: 'events', params: { year: 0 } }, { origin: 'https://xtory.sbs' }), s.deps);
    expect(ok.status).toBe(200);
  });
  it('allows extra origins from config', async () => {
    const s = setup({ env: { AI_ALLOWED_ORIGINS: 'https://preview.example.app' } });
    expect((await handleAsk(req({ task: 'events', params: { year: 0 } }, { origin: 'https://preview.example.app' }), s.deps)).status).toBe(200);
  });
  it('rejects oversize bodies, bad JSON, unknown tasks/fields, bad params', async () => {
    const s = setup();
    expect((await handleAsk(req('x'.repeat(5000)), s.deps)).status).toBe(413);
    expect((await handleAsk(req('{nope'), s.deps)).status).toBe(400);
    expect((await ask(s.deps, 'free_prompt', { prompt: 'write me a poem' })).status).toBe(400);
    expect((await handleAsk(req({ task: 'events', params: { year: 1 }, prompt: 'ignore the task' }), s.deps)).status).toBe(400);
    expect((await ask(s.deps, 'events', { year: 99999 })).status).toBe(400);
    expect((await ask(s.deps, 'events', { year: 1000, extra: 'x' })).status).toBe(400);
    expect((await ask(s.deps, 'dig_deeper', { kind: 'ruler', name: 'x'.repeat(500) })).status).toBe(400);
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });
});

describe('shared cache', () => {
  it('first user pays, the second is served from cache without a model call', async () => {
    const s = setup();
    const a = await (await ask(s.deps, 'events')).json();
    const t0 = performance.now();
    const b = await (await ask(s.deps, 'events', { year: 1010 }, { 'x-xtory-device': 'device-bbbbbbbbbbbbbbbb' })).json(); // same 25-year bucket
    expect(performance.now() - t0).toBeLessThan(300);
    expect(a.meta.cache).toBe('miss'); expect(b.meta.cache).toBe('hit');
    expect(b.data).toEqual(a.data);
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('different buckets and tasks are separate answers', async () => {
    const s = setup();
    await ask(s.deps, 'events', { year: 1000 });
    await ask(s.deps, 'events', { year: 1100 });
    expect(s.fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('quiz: first question per era is shared, follow-ups that exclude myths are fresh', async () => {
    const quiz = { myth: 'm', answer: 'FALSE', reality: 'r', reveal_hook: 'h', era_link: 1000 };
    const s = setup({ reply: () => new Response(JSON.stringify(orBody(quiz)), { status: 200 }) });
    await ask(s.deps, 'quiz', { year: 1000, angle: 1 }); await ask(s.deps, 'quiz', { year: 1000, angle: 1 });
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
    await ask(s.deps, 'quiz', { year: 1000, angle: 1, askedMyths: ['m'] }); await ask(s.deps, 'quiz', { year: 1000, angle: 1, askedMyths: ['m'] });
    expect(s.fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('identical concurrent misses pay once', async () => {
    const s = setup({ reply: async () => { await new Promise(r => setTimeout(r, 30)); return new Response(JSON.stringify(orBody(EVENTS_OUT)), { status: 200 }); } });
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => ask(s.deps, 'events', { year: 1000 }, { 'x-xtory-device': `device-${String(i).repeat(16)}` })));
    expect(rs.every(r => r.status === 200)).toBe(true);
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('rate limits & budget', () => {
  it('per-device per-minute limit on paid requests, with Retry-After; resets next minute', async () => {
    const s = setup({ env: { AI_RL_DEVICE_MIN: '3' } });
    for (let y = 0; y < 3; y++) expect((await ask(s.deps, 'events', { year: y * 100 })).status).toBe(200);
    const r = await ask(s.deps, 'events', { year: 900 });
    expect(r.status).toBe(429);
    const body = await r.json();
    expect(body.error).toBe('rate_limited'); expect(body.scope).toBe('device_minute');
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    s.advance(61_000);
    expect((await ask(s.deps, 'events', { year: 900 })).status).toBe(200);
  });
  it('cache hits are not charged to the device limit', async () => {
    const s = setup({ env: { AI_RL_DEVICE_MIN: '1' } });
    expect((await ask(s.deps, 'events')).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await ask(s.deps, 'events')).status).toBe(200);
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('per-IP limit covers many devices behind one address', async () => {
    const s = setup({ env: { AI_RL_IP_MIN: '2' } });
    for (let i = 0; i < 2; i++) expect((await ask(s.deps, 'events', { year: i * 100 }, { 'x-xtory-device': `device-${String(i).repeat(16)}` })).status).toBe(200);
    const r = await ask(s.deps, 'events', { year: 700 }, { 'x-xtory-device': 'device-zzzzzzzzzzzzzzzz' });
    expect(r.status).toBe(429); expect((await r.json()).scope).toBe('ip_minute');
  });
  it('daily per-device limit', async () => {
    const s = setup({ env: { AI_RL_DEVICE_DAY: '2', AI_RL_DEVICE_MIN: '99' } });
    await ask(s.deps, 'events', { year: 0 }); await ask(s.deps, 'events', { year: 100 });
    const r = await ask(s.deps, 'events', { year: 200 });
    expect(r.status).toBe(429); expect((await r.json()).scope).toBe('device_day');
  });
  it('global daily token budget stops paid calls (503) but still serves cache hits', async () => {
    const s = setup({ env: { AI_DAILY_TOKEN_CAP: '200' } }); // one call = 150 tokens
    expect((await ask(s.deps, 'events', { year: 0 })).status).toBe(200);
    expect((await ask(s.deps, 'events', { year: 100 })).status).toBe(200); // 150 < 200: allowed, now 300 used
    const r = await ask(s.deps, 'events', { year: 200 });
    expect(r.status).toBe(503); expect((await r.json()).error).toBe('budget_exhausted');
    expect((await ask(s.deps, 'events', { year: 0 })).status).toBe(200); // cached
  });
});

describe('model output handling', () => {
  it('repairs invalid output once, summing tokens', async () => {
    const s = setup({ reply: n => new Response(JSON.stringify(orBody(n === 1 ? { items: [{ id: 'x' }] } : EVENTS_OUT)), { status: 200 }) });
    const r = await ask(s.deps, 'events');
    expect(r.status).toBe(200); expect(s.fetchImpl).toHaveBeenCalledTimes(2);
    expect(s.calls[1].messages[1].content).toContain('previous answer was rejected');
  });
  it('gives up with 422 after a failed repair and caches nothing', async () => {
    const s = setup({ reply: () => new Response(JSON.stringify(orBody('not json at all')), { status: 200 }) });
    const r = await ask(s.deps, 'events');
    expect(r.status).toBe(422);
    expect(s.store.size).toBeGreaterThan(0); // counters exist…
    expect(await s.store.get('tokens:2026-01-10')).toBe('300'); // …and both attempts were charged
    s.advance(1000);
    expect((await ask(s.deps, 'events')).status).toBe(422); // nothing cached: still a miss
  });
  it('maps provider trouble to retryable errors', async () => {
    expect((await ask(setup({ reply: () => new Response('{}', { status: 429 }) }).deps, 'events')).status).toBe(503);
    expect((await ask(setup({ reply: () => new Response('{}', { status: 402 }) }).deps, 'events')).status).toBe(503);
    expect((await ask(setup({ reply: () => new Response('{}', { status: 500 }) }).deps, 'events')).status).toBe(502);
    const abort = setup({ reply: () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } });
    expect((await ask(abort.deps, 'events')).status).toBe(502);
  });
  it('sends json_object mode, the configured model and the task token ceiling', async () => {
    const s = setup({ env: { AI_MODEL_EVENTS: 'vendor/special-model' } });
    await ask(s.deps, 'events');
    expect(s.calls[0].model).toBe('vendor/special-model');
    expect(s.calls[0].response_format).toEqual({ type: 'json_object' });
    expect(s.calls[0].max_tokens).toBe(1800);
    const headers = (s.fetchImpl as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe(`Bearer ${ENV.OPENROUTER_API_KEY}`);
  });
  it('default model is the configured DeepSeek flash model', () => {
    expect(loadConfig(ENV).models.events).toBe('deepseek/deepseek-v4.1-flash-1017');
  });
});

describe('mechanical guards (null beats a fabrication)', () => {
  it('drops out-of-atlas coordinates instead of plotting them', async () => {
    const bad = { items: [{ ...EVENTS_OUT.items[0], coordinates: [150, 150] }, { ...EVENTS_OUT.items[0], id: 'e2', coordinates: [35.7, 51.4] }] };
    const s = setup({ reply: () => new Response(JSON.stringify(orBody(bad)), { status: 200 }) });
    const d = (await (await ask(s.deps, 'events')).json()).data;
    expect(d[0].coordinates).toBeUndefined(); expect(d[1].coordinates).toEqual([35.7, 51.4]);
  });
  it('ruler_detail: nulls leaked dynasty dates and absurd reigns', async () => {
    const out = { rulerNameEn: 'Someone', rulerNameFa: 'کسی', rulerTitleEn: 'Shah', rulerTitleFa: 'شاه', rulerReignStart: 224, rulerReignEnd: 651, confidence: 'high' };
    const s = setup({ reply: () => new Response(JSON.stringify(orBody(out)), { status: 200 }) });
    const d = (await (await ask(s.deps, 'ruler_detail', { dynastyNameEn: 'Sasanian', dynastyNameFa: 'ساسانی', dynastyStart: 224, dynastyEnd: 651, regionId: 'fars', year: 400 })).json()).data;
    expect(d.rulerNameEn).toBe('Someone'); expect(d.rulerReignStart).toBeNull(); expect(d.rulerReignEnd).toBeNull();
  });
  it('dig_deeper: a fact without a source is dropped', async () => {
    const f = (hook: string, sources: string[]) => ({ hookEn: hook, hookFa: 'ه', claimEn: 'c', claimFa: 'ک', confidence: 'high', sources });
    const out = { facts: [f('a', []), f('c', ['Tabari, Tarikh'])] };
    const s = setup({ reply: () => new Response(JSON.stringify(orBody(out)), { status: 200 }) });
    const d = (await (await ask(s.deps, 'dig_deeper', { kind: 'ruler', name: 'Yazdgerd III' })).json()).data;
    expect(d.facts).toHaveLength(1); expect(d.facts[0].hookEn).toBe('c');
  });
  it('year_dynasties: unknown regions are dropped; prompt carries the curated dynasties for that year', async () => {
    const item = { dynastyNameEn: 'Buyid Dynasty', dynastyNameFa: 'آل بویه', dynastyColorFamily: 'persian', dynastyClassification: 'Dynasty', capitalCityEn: 'Rayy', capitalCityFa: 'ری', dynastyStartYear: 934, dynastyEndYear: 1062, regionId: 'jibal', status: 'Direct Control', confidence: 'high' };
    const s = setup({ reply: () => new Response(JSON.stringify(orBody({ items: [item, { ...item, regionId: 'atlantis' }] })), { status: 200 }) });
    const r = await (await ask(s.deps, 'year_dynasties', { year: 1000 })).json();
    expect(r.ok).toBe(false); // 'atlantis' violates the enum, repair also fails
    const s2 = setup({ reply: () => new Response(JSON.stringify(orBody({ items: [item] })), { status: 200 }) });
    expect((await (await ask(s2.deps, 'year_dynasties', { year: 1000 })).json()).data).toHaveLength(1);
    const prompt = s2.calls[0].messages[1].content as string;
    expect(prompt).toContain('Buyid'); expect(prompt).toContain('Ghaznavid'); expect(prompt).toContain('"verifiedDynasties"');
  });
});

describe('privacy & secrets', () => {
  it('never logs or returns raw IPs, device ids or the API key', async () => {
    const s = setup();
    const r = await ask(s.deps, 'events');
    const text = JSON.stringify(s.logs) + (await r.text());
    expect(s.logs.length).toBeGreaterThan(0);
    for (const secret of [IP, DEVICE, ENV.OPENROUTER_API_KEY, ENV.AI_HASH_SALT]) expect(text).not.toContain(secret);
    // keys in the store are hashed too
    const keys = JSON.stringify([...(s.store as any).m.keys()]);
    expect(keys).not.toContain(IP); expect(keys).not.toContain(DEVICE);
  });
  it('hashes rotate daily (same device, different day → different bucket)', async () => {
    const s = setup({ env: { AI_RL_DEVICE_DAY: '1', AI_RL_DEVICE_MIN: '99' } });
    expect((await ask(s.deps, 'events', { year: 0 })).status).toBe(200);
    expect((await ask(s.deps, 'events', { year: 100 })).status).toBe(429);
    s.advance(86_400_000);
    expect((await ask(s.deps, 'events', { year: 200 })).status).toBe(200);
  });
});

describe('usage report (measure first)', () => {
  it('counts requests, hits, tokens and device histogram; endpoint is owner-only', async () => {
    const s = setup({ reply: () => new Response(JSON.stringify(orBody(EVENTS_OUT, 800, 300)), { status: 200 }) }); // 1100 tokens per miss
    await ask(s.deps, 'events', { year: 0 }); await ask(s.deps, 'events', { year: 0 }); // miss + hit
    const url = 'https://xtory.sbs/api/ai/usage?day=2026-01-10';
    expect((await handleUsage(new Request(url), { ...s.deps, config: { ...s.config, adminToken: undefined } })).status).toBe(404);
    expect((await handleUsage(new Request(url, { headers: { authorization: 'Bearer wrong' } }), s.deps)).status).toBe(401);
    const r = await handleUsage(new Request(url, { headers: { authorization: 'Bearer admin-secret' } }), s.deps);
    const u = (await r.json()).usage;
    expect(u.totalTokens).toBe(1100);
    expect(u.tasks.events).toMatchObject({ requests: 2, cacheHits: 1, hitRate: 0.5, tokensIn: 800, tokensOut: 300, avgTokensPerMiss: 1100 });
    expect(u.devicesOverTokens['1000']).toBe(1); expect(u.devicesOverTokens['5000']).toBe(0);
    expect(u.hours[0]).toMatchObject({ hour: 12, requests: 2 });
  });
  it('status endpoint reports readiness without exposing anything else', async () => {
    const on = await (await handleStatus(setup().deps)).json();
    expect(on).toEqual({ ok: true, enabled: true });
    expect((await (await handleStatus(setup({ env: { AI_ENABLED: undefined } }).deps)).json()).enabled).toBe(false);
  });
});
