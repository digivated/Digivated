import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { ready: false, items: [], next: null } }));
});

for (const width of [320, 390, 768, 1000, 1024, 1440]) {
  test(`site menu fits and keeps its destinations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '/');
    const trigger = page.locator('.site-menu-trigger');
    const menu = page.locator('#explore-navigation');

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger.locator('.navigation-trigger-menu')).toBeVisible();
    await expect(page.locator('.dg-header-submit')).toHaveAttribute('href', '/submit-project');
    await expect(menu).toBeHidden();
    await trigger.click();
    await expect(trigger.locator('.navigation-trigger-close')).toBeVisible();
    await expect(menu).toBeVisible();
    await expect(menu.locator('.site-menu-group a')).toHaveText([
      'Submit a project', 'Shop', 'Feedback points', 'Embed badges',
      'Weekly winners', 'Resources', 'For Investors',
    ]);
    await expect(menu.locator('.site-menu-footer a')).toHaveText(['Your projects', 'About', 'Log in or sign up']);
    await expect(menu.locator('.site-menu-primary a')).toHaveText(['Launches', 'Directory', 'Threads', 'News']);
    await expect(menu.locator('.site-menu-primary')).toBeVisible({ visible: width <= 1000 });
    await expect(page.locator('.header-primary')).toBeVisible({ visible: width > 1000 });

    if (width <= 1000) {
      const primaryBounds = (await menu.locator('.site-menu-primary').boundingBox())!;
      const groupBounds = (await menu.locator('.site-menu-groups').boundingBox())!;
      expect(groupBounds.y).toBeGreaterThanOrEqual(primaryBounds.y + primaryBounds.height);
      expect(groupBounds.width).toBeCloseTo(primaryBounds.width, 0);
    }
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('header supports keyboard navigation and search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(base + '/threads');
  const trigger = page.locator('.site-menu-trigger');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.locator('#explore-navigation');
  await expect(menu.getByRole('link', { name: 'Launches', exact: true })).toBeFocused();
  await expect(menu.getByRole('link', { name: 'Threads', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'Search Digivated', exact: true }).click();
  await expect(page.locator('#discovery-search')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#discovery-search')).toBeHidden();
});

test('the menu opens without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(base + '/');
    await page.locator('.site-menu-trigger').click();
    await expect(page.locator('#explore-navigation').getByRole('link', { name: 'Directory', exact: true })).toHaveAttribute('href', '/discover');
  } finally {
    await context.close();
  }
});
