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

    const mobile = width <= 920;
    const primary = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(trigger).toHaveAccessibleName(mobile ? 'Menu' : 'More');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger.locator(mobile ? '.dg-shell-menu-open' : '.dg-shell-more-arrow')).toBeVisible();
    const headerSubmit = page.locator('.dg-header-submit');
    await expect(headerSubmit).toBeVisible({ visible: !mobile });
    if (mobile) await expect(page.locator('.dg-shell-tools > a:visible')).toHaveText(['Log In']);
    else await expect(headerSubmit).toHaveAttribute('href', '/submit-project');
    await expect(menu).toBeHidden();
    await trigger.click();
    if (mobile) await expect(trigger.locator('.dg-shell-menu-close')).toBeVisible();
    await expect(menu).toBeVisible();
    const menuSubmit = menu.locator('.site-menu-submit a');
    await expect(menuSubmit).toBeVisible({ visible: mobile });
    if (mobile) await expect(menuSubmit).toHaveAttribute('href', '/submit-project');
    await expect(menu).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(menu.locator('.site-menu-branch-trigger')).toHaveText(['Explore', 'For makers']);
    await expect((mobile ? menu : primary).getByRole('link', { name: 'News', exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Embed badges', exact: true })).toBeHidden();
    await expect(menu.locator('.site-menu-secondary a')).toHaveText([
      'Resources', 'Weekly winners', 'For Investors', 'Feedback points', 'Embed badges', 'Shop',
    ]);
    await expect(menu.locator('.site-menu-primary')).toBeVisible({ visible: mobile });
    const mainLinks = mobile ? menu.locator('.site-menu-primary') : primary;
    await expect(mainLinks.getByRole('link')).toHaveText(['Launches', 'Directory', 'Threads', 'News']);
    const destinations = await page.locator('.dg-shell-primary a:visible, .dg-shell-tools a:visible').evaluateAll(
      links => links.map(link => link.getAttribute('href')),
    );
    expect(new Set(destinations).size).toBe(destinations.length);
    if (mobile) {
      const primaryBounds = (await mainLinks.boundingBox())!;
      const secondaryBounds = (await menu.locator('.site-menu-secondary').boundingBox())!;
      expect(secondaryBounds.y).toBeGreaterThanOrEqual(primaryBounds.y + primaryBounds.height);
      expect(Math.abs(secondaryBounds.width - primaryBounds.width)).toBeLessThanOrEqual(1);
    } else {
      const headerBounds = (await page.locator('.dg-shell-bar').boundingBox())!;
      expect(headerBounds.height).toBeLessThanOrEqual(76);
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
    await expect(menu.getByRole('link', { name: 'Directory', exact: true })).toHaveAttribute('href', '/discover');
    await menu.locator('summary', { hasText: 'For makers' }).click();
    await expect(menu.getByRole('link', { name: 'Embed badges', exact: true })).toHaveAttribute('href', '/badges');
  } finally {
    await context.close();
  }
});

test('the compact header branches are keyboard operable and open to the current destination', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(base + '/badges');
  const menu = page.locator('#explore-navigation');
  const trigger = page.locator('.site-menu-trigger');
  await trigger.press('ArrowDown');
  const badges = menu.getByRole('link', { name: 'Embed badges', exact: true });
  await expect(menu.getByRole('link', { name: 'Feedback points', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(badges).toBeFocused();
  await expect(badges).toHaveAttribute('aria-current', 'page');
  const explore = menu.locator('summary', { hasText: 'Explore' });
  await explore.press('ArrowDown');
  await expect(menu.getByRole('link', { name: 'Resources', exact: true })).toBeFocused();
  await expect(menu.locator('.site-menu-connector').first()).toHaveCSS('stroke', 'rgb(160, 160, 160)');
  await page.keyboard.press('Escape');
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
  await menu.locator('summary', { hasText: 'For makers' }).click();
  await menu.getByRole('link', { name: 'Embed badges', exact: true }).click();
  await expect(page).toHaveURL(/\/badges$/);
});


test('the glass reflection follows a mouse across the bar and menu and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 920 });
  await page.goto(base + '/');
  await page.locator('html[data-motion-ready]').waitFor();
  const bar = page.locator('.dg-shell-bar');
  const bounds = (await bar.boundingBox())!;
  await page.mouse.move(bounds.x + 100, bounds.y + 20);
  await expect(bar).toHaveAttribute('data-reflecting', '');
  const rim = (locator: typeof bar) => locator.evaluate(el => {
    const style = getComputedStyle(el, '::after');
    return { opacity: Number(style.opacity), mask: style.maskComposite, highlight: style.backgroundImage };
  });
  await expect.poll(async () => (await rim(bar)).opacity).toBeGreaterThan(.7);
  expect((await rim(bar)).mask).toContain('exclude');
  expect((await rim(bar)).highlight).toContain('radial-gradient');
  expect(await bar.evaluate(el => getComputedStyle(el, '::before').backgroundImage)).toBe('none');
  const coordinate = () => bar.evaluate(el => (el as HTMLElement).style.getPropertyValue('--reflection-x'));
  const first = await coordinate();
  await page.mouse.move(bounds.x + 220, bounds.y + 20);
  await expect.poll(coordinate).not.toBe(first);

  await page.locator('.site-menu-trigger').click();
  const panel = page.locator('#explore-navigation');
  await panel.getByRole('link', { name: 'Resources', exact: true }).hover();
  await expect(panel).toHaveAttribute('data-reflecting', '');
  await expect.poll(async () => (await rim(panel)).opacity).toBeGreaterThan(.7);
  expect((await rim(panel)).highlight).toContain('radial-gradient');
  await expect(bar).not.toHaveAttribute('data-reflecting', '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => panel.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
  await expect(panel).not.toHaveAttribute('data-reflecting', '');
});


test('navigation surfaces stay opaque over a bright backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/');
  const bar = page.locator('.dg-shell-material');
  const trigger = page.locator('.site-menu-trigger');
  await page.addStyleTag({ content: 'body.platform::before{content:"";position:absolute;inset:0 0 auto;height:100px;z-index:-1;background:repeating-linear-gradient(120deg, #fff 0 5px,#171817 5px 10px)!important}' });
  await expect(bar).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(bar).toHaveCSS('backdrop-filter', 'none');
  await trigger.click();
  const menu = page.locator('#explore-navigation');
  await expect(menu).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(menu).toHaveCSS('backdrop-filter', 'none');
  await expect(menu.getByRole('link', { name: 'Resources' })).toHaveCSS('color', 'rgb(248, 248, 248)');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
