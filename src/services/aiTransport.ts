/**
 * Client side of the server AI proxy (/api/ai/*). Used when the user has NOT supplied their own Gemini key
 * (BYOK stays a direct browser → Google call). Only typed tasks are sent; there is no way to send a prompt.
 */
import type { TaskId } from '../ai/tasks';

const DEVICE_KEY = 'xtory_device';

/** Random, anonymous, per-browser id used only for rate limiting (the server hashes it with a daily salt). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous-session-' + Math.random().toString(36).slice(2, 12); // storage blocked: per-page-load id
  }
}

export class AiServerError extends Error {
  constructor(public code: string, public status: number, public retryAfterSec?: number, public scope?: string) { super(`ai_server_${code}`); }
}

export async function askServer<T = unknown>(task: TaskId, params: Record<string, unknown>, lang: 'en' | 'fa', signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/ai/ask', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-xtory-device': getDeviceId() },
      body: JSON.stringify({ task, params, lang }),
    });
  } catch {
    throw new AiServerError('network', 0);
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || !body?.ok) throw new AiServerError(body?.error ?? 'http_' + res.status, res.status, body?.retryAfterSec, body?.scope);
  return body.data as T;
}

let statusPromise: Promise<boolean> | null = null;
/** Is the server AI switched on? (kill switch / misconfiguration → false). Cached for the page's lifetime. */
export function fetchServerAiStatus(): Promise<boolean> {
  statusPromise ??= fetch('/api/ai/status')
    .then(r => (r.ok ? r.json() : { enabled: false, reason: 'http_' + r.status }))
    .then(j => { if (!j.enabled) console.info(`[Xtory] shared AI is off: ${j.reason ?? 'unknown'}`); return !!j.enabled; })
    .catch(() => { console.info('[Xtory] shared AI is off: status request failed'); return false; });
  return statusPromise;
}

/** User-facing message; always points to the BYOK escape hatch when the shared service can't help. */
export function serverErrorMessage(e: AiServerError, lang: 'en' | 'fa'): string {
  const wait = e.retryAfterSec ? Math.max(1, Math.ceil(e.retryAfterSec / 60)) : 1;
  if (e.code === 'rate_limited' && (e.scope === 'device_day'))
    return lang === 'en' ? "⚠️ **You've used today's free AI explorations.**\nCome back tomorrow, or add your own free Gemini key in settings for unlimited use."
      : '⚠️ **سهمیه رایگان امروز شما تمام شد.**\nفردا دوباره سر بزنید، یا برای استفاده نامحدود کلید رایگان جمینای خود را در تنظیمات وارد کنید.';
  if (e.code === 'rate_limited')
    return lang === 'en' ? `⚠️ **Too many requests.**\nPlease wait about ${wait} minute${wait > 1 ? 's' : ''} and try again.`
      : `⚠️ **درخواست‌ها زیاد است.**\nلطفاً حدود ${wait} دقیقه صبر کنید و دوباره تلاش کنید.`;
  if (e.code === 'ai_busy' || e.code === 'budget_exhausted')
    return lang === 'en' ? '⏳ **The AI historian is very busy right now.**\nTry again in a little while, or add your own free Gemini key in settings.'
      : '⏳ **مورخ هوشمند در حال حاضر شلوغ است.**\nکمی بعد دوباره تلاش کنید، یا کلید رایگان جمینای خود را در تنظیمات وارد کنید.';
  if (e.code === 'ai_disabled' || e.code === 'ai_misconfigured' || e.code === 'store_unavailable')
    return lang === 'en' ? '🔌 **AI is not available right now.**\nThe map and timeline work as usual. You can also add your own free Gemini key in settings.'
      : '🔌 **هوش مصنوعی در حال حاضر در دسترس نیست.**\nنقشه و خط زمان طبق معمول کار می‌کنند. می‌توانید کلید رایگان جمینای خود را هم وارد کنید.';
  if (e.code === 'network')
    return lang === 'en' ? '📡 **Connection Error.**\nUnable to reach the AI historian right now. Check your internet or try again in a moment.'
      : '📡 **خطای اتصال.**\nدر حال حاضر دسترسی به هوش مصنوعی امکان‌پذیر نیست. اینترنت خود را چک کنید یا دوباره تلاش کنید.';
  return lang === 'en' ? '⚠️ **The AI historian could not answer.**\nPlease try again.' : '⚠️ **مورخ هوشمند نتوانست پاسخ دهد.**\nلطفاً دوباره تلاش کنید.';
}
