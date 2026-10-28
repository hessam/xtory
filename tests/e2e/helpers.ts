import { Page } from '@playwright/test';

/** Open the app as a returning user, offline from analytics and map tiles (hermetic). */
export async function openApp(page: Page, lang: 'en' | 'fa' = 'en') {
  await page.addInitScript((l) => {
    localStorage.setItem('atlas_intro_seen', '1');
    localStorage.setItem('atlas_lang', l);
  }, lang);
  await page.route(/thunderforest|googletagmanager|clarity|google-analytics|vercel|generativelanguage/, r => r.abort());
  await page.goto('/');
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1024) < 640;
export const mapRoot = (page: Page) => page.locator(isMobile(page) ? '#tour-map-mobile' : '#tour-map-desktop');
export const langToggle = (page: Page) => page.locator(isMobile(page) ? '#tour-lang-mobile' : '#tour-lang-desktop');

/** Concatenated fill/opacity of every region polygon on the visible map — a colour fingerprint. */
export async function mapFingerprint(page: Page) {
  return mapRoot(page).locator('path.region-polygon').evaluateAll(els =>
    els.map(e => `${e.getAttribute('fill')}/${e.getAttribute('fill-opacity')}`).join('|')
  );
}
