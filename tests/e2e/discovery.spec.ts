import { test, expect, type Page } from '@playwright/test';
import { isMobile, mapRoot } from './helpers';

async function open(page: Page, query: string, lang: 'en' | 'fa' = 'en', aiOn = false) {
  await page.addInitScript((l) => { if (!localStorage.getItem('atlas_intro_seen')) { localStorage.setItem('atlas_intro_seen', '1'); localStorage.setItem('atlas_lang', l); } }, lang);
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel\.|generativelanguage/, r => r.abort());
  await page.route('**/api/ai/status', r => r.fulfill({ json: { ok: true, enabled: aiOn } }));
  await page.goto('/' + query);
}
const root = (page: Page) => mapRoot(page);

test.describe('discovery (?ff=discovery)', () => {
  test('off by default', async ({ page }) => {
    await open(page, '');
    await expect(page.getByTestId('discover-btn')).toHaveCount(0);
  });

  test('first fact within two taps, survives reload, and does not block the map', async ({ page }) => {
    await open(page, '?ff=board,discovery');
    const btn = root(page).getByTestId('discover-btn');
    await expect(btn).toBeVisible();
    await expect(root(page).getByTestId('discover-progress')).toContainText(/^0 \//);
    await btn.click();
    const card = root(page).getByTestId('fact-card');
    await expect(card).toBeVisible();
    await expect(root(page).getByTestId('fact-hook')).not.toBeEmpty();
    await expect(root(page).getByTestId('discover-progress')).toContainText(/^1 \//);
    // the map is still interactive while the card is open
    await expect(root(page).getByTestId('board-map')).toBeVisible();
    await expect(root(page).getByTestId('fact-dig')).toHaveCount(0); // no shared AI → no Dig deeper
    await root(page).getByTestId('fact-close').click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(root(page).getByTestId('discover-progress')).toContainText(/^1 \//);
  });

  test('hidden sparkles sit on the board and open a card when tapped', async ({ page }) => {
    await open(page, '?ff=board,discovery');
    const sp = root(page).getByTestId('board-sparkle').first();
    await expect(sp).toBeAttached();
    expect(await root(page).getByTestId('board-sparkle').count()).toBeLessThanOrEqual(3);
    // board taps are handled by the camera on pointer-up; dispatch a real tap at the sparkle
    const box = await sp.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(root(page).getByTestId('fact-card')).toBeVisible();
  });

  test('Dig deeper appears with shared AI and adds server facts; Report is accepted', async ({ page }) => {
    let digBody: any = null, reported: any = null;
    await page.route('**/api/facts/dig', r => { digBody = r.request().postDataJSON(); return r.fulfill({ json: { ok: true, facts: [{ id: 'a_test_fact_0001', kind: 'ai', entityType: 'ruler', entityKey: 'ruler:x', entityName: { en: 'X', fa: 'ایکس' }, year: 1, hook: { en: 'Dug hook', fa: 'قلاب' }, claim: { en: 'Dug claim', fa: 'ادعا' }, sources: ['s'], confidence: 'medium', status: 'ai_checked', hash: 'h', sensitive: false, found: 1, reports: 0, history: [], createdAt: 0, updatedAt: 0 }], pending: 0, meta: {} } }); });
    await page.route('**/api/facts/report', r => { reported = r.request().postDataJSON(); return r.fulfill({ json: { ok: true, counted: true, pulledForReview: false } }); });
    await open(page, '?ff=board,discovery,server_ai', 'en', true);
    await root(page).getByTestId('discover-btn').click();
    await root(page).getByTestId('fact-dig').click();
    await expect(root(page).getByTestId('dug-fact')).toContainText('Dug hook');
    expect(Object.keys(digBody).sort()).toEqual(expect.arrayContaining(['kind', 'name']));
    await root(page).getByTestId('fact-report').click();
    await expect.poll(() => reported).toMatchObject({ reason: 'wrong' });
  });

  test('works in Persian and fits a phone', async ({ page }) => {
    await open(page, '?ff=board,discovery', 'fa');
    await root(page).getByTestId('discover-btn').click();
    await expect(root(page).getByTestId('fact-hook')).toContainText(/[؀-ۿ]/);
    const card = await root(page).getByTestId('fact-card').boundingBox();
    const vp = page.viewportSize()!;
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(vp.width + 1);
    if (isMobile(page)) for (const id of ['fact-close', 'fact-share', 'fact-report']) {
      const b = await root(page).getByTestId(id).boundingBox();
      expect(Math.min(b!.width, b!.height), id).toBeGreaterThanOrEqual(36);
    }
  });
});
