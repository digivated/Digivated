import { test, expect } from '@playwright/test';
import { assertPrivateSentryReporting } from './assert-sentry';

// Public production flows only: never submit a license, purchase, or creator key.
test('Digivated discovery, view counts, free prompt, and purchase access', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.name));
  const response = await page.goto('https://digivated.com/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('#home-title')).toBeVisible();
  await page.locator('.notebook-navigation>summary').click();
  await expect(page.locator('#explore-navigation').getByRole('link',{name:'News',exact:true})).toHaveAttribute('href','/news');
  await page.keyboard.press('Escape');
  const newsResponse = await page.request.get('https://digivated.com/api/news');
  expect(newsResponse.status()).toBe(200);
  const news = await newsResponse.json();
  expect(news.member).toBe(false);
  expect(Array.isArray(news.items)).toBe(true);
  for (const story of news.items) {
    expect(story.locked).toBe(true);
    expect(story.summary).toBe('');
    expect(story.sourceUrl).toMatch(/^https:\/\//);
    expect(Number.isFinite(Date.parse(story.sourcePublishedAt))).toBe(true);
  }
  const resourcesResponse = await page.goto('https://digivated.com/resources');
  expect(resourcesResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Resources', exact: true })).toBeVisible();
  await expect(page.locator('[data-builtin-resource]').first()).toBeVisible();
  const projectsResponse = await page.request.get('https://digivated.com/api/projects');
  expect(projectsResponse.status()).toBe(200);
  const { items } = await projectsResponse.json();
  expect(Array.isArray(items)).toBe(true);
  for (const project of items) {
    expect(Number.isSafeInteger(project.views)).toBe(true);
    expect(project.views).toBeGreaterThanOrEqual(0);
  }
  // Bot-excluded probe verifies the endpoint without inflating real counts.
  const viewsResponse = await page.request.post('https://digivated.com/api/project-views?id=monitor-probe', { headers: { origin: 'https://digivated.com', 'user-agent': 'Digivated-monitor-bot' } });
  expect(viewsResponse.status()).toBe(200);
  expect((await viewsResponse.json()).views).toBeNull();
  await page.goto('https://digivated.com/ui-ux-prompt-packet');
  await page.getByRole('link', { name: 'Try free samples', exact: true }).first().click();
  await expect(page.locator('#prompt-list .prompt-row')).toHaveCount(3);
  await page.locator('[data-open="1"]').click();
  await expect(page.locator('#prompt-dialog')).toBeVisible();
  await expect(page.locator('#prompt-dialog .prompt-text')).not.toBeEmpty();
  await page.goto('https://digivated.com/access');
  await expect(page.getByLabel('Gumroad license key')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open full edition' })).toBeEnabled();
  await expect(page.locator('#unlock-form')).toHaveAttribute('action', '/api/activate');
  expect(errors).toEqual([]);
  await assertPrivateSentryReporting(page);
});
