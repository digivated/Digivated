import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { ready: false, items: [], next: null } }));
});

for (const width of [320, 390, 768, 920, 921, 1440]) {
  test(`site menu fits and keeps its destinations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base + '/');
    const trigger = page.locator('.site-menu-trigger');
    const menu = page.locator('#explore-navigation');

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger.locator('.dg-shell-menu-open')).toBeVisible();
    await expect(page.locator('.dg-header-submit')).toHaveAttribute('href', '/submit-project');
    await expect(menu).toBeHidden();
    await trigger.click();
    await expect(trigger.locator('.dg-shell-menu-close')).toBeVisible();
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('backdrop-filter', /blur/);
    await expect(menu.locator('.site-menu-group a')).toHaveText([
      'Resources', 'Weekly winners', 'For Investors',
      'Submit a project', 'Embed badges', 'Feedback points', 'Shop',
    ]);
    await expect(menu.locator('.site-menu-footer a')).toHaveText(['Your projects', 'About', 'Log in or sign up']);
    await expect(menu.locator('.site-menu-primary a')).toHaveText(['Launches', 'Directory', 'Threads', 'News']);
    await expect(menu.locator('.site-menu-primary')).toBeVisible({ visible: width <= 920 });
    await expect(page.locator('.dg-shell-primary')).toBeVisible({ visible: width > 920 });

    if (width <= 920) {
      const primaryBounds = (await menu.locator('.site-menu-primary').boundingBox())!;
      const groupBounds = (await menu.locator('.site-menu-groups').boundingBox())!;
      expect(groupBounds.y).toBeGreaterThanOrEqual(primaryBounds.y + primaryBounds.height);
      expect(Math.abs(groupBounds.width - primaryBounds.width)).toBeLessThanOrEqual(1);
    }
    if (width > 920) {
      const primary = page.locator('.dg-shell-primary');
      await expect(primary).toHaveCSS('display', 'flex');
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

test('the phone menu stays inside a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/');
  await page.locator('.site-menu-trigger').click();
  const menu = page.locator('#explore-navigation');
  const bounds = (await menu.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(360);
  await menu.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
});


test('the glass reflection follows a mouse across the bar and menu and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
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
  expect(await panel.evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
  await expect(bar).not.toHaveAttribute('data-reflecting', '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => panel.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
  await expect(panel).not.toHaveAttribute('data-reflecting', '');
});


test('the bevel optically displaces a real backdrop and keeps the labels outside the filter', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native backdrop displacement is enabled on Chromium.');
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/');
  const bar = page.locator('.dg-shell-bar');
  await expect(bar).toHaveAttribute('data-glass-refraction', '');
  await page.addStyleTag({ content: 'body.platform::before{content:"";position:absolute;inset:0 0 auto;height:100px;z-index:-1;background:repeating-linear-gradient(120deg, #fff 0 5px,#171817 5px 10px)!important}' });

  const optics = await bar.evaluate(el => {
    const id = (el as HTMLElement).style.getPropertyValue('--shell-lens').match(/#([^"]+)/)?.[1];
    const filter = id && document.getElementById(id);
    const glass = getComputedStyle(el, '::before');
    return { id, scale: Number(filter && filter.lastElementChild?.getAttribute('scale')), backdrop: glass.backdropFilter, tint: Number(glass.backgroundColor.split(',').at(-1)?.replace(')', '')), foreground: getComputedStyle(el.querySelector('nav')!).filter };
  });
  expect(optics.scale).toBeGreaterThan(0);
  expect(optics.backdrop).toContain('url(');
  expect(optics.tint).toBeLessThan(.12);
  expect(optics.foreground).toBe('none');

  const refracted = await bar.screenshot();
  await page.evaluate(id => document.getElementById(id!)?.lastElementChild?.setAttribute('scale', '0'), optics.id);
  const flat = await bar.screenshot();
  expect(refracted.equals(flat)).toBe(false);

  await page.locator('.site-menu-trigger').click();
  const menu = page.locator('#explore-navigation');
  await expect(menu).toHaveAttribute('data-glass-refraction', '');
  await expect(menu).toHaveCSS('backdrop-filter', /url\(/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.site-menu-trigger')).toBeFocused();
});
