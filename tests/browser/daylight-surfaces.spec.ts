import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { renderLaunch } from '../../server/launch-pages.mjs';
import { footerGroups } from '../../src/data/site-navigation.mjs';

const base = 'http://127.0.0.1:4321';
const date = '2026-11-17T12:00:00.000Z';
const thread = {
  id: 'fixture-thread', slug: 'fixture-thread-1', title: 'How should I launch ' + 'a'.repeat(75) + '?',
  forum: 'feedback', forumName: 'Ask for feedback', author: { name: 'Example maker', profileUrl: '/creator?id=fixture' },
  createdAt: date, comments: 1, votes: 3, pinned: true,
  excerpt: 'I have a working prototype and would like feedback on the launch plan.',
  body: 'I have a working prototype and would like feedback on the launch plan.\n\n' + 'b'.repeat(100),
};
const reply = {
  id: '5d4c8d69-7663-432e-a018-a6897a680e44', author: { name: 'Example builder' }, date,
  body: 'Start with the group that already uses your tool.', likes: 0,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { ready: false, items: [], comments: [], next: null } }));
});

for (const width of [320, 768, 1440]) {
  test(`Threads controls and separate links fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/threads?**', route => {
      const params = new URL(route.request().url()).searchParams;
      return route.fulfill({ json: params.has('view') ? {
        comments: [{ ...reply, subject: { type: 'thread', title: thread.title, href: '/threads/' + thread.slug } }],
      } : {
        threads: params.get('offset') === '1' ? [{ ...thread, id: 'second', title: 'Another thread', slug: 'another-thread' }] : [thread],
        total: 2, next: params.get('offset') === '0' ? 1 : null,
      } });
    });
    await page.goto(base + '/threads');
    const area = page.locator('[data-threads-page]');
    await expect(area.getByRole('heading', { name: 'Threads', exact: true })).toBeVisible();
    await expect(area.getByRole('button', { name: 'New', exact: true })).toHaveCSS('min-height', '44px');
    await expect(area.getByRole('link', { name: 'Start a thread', exact: true })).toHaveCount(1);
    const topics = area.locator('.dg-forum-topics');
    if (width <= 760) {
      await expect(topics.getByRole('navigation')).toBeHidden();
      await topics.locator('summary').click();
    }
    const general = topics.getByRole('link', { name: 'General' });
    await expect(general).toBeVisible();
    await expect(general).toHaveCSS('overflow-wrap', 'normal');
    if (width <= 760) await expect(topics.getByRole('navigation')).toHaveCSS('display', 'grid');

    const row = area.locator('.dg-thread-row').first();
    await expect(row.getByRole('link', { name: thread.title })).toHaveAttribute('href', '/threads/' + thread.slug);
    await expect(row.getByRole('link', { name: '1 reply' })).toHaveAttribute('href', '/threads/' + thread.slug + '#replies');
    const widths = await area.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('.dg-forum-nav, .dg-forum-search input, .dg-forum-search button, .dg-thread-row, .dg-thread-main, .dg-thread-side')]
        .every(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= bounds.left - 1 && box.right <= bounds.right + 1; });
    });
    expect(widths).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await area.getByRole('button', { name: 'Top', exact: true }).click();
    await expect(page).toHaveURL(/sort=top/);
    await area.getByRole('button', { name: 'Load more' }).click();
    await expect(area.getByText('Another thread')).toBeVisible();
    await row.getByRole('link', { name: 'Ask for feedback' }).click();
    await expect(page).toHaveURL(/forum=feedback/);
    await expect(area.getByRole('link', { name: 'Start a thread' })).toHaveAttribute('href', '/threads/new?forum=feedback');
    await area.getByRole('searchbox', { name: 'Search all threads' }).fill('a'.repeat(80));
    await area.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=a{80}/);
    await expect(area.locator('h1')).toContainText('a'.repeat(80));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await area.getByRole('link', { name: 'Recent comments' }).click();
    await expect(area.getByText(reply.body)).toBeVisible();
    await expect(area.getByRole('group', { name: 'Sort threads' })).toBeHidden();
  });
}

test('signed-in composer keeps its forum selection, publishes and opens replies', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const email = 'threads@example.invalid';
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: '4ad90c9b-5666-482d-899c-d0d3ef41ee46', email, email_confirmed_at: date, role: 'authenticated', aud: 'authenticated' };
  const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, email, exp: expires })).toString('base64url'), 'fixture'].join('.');
  await page.addInitScript(({ token, user, expires }) => {
    try { localStorage.setItem('sb-fixture-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: expires, expires_in: 3600, token_type: 'bearer', user })); } catch {}
  }, { token, user, expires });
  await page.route('**/api/project-account?action=config', route => route.fulfill({ json: { ready: true, url: 'https://fixture.supabase.co', key: 'sb_publishable_fixture' } }));
  await page.route('https://fixture.supabase.co/auth/v1/**', route => route.fulfill({ json: user }));
  await page.route('**/api/creator-profile', route => route.fulfill({ json: { profile: { name: 'Example maker' } } }));
  let post: Record<string, unknown> | undefined;
  await page.route('**/api/threads', route => {
    post = route.request().postDataJSON();
    return route.fulfill({ json: { thread } });
  });
  await page.route('**/api/threads?slug=fixture-thread-1', route => route.fulfill({ json: { thread } }));
  await page.route('**/api/discussions?**', route => route.fulfill({ json: { comments: [reply], viewer: { signedIn: true, name: 'Example maker', needsName: true } } }));
  await page.route(base + '/threads/' + thread.slug, route => route.fulfill({
    path: 'dist/threads/thread/index.html', contentType: 'text/html',
  }));
  await page.goto(base + '/threads/new?forum=feedback');
  const form = page.locator('[data-new-thread]');
  await expect(form.locator('[value="feedback"]')).toBeChecked();
  await form.getByLabel(/^Title/).fill(thread.title);
  await form.getByLabel(/^Details/).fill(thread.body);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await form.getByRole('button', { name: 'Post thread' }).click();
  await expect(page).toHaveURL(new RegExp(thread.slug + '$'));
  await expect(page.getByRole('heading', { name: thread.title })).toBeVisible();
  expect(post).toMatchObject({ action: 'create', forum: 'feedback', title: thread.title, body: thread.body });
  await page.locator('[data-thread-actions]').getByRole('link', { name: 'Reply' }).click();
  await expect(page.getByText(reply.body)).toBeVisible();
  for (const field of [page.getByRole('textbox', { name: 'Write a comment' }), page.getByRole('textbox', { name: 'Display name (shown with your posts)' })]) {
    await expect(field).toBeVisible();
    expect(await field.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  }

  await expect(page).toHaveURL(/#replies$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [320, 1440]) {
  test(`shared footer stays compact and preserves destinations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/discover', '/threads', '/news', '/submit-project']) {
      await page.goto(base + path);
      const footer = page.getByRole('contentinfo');
      await expect(footer).toHaveCount(1);
      for (const group of footerGroups) {
        for (const [href, label] of group.links) {
          await expect(footer.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href);
        }
      }
      const height = (await footer.boundingBox())!.height;
      expect(height, path).toBeLessThan(width === 320 ? 850 : 550);
      const action = footer.getByRole('link', { name: 'New Launch', exact: true });
      await expect(action).toHaveCount(1);
      await expect(footer).toHaveCSS('background-color', 'rgba(20, 20, 20, 0.91)');
      await expect(footer.locator('.dg-footer-group').filter({ has: page.getByRole('link', { name: 'New Launch', exact: true }) })).toHaveText(/For makers/);
      await expect(footer.getByRole('link', { name: 'Email settings' })).toHaveAttribute('href', '/account?tab=settings');
      await expect(footer.locator('[data-scene-toggle]')).toHaveCount(0);
      const grid = footer.locator('.dg-footer-groups');
      const positions = await grid.locator('h2').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
      expect(positions[0].y).toBeCloseTo(positions[1].y);
      expect(positions[0].x).toBeLessThan(positions[1].x);
      const credit = footer.locator('[data-launchai-badge]');
      await expect(credit).toHaveAttribute('href', 'https://launchai.tools');
      await credit.scrollIntoViewIfNeeded();
      await expect.poll(() => credit.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(footer.locator('.dg-footer-bottom small')).toContainText('Digivated');
      await expect(footer.getByRole('navigation', { name:'Digivated social links' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    }
    const currentFooter = page.getByRole('contentinfo');
    await currentFooter.getByRole('link', { name: 'Report a bug' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report a bug' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    await currentFooter.getByRole('link', { name: 'Email settings' }).click();
    await expect(page).toHaveURL(/\/account\?tab=settings$/);
    await expect(page.getByRole('link', { name: 'Log in or sign up' })).toHaveAttribute('href', '/login?next=%2Faccount%3Ftab%3Dsettings');

    await page.goto(base + '/start');
    const compact = page.getByRole('contentinfo');
    await expect(compact.locator('[data-scene-toggle]')).toHaveCount(0);
    await expect(compact.getByRole('link', { name: 'Digivated', exact:true })).toHaveAttribute('href', '/');
    await expect(compact.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/account');
    await expect(compact.getByRole('link', {name:'News',exact:true})).toHaveAttribute('href','/news');
  });

  test(`listing names, actions and discussion are legible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const template = readFileSync('server/generated/project.html', 'utf8');
    const listing = '/projects/listing/fixture-product';
    const creator = 'Example Maker with a name long enough to wrap cleanly';
    const html = await renderLaunch({
      id: 'fixture-product', path: listing, name: 'Product fixture', creator,
      logo: '/digivated-daylight-mark.png', category: 'Apps',
      gallery: [{ image: '/missing-project-screenshot.png', alt: 'Example project screenshot' }],
      description: 'An independent product with a public discussion.', ctaUrl: 'https://example.com',
      ctaLabel: 'Visit project', socialUrl: 'https://example.com/creator', date,
    }, { template });
    await page.route(base + listing, route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route(base + '/missing-project-screenshot.png', route => route.fulfill({ status: 404 }));
    await page.goto(base + listing);
    await expect(page.locator('[data-site-backdrop]')).toHaveCount(0);
    await expect(page.getByText('Screenshot currently unavailable.')).toBeVisible();
    await expect(page.locator('.launch-shot img')).toHaveCount(0);
    const card = page.locator('.launch-creator');
    await expect(card.getByText(creator)).toBeVisible();
    await expect(card.getByText(creator)).toHaveCSS('color', 'rgb(27, 27, 27)');
    await expect(card).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const [intro, overview, maker, discussion] = await Promise.all([
      page.locator('.launch-intro').boundingBox(), page.locator('.launch-overview').boundingBox(),
      card.boundingBox(), page.locator('#feedback').boundingBox(),
    ]);
    expect(overview!.y).toBeGreaterThanOrEqual(intro!.y + intro!.height);
    if (width <= 820) {
      expect(maker!.y).toBeGreaterThanOrEqual(overview!.y + overview!.height);
      expect(discussion!.y).toBeGreaterThanOrEqual(maker!.y + maker!.height);
    } else {
      expect(maker!.x).toBeGreaterThanOrEqual(overview!.x + overview!.width);
    }
    await expect(card.getByRole('link', { name: /Creator profile/ })).toHaveAttribute('href', 'https://example.com/creator');
    await expect(page.getByRole('link', { name: /Visit project/ })).toHaveAttribute('href', 'https://example.com');
    await expect(page.getByRole('link', { name: /Visit project/ }).locator('svg')).toHaveCount(1);
    if (width <= 480) {
      const [logo, title, actions] = await Promise.all([
        page.locator('.launch-identity').boundingBox(),
        page.getByRole('heading', { name: 'Product fixture' }).boundingBox(),
        page.locator('.launch-hero .actions').boundingBox(),
      ]);
      expect(logo!.x + logo!.width).toBeLessThanOrEqual(title!.x);
      expect(actions!.x).toBeCloseTo(logo!.x);
      expect(actions!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
    }

    await page.getByRole('link', { name: 'Join the discussion' }).click();
    await expect(page.locator('#feedback .dg-signin')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.getByRole('region', { name: 'Discussion' }).getByRole('link', { name: 'Log in' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
