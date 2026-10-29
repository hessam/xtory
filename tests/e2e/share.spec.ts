import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { mapRoot } from './helpers';

async function open(page: Page, query: string, lang: 'en' | 'fa' = 'en') {
  await page.addInitScript((l) => {
    if (!localStorage.getItem('atlas_intro_seen')) { localStorage.setItem('atlas_intro_seen', '1'); localStorage.setItem('atlas_lang', l); }
    // capture what would go to the OS share sheet
    (navigator as any).canShare = () => true;
    (navigator as any).share = async (d: ShareData) => { const f = d.files![0]; const bytes = new Uint8Array(await f.arrayBuffer()); (window as any).__shared = { name: f.name, type: f.type, size: f.size, magic: [...bytes.slice(0, 4)], text: d.text, b64: (() => { let t = ''; for (let i = 0; i < bytes.length; i += 8192) t += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(t); })() }; };
  }, lang);
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel\.|generativelanguage/, r => r.abort());
  await page.route('**/api/ai/status', r => r.fulfill({ json: { ok: true, enabled: false } }));
  await page.goto('/' + query);
}

for (const lang of ['en', 'fa'] as const) {
  test(`sharing a fact sends a real PNG card with a /f/ link (${lang})`, async ({ page }, info) => {
    await open(page, '?ff=board,discovery,share', lang);
    const r = mapRoot(page);
    await r.getByTestId('discover-btn').click();
    await expect(r.getByTestId('fact-card')).toBeVisible();
    await r.getByTestId('fact-share').click();
    await expect.poll(() => page.evaluate(() => !!(window as any).__shared), { timeout: 8000 }).toBe(true);
    const s = await page.evaluate(() => (window as any).__shared);
    expect(s.type).toBe('image/png'); expect(s.magic).toEqual([137, 80, 78, 71]); expect(s.size).toBeGreaterThan(20000);
    expect(s.text).toMatch(/\/f\/[ac]_/);
    if (process.env.SAVE_CARDS && info.project.name === 'desktop') fs.writeFileSync(`${process.env.SAVE_CARDS}/card-${lang}.png`, Buffer.from(s.b64, 'base64'));
  });
}

test('a shared link opens that fact', async ({ page }) => {
  const facts = JSON.parse(fs.readFileSync('src/data/generated/facts.computed.json', 'utf8')) as { id: string; status: string; hook: { en: string } }[];
  const f = facts.find(x => x.status === 'verified')!;
  await open(page, `?ff=board,discovery,share&fact=${f.id}`);
  await expect(mapRoot(page).getByTestId('fact-hook')).toHaveText(f.hook.en);
});
