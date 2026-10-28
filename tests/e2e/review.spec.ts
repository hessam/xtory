import { test, expect, type Page } from '@playwright/test';
import { factHash } from '../../src/facts/model';

const claim = { en: 'The vizier owned 400 camels.', fa: 'وزیر ۴۰۰ شتر داشت.' };
const fact = (over: Record<string, unknown> = {}) => ({
  id: 'a_abcdef123456', kind: 'ai', entityType: 'ruler', entityKey: 'ruler:x', entityName: { en: 'Nizam al-Mulk', fa: 'نظام‌الملک' }, year: 1000,
  hook: { en: 'Camels galore', fa: 'شتر فراوان' }, claim, sources: ['Tabari, Tarikh'], confidence: 'medium', status: 'unverified', hash: factHash('ruler:x', claim.en),
  sensitive: false, found: 7, reports: 0, history: [{ at: 1, event: 'created', by: 'writer' }], createdAt: 1, updatedAt: 1,
  checks: { deterministic: [{ rule: 'age', ok: true, detail: 'fine' }], model: { verdict: 'uncertain', persianMatches: true, reason: 'not sure', model: 'google/x' } }, ...over,
});
const counts = { unverified: 1, ai_checked: 0, verified: 0, disputed: 0, rejected: 0 };

async function open(page: Page, handler?: (req: any) => void) {
  const posted: any[] = [];
  await page.route('**/api/facts/admin**', async route => {
    const req = route.request(); const url = new URL(req.url());
    if (req.headers().authorization !== 'Bearer s3cret') return route.fulfill({ status: 401, json: { ok: false, error: 'unauthorized' } });
    if (req.method() === 'POST') { const b = req.postDataJSON(); posted.push(b); handler?.(b); return route.fulfill({ json: { ok: true, fact: fact({ status: 'verified' }) } }); }
    const action = url.searchParams.get('action');
    if (action === 'queue') return route.fulfill({ json: { ok: true, status: 'unverified', counts, facts: [fact()] } });
    if (action === 'reported') return route.fulfill({ json: { ok: true, reported: [{ id: 'c_reign_0123456789', reports: 3 }] } });
    if (action === 'export') return route.fulfill({ json: { ok: true, facts: [fact({ status: 'verified' })] } });
    return route.fulfill({ status: 400, json: { ok: false } });
  });
  await page.goto('/#/admin/review');
  return posted;
}

test.describe('fact review page (#/admin/review)', () => {
  test('asks for the token, rejects a wrong one, then shows the queue ordered with checks and sources', async ({ page }) => {
    await open(page);
    await page.getByTestId('admin-token').fill('wrong'); await page.keyboard.press('Enter');
    await expect(page.getByText('Wrong token')).toBeVisible();
    await page.getByTestId('admin-token').fill('s3cret'); await page.keyboard.press('Enter');
    const card = page.getByTestId('fact-card').first();
    await expect(card).toContainText('found 7×'); await expect(card).toContainText('Camels galore');
    await expect(card).toContainText('Tabari, Tarikh'); await expect(card).toContainText('judge (google/x): uncertain');
    await expect(page.getByTestId('tab-unverified')).toContainText('(1)');
    await expect(page.getByTestId('reported')).toContainText('c_reign_0123456789');
  });

  test('approve sends the right review and refreshes', async ({ page }) => {
    const posted = await open(page);
    await page.evaluate(() => sessionStorage.setItem('xtory_admin_token', 's3cret')); await page.reload();
    await page.getByTestId('approve').click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toMatchObject({ action: 'review', factId: 'a_abcdef123456', verdict: 'approve' });
  });

  test('edit & approve sends the edited text and sources', async ({ page }) => {
    const posted = await open(page);
    await page.evaluate(() => sessionStorage.setItem('xtory_admin_token', 's3cret')); await page.reload();
    await page.getByTestId('edit').click();
    await page.getByTestId('edit-claim-en').fill('Corrected claim: 400 camels.');
    await page.getByTestId('edit-sources').fill('Tabari, Tarikh, vol. 3\nNizam al-Mulk, Siyasatnama');
    await page.getByTestId('save-approve').click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].edits.claim.en).toBe('Corrected claim: 400 camels.');
    expect(posted[0].edits.sources).toEqual(['Tabari, Tarikh, vol. 3', 'Nizam al-Mulk, Siyasatnama']);
    expect(posted[0].verdict).toBe('approve');
  });

  test('export downloads valid ai.json for data/facts/verified/', async ({ page }) => {
    await open(page);
    await page.evaluate(() => sessionStorage.setItem('xtory_admin_token', 's3cret')); await page.reload();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
    expect(download.suggestedFilename()).toBe('ai.json');
    const body = JSON.parse(await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8'));
    expect(body.version).toBe(1); expect(body.facts[0].id).toBe('a_abcdef123456'); expect(body.facts[0].firstDiscoverer).toBeUndefined();
  });

  test('is not indexed and does not load the main app', async ({ page }) => {
    await open(page);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('#tour-map-desktop, #tour-map-mobile')).toHaveCount(0);
  });
});
