/**
 * Slice 8 — anonymous profiles, synced inventory, points and leaderboards.
 *
 *   POST   /api/me  {action:'create'}                                   → {profileId, secret}   (secret = 8 words = the recovery code)
 *   POST   /api/me  {action:'recover', code}                            → {profileId, secret}   (move to another device)
 *   POST   /api/me  {action:'sync', profileId, secret, found:[ids]}     → merge inventory (idempotent), recompute points
 *   POST   /api/me  {action:'nickname', profileId, secret, nickname|null}
 *   POST   /api/me  {action:'delete', profileId, secret}  (also: DELETE /api/me with the same JSON body)
 *   GET    /api/leaderboard?board=all|week|<eraId>&limit=20             → [{rank, name, points, named}]
 *   GET    /api/leaderboard?nick=<nickname>                             → public showcase (named profiles only)
 *
 * Privacy (guardrail 6): no email/phone/location. The secret is stored only as a salted hash; IPs and device ids only
 * ever exist as the daily-rotating hashes the rate limits use. A leaderboard row is a name and a number.
 * Anti-cheat: a fact can be claimed only if it exists server-side and is visible; AI facts also need the server to have
 * served them to this device (written by /api/facts/dig); daily claim cap; unknown ids raise the anomaly counter.
 * Points are RECOMPUTED from the inventory on every sync, so facts the owner later rejects stop counting (revoked).
 */
import { createHash, randomBytes } from 'node:crypto';
import { ERAS } from '../../src/data/eras.js';
import { isVisible } from '../../src/facts/model.js';
import { identify, utcDay } from '../ai/identity.js';
import type { Deps } from '../ai/handler.js';
import type { RichStore } from '../ai/store.js';
import { staticFactMap } from '../facts/static.js';
import { FactStore } from '../facts/store.js';
import { fail, gate, json } from '../facts/handler.js';
import { checkNickname, defaultName } from './nickname.js';
import { WORDS } from './words.js';

const TTL = 10 * 365 * 86400;
export const DAILY_CLAIM_CAP = 80;
const MAX_SYNC_IDS = 400;
const RARE_UNDER = 4;           // +1 when you are among the first 3 to claim a fact
const FIRST_BONUS = 5;          // first claimant of an AI fact, once it is verified
const FACT_ID = /^[ac]_[a-z0-9_]{6,80}$/;

interface Profile { id: string; createdAt: number; nickname?: string; nickKey?: string; nickAt?: number; points: number; count: number; flags: number; day: string; today: number; boards: string[] }
/** inventory entry: at = claimed at; r = rarity bonus; f = first claimant */
type Inventory = Record<string, { at: number; r?: 1; f?: 1 }>;

const sha = (salt: string, v: string) => createHash('sha256').update(`${salt}|secret|${v}`).digest('hex');
const eraOf = (year: number | null) => (year == null ? null : ERAS.find(e => year >= e.start && year < e.end)?.id ?? null);
/** UTC Monday of the week containing `now`, as YYYY-MM-DD */
export function weekId(now: number) {
  const d = new Date(now); const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

const encodeSecret = () => [...randomBytes(8)].map(b => WORDS[b]).join('-');
const normalizeCode = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const parts = raw.toLowerCase().trim().split(/[\s,._-]+/).filter(Boolean);
  return parts.length === 8 && parts.every(p => WORDS.includes(p)) ? parts.join('-') : null;
};

class Profiles {
  constructor(private s: RichStore, private salt: string, private now: () => number) {}
  async get(id: string): Promise<Profile | null> { const r = await this.s.get(`pr:${id}`); return r ? JSON.parse(r) : null; }
  save(p: Profile) { return this.s.set(`pr:${p.id}`, JSON.stringify(p), TTL); }
  async inv(id: string): Promise<Inventory> { const r = await this.s.get(`pi:${id}`); return r ? JSON.parse(r) : {}; }
  saveInv(id: string, inv: Inventory) { return this.s.set(`pi:${id}`, JSON.stringify(inv), TTL); }
  async byCode(code: string) { return this.s.get(`ps:${sha(this.salt, code)}`); }
  async auth(id: unknown, code: unknown): Promise<Profile | null> {
    const c = normalizeCode(code);
    if (typeof id !== 'string' || !/^p_[0-9a-f]{12}$/.test(id) || !c) return null;
    return (await this.byCode(c)) === id ? this.get(id) : null;
  }
  codeKey(code: string) { return sha(this.salt, code); }
  name(p: Profile) { return p.nickname ?? defaultName(p.id); }
}

export async function handleMe(req: Request, deps: Deps): Promise<Response> {
  const g = await gate(req, deps, 16384, ['POST', 'DELETE'], false); if ('res' in g) return g.res;
  const now = (deps.now ?? Date.now)();
  const store = deps.store as RichStore, id = identify(req.headers, deps.config.hashSalt!, now);
  const P = new Profiles(store, deps.config.hashSalt!, () => now);
  const body = g.body as Record<string, any>;
  const action = req.method === 'DELETE' ? 'delete' : body.action;

  if (action === 'create') {
    if ((await store.incr(`rl:pc:${id.ipHash}`, 90000)) > 12) return fail(429, 'rate_limited', { scope: 'profile_create' });
    const profileId = 'p_' + randomBytes(6).toString('hex'), code = encodeSecret();
    const p: Profile = { id: profileId, createdAt: now, points: 0, count: 0, flags: 0, day: utcDay(now), today: 0, boards: [] };
    await P.save(p);
    await store.set(`ps:${sha(deps.config.hashSalt!, code)}`, profileId, TTL);
    return json(200, { ok: true, profileId, secret: code, name: P.name(p) });
  }

  if (action === 'recover') {
    if ((await store.incr(`rl:pa:${id.ipHash}`, 3600)) > 20) return fail(429, 'rate_limited', { scope: 'recover' });
    const code = normalizeCode(body.code); const pid = code ? await P.byCode(code) : null;
    const p = pid ? await P.get(pid) : null;
    if (!code || !p) return fail(404, 'unknown_code');
    return json(200, { ok: true, profileId: p.id, secret: code, name: P.name(p), nickname: p.nickname ?? null, points: p.points, count: p.count });
  }

  if (!['sync', 'nickname', 'delete'].includes(action)) return fail(400, 'invalid_request');
  if ((await store.incr(`rl:pa:${id.ipHash}`, 3600)) > 600) return fail(429, 'rate_limited', { scope: 'profile_ip' });
  const p = await P.auth(body.profileId, body.secret);
  if (!p) return fail(401, 'bad_credentials');

  if (action === 'delete') return json(200, await removeProfile(store, P, p, normalizeCode(body.secret)!));

  if (action === 'nickname') {
    if (body.nickname === null) {
      if (p.nickKey) { await store.srem('nicks', p.nickKey); await store.del(`nk:${p.nickKey}`); }
      delete p.nickname; delete p.nickKey; await P.save(p);
      return json(200, { ok: true, nickname: null, name: P.name(p) });
    }
    const c = checkNickname(body.nickname);
    if (!c.ok) return fail(400, 'invalid_nickname', { problem: (c as { problem: string }).problem });
    if (p.nickAt && now - p.nickAt < 60_000) return fail(429, 'rate_limited', { scope: 'nickname' });
    if (c.key !== p.nickKey) {
      if (!(await store.sadd('nicks', c.key))) return fail(409, 'nickname_taken');
      if (p.nickKey) { await store.srem('nicks', p.nickKey); await store.del(`nk:${p.nickKey}`); }
      await store.set(`nk:${c.key}`, p.id, TTL);
    } else if (!(await store.get(`nk:${c.key}`))) await store.set(`nk:${c.key}`, p.id, TTL);
    p.nickname = c.nickname; p.nickKey = c.key; p.nickAt = now; await P.save(p);
    return json(200, { ok: true, nickname: p.nickname, name: P.name(p) });
  }

  // ---- sync
  const ids: unknown = body.found;
  if (!Array.isArray(ids) || ids.length > MAX_SYNC_IDS || !ids.every(x => typeof x === 'string' && FACT_ID.test(x))) return fail(400, 'invalid_params', { detail: 'found' });
  const facts = new FactStore(store, () => now), statics = staticFactMap();
  const inv = await P.inv(p.id), rejected: { id: string; reason: string }[] = [];
  if (p.day !== utcDay(now)) { p.day = utcDay(now); p.today = 0; }
  const yesterday = identify(req.headers, deps.config.hashSalt!, now - 86_400_000);
  let weeklyGain = 0, accepted = 0;

  for (const fid of [...new Set(ids as string[])]) {
    if (inv[fid]) continue;
    const st = statics.get(fid);
    let ok = !!st;
    if (!st) {
      const f = await facts.get(fid);
      if (!f || f.kind !== 'ai' || !isVisible(f)) { rejected.push({ id: fid, reason: 'unknown' }); p.flags++; continue; }
      ok = !!(await store.get(`sv:${id.deviceHash}:${fid}`)) || !!(await store.get(`sv:${yesterday.deviceHash}:${fid}`));
      if (!ok) { rejected.push({ id: fid, reason: 'not_served' }); p.flags++; continue; }
    }
    if (p.today >= DAILY_CLAIM_CAP) { rejected.push({ id: fid, reason: 'daily_cap' }); p.flags++; continue; }
    const n = await store.incr(`pfc:${fid}`, TTL);   // how many profiles have claimed it (1 = first claimant)
    inv[fid] = { at: now, ...(n < RARE_UNDER ? { r: 1 as const } : {}), ...(n === 1 ? { f: 1 as const } : {}) };
    p.today++; accepted++; weeklyGain += 1 + (inv[fid].r ? 1 : 0);
  }

  // recompute points from the inventory: rejected / disputed facts no longer count (revocation)
  let points = 0, count = 0; const era: Record<string, number> = {};
  for (const [fid, e] of Object.entries(inv)) {
    const f = statics.get(fid) ?? (await facts.get(fid));
    if (!f || !isVisible(f)) continue;
    const pts = 1 + (e.r ? 1 : 0) + (e.f && f.kind === 'ai' && f.status === 'verified' ? FIRST_BONUS : 0);
    points += pts; count++;
    const eid = eraOf(f.year); if (eid) era[eid] = (era[eid] ?? 0) + pts;
  }
  p.points = points; p.count = count;
  await P.saveInv(p.id, inv);
  const boards = new Set(p.boards);
  await store.zadd('lb:all', points, p.id);
  if (weeklyGain) { const w = `lb:w:${weekId(now)}`; await store.zincrby(w, weeklyGain, p.id); boards.add(w); }
  for (const [eid, pts] of Object.entries(era)) { await store.zadd(`lb:e:${eid}`, pts, p.id); boards.add(`lb:e:${eid}`); }
  p.boards = [...boards].slice(-60); await P.save(p);
  return json(200, { ok: true, accepted, rejected, name: P.name(p), nickname: p.nickname ?? null, points, count });
}

async function removeProfile(store: RichStore, P: Profiles, p: Profile, code: string) {
  if (p.nickKey) { await store.srem('nicks', p.nickKey); await store.del(`nk:${p.nickKey}`); }
  for (const b of ['lb:all', ...p.boards]) await store.zrem(b, p.id);
  await store.del(`pi:${p.id}`); await store.del(`pr:${p.id}`);
  await store.del(`ps:${P.codeKey(code)}`);
  return { ok: true, deleted: true };
}

const BOARDS = new Set(['all', 'week', ...ERAS.map(e => e.id)]);

export async function handleBoard(req: Request, deps: Deps): Promise<Response> {
  const g = await gate(req, deps, 0, ['GET'], false); if ('res' in g) return g.res;
  const url = new URL(req.url), store = deps.store as RichStore, now = (deps.now ?? Date.now)();
  const P = new Profiles(store, deps.config.hashSalt!, () => now);

  const nick = url.searchParams.get('nick');
  if (nick) {
    const c = checkNickname(nick); const pid = c.ok ? await store.get(`nk:${c.key}`) : null;
    const p = pid ? await P.get(pid) : null;
    if (!p || !p.nickname) return fail(404, 'not_found');
    const inv = await P.inv(p.id);
    const latest = Object.entries(inv).sort((a, b) => b[1].at - a[1].at).slice(0, 24).map(([fid]) => fid);
    return json(200, { ok: true, nickname: p.nickname, points: p.points, count: p.count, since: p.createdAt, facts: latest });
  }

  const board = url.searchParams.get('board') || 'all';
  if (!BOARDS.has(board)) return fail(400, 'invalid_params', { detail: 'board' });
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const key = board === 'all' ? 'lb:all' : board === 'week' ? `lb:w:${weekId(now)}` : `lb:e:${board}`;
  const rows = await store.zrevrange(key, 0, limit - 1);
  const out = [];
  for (const [i, r] of rows.entries()) {
    const p = await P.get(r.member);
    if (p && r.score > 0) out.push({ rank: i + 1, name: P.name(p), named: !!p.nickname, points: r.score });
  }
  return json(200, { ok: true, board, weekStart: board === 'week' ? weekId(now) : undefined, rows: out });
}
