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
  const featured = page.locator('[data-spot-grid] .dg-spot:not(.is-open)');
  await expect(featured.locator('.dg-spot-name')).toContainText('An unusually long name');
  const titleBounds = (await featured.locator('.dg-spot-name').boundingBox())!;
  expect(titleBounds.width).toBeGreaterThan(100);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('#this-week .dg-list-title')).toBeInViewport();
    const layout = await page.locator('#main').evaluate((main, wide) => {
      const box = (selector: string) => main.querySelector(selector)!.getBoundingClientRect();
      const art = box('[data-launch-id] .dg-logo-link');
      const copy = box('[data-launch-id] .dg-main');
      const controls = box('[data-launch-id] .dg-actions');
      return {
        ordered: box('.dg-home-hero').bottom <= box('.dg-hero-panel').top &&
          box('.dg-hero-panel').bottom <= box('#this-week').top &&
          (wide ? box('.dg-board').right <= box('.dg-home-extras').left :
            box('.dg-board').bottom <= box('.dg-home-extras').top) &&
          Math.max(box('.dg-board').bottom, box('.dg-home-extras').bottom) <= box('.dg-about').top,
        separated: art.right <= copy.left && copy.right <= controls.left,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    }, width > 880);
    expect(layout, `Layout at ${width}px`).toEqual({ ordered: true, separated: true, overflow: 0 });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  const feedback = page.locator('.dg-home-side .dg-fp-strip');
  const [description, toggle] = await Promise.all([
    feedback.locator('.dg-fp-strip-copy').boundingBox(),
    feedback.locator('.dg-fp-toggle').boundingBox(),
  ]);
  expect(toggle!.y).toBeGreaterThanOrEqual(description!.y + description!.height);
  await feedback.locator('summary').click();
  await expect(feedback.getByRole('link', { name: 'Find a product that needs feedback' })).toHaveAttribute('href', '/discover?sort=needs');
  await page.setViewportSize({ width: 1440, height: 900 });
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


test('expanding weekly launches keeps the new entries reachable by keyboard', async ({ page }) => {
  const date = new Date().toISOString();
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const items = url.pathname === '/api/projects' ? Array.from({ length: 12 }, (_, index) => ({
      id: 'week-product-' + index, name: 'Product ' + index, date, category: 'Apps',
      status: 'approved', creator: 'Maker', description: 'A product that helps independent teams.',
      pageUrl: '/projects/listing/week-product-' + index, url: 'https://example.com/',
      comments: 2, votes: { all: 1, weekly: 1 },
    })) : [];
    return route.fulfill({ json: { ready: false, items, next: null } });
  });
  await page.goto(base + '/');
  const week = page.locator('#this-week');
  const rows = week.locator('[data-launch-id]');
  await expect(rows).toHaveCount(10);
  const first = rows.first();
  await expect(first.getByRole('link', { name: /Discussion for Product/ })).toHaveAttribute('href', /#feedback$/);
  await expect(first.getByRole('button', { name: /Upvote Product/ })).toHaveAttribute('aria-pressed', 'false');
  await page.locator('html[data-motion-ready]').waitFor();
  const tagline = first.locator('.dg-tagline');
  if (await page.evaluate(() => CSS.supports('animation-timeline: view()'))) {
    await expect(tagline).toHaveCSS('animation-name', 'dg-launch-row-enter');
  }
  await week.getByRole('button', { name: 'View 2 more' }).press('Enter');
  await expect(rows).toHaveCount(12);
  await expect(rows.nth(10).getByRole('heading').getByRole('link')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(rows.last().locator('.dg-tagline')).toHaveCSS('animation-name', 'none');
});
