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

    const mobile = width <= 920;
    const primary = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(trigger).toHaveAccessibleName(mobile ? 'Menu' : 'More');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger.locator(mobile ? '.dg-shell-menu-open' : '.dg-shell-more-arrow')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Submit a product' }).first()).toHaveAttribute('href', '/submit-project');
    await expect(menu).toBeHidden();
    await trigger.click();
    if (mobile) await expect(trigger.locator('.dg-shell-menu-close')).toBeVisible();
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('backdrop-filter', /blur/);
    await expect(menu.locator('.site-menu-branch-trigger')).toHaveText(['Explore', 'For makers']);
    await expect(menu.getByRole('link', { name: 'News', exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Embed badges', exact: true })).toBeHidden();
    await expect(menu.locator('.site-menu-secondary a')).toHaveText([
      'News', 'Weekly winners', 'Resources', 'For Investors', 'Embed badges', 'Feedback points', 'Shop',
    ]);
    await expect(menu.locator('.site-menu-primary')).toBeVisible({ visible: mobile });
    const mainLinks = mobile ? menu.locator('.site-menu-primary') : primary;
    await expect(mainLinks.getByRole('link')).toHaveText(['Launches', 'Directory', 'Threads']);
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
    const menu = page.locator('#explore-navigation');
    await expect(menu.getByRole('link', { name: 'Directory', exact: true })).toHaveAttribute('href', '/discover');
    await menu.locator('summary', { hasText: 'For makers' }).click();
    await expect(menu.getByRole('link', { name: 'Embed badges', exact: true })).toHaveAttribute('href', '/badges');
  } finally {
    await context.close();
  }
});

test('desktop branches are keyboard operable and open to the current destination', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + '/badges');
  const menu = page.locator('#explore-navigation');
  const trigger = page.locator('.site-menu-trigger');
  await trigger.press('ArrowDown');
  const badges = menu.getByRole('link', { name: 'Embed badges', exact: true });
  await expect(badges).toBeFocused();
  await expect(badges).toHaveAttribute('aria-current', 'page');
  const explore = menu.locator('summary', { hasText: 'Explore' });
  await explore.press('ArrowDown');
  await expect(menu.getByRole('link', { name: 'News', exact: true })).toBeFocused();
  await expect(menu.locator('.site-menu-connector').first()).toHaveCSS('stroke', 'rgb(169, 170, 164)');
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
  const material = bar.locator('.dg-shell-material');
  await expect(material).toHaveAttribute('data-liquid-lens', 'true');
  await page.addStyleTag({ content: 'body.platform::before{content:"";position:absolute;inset:0 0 auto;height:100px;z-index:-1;background:repeating-linear-gradient(120deg, #fff 0 5px,#171817 5px 10px)!important}' });

  const optics = await material.evaluate(el => {
    const id = (el as HTMLElement).style.getPropertyValue('--lq-lens').match(/#([^)]*)/)?.[1];
    const filter = id && document.getElementById(id);
    const glass = getComputedStyle(el);
    const scales = filter ? [...filter.querySelectorAll('feDisplacementMap')].map(lens => Number(lens.getAttribute('scale'))) : [];
    return { id, scales, backdrop: glass.backdropFilter, tint: Number(glass.backgroundColor.split(',').at(-1)?.replace(')', '')), foreground: getComputedStyle(el.parentElement!.querySelector('nav')!).filter };
  });
  expect(optics.scales).toHaveLength(3);
  expect(new Set(optics.scales).size).toBe(3);
  expect(Math.min(...optics.scales)).toBeGreaterThan(0);
  expect(optics.backdrop).toContain('url(');
  expect(optics.tint).toBeLessThan(.12);
  expect(optics.foreground).toBe('none');

  const refracted = await bar.screenshot();
  const setScale = (scale: number) => page.evaluate(({ id, scale }) => {
    document.getElementById(id!)?.querySelectorAll('feDisplacementMap').forEach(lens => lens.setAttribute('scale', String(scale)));
  }, { id: optics.id, scale });
  await setScale(optics.scales[1]);
  const singleColorBend = await bar.screenshot();
  expect(refracted.equals(singleColorBend)).toBe(false);
  await setScale(0);
  const flat = await bar.screenshot();
  expect(refracted.equals(flat)).toBe(false);

  await page.locator('.site-menu-trigger').click();
  const menu = page.locator('#explore-navigation');
  await expect(menu).toHaveAttribute('data-liquid-lens', 'true');
  await expect(menu).toHaveCSS('backdrop-filter', /url\(/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.site-menu-trigger')).toBeFocused();
});
