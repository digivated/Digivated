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

test('ranking signal keeps moving after reload', async ({ page }) => {
  await page.goto(base + '/rankings');
  await page.reload();
  const line = page.locator('.rankings-hero');
  const motion = async () => line.evaluate(element => {
    const style = getComputedStyle(element, '::after');
    return { transform: style.transform, state: style.animationPlayState, name: style.animationName };
  });
  const before = await motion();
  await page.waitForTimeout(1200);
  const after = await motion();
  expect(before.name).toContain('digivated-signal-sweep');
  expect(after.state).toBe('running');
  expect(after.transform).not.toBe(before.transform);
});
