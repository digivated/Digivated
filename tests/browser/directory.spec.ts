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
  await expect(rail).toHaveCSS('background-image', /radial-gradient/);
  const login = rail.getByRole('link', { name: 'Log In', exact: true });
  await expect(login).toHaveAttribute('href', '/login');
  await expect(rail.locator('[data-open-search]')).toHaveCount(0);
  const submit = rail.getByRole('link', { name: 'Submit a launch' });
  const [loginBox, submitBox] = await Promise.all([login.boundingBox(), submit.boundingBox()]);
  expect(loginBox!.x).toBeCloseTo(submitBox!.x, 0);
  expect(loginBox!.width).toBeCloseTo(submitBox!.width, 0);
  await expect(page.locator('.dg-workspace-content > header')).toHaveCount(0);
  const [railBox, mainBox] = await Promise.all([rail.boundingBox(), page.locator('#main').boundingBox()]);
  expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(mainBox!.x);

  const search = page.getByRole('search', { name: 'Find a product' }).getByRole('searchbox');
  const status = page.locator('[data-launch-search-status]');
  await expect(page.locator('[data-stat-products]')).toHaveText('27');
  await search.fill('Directory fixture 26');
  await expect(status).toHaveText('1 of 27 launches');
  await expect(page.locator('[data-launch-id]:visible h3')).toHaveText(['Directory fixture 26']);
  await search.press('Enter');
  await expect(page).toHaveURL(base + '/');
  await search.press('ArrowDown');
  await expect(page.getByRole('link', { name: 'Directory fixture 26', exact: true })).toBeFocused();
  const clear = page.getByRole('button', { name: 'Clear launch search' });
  await clear.click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(clear).toBeHidden();
  await search.fill('unmatched query');
  await expect(status).toHaveText('No launches match your search.');
  await expect(page.locator('[data-launch-id]:visible')).toHaveCount(0);
  await search.press('Escape');
  await expect(status).toBeHidden();
  await expect(page.locator('[data-launch-id]:visible').first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(rail.locator('.dg-rail-navigation')).toBeHidden();
  await expect(rail.locator('.dg-shell-material')).toHaveCSS('backdrop-filter', /blur/);
  await page.locator('.site-menu-trigger').click();
  const directory = page.getByRole('navigation', { name: 'Site menu' }).getByRole('link', { name: 'Directory', exact: true });
  await expect(directory).toBeVisible();
  await directory.click();
  await expect(page).toHaveURL(base + '/discover');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('the upcoming batch and countdown agree on Monday, November 23', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-22T04:00:00Z'));
  await page.route('**/api/projects*', route => route.fulfill({ json: { items: projects, next: null } }));
  await page.route('**/api/launches?view=upcoming', route => route.fulfill({ json: { items: [{
    id: 'upcoming-fixture', name: 'Scheduled fixture', launchAt: '2026-11-23T14:00:00.000Z', watchers: 1,
  }] } }));
  await page.goto(base + '/');
  await expect(page.locator('#queue-countdown')).toHaveAttribute('datetime', '2026-11-23T14:00:00.000Z');
  await expect(page.getByRole('region', { name: 'Launching next' })).toContainText('Mon, Nov 23 · 9:00 AM Eastern');
  await expect(page.getByRole('button', { name: 'Notify me when Scheduled fixture launches' })).toBeVisible();
});
