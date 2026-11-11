import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

for (const path of ['/', '/rankings', '/creators', '/news']) {
  test(`${path} stays usable through repeated reloads`, async ({ page }) => {
    await page.goto(base + path);
    await page.reload();
    await page.reload();
    await expect(page.locator('main#main')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const intro = document.getElementById('site-intro');
      return !intro || getComputedStyle(intro).pointerEvents === 'none' || getComputedStyle(intro).display === 'none';
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.dataset.siteIntro)).toBeUndefined();
  });
}

test('first-visit intro releases the page if its JavaScript timer is delayed', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.removeItem('digivated:intro:v1'));
  await page.goto(base + '/creators');
  await expect.poll(() => page.evaluate(() => {
    const intro = document.getElementById('site-intro');
    return !intro || getComputedStyle(intro).pointerEvents === 'none';
  }), { timeout: 3000 }).toBe(true);
});
