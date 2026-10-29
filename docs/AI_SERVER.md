# Shared AI server — setup & operations

Code: `server/ai/` (logic), `server/entry/` (Vercel entries), `src/ai/` (typed tasks, shared with the browser), generated bundles in `api/ai/`.
Decision record and limits philosophy: `docs/adr/002-ai-provider.md`.

## Turn it on (Vercel → Project → Settings → Environment Variables)
| Variable | Required | Notes |
|---|---|---|
| `AI_ENABLED` | yes | `true` to enable. Anything else = off (kill switch; no redeploy of code needed, just redeploy env). |
| `OPENROUTER_API_KEY` | yes | Server only. Never prefix with `VITE_`. |
| `AI_HASH_SALT` | yes | Long random string. Used to hash IPs/devices; rotating it resets everyone's counters. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | yes in production | Upstash Redis (free tier is enough to start). Without it production refuses to serve. |
| `AI_ADMIN_TOKEN` | to read usage | Bearer token for `/api/ai/usage`. |
| `AI_MODEL` | no | Default `deepseek/deepseek-v4.1-flash-1017`. Per task: `AI_MODEL_EVENTS`, `AI_MODEL_QUIZ`, … |
| `AI_RL_DEVICE_MIN` / `AI_RL_DEVICE_DAY` / `AI_RL_IP_MIN` / `AI_RL_IP_HIT_MIN` | no | Defaults 10 / 150 / 40 / 150 (placeholders until measured). |
| `AI_DAILY_TOKEN_CAP` | no | Global tokens per UTC day. Default 1,500,000. |
| `AI_CHECKER_MODEL` | for AI facts | Second model that judges AI-written facts. **Must be a different vendor than the writer** (not `deepseek/…`). Unset or same-vendor = no AI fact is ever shown. |
| `AI_FACT_REPORT_THRESHOLD` | no | Distinct user reports that pull a visible fact back to review. Default 2. |
| `AI_ALLOWED_ORIGINS` | no | Extra origins (comma separated), e.g. a preview URL. |
| `AI_TEMPERATURE`, `AI_TIMEOUT_MS`, `AI_MAX_BODY_BYTES`, `AI_REFERER` | no | Rarely needed. |

Then open the site with `?ff=server_ai` (or build with `VITE_FF_SERVER_AI=1`). Without a personal key, AI buttons are enabled only when
`/api/ai/status` says the server is ready. To switch everything off instantly: set `AI_ENABLED=false` and redeploy.

## Read the numbers (decide the limits)
```
curl -H "Authorization: Bearer $AI_ADMIN_TOKEN" "https://xtory.sbs/api/ai/usage?day=2026-11-01"
```
Look at `tasks.*.hitRate` (cache working?), `avgTokensPerMiss` (cost per paid call), `hours` (traffic shape) and `devicesOverTokens`
(how many devices used more than N tokens that day). Change limits by editing the env vars; no code change.

## Change code
Edit `server/` or `src/ai/`, then `npm run api:build` and commit `api/ai/*.js` (CI runs `npm run api:check`).
Local check: `npm test` (offline, fake provider and store).

## Fact engine (Slice 6)
Endpoints: `POST /api/facts/dig`, `POST /api/facts/report` (public, same limits), `/api/facts/admin` (owner, Bearer `AI_ADMIN_TOKEN`).
Review UI: open `https://xtory.sbs/#/admin/review`, enter the admin token, work the queue, then **Export → ai.json** and commit it to `data/facts/verified/`
(or run `FACTS_URL=https://xtory.sbs AI_ADMIN_TOKEN=… npm run facts:export`). Details and rules: `docs/adr/003-fact-engine.md`.
Static facts need nothing: `npm run facts:build` regenerates `src/data/generated/facts.computed.json` (CI fails on drift: `npm run facts:check`).
Local note: the in-memory store is per function, so the review loop can only be tried end to end against a real Upstash database (unit tests cover it with fakes).

## How to test it

**1. Offline, no keys (always safe):** `npm test` (159 unit tests: limits, cache, kill switch, fact checks, review flow with a fake provider and store) and `npm run test:e2e`.

**2. On your machine with your real key (no Vercel, no Redis):**
1. Create `.env.local` in the repo root (git-ignored):
   ```
   AI_ENABLED=true
   OPENROUTER_API_KEY=sk-or-...        # your OpenRouter key
   AI_HASH_SALT=any-long-random-string
   AI_ADMIN_TOKEN=pick-a-password      # for the review page and /api/ai/usage
   AI_CHECKER_MODEL=vendor/model-id    # optional; a NON-DeepSeek model from openrouter.ai/models (needed to *show* AI facts)
   ```
2. Terminal A: `npm run dev:api` (prints a checklist of what is configured). Terminal B: `npm run dev`.
3. Open `http://localhost:3000/?ff=server_ai` — with no personal key the AI buttons (e.g. "Who ruled here?") should now be enabled. Click one; click it again for the same year and it is instant (cache).
4. Usage numbers: `curl -H "Authorization: Bearer pick-a-password" localhost:8787/api/ai/usage`.
5. Review page: `http://localhost:3000/#/admin/review` (token = `AI_ADMIN_TOKEN`).
6. Fact engine from the terminal:
   ```
   curl -s -XPOST localhost:8787/api/facts/dig -H 'content-type: application/json' \
        -d '{"kind":"ruler","name":"Yazdgerd III","year":651}'
   ```
   Without `AI_CHECKER_MODEL` you get `"facts":[]` and `"pending":N` (written, stored, hidden until you approve them on the review page). With it, checked facts come back with `"badge":"ai_checked"`.
The dev API keeps everything in memory (one process, so the whole loop works); data is lost when you stop it.

**3. On a Vercel preview (the real thing):** set the env vars for the *Preview* environment (plus the two Upstash ones), redeploy, then repeat step 3-6 against the preview URL. Check `/api/ai/status` returns `{"enabled":true}` first.
