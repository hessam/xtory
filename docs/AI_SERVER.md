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
