import { test, expect, type Page } from '@playwright/test';
import { mapRoot } from './helpers';

/** Stateful stand-in for /api/me and /api/leaderboard (the real handlers are covered by server/profile/profile.test.ts). */
async function open(page: Page, query: string, lang: 'en' | 'fa' = 'en') {
  const calls: any[] = [];
  let profile: { id: string; nick: string | null } | null = null;
  await page.addInitScript((l) => { if (!localStorage.getItem('atlas_intro_seen')) { localStorage.setItem('atlas_intro_seen', '1'); localStorage.setItem('atlas_lang', l); } }, lang);
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel\.|generativelanguage/, r => r.abort());
  await page.route('**/api/ai/status', r => r.fulfill({ json: { ok: true, enabled: false } }));
  await page.route('**/api/me', async r => {
    const req = r.request(); const body = JSON.parse(req.postData() || '{}'); const action = req.method() === 'DELETE' ? 'delete' : body.action; calls.push({ action, body });
    const name = () => profile?.nick ?? 'Explorer #4821';
    if (action === 'create') { profile = { id: 'p_0123456789ab', nick: null }; return r.fulfill({ json: { ok: true, profileId: profile.id, secret: 'amber-anchor-apple-arrow-aspen-atlas-autumn-badge', name: name() } }); }
    if (action === 'sync') return r.fulfill({ json: { ok: true, accepted: body.found.length, rejected: [], name: name(), nickname: profile?.nick ?? null, points: body.found.length * 2, count: body.found.length } });
    if (action === 'nickname') { if (body.nickname === 'Taken') return r.fulfill({ status: 409, json: { ok: false, error: 'nickname_taken' } }); profile!.nick = body.nickname; return r.fulfill({ json: { ok: true, nickname: body.nickname, name: name() } }); }
    if (action === 'delete') { profile = null; return r.fulfill({ json: { ok: true, deleted: true } }); }
    return r.fulfill({ status: 400, json: { ok: false, error: 'invalid_request' } });
  });
  await page.route('**/api/leaderboard**', r => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('nick')) return r.fulfill({ json: { ok: true, nickname: 'Anahita', points: 12, count: 5, facts: ['a_unknown_ai_fact_1'] } });
    return r.fulfill({ json: { ok: true, board: u.searchParams.get('board'), rows: [{ rank: 1, name: 'Anahita', named: true, points: 40 }, { rank: 2, name: 'Explorer #4821', named: false, points: 4 }] } });
  });
  await page.goto('/' + query);
  return { calls };
}
const root = (page: Page) => mapRoot(page);

test.describe('profile + leaderboard (?ff=leaderboard)', () => {
  test('off unless the flag is on', async ({ page }) => {
    await open(page, '?ff=board,discovery');
    await expect(root(page).getByTestId('discover-btn')).toBeVisible();
    await expect(root(page).getByTestId('profile-btn')).toHaveCount(0);
  });

  test('join anonymously → find a fact → points sync → nickname → recovery code → delete', async ({ page }) => {
    const { calls } = await open(page, '?ff=board,discovery,leaderboard');
    const r = root(page);
    await r.getByTestId('profile-btn').click();
    await expect(r.getByTestId('profile-panel')).toBeVisible();
    await expect(r.getByTestId('leaderboard')).toContainText('Anahita');
    await r.getByTestId('profile-join').click();
    await expect(r.getByTestId('profile-name')).toHaveText('Explorer #4821');
    await expect(r.getByTestId('profile-secret')).not.toContainText('amber');           // hidden until asked
    await r.getByRole('button', { name: 'Show code' }).click();
    await expect(r.getByTestId('profile-secret')).toContainText('amber-anchor');

    // a fact found afterwards is synced automatically
    await r.getByTestId('profile-close').click();
    await r.getByTestId('discover-btn').click();
    await expect(r.getByTestId('fact-card')).toBeVisible();
    await expect.poll(() => calls.filter(c => c.action === 'sync').pop()?.body.found.length ?? 0, { timeout: 8000 }).toBe(1);

    await r.getByTestId('profile-btn').click();
    await expect(r.getByTestId('profile-points')).toContainText('2 points');
    await r.getByTestId('profile-nick-input').fill('Taken');
    await r.getByTestId('profile-nick-save').click();
    await expect(r.getByTestId('profile-error')).toContainText('taken');
    await r.getByTestId('profile-nick-input').fill('Anahita');
    await r.getByTestId('profile-nick-save').click();
    await expect(r.getByTestId('profile-name')).toHaveText('Anahita');

    // reload: the profile is remembered on this device
    await page.reload();
    await root(page).getByTestId('profile-btn').click();
    await expect(root(page).getByTestId('profile-name')).toHaveText('Anahita');

    page.once('dialog', d => d.accept());
    await root(page).getByTestId('profile-delete').click();
    await expect(root(page).getByTestId('profile-join')).toBeVisible();
    expect(calls.some(c => c.action === 'delete')).toBe(true);
  });

  test('public showcase at #/u/<nickname>, in Persian too', async ({ page }) => {
    await open(page, '?ff=board,discovery,leaderboard#/u/Anahita', 'fa');
    const r = root(page);
    await expect(r.getByTestId('showcase')).toContainText('Anahita');
    await expect(r.getByTestId('showcase')).toContainText('۱۲'); // Persian digits
    await expect(r.getByTestId('profile-panel').locator('..')).toHaveAttribute('dir', 'rtl');
  });
});
