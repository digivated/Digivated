import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

test('public, packet and owner headings share the gentle entrance', async ({ page }) => {
 await page.addInitScript(() => {
  const original = Element.prototype.animate;
  const headings: string[] = [];
  Object.defineProperty(window, '__animatedHeadings', { value: headings });
  Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
   if (this.matches('main#main h1') && args[1] && typeof args[1] === 'object' && args[1].duration === 640) {
    headings.push(this.textContent || '');
   }
   return original.apply(this, args);
  };
 });
 await page.setViewportSize({ width: 390, height: 844 });
 for (const route of ['/discover', '/threads', '/login', '/submit-project', '/creators', '/news', '/resources', '/membership', '/inbox', '/account', '/start', '/admin']) {
  await page.goto(base + route);
  await expect.poll(() => page.evaluate(() => (window as any).__animatedHeadings.length), { message: route }).toBeGreaterThan(0);
  await expect(page.locator('#main h1:visible').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
 }
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.goto(base + '/start');
 await expect(page.locator('#main h1')).toBeVisible();
 expect(await page.evaluate(() => (window as any).__animatedHeadings)).toEqual([]);
});

test('the creators heading has no retired decorative underline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/creators');
  const heading = page.locator('.creator-social-heading h1');
  await expect(heading).toBeVisible();
  const detail = await heading.evaluate(element => {
    const style = getComputedStyle(element, '::after');
    return { content: style.content, animation: style.animationName };
  });
  expect(detail.content).toBe('none');
  expect(detail.animation).toBe('none');
});

test('editorial details animate during scrolling and menu interaction', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem('digivated-announcement-seen-v2', '1'));
  await page.route('**/api/**', route => route.fulfill({ json: { items: [], next: null, ready: false } }));
  await page.goto(base + '/discover');

  const art = page.locator('[data-site-backdrop]');
  await expect(art).toHaveCount(1);
  await expect(art).toHaveJSProperty('tagName', 'CANVAS');
  const [artBounds, searchBounds] = await Promise.all([
    art.boundingBox(),
    page.locator('[data-dir-search]').boundingBox(),
  ]);
  expect(artBounds!.x).toBe(0);
  expect(artBounds!.width).toBe(1000);
  expect(artBounds!.y + artBounds!.height).toBeGreaterThan(searchBounds!.y);

  const menu = page.locator('.site-menu-trigger');
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Site menu' })).toHaveCSS('animation-name', 'dg-panel-arrive');
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  const track = page.locator('[data-reading-progress]');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => track.evaluate(node => Number((node as HTMLElement).style.getPropertyValue('--reading-progress')))).toBeGreaterThan(.95);
  await expect(page.locator('.dg-footer-imprint')).toHaveAttribute('data-motion-entered', '');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(track).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-motion-ready', '');
  await expect(art).toHaveJSProperty('tagName', 'CANVAS');
});
