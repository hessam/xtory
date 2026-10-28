export class UpstreamError extends Error {
  constructor(public kind: 'rate_limited' | 'payment' | 'timeout' | 'http' | 'empty', public status?: number) { super(`upstream_${kind}`); }
}

export interface ChatResult { text: string; tokensIn: number; tokensOut: number; model: string }

const approxTokens = (s: string) => Math.ceil(s.length / 3.5);

/** One OpenRouter chat completion in JSON-object mode. `fetchImpl` is injectable for tests. */
export async function chatJson(opts: {
  apiKey: string; model: string; system: string; prompt: string; maxTokens: number; temperature: number;
  timeoutMs: number; referer: string; fetchImpl?: typeof fetch;
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
        messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.prompt }],
      }),
    });
    if (res.status === 429) throw new UpstreamError('rate_limited', 429);
    if (res.status === 402) throw new UpstreamError('payment', 402);
    if (!res.ok) throw new UpstreamError('http', res.status);
    const body: any = await res.json();
    const raw: string | undefined = body?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') throw new UpstreamError('empty');
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
