import { TASK_IDS, type TaskId } from '../../src/ai/tasks.js';

export interface Limits {
  /** cache MISSES (they cost money) per device */
  deviceMin: number; deviceDay: number;
  /** cache misses per hashed IP per minute (many devices behind one NAT/VPN share this: keep it looser) */
  ipMin: number;
  /** cache HITS per hashed IP per minute (free, but still bounded against scraping) */
  ipHitMin: number;
  /** global tokens per UTC day across everyone: the circuit breaker */
  dailyTokenCap: number;
}

export interface AiConfig {
  enabled: boolean;
  apiKey?: string;
  models: Record<TaskId, string>;
  limits: Limits;
  temperature: number;
  timeoutMs: number;
  maxBodyBytes: number;
  allowedOrigins: string[];
  hashSalt?: string;
  adminToken?: string;
  upstash?: { url: string; token: string };
  isProduction: boolean;
  referer: string;
}

/** Placeholder defaults — deliberately generous. Real numbers come from the usage report (docs/adr/002-ai-provider.md). */
export const DEFAULT_LIMITS: Limits = { deviceMin: 10, deviceDay: 150, ipMin: 40, ipHitMin: 150, dailyTokenCap: 1_500_000 };
export const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017';

const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };

/** All tunables are env vars so limits can change without a deploy of code. Kill switch defaults to OFF. */
export function loadConfig(env: Record<string, string | undefined>): AiConfig {
  const base = env.AI_MODEL || DEFAULT_MODEL;
  const models = Object.fromEntries(TASK_IDS.map(t => [t, env[`AI_MODEL_${t.toUpperCase()}`] || base])) as Record<TaskId, string>;
  return {
    enabled: env.AI_ENABLED === 'true',
    apiKey: env.OPENROUTER_API_KEY || undefined,
    models,
    limits: {
      deviceMin: num(env.AI_RL_DEVICE_MIN, DEFAULT_LIMITS.deviceMin),
      deviceDay: num(env.AI_RL_DEVICE_DAY, DEFAULT_LIMITS.deviceDay),
      ipMin: num(env.AI_RL_IP_MIN, DEFAULT_LIMITS.ipMin),
      ipHitMin: num(env.AI_RL_IP_HIT_MIN, DEFAULT_LIMITS.ipHitMin),
      dailyTokenCap: num(env.AI_DAILY_TOKEN_CAP, DEFAULT_LIMITS.dailyTokenCap),
    },
    temperature: num(env.AI_TEMPERATURE, 0.3),
    timeoutMs: num(env.AI_TIMEOUT_MS, 25_000),
    maxBodyBytes: num(env.AI_MAX_BODY_BYTES, 4096),
    allowedOrigins: (env.AI_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    hashSalt: env.AI_HASH_SALT || undefined,
    adminToken: env.AI_ADMIN_TOKEN || undefined,
    upstash: env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN } : undefined,
    isProduction: env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production',
    referer: env.AI_REFERER || 'https://xtory.sbs',
  };
}
