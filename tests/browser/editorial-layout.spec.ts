import { expect, test } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

test('homepage activity, launches and community sections stay in reading order', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => sessionStorage.setItem('digivated-announcement-seen-v2', '1'));
  const date = new Date().toISOString();
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const items = url.pathname === '/api/projects' ? [{
      id: 'launch-fixture', name: 'An unusually long name for a featured product ' + 'a'.repeat(55),
      description: 'A focused tool for independent makers.', creator: 'An independent maker',
      category: 'Writing & Content', status: 'featured', date, url: 'https://example.com',
      pageUrl: '/projects/listing/launch-fixture', image: '/digivated-daylight-mark.png',
      comments: 20, votes: { all: 17, weekly: 17 },
    }] : [];
    return route.fulfill({ json: { ready: false, items, next: null, views: {}, counts: {} } });
  });
  await page.goto(base + '/');
  await expect(page.locator('[data-launch-id="launch-fixture"]')).toBeVisible();
  await expect(page.locator('[data-spot-grid] .dg-spot:not(.is-open)')).toBeVisible();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('#main').evaluate(main => {
      const box = (selector: string) => main.querySelector(selector)!.getBoundingClientRect();
      const art = box('[data-launch-id] .dg-logo-link');
      const copy = box('[data-launch-id] .dg-main');
      const controls = box('[data-launch-id] .dg-actions');
      return {
        ordered: box('.dg-home-hero').bottom <= box('.dg-hero-panel').top &&
          box('.dg-hero-panel').bottom <= box('#this-week').top &&
          box('.dg-board').bottom <= box('.dg-home-extras').top &&
          box('.dg-home-extras').bottom <= box('.dg-about').top,
        separated: art.right <= copy.left && copy.right <= controls.left,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(layout, `Layout at ${width}px`).toEqual({ ordered: true, separated: true, overflow: 0 });
  }
  await page.getByRole('link', { name: 'Browse launches' }).click();
  await expect(page).toHaveURL(/#this-week$/);
});

test('resource icons replace initials in one slot and votes stay separate', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route('**/api/**', route => route.fulfill({ json: { counts: {} } }));
  await page.route('https://icons.duckduckgo.com/**', route => {
    if (!route.request().url().includes('60fps.design')) return route.abort();
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="10" fill="black"/></svg>',
    });
  });

  await page.goto(base + '/resources');
  const link = page.locator('a[href="https://60fps.design"]').first();
  await expect(link.locator('.rl-icon')).toBeVisible();
  await expect(link.locator('.rl-fallback')).toBeHidden();
  const row = page.locator('.rl-grid > li:visible').nth(1);
  await expect(row.locator('.rl-fallback')).toBeVisible();
  await expect(row.locator('.rl-icon')).toBeHidden();
  const [resource, vote] = await Promise.all([row.locator('.rl-card').boundingBox(), row.locator('.rl-vote').boundingBox()]);
  expect(vote!.x).toBeGreaterThanOrEqual(resource!.x + resource!.width);
});
