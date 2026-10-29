/**
 * Optional anonymous profile (ff_leaderboard). The secret is the 8-word recovery code; it lives on this device and is
 * the only credential. Everything else (points, rank) is computed by the server from the inventory we sync.
 */
import { useSyncExternalStore } from 'react';
import { getDeviceId } from '../services/aiTransport';
import { getState as discoveryState, subscribe as subscribeDiscovery } from '../discovery/store';

const KEY = 'xtory_profile';
export interface Me { profileId: string; secret: string; name: string; nickname: string | null; points: number; count: number }
export interface Row { rank: number; name: string; named: boolean; points: number }
export class ProfileError extends Error { constructor(public code: string, public status = 0, public problem?: string) { super(code); } }

const listeners = new Set<() => void>();
function load(): Me | null {
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r?.profileId && r?.secret ? { points: 0, count: 0, nickname: null, name: '', ...r } : null; } catch { return null; }
}
let me: Me | null = load();
const setMe = (next: Me | null) => {
  me = next;
  try { next ? localStorage.setItem(KEY, JSON.stringify(next)) : localStorage.removeItem(KEY); } catch { /* private mode: lasts for this session */ }
  listeners.forEach(l => l());
};
export const getMe = () => me;
export const useMe = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, getMe, getMe);

async function call(path: string, init: RequestInit & { json?: unknown } = {}) {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', 'x-xtory-device': getDeviceId() }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  } catch { throw new ProfileError('network'); }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new ProfileError(body?.error ?? 'http_' + res.status, res.status, body?.problem);
  return body;
}
const creds = () => ({ profileId: me!.profileId, secret: me!.secret });

export async function join() {
  const r = await call('/api/me', { method: 'POST', json: { action: 'create' } });
  setMe({ profileId: r.profileId, secret: r.secret, name: r.name, nickname: null, points: 0, count: 0 });
  await sync();
}
export async function recover(code: string) {
  const r = await call('/api/me', { method: 'POST', json: { action: 'recover', code } });
  setMe({ profileId: r.profileId, secret: r.secret, name: r.name, nickname: r.nickname, points: r.points, count: r.count });
  await sync();
}

let syncing: Promise<void> | null = null;
/** Push the local inventory to the server (idempotent) and take back the recomputed points. */
export function sync(): Promise<void> {
  if (!me) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const found = Object.keys(discoveryState().found).slice(0, 400);
      const r = await call('/api/me', { method: 'POST', json: { action: 'sync', ...creds(), found } });
      if (me) setMe({ ...me, name: r.name, nickname: r.nickname, points: r.points, count: r.count });
    } catch (e) {
      if (e instanceof ProfileError && e.status === 401) setMe(null);  // profile deleted elsewhere
      else throw e;
    } finally { syncing = null; }
  })();
  return syncing;
}
export async function setNickname(nickname: string | null) {
  const r = await call('/api/me', { method: 'POST', json: { action: 'nickname', ...creds(), nickname } });
  if (me) setMe({ ...me, nickname: r.nickname, name: r.name });
}
export async function remove() {
  await call('/api/me', { method: 'DELETE', json: creds() });
  setMe(null);
}
/** Forget this device only (the profile stays on the server and can be recovered with the code). */
export const signOut = () => setMe(null);

export async function fetchBoard(board: string): Promise<Row[]> { return (await call(`/api/leaderboard?board=${encodeURIComponent(board)}`)).rows; }
export async function fetchShowcase(nick: string): Promise<{ nickname: string; points: number; count: number; facts: string[] }> { return call(`/api/leaderboard?nick=${encodeURIComponent(nick)}`); }

let timer: ReturnType<typeof setTimeout> | undefined, lastCount = -1;
/** Keep the server in step with the device inventory while a profile exists. Returns an unsubscribe. */
export function autoSync(): () => void {
  const off = subscribeDiscovery(() => {
    const n = Object.keys(discoveryState().found).length;
    if (!me || n === lastCount) return;
    lastCount = n; clearTimeout(timer); timer = setTimeout(() => { sync().catch(() => {}); }, 1500);
  });
  return () => { off(); clearTimeout(timer); };
}
