import { expect, test } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

test('homepage activity, launches and community sections stay in reading order', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => sessionStorage.setItem('digivated-announcement-seen-v2', '1'));
  const date = new Date().toISOString();
  const fullDescription = 'A focused tool for independent makers. ' + 'The full product overview has more information for anyone who wants to read the details. '.repeat(3);
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const items = url.pathname === '/api/projects' ? [{
      id: 'launch-fixture', name: 'An unusually long name for a featured product ' + 'a'.repeat(55),
      description: fullDescription, creator: 'An independent maker',
      category: 'Writing & Content', status: 'featured', date, url: 'https://example.com',
      pageUrl: '/projects/listing/launch-fixture', image: '/digivated-daylight-mark.png',
      comments: 20, votes: { all: 17, weekly: 17 },
    }] : [];
    return route.fulfill({ json: { ready: false, items, next: null, views: {}, counts: {} } });
  });
  await page.goto(base + '/');
  const launch = page.locator('[data-launch-id="launch-fixture"]');
  await expect(launch).toBeVisible();
  await expect(launch).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(launch.locator('.dg-project-art img')).toHaveCSS('object-fit', 'contain');
  const excerpt = await launch.locator('.dg-tagline').textContent();
  expect(excerpt).toMatch(/^A focused tool for independent makers\..+…$/);
  expect(Array.from(excerpt!).length).toBeLessThanOrEqual(81);
  await expect(launch.locator('.dg-project-art')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('a[href^="/winners"], a[href="/points"], .dg-dot, [data-points-chip]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /how (launches are ranked|ranking works)/i })).toHaveCount(0);
  const featured = page.locator('[data-spot-grid] .dg-spot:not(.is-open)');
  await expect(featured.locator('.dg-spot-name')).toContainText('An unusually long name');
  const titleBounds = (await featured.locator('.dg-spot-name').boundingBox())!;
  expect(titleBounds.width).toBeGreaterThan(100);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('#this-week .dg-list-title')).toBeInViewport();
    const layout = await page.locator('#main').evaluate((main, stackActions) => {
      const box = (selector: string) => main.querySelector(selector)!.getBoundingClientRect();
      const art = box('[data-launch-id] .dg-logo-link');
      const copy = box('[data-launch-id] .dg-main');
      const controls = box('[data-launch-id] .dg-actions');
      return {
        ordered: box('.dg-home-hero').bottom <= box('.dg-hero-panel').top &&
          box('.dg-hero-panel').bottom <= box('#this-week').top &&
          box('.dg-board').bottom <= box('.dg-home-extras').top &&
          Math.max(box('.dg-board').bottom, box('.dg-home-extras').bottom) <= box('.dg-about').top,
        separated: art.right <= copy.left && (stackActions ? copy.bottom <= controls.top + 1 : copy.right <= controls.left),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    }, width <= 480);
    expect(layout, `Layout at ${width}px`).toEqual({ ordered: true, separated: true, overflow: 0 });
    if (width >= 1120) {
      await expect(page.locator('.dg-hero-actions .dg-btn-primary')).toHaveCSS('background-color', 'rgb(23, 23, 23)');
      await expect(page.locator('.board-categories button[aria-pressed="true"]')).toHaveCSS('background-color', 'rgb(23, 23, 23)');
      await expect(launch.locator('.dg-tagline')).toHaveCSS('white-space', 'normal');
      await expect(launch.locator('.dg-meta')).toContainText('By An independent maker');
      await expect(launch.locator('.dg-meta')).toBeVisible();
      const [board, about] = await Promise.all(['.dg-home', '.dg-about'].map(selector => page.locator(selector).boundingBox()));
      expect(board!.x).toBeCloseTo(about!.x, 0);
      expect(board!.width).toBeCloseTo(1120, 0);
      expect(board!.width).toBeCloseTo(about!.width, 0);
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  const launchNav = page.getByRole('navigation', { name: 'Browse launches' });
  const [thisWeek, lastWeek] = await Promise.all(['This week', 'Last week'].map(
    name => launchNav.getByRole('link', { name, exact: true }).boundingBox(),
  ));
  expect(thisWeek!.y).toBeCloseTo(lastWeek!.y, 0);
  expect(lastWeek!.x).toBeGreaterThan(thisWeek!.x);
  const feedback = page.locator('.dg-home-side .dg-fp-strip');
  const [description, toggle] = await Promise.all([
    feedback.locator('.dg-fp-strip-copy').boundingBox(),
    feedback.locator('.dg-fp-toggle').boundingBox(),
  ]);
  expect(toggle!.y).toBeGreaterThanOrEqual(description!.y + description!.height);
  const feedbackSummary = feedback.locator('summary');
  await feedbackSummary.focus();
  await expect(feedbackSummary).toHaveCSS('outline-color', 'rgb(36, 36, 36)');
  await expect(feedbackSummary).toHaveCSS('outline-style', 'solid');
  await feedbackSummary.press('Enter');
  await expect(feedback.getByRole('link', { name: 'Find a product that needs feedback' })).toHaveAttribute('href', '/discover?sort=needs');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('navigation', { name: 'Browse launches' }).getByRole('link', { name: 'This week', exact: true }).click();
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
  const alphabeticalSort = page.getByRole('button', { name: 'a–z' });
  await expect(alphabeticalSort).toHaveCSS('color', 'rgb(27, 27, 27)');
  await alphabeticalSort.click();
  await expect(alphabeticalSort).toHaveAttribute('aria-pressed', 'true');
  await expect(alphabeticalSort).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByRole('group', { name: 'Sort resources' }).getByRole('button', { name: 'most helpful' }).click();
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
  await expect(first.locator('.dg-tagline')).toHaveText('A product that helps independent teams.');
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

test('signed-in feedback points and the how-it-works control fit the homepage sidebar', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('digivated-announcement-seen-v2', '1');
    localStorage.setItem('sb-fixture-auth-token', JSON.stringify({
      access_token: 'fixture-token',
      refresh_token: 'fixture-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'fixture-owner' },
    }));
  });
  await page.route('**/api/**', route => route.fulfill({ json: { items: [], next: null } }));
  await page.route('**/api/project-account?*', route => route.fulfill({
    json: route.request().url().includes('action=config')
      ? { ready: true, url: 'https://fixture.supabase.co', key: 'fixture-key' }
      : { email: 'fixture@example.com' },
  }));
  await page.route('**/api/feedback-points?action=me', route => route.fulfill({ json: { total: 0 } }));
  await page.goto(base + '/');
  const card = page.locator('.dg-home-side [data-feedback-points]');
  const summary = card.locator('summary');
  const meter = summary.locator('[data-fp-me]');
  const toggle = summary.getByText('How it works');
  await expect(meter).toBeVisible();
  await expect(meter).toContainText('0 pts');

  for (const total of [0, 12345]) {
    await page.evaluate(total => document.dispatchEvent(new CustomEvent('digivated:points', { detail: { total } })), total);
    await expect(meter).toContainText(`${total} pts`);
    for (const width of [320, 390, 900, 1024, 1120, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });

      for (const open of [false, true]) {
        await expect(card).toHaveJSProperty('open', open);
        const [summaryBox, meterBox, toggleBox] = await Promise.all([
          summary.boundingBox(), meter.boundingBox(), summary.locator('.dg-fp-toggle').boundingBox(),
        ]);
        expect(summaryBox && meterBox && toggleBox).toBeTruthy();
        const summaryRight = summaryBox!.x + summaryBox!.width;
        const meterRight = meterBox!.x + meterBox!.width;
        const toggleRight = toggleBox!.x + toggleBox!.width;
        expect(meterRight, `Points fit at ${width}px`).toBeLessThanOrEqual(summaryRight + 1);
        expect(toggleRight, `Control fits at ${width}px`).toBeLessThanOrEqual(summaryRight + 1);
        expect(meterRight <= toggleBox!.x || meterBox!.y + meterBox!.height <= toggleBox!.y,
          `Points and control are separate at ${width}px, expanded=${open}`).toBe(true);
        await toggle.click();
      }
    }
  }
});
