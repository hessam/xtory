import { describe, it, expect } from 'vitest';
import { handleUnfurl } from './handler';
import { handleMe } from '../profile/handler';
import { loadConfig } from '../ai/config';
import { MemoryStore } from '../ai/store';
import type { Deps } from '../ai/handler';
import { staticFactMap } from '../facts/static';

const deps = (): Deps => ({ config: loadConfig({ AI_ENABLED: 'true', OPENROUTER_API_KEY: 'sk-or-test-1234567890', AI_HASH_SALT: 'salt' }), store: new MemoryStore() });
const get = (d: Deps, q: string, h: Record<string, string> = {}) => handleUnfurl(new Request(`https://xtory.sbs/api/unfurl${q}`, { headers: h }), d);
const FACT = [...staticFactMap().values()][0];

describe('link unfurls', () => {
  it('a fact page carries OG/Twitter tags, the image, and sends people to the app', async () => {
    const r = await get(deps(), `?fact=${FACT.id}&lang=en`); const h = await r.text();
    expect(r.status).toBe(200);
    expect(h).toContain('og:title'); expect(h).toContain('twitter:card'); expect(h).toContain('og:image" content="https://xtory.sbs/og-preview.png');
    expect(h).toContain(`/?ff=`); expect(h).toContain(`fact=${FACT.id}`);
    expect(h).toContain(FACT.hook.en.slice(0, 20).replace(/&/g, '&amp;'));
  });
  it('Persian by Accept-Language, right-to-left', async () => {
    const h = await (await get(deps(), `?fact=${FACT.id}`, { 'accept-language': 'fa-IR,fa;q=0.9' })).text();
    expect(h).toContain('lang="fa"'); expect(h).toContain('dir="rtl"');
  });
  it('unknown / malformed ids are 404, and markup is escaped', async () => {
    expect((await get(deps(), '?fact=a_doesnotexist12')).status).toBe(404);
    expect((await get(deps(), '?fact="><script>alert(1)</script>')).status).toBe(404);
    expect((await get(deps(), '')).status).toBe(404);
  });
  it('profile page only for named players, showing counts and no id', async () => {
    const d = deps();
    const mk = (b: unknown) => handleMe(new Request('https://xtory.sbs/api/me', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' }, body: JSON.stringify(b) }), d);
    const p = await (await mk({ action: 'create' })).json();
    expect((await get(d, '?nick=Anahita')).status).toBe(404);
    await mk({ action: 'nickname', profileId: p.profileId, secret: p.secret, nickname: 'Anahita' });
    const r = await get(d, '?nick=anahita&lang=en'); const h = await r.text();
    expect(r.status).toBe(200); expect(h).toContain('Anahita on Xtory'); expect(h).not.toContain(p.profileId); expect(h).not.toContain(p.secret);
  });
});
