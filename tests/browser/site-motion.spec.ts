import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

for (const path of ['/creators', '/news', '/resources', '/membership', '/inbox']) {
  test(`${path} shares the page entrance`, async ({ page }) => {
    await page.goto(base + path);
    const name = await page.locator('main#main > section').first().evaluate(element => getComputedStyle(element).animationName);
    expect(name).toContain('digivated-page-arrive');
  });
}

test('reduced motion keeps content immediately visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/creators');
  const section = page.locator('main#main > section').first();
  await expect(section).toBeVisible();
  expect(await section.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});
