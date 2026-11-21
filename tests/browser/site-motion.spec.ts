import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

test('public, packet and owner headings share the gentle entrance', async ({ page }) => {
 await page.addInitScript(() => {
  const original = Element.prototype.animate;
  const headings: string[] = [];
  Object.defineProperty(window, '__animatedHeadings', { value: headings });
  Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
   if (this.matches('main#main h1') && args[1] && typeof args[1] === 'object' && args[1].duration === 240) {
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

test('the editorial heading detail stays static with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/creators');
  const heading = page.locator('.creator-social-heading h1');
  await expect(heading).toBeVisible();
  const detail = await heading.evaluate(element => {
    const style = getComputedStyle(element, '::after');
    return { width: parseFloat(style.width), animation: style.animationName };
  });
  expect(detail.width).toBe(32);
  expect(detail.animation).toBe('none');
});
