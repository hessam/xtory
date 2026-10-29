import { test, expect, type Page } from '@playwright/test';
import { mapRoot } from './helpers';

async function open(page: Page, query: string, lang: 'en' | 'fa' = 'en') {
  await page.addInitScript((l) => { if (!localStorage.getItem('atlas_intro_seen')) { localStorage.setItem('atlas_intro_seen', '1'); localStorage.setItem('atlas_lang', l); } }, lang);
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel\.|generativelanguage/, r => r.abort());
  await page.route('**/api/ai/status', r => r.fulfill({ json: { ok: true, enabled: false } }));
  await page.goto('/' + query);
}

test.describe('meanwhile (?ff=meanwhile)', () => {
  test('off by default', async ({ page }) => {
    await open(page, '?ff=board');
    await expect(mapRoot(page).getByTestId('discover-btn')).toHaveCount(0);
    await expect(page.getByTestId('meanwhile-btn')).toHaveCount(0);
  });

  test('edge arrows and versus panel work with no backend (any /api call fails the test)', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && u.pathname !== '/api/ai/status') apiCalls.push(u.pathname); });
    await open(page, '?ff=board,meanwhile');
    const r = mapRoot(page);
    await expect(r.getByTestId('meanwhile-btn')).toBeVisible();
    await expect(r.getByTestId('meanwhile-arrows').locator('button').first()).toBeVisible();
    await r.getByTestId('meanwhile-btn').click();
    const panel = r.getByTestId('meanwhile-panel');
    await expect(panel).toBeVisible();
    expect(await panel.getByTestId('meanwhile-row').count()).toBeGreaterThanOrEqual(5);
    await expect(panel.getByTestId('meanwhile-city')).toBeVisible();
    await panel.getByTestId('meanwhile-close').click();
    await expect(panel).toHaveCount(0);
    expect(apiCalls).toEqual([]);
  });

  test('Persian: RTL panel with Persian digits', async ({ page }) => {
    await open(page, '?ff=board,meanwhile', 'fa');
    const r = mapRoot(page);
    await r.getByTestId('meanwhile-btn').click();
    await expect(r.getByTestId('meanwhile-panel').locator('..')).toHaveAttribute('dir', 'rtl');
    await expect(r.getByTestId('meanwhile-year')).toHaveText(/[۰-۹]/);
    await expect(r.getByTestId('meanwhile-city')).toContainText('بزرگ‌ترین شهر جهان');
  });
});
