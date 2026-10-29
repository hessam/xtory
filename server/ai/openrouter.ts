export class UpstreamError extends Error {
  /** `detail` says what the provider actually returned (no secrets, no prompt text): surfaced in logs and the error JSON. */
  constructor(public kind: 'rate_limited' | 'payment' | 'timeout' | 'http' | 'empty', public status?: number, public detail?: string) { super(`upstream_${kind}`); }
}

export interface ChatResult { text: string; tokensIn: number; tokensOut: number; model: string }

const approxTokens = (s: string) => Math.ceil(s.length / 3.5);

/** One OpenRouter chat completion in JSON-object mode. `fetchImpl` is injectable for tests. */
export async function chatJson(opts: {
  apiKey: string; model: string; system: string; prompt: string; maxTokens: number; temperature: number;
  timeoutMs: number; referer: string; fetchImpl?: typeof fetch;
  /** ask reasoning-capable models not to spend the token budget on hidden thinking (our tasks need JSON, not chain-of-thought) */
  reasoningOff?: boolean;
}): Promise<ChatResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await (opts.fetchImpl ?? fetch)('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': opts.referer, 'X-Title': 'Xtory' },
      body: JSON.stringify({
        model: opts.model, temperature: opts.temperature, max_tokens: opts.maxTokens,
        response_format: { type: 'json_object' },
        ...(opts.reasoningOff ? { reasoning: { enabled: false } } : {}),
        messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.prompt }],
      }),
    });
    if (res.status === 429) throw new UpstreamError('rate_limited', 429);
    if (res.status === 402) throw new UpstreamError('payment', 402);
    const body: any = await res.json().catch(() => null);
    if (!res.ok) throw new UpstreamError('http', res.status, String(body?.error?.message ?? '').slice(0, 160) || undefined);
    // OpenRouter sometimes answers 200 with an error object instead of choices
    if (body?.error) throw new UpstreamError(body.error.code === 429 ? 'rate_limited' : 'http', res.status, `provider error: ${String(body.error.message ?? body.error.code).slice(0, 160)}`);
    const choice = body?.choices?.[0], msg = choice?.message;
    let raw: unknown = msg?.content;
    if (Array.isArray(raw)) raw = raw.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join(''); // some providers return content parts
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new UpstreamError('empty', res.status, `finish_reason=${choice?.finish_reason ?? 'none'}; reasoning=${msg?.reasoning || msg?.reasoning_content ? 'present' : 'absent'}; completion_tokens=${body?.usage?.completion_tokens ?? '?'}; model=${body?.model ?? opts.model}`);
    }
    const text = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    return {
      text, model: body.model || opts.model,
      tokensIn: body.usage?.prompt_tokens ?? approxTokens(opts.system + opts.prompt),
      tokensOut: body.usage?.completion_tokens ?? approxTokens(raw),
    };
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    if ((e as Error)?.name === 'AbortError') throw new UpstreamError('timeout');
    throw new UpstreamError('http');
  } finally {
    clearTimeout(timer);
  }
}
