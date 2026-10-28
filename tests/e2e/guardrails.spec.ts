import { test, expect } from '@playwright/test';
import { openApp, isMobile, mapRoot, langToggle, mapFingerprint } from './helpers';

// Automates the checkable items of docs/guardrails/GUARDRAILS.md.

test.describe('map', () => {
  test('renders region polygons and loads without page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page);
    await expect(mapRoot(page).locator('path.region-polygon').first()).toBeVisible();
    expect(await mapRoot(page).locator('path.region-polygon').count()).toBeGreaterThanOrEqual(12);
    expect(errors).toEqual([]);
  });

  test('clicking a region opens the detail panel', async ({ page }) => {
    await openApp(page);
    const poly = mapRoot(page).locator('path.region-polygon').nth(3);
    await poly.waitFor();
    await poly.dispatchEvent('click');
    await expect(page.locator('.fixed.inset-0').first()).toBeVisible();
  });

  test('zoom in/out controls change zoom', async ({ page }) => {
    test.skip(isMobile(page), 'zoom buttons are desktop-only; mobile uses pinch');
    await openApp(page);
    const before = await mapRoot(page).locator('.leaflet-zoom-animated').first().getAttribute('style');
    await mapRoot(page).locator('button:has(svg.lucide-zoom-in)').click();
    await page.waitForTimeout(600);
    const after = await mapRoot(page).locator('.leaflet-zoom-animated').first().getAttribute('style');
    expect(after).not.toBe(before);
  });
});

test.describe('timeline & era context', () => {
  test('timeline is visible', async ({ page }) => {
    await openApp(page);
    await expect(page.locator(isMobile(page) ? '#tour-timeline-mobile' : '#tour-timeline-desktop')).toBeVisible();
  });

  test('context strip shows the era and year', async ({ page }) => {
    await openApp(page);
    await expect(page.getByText('Achaemenid Empire').locator('visible=true').first()).toBeVisible();
    await expect(page.getByText('500 BC').locator('visible=true').first()).toBeVisible();
  });

  test('"Who ruled here?" is disabled without an API key but not hidden', async ({ page }) => {
    await openApp(page);
    // Both layouts are mounted (and ids duplicated) — see Slice 4 — so target the visible one.
    const btn = page.locator(isMobile(page) ? '#tour-timeline-ai-mobile' : '#tour-timeline-ai-desktop').locator('visible=true').first();
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test('era navigation changes the year, context strip and map colours', async ({ page }) => {
    test.skip(isMobile(page), 'era chips live in the half/full sheet on mobile');
    await openApp(page);
    const before = await mapFingerprint(page);
    await page.locator('button').filter({ hasText: /Hellen/i }).locator('visible=true').first().click();
    await expect(page.getByText(/Hellen/i).locator('visible=true').first()).toBeVisible();
    await expect.poll(() => mapFingerprint(page)).not.toBe(before);
  });
});

test.describe('panels', () => {
  test('desktop: historian panel is open by default', async ({ page }) => {
    test.skip(isMobile(page));
    await openApp(page);
    const panel = page.locator('#historian-pivot-trigger').locator('xpath=..');
    expect((await panel.boundingBox())?.width).toBeGreaterThan(300);
  });

  test('mobile: drawer is present and timeline stays visible', async ({ page }) => {
    test.skip(!isMobile(page));
    await openApp(page);
    await expect(page.locator('#tour-events-panel-mobile')).toBeVisible();
    await expect(page.locator('#tour-timeline-mobile')).toBeVisible();
  });
});

test.describe('language', () => {
  test('EN/FA toggle flips direction, lang and UI text', async ({ page }) => {
    await openApp(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await langToggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.getByText('امپراتوری هخامنشی').locator('visible=true').first()).toBeVisible();
    await expect(page.getByText('۵۰۰ ق.م').locator('visible=true').first()).toBeVisible();
    await langToggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('persisted Persian choice loads RTL', async ({ page }) => {
    await openApp(page, 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});

test('Ctrl/Cmd+K opens search', async ({ page }) => {
  test.skip(isMobile(page), 'keyboard shortcut');
  await openApp(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('input:visible').first()).toBeVisible();
});
