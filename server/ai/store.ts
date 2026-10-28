/** Minimal key-value surface the AI server needs. Memory for dev/tests, Upstash Redis (REST) in production. */
export interface Store {
  /** INCR; sets the TTL when the key is created. Returns the new value. */
  incr(key: string, ttlSec: number): Promise<number>;
  incrBy(key: string, n: number, ttlSec: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  /** durable across serverless instances? Rate limits are only meaningful if true. */
  readonly durable: boolean;
}

export class MemoryStore implements RichStore {
  readonly durable = false;
  private m = new Map<string, { v: string; exp: number }>();
  constructor(private now: () => number = Date.now) {}
  private live(key: string) {
    const e = this.m.get(key);
    if (!e) return null;
    if (e.exp <= this.now()) { this.m.delete(key); return null; }
    return e;
  }
  async incr(key: string, ttlSec: number) { return this.incrBy(key, 1, ttlSec); }
  async incrBy(key: string, n: number, ttlSec: number) {
    const e = this.live(key);
    const v = (e ? Number(e.v) : 0) + n;
    this.m.set(key, { v: String(v), exp: e ? e.exp : this.now() + ttlSec * 1000 });
    return v;
  }
  async get(key: string) { return this.live(key)?.v ?? null; }
  async set(key: string, value: string, ttlSec: number) { this.m.set(key, { v: value, exp: this.now() + ttlSec * 1000 }); }
  /** test helper */
  get size() { return this.m.size; }

  private sets = new Map<string, Set<string>>();
  private zsets = new Map<string, Map<string, number>>();
  async sadd(key: string, member: string) { const s = this.sets.get(key) ?? new Set(); this.sets.set(key, s); const had = s.has(member); s.add(member); return !had; }
  async smembers(key: string) { return [...(this.sets.get(key) ?? [])]; }
  async srem(key: string, member: string) { this.sets.get(key)?.delete(member); }
  private z(key: string) { const z = this.zsets.get(key) ?? new Map<string, number>(); this.zsets.set(key, z); return z; }
  async zadd(key: string, score: number, member: string) { this.z(key).set(member, score); }
  async zincrby(key: string, by: number, member: string) { const z = this.z(key); const v = (z.get(member) ?? 0) + by; z.set(member, v); return v; }
  async zrem(key: string, member: string) { this.zsets.get(key)?.delete(member); }
  async zrevrange(key: string, start: number, stop: number) {
    const all = [...(this.zsets.get(key) ?? [])].map(([member, score]) => ({ member, score })).sort((a, b) => b.score - a.score || a.member.localeCompare(b.member));
    return all.slice(start, stop < 0 ? undefined : stop + 1);
  }
  async zcard(key: string) { return this.zsets.get(key)?.size ?? 0; }
  async del(key: string) { this.m.delete(key); this.sets.delete(key); this.zsets.delete(key); }
}

/** Upstash Redis over its REST pipeline API: plain fetch, no dependency. */
export class UpstashStore implements RichStore {
  readonly durable = true;
  constructor(private url: string, private token: string, private fetchImpl: typeof fetch = fetch) {}
  private async pipeline(cmds: (string | number)[][]): Promise<any[]> {
    const res = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
    });
    if (!res.ok) throw new Error(`store_http_${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    const bad = out.find(r => r.error);
    if (bad) throw new Error(`store_error`);
    return out.map(r => r.result);
  }
  async incr(key: string, ttlSec: number) { return this.incrBy(key, 1, ttlSec); }
  async incrBy(key: string, n: number, ttlSec: number) {
    const [v] = await this.pipeline([['INCRBY', key, n], ['EXPIRE', key, ttlSec, 'NX']]);
    return Number(v);
  }
  async get(key: string) { const [v] = await this.pipeline([['GET', key]]); return v === null || v === undefined ? null : String(v); }
  async set(key: string, value: string, ttlSec: number) { await this.pipeline([['SET', key, value, 'EX', ttlSec]]); }

  async sadd(key: string, member: string) { const [n] = await this.pipeline([['SADD', key, member]]); return Number(n) === 1; }
  async smembers(key: string) { const [r] = await this.pipeline([['SMEMBERS', key]]); return (r as string[]) ?? []; }
  async srem(key: string, member: string) { await this.pipeline([['SREM', key, member]]); }
  async zadd(key: string, score: number, member: string) { await this.pipeline([['ZADD', key, score, member]]); }
  async zincrby(key: string, by: number, member: string) { const [v] = await this.pipeline([['ZINCRBY', key, by, member]]); return Number(v); }
  async zrem(key: string, member: string) { await this.pipeline([['ZREM', key, member]]); }
  async zrevrange(key: string, start: number, stop: number) {
    const [r] = await this.pipeline([['ZREVRANGE', key, start, stop, 'WITHSCORES']]);
    const flat = (r as string[]) ?? []; const out: { member: string; score: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) out.push({ member: flat[i], score: Number(flat[i + 1]) });
    return out;
  }
  async zcard(key: string) { const [n] = await this.pipeline([['ZCARD', key]]); return Number(n); }
  async del(key: string) { await this.pipeline([['DEL', key]]); }
}

/** Set / sorted-set operations used by the fact engine (review queue ordered by "times found"). */
export interface RichStore extends Store {
  sadd(key: string, member: string): Promise<boolean>;      // true if newly added
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zincrby(key: string, by: number, member: string): Promise<number>;
  zrem(key: string, member: string): Promise<void>;
  /** highest score first */
  zrevrange(key: string, start: number, stop: number): Promise<{ member: string; score: number }[]>;
  zcard(key: string): Promise<number>;
  del(key: string): Promise<void>;
}
