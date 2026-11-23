import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { ready: false, items: [], next: null } }));
});

for (const width of [320, 390, 768, 920, 921, 1119]) {
  test(`site menu fits and keeps its destinations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base + '/');
    const trigger = page.locator('.site-menu-trigger');
    const menu = page.locator('#explore-navigation');

    await expect(trigger).toHaveAccessibleName('Menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(menu.getByRole('link')).toHaveText(['Home', 'Categories', 'Dashboard', 'Shop', 'News', 'Threads', 'Tools', 'New Launch']);
    const current = menu.getByRole('link', { name: 'Home', exact: true });
    await expect(current).toHaveAttribute('aria-current','page');
    await expect(current).toHaveCSS('background-color','rgb(23, 23, 23)');
    await expect(menu.getByRole('button', { name: 'Close menu' })).toBeVisible();
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
  await expect(menu.getByRole('link', { name: 'Home', exact: true })).toBeFocused();
  await expect(menu.getByRole('link', { name: 'Threads', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('/');
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
    const menu = page.locator('#explore-navigation');
    await expect(menu.getByRole('link', { name: 'Categories', exact: true })).toHaveAttribute('href', '/categories');
    await expect(menu.getByRole('link', { name: 'Shop', exact: true })).toHaveAttribute('href', '/shop');
  } finally {
    await context.close();
  }
});

test('the drawer close button restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(base + '/dashboard');
  const trigger = page.locator('.site-menu-trigger');
  await trigger.click();
  const menu = page.getByRole('navigation', { name: 'Site menu' });
  await expect(menu.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('button', { name: 'Close menu' }).click();
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the phone menu stays inside a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/');
  await page.locator('.site-menu-trigger').click();
  const menu = page.locator('#explore-navigation');
  const bounds = (await menu.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(360);
  await menu.getByRole('link', { name: 'New Launch', exact: true }).click();
  await expect(page).toHaveURL(/\/new-launch$/);
});


test('navigation surfaces stay opaque over a bright backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/');
  const bar = page.locator('.dg-shell-material');
  const trigger = page.locator('.site-menu-trigger');
  await page.addStyleTag({ content: 'body.platform::before{content:"";position:absolute;inset:0 0 auto;height:100px;z-index:-1;background:repeating-linear-gradient(120deg, #fff 0 5px,#171817 5px 10px)!important}' });
  await expect(bar).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(bar).toHaveCSS('backdrop-filter', 'none');
  await trigger.click();
  const menu = page.locator('#explore-navigation');
  await expect(menu).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(menu).toHaveCSS('backdrop-filter', 'none');
  await expect(menu.getByRole('link', { name: 'Categories' })).toHaveCSS('color', 'rgb(51, 51, 51)');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
