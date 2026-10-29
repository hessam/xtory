/**
 * Local API server for trying the AI proxy and the fact engine without Vercel or Redis.
 *   npm run dev:api        (port 8787)   +   npm run dev   (Vite on :3000 proxies /api → :8787)
 * Reads .env.local then .env (git-ignored). Everything runs in ONE process, so the in-memory store is shared and the whole
 * loop (ask → cache → dig → review → export) works locally. Data is lost when you stop it; production uses Upstash.
 */
import http from 'node:http';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const { handleAsk, handleStatus, handleUsage, depsFromEnv } = await import('../server/ai/handler.js');
const { handleDig, handleReport, handleAdmin } = await import('../server/facts/handler.js');
const { handleMe, handleBoard } = await import('../server/profile/handler.js');
const { nodeAdapter } = await import('../server/entry/node.js');
const { checkerUsable } = await import('../server/ai/config.js');

const deps = depsFromEnv();
const routes: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>> = {
  '/api/ai/ask': nodeAdapter(r => handleAsk(r, deps)),
  '/api/ai/status': nodeAdapter(() => handleStatus(deps)),
  '/api/ai/usage': nodeAdapter(r => handleUsage(r, deps)),
  '/api/facts/dig': nodeAdapter(r => handleDig(r, deps)),
  '/api/facts/report': nodeAdapter(r => handleReport(r, deps)),
  '/api/facts/admin': nodeAdapter(r => handleAdmin(r, deps)),
  '/api/me': nodeAdapter(r => handleMe(r, deps)),
  '/api/leaderboard': nodeAdapter(r => handleBoard(r, deps)),
};

const server = http.createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  const route = routes[path];
  if (!route) { res.statusCode = 404; res.end('not found'); return; }
  route(req, res).catch(err => { console.error(err); res.statusCode = 500; res.end('error'); });
});

const c = deps.config;
const checker = checkerUsable(c);
const line = (ok: boolean, text: string) => console.log(`  ${ok ? '✓' : '✗'} ${text}`);
server.listen(Number(process.env.PORT) || 8787, () => {
  console.log(`\nXtory dev API on http://localhost:${(server.address() as { port: number }).port}`);
  line(c.enabled, `AI_ENABLED=true ${c.enabled ? '' : '— server AI is OFF (set it in .env.local)'}`);
  line(!!c.apiKey, `OPENROUTER_API_KEY ${c.apiKey ? 'set' : 'missing'}`);
  line(!!c.hashSalt, `AI_HASH_SALT ${c.hashSalt ? 'set' : 'missing (any random string)'}`);
  line(!!c.adminToken, `AI_ADMIN_TOKEN ${c.adminToken ? 'set (review page + usage report)' : 'missing (needed for #/admin/review and /api/ai/usage)'}`);
  line(checker.ok, checker.ok ? `fact checker: ${checker.model}` : `fact checker: ${checker.reason === 'same_family' ? 'same vendor as the writer — refused' : 'AI_CHECKER_MODEL not set'} (AI facts will be stored but not shown)`);
  console.log(`  writer model: ${c.models.dig_deeper}\n  store: in-memory (resets on restart)\n`);
});
