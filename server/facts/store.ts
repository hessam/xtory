/**
 * Fact persistence on top of the shared Redis-style store (see docs/adr/003-fact-engine.md: Redis now, git export is
 * the durable audit record). Indexes:  fq:<status> (zset by times-found), fe:<entityKey> (set), fh:<hash> → id,
 * fr:<id> (reporter device hashes), freported (zset id → report count, also covers static facts).
 */
import type { RichStore } from '../ai/store.js';
import { canTransition, type Fact, type FactStatus } from '../../src/facts/model.js';

const TTL = 10 * 365 * 86400;
export const STATUSES: FactStatus[] = ['unverified', 'ai_checked', 'verified', 'disputed', 'rejected'];

export class FactStore {
  constructor(private s: RichStore, private now: () => number = Date.now) {}

  async get(id: string): Promise<Fact | null> { const raw = await this.s.get(`fact:${id}`); return raw ? (JSON.parse(raw) as Fact) : null; }
  async byHash(hash: string): Promise<Fact | null> { const id = await this.s.get(`fh:${hash}`); return id ? this.get(id) : null; }
  async byEntity(entityKey: string): Promise<Fact[]> {
    const ids = await this.s.smembers(`fe:${entityKey}`);
    return (await Promise.all(ids.map(id => this.get(id)))).filter((f): f is Fact => !!f);
  }

  /** Insert a new fact and index it. */
  async create(f: Fact): Promise<void> {
    await this.s.set(`fact:${f.id}`, JSON.stringify(f), TTL);
    await this.s.set(`fh:${f.hash}`, f.id, TTL);
    await this.s.sadd(`fe:${f.entityKey}`, f.id);
    await this.s.zadd(`fq:${f.status}`, f.found, f.id);
  }

  private async save(f: Fact) { f.updatedAt = this.now(); await this.s.set(`fact:${f.id}`, JSON.stringify(f), TTL); }

  /** A user found this fact (again). Order of review follows how often facts are found. */
  async bump(id: string): Promise<Fact | null> {
    const f = await this.get(id); if (!f) return null;
    f.found += 1;
    await this.save(f);
    await this.s.zincrby(`fq:${f.status}`, 1, f.id);
    return f;
  }

  async transition(id: string, to: FactStatus, by: string, note?: string): Promise<{ ok: true; fact: Fact } | { ok: false; reason: string }> {
    const f = await this.get(id); if (!f) return { ok: false, reason: 'not_found' };
    const t = canTransition(f, to); if (!t.ok) return { ok: false, reason: t.reason! };
    const from = f.status;
    await this.s.zrem(`fq:${from}`, f.id);
    f.status = to;
    f.history.push({ at: this.now(), event: `${from}→${to}`, by, note });
    // points earned from a verified fact are revoked when it is later rejected (consumed by the leaderboard, Slice 8)
    if (from === 'verified' && to === 'rejected') f.history.push({ at: this.now(), event: 'points_revoked', by });
    await this.save(f);
    await this.s.zadd(`fq:${to}`, f.found, f.id);
    return { ok: true, fact: f };
  }

  /** Edit text/sources (admin). The hash follows the English claim so dedupe keeps working. */
  async edit(id: string, patch: Partial<Pick<Fact, 'hook' | 'claim' | 'context' | 'sources'>>, hashOf: (f: Fact) => string, by: string): Promise<Fact | null> {
    const f = await this.get(id); if (!f) return null;
    Object.assign(f, patch);
    const old = f.hash; f.hash = hashOf(f);
    if (old !== f.hash) await this.s.set(`fh:${f.hash}`, f.id, TTL);
    f.history.push({ at: this.now(), event: 'edited', by });
    await this.save(f);
    return f;
  }

  async queue(status: FactStatus, limit = 50): Promise<Fact[]> {
    const rows = await this.s.zrevrange(`fq:${status}`, 0, limit - 1);
    return (await Promise.all(rows.map(r => this.get(r.member)))).filter((f): f is Fact => !!f);
  }
  async count(status: FactStatus) { return this.s.zcard(`fq:${status}`); }

  /** One report per device per fact. Works for static (computed) facts too, which have no stored record. */
  async report(factId: string, deviceHash: string): Promise<{ counted: boolean; total: number }> {
    const isNew = await this.s.sadd(`fr:${factId}`, deviceHash);
    if (!isNew) return { counted: false, total: await this.s.zincrby('freported', 0, factId) };
    const total = await this.s.zincrby('freported', 1, factId);
    const f = await this.get(factId);
    if (f) { f.reports += 1; await this.save(f); }
    return { counted: true, total };
  }
  async reported(limit = 50): Promise<{ id: string; reports: number }[]> {
    return (await this.s.zrevrange('freported', 0, limit - 1)).filter(r => r.score > 0).map(r => ({ id: r.member, reports: r.score }));
  }
  async clearReports(factId: string) { await this.s.zrem('freported', factId); await this.s.del(`fr:${factId}`); }

  async exportVerified(): Promise<Fact[]> {
    const all = await this.s.zrevrange('fq:verified', 0, -1);
    return (await Promise.all(all.map(r => this.get(r.member)))).filter((f): f is Fact => !!f && f.kind !== 'computed');
  }
}
