import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';
const projects = Array.from({ length: 27 }, (_, i) => ({
  id: 'directory-' + i,
  name: 'Directory fixture ' + i,
  creator: 'Builder',
  description: 'An independent project for the directory test.',
  category: i === 0 ? 'Education' : 'Apps',
  status: i === 0 ? 'featured' : 'approved',
  url: 'https://example.com',
  pageUrl: '/projects/listing/directory-' + i,
  votes: { all: 100 - i },
}));

for (const width of [390, 1440]) {
  test(`Directory navigation and project controls work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/projects*', route => route.fulfill({ json: { items: projects, next: null } }));
    await page.goto(base + '/discover');

    await expect(page.locator('.site-breadcrumbs [aria-current="page"]')).toHaveText('Directory');
    await expect(page.locator('header a[href="/discover"]').first()).toHaveText('Directory');
    await expect(page.locator('a[href^="/rankings"]')).toHaveCount(0);
    await expect(page.locator('[data-dir-podium]')).toHaveCount(0);
    const rows = page.locator('[data-dir-list] .dg-dir-open');
    await expect(rows).toHaveCount(24);
    await page.locator('[data-dir-more]').click();
    await expect(rows).toHaveCount(27);
    await page.locator('[data-dir-search]').fill('Directory fixture 26');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('href', '/projects/listing/directory-26');
    await expect(page.locator('[data-dir-list] .dg-comments')).toHaveAttribute('href', '/projects/listing/directory-26#feedback');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('the retired Rankings route redirects and is absent from the sitemap', async ({ request }) => {
  // Astro preview does not apply Vercel routing rules.
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  expect(config.redirects).toContainEqual({ source: '/rankings', destination: '/discover', permanent: true });
  const sitemap = await request.get(base + '/sitemap.xml');
  expect(await sitemap.text()).not.toContain('https://digivated.com/rankings');
});
