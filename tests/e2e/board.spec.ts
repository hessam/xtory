import { test, expect, type Page } from '@playwright/test';
import { isMobile } from './helpers';

async function openBoard(page: Page, lang: 'en' | 'fa' = 'en') {
  await page.addInitScript((l) => { localStorage.setItem('atlas_intro_seen', '1'); localStorage.setItem('atlas_lang', l); }, lang);
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel|generativelanguage/, r => r.abort());
  await page.goto('/?ff=board');
  await page.getByTestId('board-cell').first().waitFor();
  await page.waitForTimeout(400);
}
const k = async (page: Page) => Number(await page.getByTestId('board-map').getAttribute('data-k'));
const settle = (page: Page) => page.waitForTimeout(450);

/** A screen point that is really inside the first realm cell (concave-safe). */
async function pointInCell(page: Page) {
  return page.evaluate(() => {
    const path = document.querySelector('[data-testid=board-cell] path.board-cell') as SVGGeometryElement;
    const bb = path.getBBox(); const m = path.getScreenCTM()!;
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
      const x = bb.x + bb.width * i / 12, y = bb.y + bb.height * j / 12;
      const pt = new DOMPoint(x, y);
      if (path.isPointInFill(pt)) { const s = pt.matrixTransform(m); return { x: s.x, y: s.y }; }
    }
    return null;
  });
}

test.describe('board (?ff=board)', () => {
  test('renders realms, mounts one layout only, no duplicate ids, no page errors', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await openBoard(page);
    expect(await page.getByTestId('board-cell').count()).toBeGreaterThanOrEqual(5);
    const dupes = await page.evaluate(() => { const seen = new Set<string>(), d: string[] = []; document.querySelectorAll('[id]').forEach(e => { if (seen.has(e.id)) d.push(e.id); seen.add(e.id); }); return d; });
    expect(dupes).toEqual([]);
    expect(await page.getByTestId('board-root').count()).toBe(1);
    expect(errors).toEqual([]);
  });

  test('tapping a realm opens the region detail (guardrail: region click)', async ({ page }) => {
    await openBoard(page);
    const pt = await pointInCell(page); expect(pt).not.toBeNull();
    if (isMobile(page)) await page.touchscreen.tap(pt!.x, pt!.y); else await page.mouse.click(pt!.x, pt!.y);
    await expect(page.locator('.fixed.inset-0').first()).toBeVisible();
  });

  test('wheel / buttons zoom, reset restores', async ({ page }) => {
    test.skip(isMobile(page), 'wheel and +/- are desktop controls; mobile uses pinch');
    await openBoard(page);
    const k0 = await k(page);
    await page.getByTestId('board-zoom-in').click(); await settle(page);
    const k1 = await k(page); expect(k1).toBeGreaterThan(k0);
    await page.mouse.move(560, 420); await page.mouse.wheel(0, -300); await settle(page);
    expect(await k(page)).toBeGreaterThan(k1);
    const kz = await k(page);
    await page.getByTestId('board-reset').click(); await page.waitForTimeout(1000);
    const kr = await k(page);
    expect(kr).toBeLessThan(kz);
    expect(kr).toBeCloseTo(k0, 0); // framing depends on the container size, which settles as panels load
  });

  test('dragging pans without opening a region', async ({ page }) => {
    test.skip(isMobile(page), 'touch drag covered by tap test; mouse drag here');
    await openBoard(page);
    await page.getByTestId('board-zoom-in').click(); await settle(page);
    const t0 = await page.getByTestId('board-map').evaluate(e => (e.firstElementChild as HTMLElement).style.transform);
    const bb = (await page.getByTestId('board-map').boundingBox())!;
    const pt = { x: bb.x + bb.width * 0.4, y: bb.y + bb.height * 0.6 }; // away from the HUD and the control stack
    // drag one way, then the other: at least one direction has room (the camera is clamped to the board edge)
    for (const [dx, dy] of [[-80, -40], [160, 80]]) {
      await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(pt.x + dx, pt.y + dy, { steps: 6 }); await page.mouse.up();
    }
    const t1 = await page.getByTestId('board-map').evaluate(e => (e.firstElementChild as HTMLElement).style.transform);
    expect(t1).not.toBe(t0);
    await expect(page.locator('.fixed.inset-0')).toHaveCount(0);
  });

  test('map modes: fragmentation shows counts, terrain hides realms, realms returns', async ({ page }) => {
    await openBoard(page);
    await page.getByTestId('board-mode-fragmentation').click();
    await expect(page.getByTestId('board-count').first()).toBeAttached();
    await page.getByTestId('board-mode-terrain').click();
    await expect(page.locator('[data-testid=board-cell][data-dyn]')).toHaveCount(0);
    await page.getByTestId('board-mode-political').click();
    expect(await page.locator('[data-testid=board-cell][data-dyn]').count()).toBeGreaterThan(0);
  });

  test('reach lens flies the camera and dims other realms; counter matches', async ({ page }) => {
    await openBoard(page);
    const count = Number(await page.getByTestId('dynasty-count').textContent());
    expect(count).toBeGreaterThan(0);
    await page.getByTestId('dynasty-counter').click();
    await page.locator('[data-testid=dynasty-list] button[data-dynasty]').first().click();
    await expect(page.getByTestId('lens-caption')).toBeVisible();
    await page.waitForTimeout(1200);
    const opacities = await page.locator('[data-testid=board-cell][data-dyn] path.board-cell').evaluateAll(els => els.map(e => e.getAttribute('fill-opacity')));
    expect(opacities).toContain('0.1');
  });

  test('Persian: RTL, Persian digits and Persian realm names', async ({ page }) => {
    await openBoard(page, 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('dynasty-count')).toHaveText(/^[۰-۹]+$/);
    const labels = await page.getByTestId('board-label').allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    for (const t of labels) expect(t).toMatch(/[؀-ۿ]/);
  });

  test('without the flag the Leaflet map is still used', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas_intro_seen', '1'));
    await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel/, r => r.abort());
    await page.goto('/');
    await expect(page.locator('.leaflet-container').first()).toBeAttached();
    await expect(page.getByTestId('board-root')).toHaveCount(0);
  });
});
