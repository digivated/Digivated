import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

for (const path of ['/', '/discover', '/news']) {
  test(`${path} stays usable on first visit and repeated reloads`, async ({ page }) => {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(page.locator('main#main h1').first()).toBeVisible();
      await expect(page.locator('#site-intro,[data-fl-reveal],.dg-rv')).toHaveCount(0);
      await page.keyboard.press('/');
      await expect(page.locator('#unified-search-input')).toBeFocused();
      if (attempt < 2) await page.reload({ waitUntil: 'domcontentloaded' });
    }
  });
}

test('the homepage still forwards email sign-in callbacks to the dashboard', async ({ page }) => {
  const callback = '#access_token=fixture-token&refresh_token=fixture-refresh';
  const dashboard = page.waitForURL(url => url.pathname === '/dashboard' && url.hash === callback);
  await page.route('**/dashboard', route => route.fulfill({ contentType: 'text/html', body: '<title>Account callback fixture</title>' }));
  await page.goto(base + '/' + callback).catch(error => {
    if (!String(error).includes('ERR_ABORTED')) throw error;
  });
  await dashboard;
});
