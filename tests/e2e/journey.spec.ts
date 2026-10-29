import { test, expect, type Page } from '@playwright/test';
import { mapRoot } from './helpers';

async function open(page: Page, query: string, lang: 'en' | 'fa' = 'en') {
  await page.addInitScript((l) => { if (!localStorage.getItem('atlas_intro_seen')) { localStorage.setItem('atlas_intro_seen', '1'); localStorage.setItem('atlas_lang', l); } }, lang);
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel\.|generativelanguage/, r => r.abort());
  await page.route('**/api/ai/status', r => r.fulfill({ json: { ok: true, enabled: false } }));
  await page.goto('/' + query);
}

/** Tap a region where the player can actually see it (a screen point inside the region that nothing covers). */
async function tapRegion(page: Page, regionId: string) {
  await page.waitForTimeout(900); // let the camera settle
  const pt = await page.evaluate((id) => {
    const roots = [document.querySelector('#tour-map-mobile'), document.querySelector('#tour-map-desktop')].filter(Boolean) as Element[];
    for (const root of roots) for (const el of root.querySelectorAll(`[data-kind="cell"][data-region="${id}"]`)) {
      const shape = (el.tagName === 'path' ? el : el.querySelector('path')) as SVGGeometryElement | null; if (!shape) continue;
      const bb = shape.getBBox(), m = shape.getScreenCTM(); if (!m) continue;
      for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) {
        const p = new DOMPoint(bb.x + bb.width * i / 16, bb.y + bb.height * j / 16);
        if (!shape.isPointInFill(p)) continue;
        const s = p.matrixTransform(m), hit = document.elementFromPoint(s.x, s.y);
        if (hit?.closest('[data-kind="cell"]')?.getAttribute('data-region') === id) return { x: s.x, y: s.y };
      }
    }
    return null;
  }, regionId);
  expect(pt, `no visible point in ${regionId}`).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
}

test.describe('journey (?ff=journey)', () => {
  test('off by default', async ({ page }) => {
    await open(page, '?ff=board');
    await expect(page.getByTestId('journey-btn')).toHaveCount(0);
  });

  test('the board is the stage: pins, spotlight, timeline sweep, and "where?" answered by tapping the map', async ({ page }) => {
    await open(page, '?ff=journey');
    const r = mapRoot(page);
    await r.getByTestId('journey-btn').click();
    await expect(r.getByTestId('journey-chapter-median')).toBeDisabled();
    await r.getByTestId('journey-chapter-prehistoric').click();
    await expect(page).toHaveURL(/#\/journey\/prehistoric\/1$/);
    await expect(r.getByTestId('journey-pin')).toHaveCount(1);              // Sialk pinned on the board
    await expect(r.getByTestId('journey-pin')).toContainText('Sialk');
    await expect(page.getByText('3000 BC').first()).toBeVisible();          // the app's own year display followed the story

    await r.getByTestId('journey-next').click();                             // beat 2 asks: where is Susa?
    await expect(r.getByTestId('journey-ask')).toContainText('Susa');
    await expect(r.getByTestId('journey-next')).toBeDisabled();
    await tapRegion(page, 'fars');                                           // wrong
    await expect(r.getByTestId('journey-flash-no')).toBeVisible();
    await expect(r.getByTestId('journey-ask')).toContainText('Not quite');
    await tapRegion(page, 'khuzestan');                                      // right
    await expect(r.getByTestId('journey-flash-ok')).toBeVisible();
    await expect(r.getByTestId('journey-next')).toBeEnabled();
    await expect(page.getByTestId('detail-modal')).toHaveCount(0);           // a journey tap does not open region details…
    await r.getByTestId('journey-close').click();                            // …but back in the atlas the same tap does
    await tapRegion(page, 'khuzestan');
    await expect(page.getByTestId('detail-modal')).toBeVisible();
  });

  test('chapter challenge is played on the map, gives stars and unlocks the next chapter', async ({ page }) => {
    await open(page, '?ff=journey#/journey/median/5');
    const r = mapRoot(page);
    await r.getByTestId('journey-next').click();
    await expect(page).toHaveURL(/#\/journey\/median\/challenge$/);
    for (let i = 0; i < 3; i++) {
      await expect(r.getByTestId('journey-question')).toBeVisible();
      await tapRegion(page, 'jibal');                                        // right or wrong, the map then lights up the true answer
      await expect(r.getByTestId('journey-verdict')).toBeVisible();
      await r.getByTestId('journey-next').click();
    }
    await expect(r.getByTestId('journey-result')).toBeVisible();
    await r.getByTestId('journey-next-chapter').click();
    await expect(page).toHaveURL(/#\/journey\/achaemenid\/1$/);
    await r.getByTestId('journey-close').click();
    await r.getByTestId('journey-btn').click();
    await expect(r.getByTestId('journey-chapter-achaemenid')).toBeEnabled();
  });

  test('deep link opens the exact beat with its spotlight; Persian is right-to-left', async ({ page }) => {
    await open(page, '?ff=journey#/journey/achaemenid/3', 'fa');
    const r = mapRoot(page);
    await expect(r.getByTestId('journey-text')).toContainText('تخت جمشید');
    await expect(r.getByTestId('journey-pin')).toHaveCount(2);              // Persepolis + Susa
    await expect(r.getByTestId('journey-caption').locator('..')).toHaveAttribute('dir', 'rtl');
  });
});
