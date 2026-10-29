import { describe, it, expect, vi } from 'vitest';
import { validate, wrapRoot, describe as describeSchema } from '../../src/ai/schema';
import { TASKS, ParamError, QUIZ_ANGLES } from '../../src/ai/tasks';
import { UpstashStore, MemoryStore } from './store';
import { chatJson, UpstreamError } from './openrouter';
import { identify } from './identity';
import { loadConfig, DEFAULT_LIMITS } from './config';

describe('schema validator', () => {
  const schema = { type: 'object', required: ['a'], properties: { a: { type: 'integer' }, b: { type: 'string', enum: ['x', 'y'], nullable: true }, c: { type: 'array', maxItems: 2, items: { type: 'number' } } } } as const;
  it('accepts valid, rejects wrong types / enums / missing / too many', () => {
    expect(validate({ a: 1, b: null, c: [1] }, schema)).toEqual([]);
    expect(validate({ a: 1.5 }, schema)).toHaveLength(1);
    expect(validate({}, schema)[0]).toContain('required');
    expect(validate({ a: 1, b: 'z' }, schema)[0]).toContain('enum');
    expect(validate({ a: 1, c: [1, 2, 3] }, schema)[0]).toContain('more than 2');
  });
  it('wraps array roots for object-only providers and describes schemas compactly', () => {
    expect(wrapRoot({ type: 'array', items: { type: 'string' } }).type).toBe('object');
    expect(describeSchema(schema)).toContain('"a": integer');
  });
});

describe('task params', () => {
  it('round shared answers to buckets and reject junk', () => {
    expect(TASKS.year_dynasties.parse({ year: 1003 })).toEqual({ year: 1005 });
    expect(TASKS.events.parse({ year: 1000 })).toEqual({ year: 1012 });
    expect(() => TASKS.events.parse({ year: '1000' })).toThrow(ParamError);
    expect(() => TASKS.ruler_detail.parse({ dynastyNameEn: 'x', dynastyNameFa: 'y', dynastyStart: 1, dynastyEnd: 2, regionId: 'narnia', year: 1 })).toThrow(ParamError);
    expect(() => TASKS.quiz.parse({ year: 1, askedMyths: Array(9).fill('x') })).toThrow(ParamError);
    expect(TASKS.quiz.parse({ year: 1000, angle: 99 }).angle).toBe(QUIZ_ANGLES.length - 1);
  });
  it('cache identity ignores language only for tasks whose output holds both languages', () => {
    expect(TASKS.events.cacheKey({ year: 1012 }, 'en')).toBe(TASKS.events.cacheKey({ year: 1012 }, 'fa'));
    expect(TASKS.quiz.cacheKey({ year: 1012, angle: 0, askedMyths: [] }, 'en')).not.toBe(TASKS.quiz.cacheKey({ year: 1012, angle: 0, askedMyths: [] }, 'fa'));
    expect(TASKS.quiz.cacheKey({ year: 1012, angle: 0, askedMyths: ['x'] }, 'en')).toBeNull();
  });
  it('every task builds a prompt and a schema for sample params', () => {
    const samples: Record<string, unknown> = {
      year_dynasties: { year: 1000 }, events: { year: 1000 }, figures: { year: 1000 }, artifacts: { year: 1000 }, quiz: { year: 1000, angle: 2 },
      ruler_detail: { dynastyNameEn: 'Buyid Dynasty', dynastyNameFa: 'آل بویه', dynastyStart: 934, dynastyEnd: 1062, regionId: 'fars', year: 1000 },
      dig_deeper: { kind: 'ruler', name: 'Yazdgerd III', year: 651 },
    };
    for (const [id, def] of Object.entries(TASKS)) {
      const p = def.parse(samples[id]);
      const b = def.build(p, 'en');
      expect(b.prompt.length, id).toBeGreaterThan(50); expect(b.system, id).toContain('ONLY a JSON');
      expect(def.maxTokens, id).toBeLessThanOrEqual(3500);
    }
  });
});

describe('UpstashStore', () => {
  it('speaks the REST pipeline protocol and parses results', async () => {
    const fetchImpl = vi.fn(async (_u: any, init: any) => {
      const cmds = JSON.parse(init.body);
      return new Response(JSON.stringify(cmds.map((c: string[]) => ({ result: c[0] === 'GET' ? 'v' : 3 }))), { status: 200 });
    }) as unknown as typeof fetch;
    const s = new UpstashStore('https://x.upstash.io/', 'tok', fetchImpl);
    expect(await s.incrBy('k', 2, 60)).toBe(3);
    expect(await s.get('k')).toBe('v');
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://x.upstash.io/pipeline');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual([['INCRBY', 'k', 2], ['EXPIRE', 'k', 60, 'NX']]);
    expect(s.durable).toBe(true);
  });
  it('surfaces store failures', async () => {
    const s = new UpstashStore('https://x', 't', (async () => new Response('no', { status: 500 })) as typeof fetch);
    await expect(s.get('k')).rejects.toThrow('store_http_500');
  });
  it('memory store expires keys', async () => {
    let t = 0; const m = new MemoryStore(() => t);
    await m.set('a', '1', 10); t = 11_000; expect(await m.get('a')).toBeNull();
  });
});

describe('openrouter client', () => {
  it('strips code fences and reads usage', async () => {
    const f = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"a":1}\n```' } }], usage: { prompt_tokens: 5, completion_tokens: 7 } }), { status: 200 })) as typeof fetch;
    const r = await chatJson({ apiKey: 'k', model: 'm', system: 's', prompt: 'p', maxTokens: 10, temperature: 0, timeoutMs: 1000, referer: 'r', fetchImpl: f });
    expect(JSON.parse(r.text)).toEqual({ a: 1 }); expect([r.tokensIn, r.tokensOut]).toEqual([5, 7]);
  });
  const base = { apiKey: 'k', model: 'm', system: 's', prompt: 'p', maxTokens: 10, temperature: 0, timeoutMs: 1000, referer: 'r' };
  const reply = (b: unknown, status = 200) => (async () => new Response(JSON.stringify(b), { status })) as typeof fetch;
  it('explains an empty reply (reasoning ate the budget)', async () => {
    const e = await chatJson({ ...base, fetchImpl: reply({ model: 'x/y', choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'hmm' } }] }) }).catch((x) => x);
    expect(e).toBeInstanceOf(UpstreamError); expect(e.kind).toBe('empty'); expect(e.detail).toContain('finish_reason=length'); expect(e.detail).toContain('reasoning=present');
  });
  it('reports a 200 response that carries an error object', async () => {
    const e = await chatJson({ ...base, fetchImpl: reply({ error: { code: 404, message: 'No endpoints found for m' } }) }).catch((x) => x);
    expect(e.kind).toBe('http'); expect(e.detail).toContain('No endpoints found');
  });
  it('joins content parts', async () => {
    const r = await chatJson({ ...base, fetchImpl: reply({ choices: [{ message: { content: [{ text: '{"a"' }, { text: ':1}' }] } }] }) });
    expect(JSON.parse(r.text)).toEqual({ a: 1 });
  });
  it('times out', async () => {
    const f = ((_u: any, init: any) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => { const e = new Error('x'); e.name = 'AbortError'; rej(e); }))) as typeof fetch;
    await expect(chatJson({ apiKey: 'k', model: 'm', system: 's', prompt: 'p', maxTokens: 10, temperature: 0, timeoutMs: 20, referer: 'r', fetchImpl: f })).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('identity & config', () => {
  it('hashes are stable within a day, differ across days, and fall back to IP when no device id', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-xtory-device': 'abcdefabcdefabcdef' });
    const day1 = Date.UTC(2026, 0, 1), day2 = Date.UTC(2026, 0, 2);
    expect(identify(h, 's', day1)).toEqual(identify(h, 's', day1 + 5000));
    expect(identify(h, 's', day1).deviceHash).not.toBe(identify(h, 's', day2).deviceHash);
    expect(identify(new Headers({ 'x-forwarded-for': '1.2.3.4' }), 's', day1).deviceHash).toBeTruthy();
    expect(identify(new Headers({ 'x-xtory-device': 'short' }), 's', day1).deviceHash).toBeTruthy();
  });
  it('config: kill switch off by default, env overrides, bad numbers fall back', () => {
    expect(loadConfig({}).enabled).toBe(false);
    expect(loadConfig({ AI_RL_DEVICE_MIN: 'abc' }).limits.deviceMin).toBe(DEFAULT_LIMITS.deviceMin);
    expect(loadConfig({ AI_RL_DEVICE_MIN: '7', AI_DAILY_TOKEN_CAP: '5' }).limits).toMatchObject({ deviceMin: 7, dailyTokenCap: 5 });
    expect(loadConfig({ AI_MODEL: 'a/b' }).models.quiz).toBe('a/b');
  });
});
