import { test, expect } from '@playwright/test';

for (const width of [390, 768, 1440]) {
  for (const path of ['/creators', '/news', '/resources', '/membership', '/inbox', '/account', '/saved', '/about', '/login']) {
    test(`${path} breadcrumb follows its title at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://127.0.0.1:4321' + path);
      const offset = await page.evaluate((current) => {
        // The Creators header is a card, so the breadcrumb follows the card's edge.
        const title = (current === '/creators' ? document.querySelector('.creator-social-heading')! : document.querySelector('main#main h1')!).getBoundingClientRect();
        const crumb = document.querySelector('main#main > .site-breadcrumbs')!.getBoundingClientRect();
        return Math.abs(title.left - crumb.left);
      }, path);
      expect(offset).toBeLessThan(14);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
