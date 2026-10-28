import { test, expect } from '@playwright/test';

for (const renderer of ['svg', 'svgl', 'pixi']) {
  test(`board spike renders (${renderer})`, async ({ page }) => {
    test.skip(renderer === 'pixi', 'WebGL is software-only in CI; Pixi is compared manually (see ADR 001)');
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/googletagmanager|clarity|google-analytics|vercel/, r => r.abort());
    await page.goto(`/?ff=board_spike&renderer=${renderer}&year=1000`);
    await page.waitForFunction(() => (window as any).__board);
    await page.evaluate(() => (window as any).__board.ready());
    await expect(page.locator('svg path').first()).toBeAttached();
    expect(await page.locator('svg path').count()).toBeGreaterThan(40);
    await expect(page.getByText(/dynasties · 1000 AD/)).toBeVisible();
    // camera + scrub API works
    const stats = await page.evaluate(() => (window as any).__board.bench());
    expect(stats.scrubP95ms).toBeLessThan(1000);
    expect(errors).toEqual([]);
  });
}
