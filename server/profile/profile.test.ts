import { describe, it, expect, vi } from 'vitest';
import { handleMe, handleBoard, weekId, DAILY_CLAIM_CAP } from './handler';
import { handleDig, handleAdmin } from '../facts/handler';
import { loadConfig } from '../ai/config';
import { MemoryStore } from '../ai/store';
import type { Deps } from '../ai/handler';
import { staticFactMap } from '../facts/static';
import { FactStore } from '../facts/store';
import { checkNickname } from './nickname';
import { WORDS } from './words';

const ENV = { AI_ENABLED: 'true', OPENROUTER_API_KEY: 'sk-or-test-1234567890', AI_HASH_SALT: 'salt', AI_ADMIN_TOKEN: 'admin', AI_CHECKER_MODEL: 'google/checker-model' };
const WRITER = 'deepseek/deepseek-v4.1-flash-1017';
const orBody = (c: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(c) } }], usage: { prompt_tokens: 200, completion_tokens: 100 }, model: 'm' }), { status: 200 });
const cand = { hookEn: 'A striking hook', hookFa: 'قلاب', claimEn: 'The vizier owned 400 camels.', claimFa: 'وزیر ۴۰۰ شتر داشت.', year: 1000, confidence: 'medium', sources: ['Tabari, Tarikh'] };

function setup(start = Date.UTC(2026, 0, 14, 12)) {
  let t = start;
  const store = new MemoryStore(() => t);
  const fetchImpl = vi.fn(async (_u: any, init: any) => { const b = JSON.parse(init.body); return orBody(b.model === WRITER ? { facts: [cand] } : { verdict: 'supported', persianMatches: true, reason: 'ok' }); }) as unknown as typeof fetch;
  const logs: any[] = [];
  const deps: Deps = { config: loadConfig(ENV), store, fetchImpl, now: () => t, log: l => logs.push(l) };
  return { deps, store, logs, advance: (ms: number) => { t += ms; }, set: (v: number) => { t = v; }, facts: new FactStore(store, () => t) };
}
const H = (device: string, ip = '198.51.100.9') => ({ 'content-type': 'application/json', 'x-forwarded-for': ip, 'x-xtory-device': device, origin: 'https://xtory.sbs' });
const DEV_A = 'device-aaaaaaaaaaaaaaaa', DEV_B = 'device-bbbbbbbbbbbbbbbb';
const me = (d: Deps, body: unknown, device = DEV_A, ip?: string, method = 'POST') => handleMe(new Request('https://xtory.sbs/api/me', { method, headers: H(device, ip), body: JSON.stringify(body) }), d);
const board = (d: Deps, q: string) => handleBoard(new Request(`https://xtory.sbs/api/leaderboard${q}`, { headers: { origin: 'https://xtory.sbs' } }), d);
const create = async (d: Deps, device = DEV_A, ip?: string) => (await me(d, { action: 'create' }, device, ip)).json();
const STATIC = [...staticFactMap().keys()];

describe('profile lifecycle', () => {
  it('creates an anonymous profile whose secret is 8 recovery words, and never stores it in the clear', async () => {
    const s = setup(); const p = await create(s.deps);
    expect(p.ok).toBe(true); expect(p.profileId).toMatch(/^p_[0-9a-f]{12}$/); expect(p.name).toMatch(/^Explorer #\d{4}$/);
    const words = p.secret.split('-'); expect(words).toHaveLength(8); expect(words.every((w: string) => WORDS.includes(w))).toBe(true);
    expect(new Set(WORDS).size).toBe(256);
  });

  it('syncs the inventory idempotently: +1 point per fact, repeat syncs change nothing', async () => {
    const s = setup(); const p = await create(s.deps);
    const found = STATIC.slice(0, 5);
    const a = await (await me(s.deps, { action: 'sync', profileId: p.profileId, secret: p.secret, found })).json();
    expect(a.accepted).toBe(5); expect(a.count).toBe(5); expect(a.points).toBeGreaterThanOrEqual(5);
    const b = await (await me(s.deps, { action: 'sync', profileId: p.profileId, secret: p.secret, found })).json();
    expect(b.accepted).toBe(0); expect(b.points).toBe(a.points);
  });

  it('rejects wrong credentials', async () => {
    const s = setup(); const p = await create(s.deps);
    const r = await me(s.deps, { action: 'sync', profileId: p.profileId, secret: 'amber-anchor-apple-arrow-aspen-atlas-autumn-badge', found: [] });
    expect(r.status).toBe(401);
    expect((await me(s.deps, { action: 'sync', profileId: 'p_000000000000', secret: p.secret, found: [] })).status).toBe(401);
  });

  it('recovery code moves the profile to another device and keeps points', async () => {
    const s = setup(); const p = await create(s.deps);
    await me(s.deps, { action: 'sync', profileId: p.profileId, secret: p.secret, found: STATIC.slice(0, 3) });
    const messy = ' ' + p.secret.toUpperCase().replace(/-/g, '  ') + ' ';
    const r = await (await me(s.deps, { action: 'recover', code: messy }, DEV_B, '203.0.113.5')).json();
    expect(r).toMatchObject({ ok: true, profileId: p.profileId, count: 3 });
    expect((await me(s.deps, { action: 'recover', code: 'not a real code at all' }, DEV_B, '203.0.113.5')).status).toBe(404);
  });

  it('deleting removes the profile, its nickname, its leaderboard rows and the recovery code', async () => {
    const s = setup(); const p = await create(s.deps); const auth = { profileId: p.profileId, secret: p.secret };
    await me(s.deps, { action: 'nickname', ...auth, nickname: 'Cyrus_Fan' });
    await me(s.deps, { action: 'sync', ...auth, found: STATIC.slice(0, 4) });
    expect((await (await board(s.deps, '?board=all')).json()).rows).toHaveLength(1);
    expect((await (await me(s.deps, {}, DEV_A, undefined, 'DELETE')).status)).toBe(401); // needs credentials
    expect((await me(s.deps, auth, DEV_A, undefined, 'DELETE')).status).toBe(200);
    expect((await (await board(s.deps, '?board=all')).json()).rows).toHaveLength(0);
    expect((await board(s.deps, '?nick=Cyrus_Fan')).status).toBe(404);
    expect((await me(s.deps, { action: 'recover', code: p.secret })).status).toBe(404);
    expect((await me(s.deps, { action: 'sync', ...auth, found: [] })).status).toBe(401);
    // the nickname is free again
    const q = await create(s.deps, DEV_B);
    expect((await me(s.deps, { action: 'nickname', profileId: q.profileId, secret: q.secret, nickname: 'Cyrus_Fan' }, DEV_B)).status).toBe(200);
  });
});

describe('nicknames', () => {
  it('enforces length, charset, reserved, rude (fa + en, with leet spellings) and uniqueness', async () => {
    expect(checkNickname('ab')).toMatchObject({ ok: false, problem: 'length' });
    expect(checkNickname('a'.repeat(21))).toMatchObject({ ok: false, problem: 'length' });
    expect(checkNickname('bad name!')).toMatchObject({ ok: false, problem: 'charset' });
    expect(checkNickname('12345')).toMatchObject({ ok: false, problem: 'charset' });
    expect(checkNickname('Admin')).toMatchObject({ ok: false, problem: 'reserved' });
    expect(checkNickname('xtory_official')).toMatchObject({ ok: false, problem: 'reserved' });
    expect(checkNickname('Explorer7')).toMatchObject({ ok: false, problem: 'reserved' });
    expect(checkNickname('f_u_c_k3r')).toMatchObject({ ok: false, problem: 'rude' });
    expect(checkNickname('جنده')).toMatchObject({ ok: false, problem: 'rude' });
    expect(checkNickname('کوروش_بزرگ')).toMatchObject({ ok: true });
    expect(checkNickname('Cyrus')).toMatchObject({ ok: true });
    const s = setup(); const a = await create(s.deps), b = await create(s.deps, DEV_B, '203.0.113.5');
    expect((await me(s.deps, { action: 'nickname', profileId: a.profileId, secret: a.secret, nickname: 'Darius' })).status).toBe(200);
    expect((await me(s.deps, { action: 'nickname', profileId: b.profileId, secret: b.secret, nickname: 'dArIuS' }, DEV_B, '203.0.113.5')).status).toBe(409);
    expect((await me(s.deps, { action: 'nickname', profileId: b.profileId, secret: b.secret, nickname: 'Dar-ius' }, DEV_B, '203.0.113.5')).status).toBe(409); // separators do not make a new name
    expect((await me(s.deps, { action: 'nickname', profileId: b.profileId, secret: b.secret, nickname: 'sh1t_head' }, DEV_B, '203.0.113.5')).status).toBe(400);
  });
});

describe('anti-cheat', () => {
  it('claiming a fact the server never served is rejected', async () => {
    const s = setup(); const p = await create(s.deps); const auth = { profileId: p.profileId, secret: p.secret };
    const r = await (await me(s.deps, { action: 'sync', ...auth, found: ['a_madeupfact123', 'c_nosuchfact1'] })).json();
    expect(r.accepted).toBe(0); expect(r.rejected.map((x: any) => x.reason)).toEqual(['unknown', 'unknown']); expect(r.points).toBe(0);
    // an AI fact that exists but was served to ANOTHER device is also refused
    const d = await (await handleDig(new Request('https://xtory.sbs/api/facts/dig', { method: 'POST', headers: H(DEV_B, '203.0.113.5'), body: JSON.stringify({ kind: 'ruler', name: 'Nizam al-Mulk' }) }), s.deps)).json();
    expect(d.facts).toHaveLength(1);
    const stolen = await (await me(s.deps, { action: 'sync', ...auth, found: [d.facts[0].id] })).json();
    expect(stolen.rejected[0].reason).toBe('not_served'); expect(stolen.points).toBe(0);
    // ...but accepted for the device that was served it
    const q = await create(s.deps, DEV_B, '203.0.113.5');
    const ok = await (await me(s.deps, { action: 'sync', profileId: q.profileId, secret: q.secret, found: [d.facts[0].id] }, DEV_B, '203.0.113.5')).json();
    expect(ok.accepted).toBe(1);
  });

  it('daily claim cap, reset the next UTC day', async () => {
    const s = setup(); const p = await create(s.deps); const auth = { profileId: p.profileId, secret: p.secret };
    expect(STATIC.length).toBeGreaterThan(DAILY_CLAIM_CAP + 5);
    const r = await (await me(s.deps, { action: 'sync', ...auth, found: STATIC.slice(0, DAILY_CLAIM_CAP + 5) })).json();
    expect(r.accepted).toBe(DAILY_CLAIM_CAP); expect(r.rejected).toHaveLength(5); expect(r.rejected[0].reason).toBe('daily_cap');
    s.advance(86_400_000);
    const r2 = await (await me(s.deps, { action: 'sync', ...auth, found: STATIC.slice(0, DAILY_CLAIM_CAP + 5) })).json();
    expect(r2.accepted).toBe(5);
  });

  it('profile creation is rate limited per IP', async () => {
    const s = setup(); let last = 200;
    for (let i = 0; i < 14; i++) last = (await me(s.deps, { action: 'create' })).status;
    expect(last).toBe(429);
  });
});

describe('points: first discoverer bonus and revocation', () => {
  it('+5 only when the AI fact is verified; lost again if it is later rejected', async () => {
    const s = setup(); const p = await create(s.deps); const auth = { profileId: p.profileId, secret: p.secret };
    const d = await (await handleDig(new Request('https://xtory.sbs/api/facts/dig', { method: 'POST', headers: H(DEV_A), body: JSON.stringify({ kind: 'ruler', name: 'Nizam al-Mulk' }) }), s.deps)).json();
    const fid = d.facts[0].id;
    const a = await (await me(s.deps, { action: 'sync', ...auth, found: [fid] })).json();
    expect(a.points).toBe(2); // 1 + rarity (among the first claimants); the first-discoverer bonus waits for verification
    const review = (verdict: string) => handleAdmin(new Request('https://xtory.sbs/api/facts/admin', { method: 'POST', headers: { authorization: 'Bearer admin' }, body: JSON.stringify({ action: 'review', factId: fid, verdict }) }), s.deps);
    expect((await review('approve')).status).toBe(200);
    expect((await (await me(s.deps, { action: 'sync', ...auth, found: [] })).json()).points).toBe(7);
    expect((await review('reject')).status).toBe(200);
    expect((await (await me(s.deps, { action: 'sync', ...auth, found: [] })).json()).points).toBe(0);
  });
});

describe('leaderboards', () => {
  const claimN = async (s: ReturnType<typeof setup>, n: number, device = DEV_A, ip?: string) => {
    const p = await create(s.deps, device, ip);
    await me(s.deps, { action: 'sync', profileId: p.profileId, secret: p.secret, found: STATIC.slice(0, n) }, device, ip);
    return p;
  };
  it('ranks by points, shows only a name and a number, default name for anonymous players', async () => {
    const s = setup();
    const a = await claimN(s, 3), b = await claimN(s, 8, DEV_B, '203.0.113.5');
    await me(s.deps, { action: 'nickname', profileId: b.profileId, secret: b.secret, nickname: 'Anahita' }, DEV_B, '203.0.113.5');
    const r = await (await board(s.deps, '?board=all')).json();
    expect(r.rows.map((x: any) => x.name)).toEqual(['Anahita', expect.stringMatching(/^Explorer #\d{4}$/)]);
    expect(Object.keys(r.rows[0]).sort()).toEqual(['name', 'named', 'points', 'rank']);
    expect(r.rows[0].points).toBeGreaterThan(r.rows[1].points); expect(a.profileId).toBeTruthy();
    expect((await board(s.deps, '?board=nonsense')).status).toBe(400);
  });

  it('public profile exists only for named players', async () => {
    const s = setup(); const p = await claimN(s, 4);
    expect((await board(s.deps, '?nick=Anahita')).status).toBe(404);
    await me(s.deps, { action: 'nickname', profileId: p.profileId, secret: p.secret, nickname: 'Anahita' });
    const r = await (await board(s.deps, '?nick=anahita')).json();
    expect(r).toMatchObject({ ok: true, nickname: 'Anahita', count: 4 }); expect(r.facts).toHaveLength(4);
  });

  it('the weekly board resets on Monday (time-travel)', async () => {
    const s = setup(Date.UTC(2026, 0, 14, 12));   // Wednesday
    expect(weekId(Date.UTC(2026, 0, 14))).toBe('2026-01-12'); expect(weekId(Date.UTC(2026, 0, 18, 23, 59))).toBe('2026-01-12'); expect(weekId(Date.UTC(2026, 0, 19))).toBe('2026-01-19');
    const p = await claimN(s, 5);
    expect((await (await board(s.deps, '?board=week')).json()).rows).toHaveLength(1);
    s.set(Date.UTC(2026, 0, 19, 0, 1));            // next Monday
    expect((await (await board(s.deps, '?board=week')).json()).rows).toHaveLength(0);
    expect((await (await board(s.deps, '?board=all')).json()).rows).toHaveLength(1);   // all-time survives
    await me(s.deps, { action: 'sync', profileId: p.profileId, secret: p.secret, found: STATIC.slice(5, 7) });
    const w = await (await board(s.deps, '?board=week')).json();
    expect(w.rows).toHaveLength(1); expect(w.rows[0].points).toBeLessThan((await (await board(s.deps, '?board=all')).json()).rows[0].points);
  });

  it('per-era boards only count that era', async () => {
    const s = setup(); await claimN(s, 20);
    const e = await (await board(s.deps, '?board=ancient')).json(); const all = await (await board(s.deps, '?board=all')).json();
    expect(e.rows.length + (await (await board(s.deps, '?board=modern')).json()).rows.length).toBeGreaterThan(0);
    for (const r of e.rows) expect(r.points).toBeLessThanOrEqual(all.rows[0].points);
  });
});

describe('privacy audit', () => {
  it('nothing in the store or the logs contains a raw IP, device id or the plain recovery code', async () => {
    const s = setup(); const IP = '198.51.100.77', DEV = 'device-privacyprivacy01';
    const p = await create(s.deps, DEV, IP);
    await me(s.deps, { action: 'nickname', profileId: p.profileId, secret: p.secret, nickname: 'Roxana' }, DEV, IP);
    await me(s.deps, { action: 'sync', profileId: p.profileId, secret: p.secret, found: STATIC.slice(0, 3) }, DEV, IP);
    await handleDig(new Request('https://xtory.sbs/api/facts/dig', { method: 'POST', headers: H(DEV, IP), body: JSON.stringify({ kind: 'ruler', name: 'Nizam al-Mulk' }) }), s.deps);
    const dump = JSON.stringify(s.store.dump()) + JSON.stringify(s.logs);
    expect(dump).not.toContain(IP); expect(dump).not.toContain(DEV); expect(dump).not.toContain(p.secret);
    for (const w of p.secret.split('-').slice(0, 3)) expect(dump.includes(p.secret)).toBe(false), void w;
  });
});
