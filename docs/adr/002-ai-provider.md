# ADR 002 — Shared AI through a server proxy (OpenRouter)

- **Status:** Implemented behind `ff_server_ai` and the server kill switch (**off by default**). Provider-terms question below is **open**.
- **Date:** 2026-10-28
- **Decision by owner:** writer model `deepseek/deepseek-v4.1-flash-1017` via OpenRouter; usage limits are **not** set yet — measure first.

## Context
Until now every AI feature required the visitor's own Gemini key (BYOK). Most casual users — and, because Google's Gemini API is not
offered in Iran, most Iranian users without a VPN — never get AI at all. Goals: AI works without a key, cost is bounded, and no secret
ever reaches the browser.

## Decision
`POST /api/ai/ask` (Vercel Node function) runs **typed tasks only**: `year_dynasties`, `ruler_detail`, `events`, `figures`,
`artifacts`, `quiz`, `dig_deeper`. The browser sends `{task, params, lang}`; the server validates the params strictly (unknown keys
rejected, ranges enforced), builds the prompt itself (`src/ai/tasks.ts`), calls OpenRouter in JSON mode, validates the output against
the task schema (one automated repair retry), applies the same mechanical guards the client had ("null beats a fabrication",
reign ≤ 80 years, no leaked dynasty dates, coordinates must fall inside the atlas, a fact needs a source), caches, and returns it.
There is no way to send a prompt, so the endpoint cannot be used as a free LLM.
BYOK is unchanged and always wins when a personal key is set (direct browser → Google).

### Controls
| Control | How |
|---|---|
| Kill switch | `AI_ENABLED` must be exactly `true`; default off. `/api/ai/status` reports readiness so the UI never promises AI that is off. |
| Shared answer cache | key = prompt-version + task + canonical params (+ language only where the answer is single-language); 30-day TTL; identical concurrent misses pay once. |
| Per-device / per-IP limits | fixed windows in Upstash Redis; **only cache misses are charged** (hits cost nothing); hits have a loose per-IP anti-scrape ceiling. |
| Global breaker | tokens per UTC day (`AI_DAILY_TOKEN_CAP`); when hit, paid calls return 503 while cached answers still flow. |
| Production safety | refuses to serve without a durable store (memory limits across serverless instances would be fake) and without a hash salt. |
| Privacy | raw IP and device id are never stored or logged: both are salted-hashed with the UTC day (daily rotation), used only for limits and statistics. |
| Origin | same-origin (or `AI_ALLOWED_ORIGINS`) only. |
| Secrets | `OPENROUTER_API_KEY` exists only in Vercel env; CI scans the build for key patterns. |

### Measure first, then set limits
All limits are env vars with generous placeholder defaults (`AI_RL_DEVICE_MIN=10`, `AI_RL_DEVICE_DAY=150`, `AI_RL_IP_MIN=40`,
`AI_RL_IP_HIT_MIN=150`, `AI_DAILY_TOKEN_CAP=1,500,000`). `GET /api/ai/usage?day=YYYY-MM-DD` (bearer `AI_ADMIN_TOKEN`) reports, per task:
requests, cache hit rate, errors, tokens in/out, average tokens per paid call; plus total tokens, an **hourly traffic shape**, and a
**histogram of how many devices crossed 1k / 5k / 10k / 25k / 50k / 100k / 250k tokens that day**. That histogram is how to choose between
the three limit styles you mentioned:
- **tokens per user per day** — pick the threshold that covers ~95% of devices (read from the histogram);
- **requests per minute** — set from burst behaviour (`AI_RL_DEVICE_MIN`, hourly peaks);
- **tokens per minute / global** — set `AI_DAILY_TOKEN_CAP` from total tokens and the hourly curve.
Per-user *token* caps are not enforced yet by design (only counted); request-count caps are.

## Open question — provider terms for users in Iran (NOT resolved)
A web search did not find an explicit statement. What is known: our server (outside Iran) is the customer; Iranian users only talk to
our domain. But OpenRouter and the upstream model providers each have their own terms and may restrict models by region or sanctions
policy, and OpenRouter's terms say users must follow the policies of the providers behind each model. Secondary sources claim OpenRouter
may restrict access on suspicion of provider-term violations; I could not verify against the current official text.
**Owner action:** read the current [OpenRouter terms](https://openrouter.ai/terms) and the chosen provider's usage policy/privacy policy
(DeepSeek's servers are reported to be in China; OpenRouter can route to other hosts), and decide whether serving Iranian users is acceptable
for you. Technical mitigation already in place: no user data is sent to the model — only topic parameters (a year, a dynasty name).
If this turns out to be a blocker, the fallback is a different provider/host behind the same task interface (change `AI_MODEL*` or `openrouter.ts`).

## Also decided / consequences
- The fact-checker model for Slice 6 must be a different model family from the writer (not DeepSeek); to be chosen then.
- Prompts now exist twice: server tasks (`src/ai/tasks.ts`) and the older BYOK prompts in `geminiService.ts`. Consolidating BYOK onto
  the shared builders is planned with Slice 6. Server `year_dynasties` uses the curated **registry** (merged dynasty names) instead of raw files.
- Biography, alternate-history, what-if, lineage, chat and search stay BYOK-only for now (not part of this slice).
- Bug fixed on the way: the old events/artifacts prompts asked for coordinates on an invented 0–1000 grid but the map plots them as
  `[lat, lng]`, so AI-created events were off the map. Prompts now ask for real lat/lng and anything outside the atlas is dropped (BYOK path fixed too).
- Function bundles `api/ai/*.js` are generated (esbuild) and committed so a deploy never depends on TypeScript/ESM/JSON resolution;
  CI fails if they drift (`npm run api:check`).
