import { createHash } from 'node:crypto';

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

const hash = (salt: string, day: string, value: string) => createHash('sha256').update(`${salt}|${day}|${value}`).digest('hex').slice(0, 16);

export interface Identity { ipHash: string; deviceHash: string }

/**
 * Raw IPs and device ids never leave this function: both are salted-hashed with the UTC day, so the same person
 * has a different hash tomorrow. Enough for rate limiting and daily usage statistics, useless for tracking.
 */
export function identify(headers: Headers, salt: string, now: number): Identity {
  const day = utcDay(now);
  const ip = (headers.get('x-forwarded-for')?.split(',')[0] || headers.get('x-real-ip') || 'unknown').trim();
  const deviceRaw = headers.get('x-xtory-device') || '';
  const device = /^[A-Za-z0-9-]{16,64}$/.test(deviceRaw) ? deviceRaw : `anon:${ip}`;
  return { ipHash: hash(salt, day, `ip:${ip}`), deviceHash: hash(salt, day, `dev:${device}`) };
}
