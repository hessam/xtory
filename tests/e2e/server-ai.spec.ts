import { test, expect, type Page } from '@playwright/test';
import { isMobile } from './helpers';

const ITEM = { dynastyNameEn: 'Achaemenid Empire', dynastyNameFa: 'هخامنشی', dynastyColorFamily: 'persian', dynastyClassification: 'Empire', capitalCityEn: 'Persepolis', capitalCityFa: 'پرسپولیس', dynastyStartYear: -550, dynastyEndYear: -330, regionId: 'fars', status: 'Direct Control', confidence: 'high', rulerNameEn: null, rulerNameFa: null, rulerTitleEn: null, rulerTitleFa: null, rulerReignStart: null, rulerReignEnd: null };

async function open(page: Page, query: string, statusEnabled = true) {
  await page.addInitScript(() => localStorage.setItem('atlas_intro_seen', '1'));
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel\.|generativelanguage/, r => r.abort());
  await page.route('**/api/ai/status', r => r.fulfill({ json: { ok: true, enabled: statusEnabled } }));
  await page.goto('/' + query);
}
const rulersBtn = (page: Page) => page.locator(isMobile(page) ? '#tour-timeline-ai-mobile' : '#tour-timeline-ai-desktop').locator('visible=true').first();

test.describe('server AI (?ff=server_ai)', () => {
  test('without the flag AI stays disabled until the user adds a key', async ({ page }) => {
    await open(page, '');
    await expect(rulersBtn(page)).toBeDisabled();
  });

  test('flag on + server enabled: AI works without a key and sends only a typed task', async ({ page }) => {
    let sent: any = null, headers: Record<string, string> = {};
    await page.route('**/api/ai/ask', async r => { sent = r.request().postDataJSON(); headers = r.request().headers(); await r.fulfill({ json: { ok: true, data: [ITEM], meta: { cache: 'miss', task: 'year_dynasties' } } }); });
    await open(page, '?ff=server_ai');
    await expect(rulersBtn(page)).toBeEnabled();
    await rulersBtn(page).click();
    await expect.poll(() => sent).not.toBeNull();
    expect(Object.keys(sent).sort()).toEqual(['lang', 'params', 'task']);
    expect(sent.task).toBe('year_dynasties');
    expect(sent.params).toEqual({ year: -500 });
    expect(headers['x-xtory-device']).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    await expect(page.getByText('Historian Unavailable')).toHaveCount(0);
  });

  test('flag on but server kill switch off: buttons stay disabled', async ({ page }) => {
    await open(page, '?ff=server_ai', false);
    await expect(rulersBtn(page)).toBeDisabled();
  });

  test('daily limit shows a friendly message that points to the personal-key option', async ({ page }) => {
    await page.route('**/api/ai/ask', r => r.fulfill({ status: 429, json: { ok: false, error: 'rate_limited', scope: 'device_day', retryAfterSec: 3600 } }));
    await open(page, '?ff=server_ai');
    await rulersBtn(page).click();
    await expect(page.getByText(/used today's free AI explorations/)).toBeVisible();
  });

  test('the device id is stable across calls', async ({ page }) => {
    const ids: string[] = [];
    await page.route('**/api/ai/ask', async r => { ids.push(r.request().headers()['x-xtory-device']); await r.fulfill({ json: { ok: true, data: [], meta: {} } }); });
    await open(page, '?ff=server_ai');
    await rulersBtn(page).click(); await expect.poll(() => ids.length).toBe(1);
    await page.waitForTimeout(300);
    await rulersBtn(page).click(); await expect.poll(() => ids.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ids).size).toBe(1);
  });
});
