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
  image: i === 26 ? '/digivated-daylight-mark.png' : '',
  url: 'https://example.com',
  pageUrl: '/projects/listing/directory-' + i,
  votes: { all: 100 - i },
  date: new Date(Date.UTC(2026, 9, i + 1)).toISOString(),
}));

for (const width of [390, 1440]) {
  test(`Directory navigation and project controls work at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/projects*', route => route.fulfill({ json: { items: projects, next: null } }));
    await page.goto(base + '/discover');

    await expect(page.locator('.site-breadcrumbs [aria-current="page"]')).toHaveText('Directory');
    await expect(page.locator('header a[href="/discover"]').first()).toHaveText('Directory');
    await expect(page.locator('a[href^="/rankings"]')).toHaveCount(0);
    await expect(page.locator('[data-dir-podium]')).toHaveCount(0);
    const rows = page.locator('[data-dir-list] .dg-dir-open');
    await expect(rows).toHaveCount(24);
    await expect(page.getByLabel('Sort by')).toHaveValue('new');
    await expect(rows.first()).toHaveText('Directory fixture 26');
    await expect(page.locator('#project-directory-26 .dg-logo img')).toHaveCSS('object-fit', 'contain');
    await expect(page.locator('#project-directory-25 .dg-monogram')).toHaveText('DI');
    await page.getByLabel('Sort by').selectOption('top');
    await expect(page).toHaveURL(/sort=top$/);
    await page.reload();
    await expect(rows.first()).toHaveText('Directory fixture 0');
    await page.getByLabel('Sort by').selectOption('new');
    await expect(page).toHaveURL(base + '/discover');
    await expect(rows.first()).toHaveText('Directory fixture 26');
    await page.locator('[data-dir-more]').click();
    await expect(rows).toHaveCount(27);
    await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Education');
    await expect(page).toHaveURL(/category=Education$/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveText('Directory fixture 0');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue('Education');
    await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('');
    await expect(page).toHaveURL(base + '/discover');
    await page.locator('[data-dir-search]').fill('Directory fixture 26');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('href', '/projects/listing/directory-26');
    await expect(page.locator('[data-dir-list] .dg-comments')).toHaveAttribute('href', '/projects/listing/directory-26#feedback');
    expect(errors).toEqual([]);
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

test('workspace navigation and homepage search work on desktop and mobile', async ({ page }) => {
  await page.route('**/api/projects*', route => route.fulfill({ json: { items: projects, next: null } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + '/');
  const rail = page.getByRole('complementary', { name: 'Digivated sidebar' });
  await expect(rail.getByRole('link', { name: 'Launches', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(rail.getByRole('link', { name: 'Submit a launch' })).toHaveAttribute('href', '/submit-project');
  const [railBox, mainBox] = await Promise.all([rail.boundingBox(), page.locator('#main').boundingBox()]);
  expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(mainBox!.x);

  const search = page.getByRole('search', { name: 'Find a product' }).getByRole('searchbox');
  await search.fill('Directory fixture 26');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/discover\?q=Directory\+fixture\+26$/);
  await expect(rail.getByRole('link', { name: 'Directory', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-dir-search]')).toHaveValue('Directory fixture 26');
  await expect(page.locator('[data-dir-list] .dg-dir-open')).toHaveText(['Directory fixture 26']);
  await page.reload();
  await expect(page.locator('[data-dir-list] .dg-dir-open')).toHaveText(['Directory fixture 26']);

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(rail).toBeHidden();
  await page.locator('.site-menu-trigger').click();
  await expect(page.getByRole('navigation', { name: 'Site menu' }).getByRole('link', { name: 'Directory', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-dir-search]').press('Escape');
  await expect(page).toHaveURL(base + '/discover');
  await expect(page.locator('[data-dir-list] .dg-dir-open')).toHaveCount(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
