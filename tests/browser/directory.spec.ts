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
  const activeLaunches = rail.getByRole('link', { name: 'Launches', exact: true });
  await expect(activeLaunches).toHaveAttribute('aria-current', 'page');
  await expect(activeLaunches).toHaveCSS('box-shadow', /inset/);
  await expect(rail.getByRole('link', { name: 'Submit a launch' })).toHaveAttribute('href', '/submit-project');
  await expect(rail).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(rail).toHaveCSS('background-image', 'none');
  const workspace = rail.getByRole('navigation', { name: 'Workspace navigation' });
  await expect(workspace.locator('a')).toHaveText([
    'Launches', 'Directory', 'Threads', 'News', 'Resources', 'Weekly winners', 'For Investors', 'Feedback points', 'Embed badges', 'Shop',
  ]);
  await expect(workspace.getByRole('link', { name: 'News', exact: true })).toBeVisible();
  await expect(workspace.locator('a[href="/badges"]')).toBeHidden();
  const makers = workspace.locator('summary', { hasText: 'For makers' });
  await makers.press('ArrowDown');
  await expect(workspace.getByRole('link', { name: 'Feedback points' })).toBeFocused();
  await expect(workspace.getByRole('link', { name: 'Embed badges' })).toHaveAttribute('href', '/badges');
  await expect(workspace.locator('.site-menu-connector').first()).toBeVisible();
  await makers.press('Enter');
  await expect(workspace.locator('a[href="/badges"]')).toBeHidden();
  const login = rail.getByRole('link', { name: 'Log In', exact: true });
  await expect(login).toHaveAttribute('href', '/login');
  await expect(rail.locator('[data-open-search]')).toHaveCount(0);
  const submit = rail.getByRole('link', { name: 'Submit a launch' });
  const [loginBox, submitBox] = await Promise.all([login.boundingBox(), submit.boundingBox()]);
  expect(loginBox!.x).toBeCloseTo(submitBox!.x, 0);
  expect(loginBox!.width).toBeCloseTo(submitBox!.width, 0);
  expect(submitBox!.y).toBeGreaterThan(loginBox!.y);
  await expect(page.locator('.dg-workspace-content > header')).toHaveCount(0);
  const [railBox, mainBox] = await Promise.all([rail.boundingBox(), page.locator('#main').boundingBox()]);
  expect(railBox!.width).toBe(196);
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
  await expect(rail.locator('.dg-shell-material')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(login).toHaveCSS('color', 'rgb(248, 248, 248)');
  await page.locator('.site-menu-trigger').click();
  const directory = page.getByRole('navigation', { name: 'Site menu' }).getByRole('link', { name: 'Directory', exact: true });
  await expect(directory).toBeVisible();
  await directory.click();
  await expect(page).toHaveURL(base + '/discover');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the desktop sidebar opens the current branch and scrolls in a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 430 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/badges');
  const rail = page.getByRole('complementary', { name: 'Digivated sidebar' });
  const nav = rail.getByRole('navigation', { name: 'Workspace navigation' });
  await expect(nav.getByRole('link', { name: 'Embed badges' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.locator('a[href="/news"]')).toBeHidden();
  await expect(nav.locator('.site-menu-branch[open] .site-menu-connector').first()).toHaveCSS('animation-name', 'none');
  await nav.locator('summary', { hasText: 'Explore' }).press('Enter');
  await expect(nav.getByRole('link', { name: 'Weekly winners' })).toHaveAttribute('href', '/winners');
  const action = rail.getByRole('link', { name: 'Submit a launch' });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1120);
  await action.click();
  await expect(page).toHaveURL(base + '/submit-project');
});


test('the upcoming batch and countdown agree on Monday, November 23', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-22T04:00:00Z'));
  await page.route('**/api/projects*', route => route.fulfill({ json: { items: projects, next: null } }));
  await page.route('**/api/launches?view=upcoming', route => route.fulfill({ json: { items: [{
    id: 'upcoming-fixture', name: 'Scheduled fixture', image: '/digivated-daylight-mark.png', launchAt: '2026-11-23T14:00:00.000Z', watchers: 1,
  }, {
    id: 'missing-logo', name: 'Broken image fixture', image: '/missing-project-logo.webp', launchAt: '2026-11-23T14:00:00.000Z',
  }] } }));
  await page.route('**/missing-project-logo.webp', route => route.fulfill({ status: 404 }));
  await page.goto(base + '/');
  await expect(page.locator('#queue-countdown')).toHaveAttribute('datetime', '2026-11-23T14:00:00.000Z');
  const nav = page.getByRole('navigation', { name: 'Browse launches' });
  await nav.getByRole('link', { name: 'Upcoming' }).click();
  await expect(page).toHaveURL(base + '/#launching-next');
  await expect(nav.getByRole('link', { name: 'Browse by category' })).toHaveAttribute('href', '/discover#directory-filters');
  await expect(page.getByRole('region', { name: 'Launching next' })).toContainText('Mon, Nov 23 · 9:00 AM Eastern');
  await expect(page.locator('[data-upcoming-id="upcoming-fixture"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('button', { name: 'Notify me when Scheduled fixture launches' })).toBeVisible();
  const upcoming = page.locator('[data-upcoming-id="upcoming-fixture"] img');
  await expect(upcoming).toHaveAttribute('src', '/digivated-daylight-mark.png');
  await upcoming.scrollIntoViewIfNeeded();
  await expect.poll(() => upcoming.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(upcoming).toHaveCSS('object-fit', 'contain');
  await expect(page.locator('[data-upcoming-id="upcoming-fixture"] .dg-monogram')).toBeHidden();
  const missingLogo = page.locator('[data-upcoming-id="missing-logo"] .dg-logo');
  await missingLogo.scrollIntoViewIfNeeded();
  await expect(missingLogo.locator('img')).toHaveCount(0);
  await expect(missingLogo.locator('.dg-monogram')).toHaveText('BR');
  await expect(missingLogo.locator('.dg-monogram')).toBeVisible();
});

test('sidebar navigation keeps the content and footer aligned across destinations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/**', route => route.fulfill({ json: { ready: false, items: [], threads: [] } }));
  await page.goto(base + '/');
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
  const shell = () => page.evaluate(() => {
    const rail = document.querySelector('.dg-workspace-rail')!;
    const main = document.querySelector('#main')!;
    const footer = document.querySelector('.dg-footer-inner')!;
    const railBox = rail.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const style = getComputedStyle(main);
    return {
      rail: [railBox.x, railBox.width],
      content: [mainBox.left + parseFloat(style.paddingLeft), mainBox.right - parseFloat(style.paddingRight)],
      footer: [footer.getBoundingClientRect().left, footer.getBoundingClientRect().right],
    };
  });
  const home = await shell();
  expect(home.footer).toEqual(home.content);
  await nav.getByRole('link', { name: 'Directory', exact: true }).click();
  await expect(page).toHaveURL(base + '/discover');
  await expect(nav.getByRole('link', { name: 'Directory', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await shell()).toEqual(home);

  await nav.getByRole('link', { name: 'News', exact: true }).click();
  await expect(page).toHaveURL(base + '/news');
  await expect(nav.getByRole('link', { name: 'News', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('contentinfo').locator('.dg-footer-group h2').first()).toHaveCSS('color', 'rgb(27, 27, 27)');
  expect(await shell()).toEqual(home);

  await page.goBack();
  await expect(page).toHaveURL(base + '/discover');
  await expect(nav.getByRole('link', { name: 'Directory', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#main')).toHaveCSS('view-transition-name', 'none');
});

test('signed-out launch browsing skips account setup and keeps focused rows during feed updates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const accountRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/project-account') accountRequests.push(request.url());
  });
  await page.route('**/api/projects?**', route => route.fulfill({ json: { items: projects, next: null } }));
  let finishUpcoming!: () => void;
  const upcoming = new Promise<void>(resolve => { finishUpcoming = resolve; });
  await page.route('**/api/launches?view=upcoming', async route => {
    await upcoming;
    await route.fulfill({ json: { items: [{
      id: 'upcoming-after-board', name: 'Upcoming after board', launchAt: '2026-11-23T14:00:00.000Z', watchers: 0,
    }] } });
  });
  await page.goto(base + '/');
  try {
    await expect(page.locator('[data-stat-products]')).toHaveText('27');
    const existing = page.locator('li[data-launch-id] h3 a').first();
    await existing.focus();
    finishUpcoming();
    await expect(page.getByText('Upcoming after board', { exact: true })).toBeVisible();
    await expect(existing).toBeFocused();
    await expect(page.getByRole('link', { name: 'Log In', exact: true }).first()).toBeVisible();
    expect(accountRequests).toEqual([]);
  } finally {
    finishUpcoming();
  }
});
