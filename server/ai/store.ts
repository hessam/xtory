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

export class MemoryStore implements Store {
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
}

/** Upstash Redis over its REST pipeline API: plain fetch, no dependency. */
export class UpstashStore implements Store {
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
}
