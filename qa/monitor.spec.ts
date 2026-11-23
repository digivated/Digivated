import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Read-only public checks. Do not submit forms, cast votes, verify purchases, or
// call authenticated endpoints from the monitor.
const routes = [
  '/', '/discover', '/creators', '/news', '/resources', '/resources/guides',
  '/membership', '/submit-project', '/about', '/privacy', '/terms',
  '/ui-ux-prompt-packet', '/packet-example', '/start', '/library', '/fixes',
  '/builder', '/workflows', '/checklists', '/learn', '/toolkit', '/access',
  '/login', '/account', '/creator', '/notifications', '/email-preferences', '/admin',
];
const viewports = [{ name: 'mobile', width: 390, height: 900 }, { name: 'desktop', width: 1440, height: 900 }];
const dynamic = new Map([
  ['/discover', 'main a[href^="/projects/"]'],
  ['/news', '[data-news-feed] > *'],
  // /creators now serves the Threads page.
  ['/creators', '[data-thread-list] > *'],
]);

async function ready(page: Page, route: string) {
  const started = Date.now();
  const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const expectedStatus = route === '/creator' ? 404 : 200;
  expect(response?.status(), `${route} must return ${expectedStatus}`).toBe(expectedStatus);
  if (route === '/creator') expect(response?.headers()['x-robots-tag']).toContain('noindex');
  expect(new URL(page.url()).hostname, `${route} must not become a Vercel login page`)
    .toBe(new URL(test.info().project.use.baseURL as string).hostname);
  await expect(page.locator('main').first()).toBeVisible({ timeout: 4000 });
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 4000 });
  const selector = dynamic.get(route);
  if (selector) await expect(page.locator(selector).first(), `${route} must load its public content`).toBeVisible({ timeout: 8000 });
  return Date.now() - started;
}

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    for (const route of routes) {
      const name = route === '/' ? 'home' : route.slice(1).replaceAll('/', '_');
      test(`${name} renders without regressions`, async ({ page }) => {
        const errors: string[] = [];
        const assets: string[] = [];
        page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
        page.on('response', response => {
          const url = new URL(response.url());
          if (url.origin === new URL(page.url()).origin && response.status() >= 400 &&
              /\.(?:css|js|png|jpe?g|webp|svg|woff2?)(?:\?|$)/i.test(url.pathname)) {
            assets.push(`${response.status()} ${url.pathname}`);
          }
        });
        const usableMs = await ready(page, route);
        expect(usableMs, `${route} should be usable within four seconds`).toBeLessThanOrEqual(4000);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
          `${route} must not scroll sideways`).toBe(true);
        expect(errors, `${route} browser errors`).toEqual([]);
        expect(assets, `${route} missing site assets`).toEqual([]);
        const brokenImages = await page.locator('img').evaluateAll(images => images
          .filter(image => {
            const box = image.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight &&
              image.complete && image.naturalWidth === 0;
          }).map(image => image.getAttribute('src')));
        expect(brokenImages, `${route} visible images must load`).toEqual([]);
        const capturePath = test.info().outputPath(`${name}-${viewport.name}.png`);
        const screenshot = await page.screenshot({ path: capturePath, animations: 'disabled',
          mask: [page.locator('time[role="timer"], [data-site-visits], [data-news-checked]')],
          maskColor: '#111111' });
        await test.info().attach(`${name}-${viewport.name}`, { path: capturePath, contentType: 'image/png' });
        // The committed baseline is production. A preview of a branch that changes the design always
        // differs from it, so previews keep every functional check and skip only this comparison.
        const isProduction = new URL(test.info().project.use.baseURL as string).hostname === 'digivated.com';
        if (isProduction) expect(screenshot).toMatchSnapshot({ name: `${name}-${viewport.name}.png`, maxDiffPixelRatio: 0.22 });
      });
    }
    test('public navigation and search controls work', async ({ page }) => {
      await ready(page, '/');
      const browse = page.locator('a[href="/discover"]').first();
      await expect(browse).toHaveAttribute('href', '/discover');
      await page.goto('/discover');
      await expect(page.locator('main a[href^="/projects/"]').first()).toBeVisible({ timeout: 8000 });
      const listing = await page.locator('main a[href^="/projects/"]').first().getAttribute('href');
      expect(listing).toMatch(/^\/projects\//);
      await page.goto(listing!);
      await expect(page.locator('h1').first()).toBeVisible();
      await page.goto('/rankings');
      await expect(page).toHaveURL(/\/discover$/);
      await page.locator('[data-dir-collection="featured"]').click();
      await expect(page.locator('[data-dir-collection="featured"]')).toHaveAttribute('aria-pressed', 'true');
      await page.goto('/news');
      await expect(page.locator('[data-news-feed] > *').first()).toBeVisible({ timeout: 8000 });
      await page.locator('[data-news-category="markets"]').click();
      await expect(page.locator('[data-news-category="markets"]')).toHaveAttribute('aria-pressed', 'true');
      await page.goto('/membership');
      await expect(page.locator('a[href^="https://digivated.gumroad.com/"]').first()).toBeVisible();
      await page.goto('/submit-project');
      await expect(page.locator('#project-form')).toHaveAttribute('method', 'post');
      await expect(page.locator('#project-form')).toHaveAttribute('action', '/api/submissions');
    });
  });
}

test('all public sitemap pages respond without redirecting to an error', async () => {
  test.setTimeout(90000);
  const base = process.env.QA_BASE_URL || 'https://digivated.com';
  test.skip(new URL(base).hostname !== 'digivated.com', 'Sitemap canonical URLs belong to production');
  const response = await fetch(new URL('/sitemap.xml', base), {
    headers: { 'User-Agent': 'Digivated-monitor-bot' }, signal: AbortSignal.timeout(12000),
  });
  expect(response.status).toBe(200);
  const urls = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  expect(urls.length).toBeGreaterThan(20);
  const failures: string[] = [];
  for (let i = 0; i < urls.length; i += 5) {
    await Promise.all(urls.slice(i, i + 5).map(async url => {
      try {
        const result = await fetch(url, {
          headers: { 'User-Agent': 'Digivated-monitor-bot' }, signal: AbortSignal.timeout(12000),
        });
        if (result.status !== 200 || new URL(result.url).hostname !== 'digivated.com')
          failures.push(`${result.status} ${url} -> ${result.url}`);
        if (result.status === 200) {
          const html = await result.text();
          const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/i)?.[1];
          if (canonical !== url) failures.push(`Canonical mismatch: ${url} -> ${canonical}`);
          if (/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html)) failures.push(`Sitemap URL is noindex: ${url}`);
        }
      } catch (error) { failures.push(`${url}: ${String(error)}`); }
    }));
  }
  expect(failures).toEqual([]);
});
