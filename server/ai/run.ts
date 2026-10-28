import { validate, wrapRoot } from '../../src/ai/schema.js';
import type { BuiltTask } from '../../src/ai/tasks.js';
import { chatJson } from './openrouter.js';
import type { AiConfig } from './config.js';

export class InvalidOutputError extends Error {
  constructor(public tokensIn: number, public tokensOut: number, public problems: string[]) { super('invalid_model_output'); }
}
export interface Structured { data: any; model: string; tokensIn: number; tokensOut: number }

/**
 * One structured model call: JSON mode, validate against the task schema, ONE automatic repair retry that tells the
 * model what was wrong. Array roots are wrapped in {items} on the wire (providers only guarantee JSON objects).
 * Both attempts are charged (tokens summed) so budgets stay honest.
 */
export async function runStructured(cfg: AiConfig, built: BuiltTask, opts: { model: string; maxTokens: number; fetchImpl?: typeof fetch }): Promise<Structured> {
  const wire = wrapRoot(built.schema);
  let tokensIn = 0, tokensOut = 0, problems: string[] = [], prompt = built.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chatJson({ apiKey: cfg.apiKey!, model: opts.model, system: built.system, prompt, maxTokens: opts.maxTokens, temperature: cfg.temperature, timeoutMs: cfg.timeoutMs, referer: cfg.referer, fetchImpl: opts.fetchImpl });
    tokensIn += r.tokensIn; tokensOut += r.tokensOut;
    let parsed: any;
    try { parsed = JSON.parse(r.text); } catch { problems = ['output was not valid JSON']; parsed = undefined; }
    if (parsed !== undefined) {
      problems = validate(parsed, wire);
      if (problems.length === 0) return { data: built.schema.type === 'array' ? parsed.items : parsed, model: r.model, tokensIn, tokensOut };
    }
    prompt = `${built.prompt}\n\nYour previous answer was rejected: ${problems.slice(0, 4).join('; ')}. Return ONLY corrected JSON that matches the schema.`;
  }
  throw new InvalidOutputError(tokensIn, tokensOut, problems);
}
