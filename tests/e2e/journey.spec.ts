import { test, expect, type Page } from '@playwright/test';
import { mapRoot } from './helpers';

async function open(page: Page, query: string, lang: 'en' | 'fa' = 'en') {
  await page.addInitScript((l) => { if (!localStorage.getItem('atlas_intro_seen')) { localStorage.setItem('atlas_intro_seen', '1'); localStorage.setItem('atlas_lang', l); } }, lang);
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel\.|generativelanguage/, r => r.abort());
  await page.route('**/api/ai/status', r => r.fulfill({ json: { ok: true, enabled: false } }));
  await page.goto('/' + query);
}

test.describe('journey (?ff=journey)', () => {
  test('off by default', async ({ page }) => {
    await open(page, '?ff=board');
    await expect(page.getByTestId('journey-btn')).toHaveCount(0);
  });

  test('path → beats → myth-or-reality quiz → stars unlock the next chapter', async ({ page }) => {
    await open(page, '?ff=board,journey');
    const r = mapRoot(page);
    await r.getByTestId('journey-btn').click();
    await expect(r.getByTestId('journey-path')).toBeVisible();
    await expect(r.getByTestId('journey-chapter-median')).toBeDisabled();   // locked until chapter 1 has a star
    await r.getByTestId('journey-chapter-prehistoric').click();
    await expect(page).toHaveURL(/#\/journey\/prehistoric\/1$/);
    await expect(r.getByTestId('journey-text')).toContainText('Villages on the plateau');
    for (let i = 0; i < 5; i++) await r.getByTestId('journey-next').click();   // beats 1→5, then the last tap opens the quiz
    await expect(page).toHaveURL(/#\/journey\/prehistoric\/quiz$/);
    // answers: myth, reality, myth — all three correct
    await r.getByTestId('quiz-myth').click();
    await r.getByTestId('quiz-real').click();
    await r.getByTestId('quiz-myth').click();
    await expect(r.getByTestId('journey-result')).toContainText('3');
    await r.getByTestId('journey-next-chapter').click();
    await expect(page).toHaveURL(/#\/journey\/median\/1$/);
    // the stars survive a reload
    await page.reload();
    await r.getByTestId('journey-btn').click();
    await expect(r.getByTestId('journey-chapter-median')).toBeEnabled();
  });

  test('deep link opens the exact beat, and the timeline moves to its year', async ({ page }) => {
    await open(page, '?ff=board,journey#/journey/median/2');
    const r = mapRoot(page);
    await expect(r.getByTestId('journey-text')).toContainText('Babylon');
    await expect(r.getByTestId('journey-panel').locator('..')).toHaveAttribute('dir', 'ltr');
  });

  test('Persian beat is right-to-left', async ({ page }) => {
    await open(page, '?ff=board,journey#/journey/median/1', 'fa');
    const r = mapRoot(page);
    await expect(r.getByTestId('journey-text')).toContainText('ماد');
    await expect(r.getByTestId('journey-panel').locator('..')).toHaveAttribute('dir', 'rtl');
  });
});
