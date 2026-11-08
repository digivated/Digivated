import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4321';
async function account(page, signedIn = true) {
  const email = 'builder@example.com', expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: 'submission-fixture', email, email_confirmed_at: new Date().toISOString() };
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, email, exp: expires })).toString('base64url'), 'fixture'].join('.');
  if (signedIn) await page.addInitScript(({ token, user, expires }) => {
    localStorage.setItem('sb-fixture-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }));
  }, { token, user, expires });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: url.pathname === '/api/project-account' ? (url.searchParams.get('action') === 'config' ? { ready: true, url: 'https://fixture.supabase.co', key: 'sb_publishable_fixture' } : { email, submissions: [] }) : { ready: false, items: [], counts: {} } });
  });
  await page.route('https://fixture.supabase.co/**', route => route.fulfill({ json: user }));
}
for (const width of [390, 820, 1440]) test(`submission stays readable and usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await account(page);
  await page.goto(base + '/submit-project');
  await expect(page.locator('#submission-details')).toBeVisible();
  await expect(page.locator('#submission-account-status')).toHaveCSS('background-color', 'rgb(24, 23, 30)');
  for (const fieldset of await page.locator('#project-form fieldset').all()) {
    await expect(fieldset).toHaveCSS('background-color', 'rgb(16, 16, 20)');
    await expect(fieldset.locator('legend')).toHaveCSS('color', 'rgb(244, 242, 248)');
  }
  await expect(page.locator('.submission-preview-panel')).toBeVisible();
  await page.locator('#project-form [name=name]').fill('Orbit');
  await page.locator('#project-form [name=url]').fill('https://example.com');
  await page.locator('#project-form [name=description]').fill('A useful workspace for independent builders to organize their projects.');
  await page.locator('#project-form [name=category]').selectOption('Developer Tools');
  await expect(page.locator('[data-listing-name]')).toHaveText('Orbit');
  await expect(page.locator('[data-listing-domain]')).toHaveText('example.com');
  await expect(page.locator('[data-listing-category]')).toHaveText('Developer Tools');
  await page.locator('#submission-type').selectOption('founding-feature');
  await expect(page.locator('#membership-fields')).toBeVisible();
  await page.locator('#submission-type').selectOption('promotion');
  await expect(page.locator('#promotion-fields')).toBeVisible();
  await expect(page.locator('#promotion-receipt')).toHaveJSProperty('required', true);
  await page.locator('#submission-type').selectOption('directory');
  await expect(page.locator('#promotion-fields')).toBeHidden();
  await expect(page.locator('#promotion-receipt')).toBeDisabled();
  await page.locator('#project-form [name=creator]').fill('Builder');
  await page.locator('#project-image').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3foAAAAASUVORK5CYII=', 'base64') });
  await expect(page.locator('[data-listing-image]')).toBeVisible();
  await expect(page.locator('#project-image-preview')).toBeVisible();
  await expect(page.locator('#project-image-preview')).toHaveCSS('background-color', 'rgb(24, 23, 30)');
  await page.locator('#project-form [name=consent]').check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath(`submission-${width}.png`), fullPage: true });
  let payload;
  await page.route('**/api/submissions', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'Please try again shortly.' } });
  });
  await page.getByRole('button', { name: 'Submit Your Project', exact: true }).click();
  await expect(page.locator('#submission-status')).toHaveText('Please try again shortly.');
  await expect(page.locator('#project-form [name=name]')).toHaveValue('Orbit');
  expect(payload.submissionType).toBe('directory');
  expect(payload.email).toBe('builder@example.com');
  expect(payload.image).toBeTruthy();
  await page.route('**/api/submissions', route => route.fulfill({ status: 201, json: { ok: true, status: 'pending' } }));
  await page.getByRole('button', { name: 'Submit Your Project', exact: true }).click();
  await expect(page.locator('#submission-status')).toContainText('received for review');
  await expect(page.locator('[data-listing-name]')).toHaveText('Your project name');
  await expect(page.locator('[data-listing-image]')).toBeHidden();
  await expect(page.locator('#project-form [name=email]')).toHaveValue('builder@example.com');
});
test('signed-out visitors keep the account gate', async ({ page }) => {
  await account(page, false);
  await page.goto(base + '/submit-project');
  await expect(page.locator('#submission-account-callout')).toBeVisible();
  await expect(page.locator('#submission-details')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Create an account', exact: true })).toHaveAttribute('href', '/login?mode=signup');
});
