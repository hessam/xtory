import { test, expect } from '@playwright/test';
import { openApp, isMobile, mapFingerprint } from './helpers';

const vis = (loc: import('@playwright/test').Locator) => loc.locator('visible=true').first();

test.describe('fragmentation mode (?ff=fragmentation)', () => {
  test('is dark by default', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('dynasty-counter')).toHaveCount(0);
  });

  test('shows the dynasty counter and opens the list', async ({ page }) => {
    await openApp(page);
    await page.goto('/?ff=fragmentation');
    const counter = vis(page.getByTestId('dynasty-counter'));
    await expect(counter).toBeVisible();
    await expect(vis(page.getByTestId('dynasty-count'))).toHaveText(/^\d+$/);
    await counter.click();
    await expect(vis(page.getByTestId('dynasty-list'))).toBeVisible();
  });

  test('reach lens: pick a dynasty → caption, dimmed map; clear → restored', async ({ page }) => {
    await openApp(page);
    await page.goto('/?ff=fragmentation');
    const before = await mapFingerprint(page);
    await vis(page.getByTestId('dynasty-counter')).click();
    await vis(page.locator('[data-testid="dynasty-list"] button[data-dynasty]')).click();
    const caption = vis(page.getByTestId('lens-caption'));
    await expect(caption).toBeVisible();
    await expect(caption).toContainText(/held \d+ of 12 regions|not active|outside the 12/);
    await expect.poll(() => mapFingerprint(page)).not.toBe(before);
    await caption.getByRole('button').click();
    await page.mouse.move(0, 0); // leave any hovered polygon so hover styling doesn't skew the fingerprint
    await expect(page.getByTestId('lens-caption')).toHaveCount(0);
    await expect.poll(() => mapFingerprint(page)).toBe(before);
  });

  test('Persian: counter uses Persian digits', async ({ page }) => {
    await openApp(page, 'fa');
    await page.goto('/?ff=fragmentation');
    await expect(vis(page.getByTestId('dynasty-count'))).toHaveText(/^[۰-۹]+$/);
  });

  test('desktop legend lists the dynasties ruling now, each tappable', async ({ page }) => {
    test.skip(isMobile(page));
    await openApp(page);
    await page.goto('/?ff=fragmentation');
    const rows = page.locator('button[data-dynasty]').locator('visible=true');
    await expect(rows.first()).toBeVisible();
    const legendCount = await rows.count();
    await expect(vis(page.getByTestId('dynasty-count'))).toHaveText(String(legendCount));
  });
});
