import { test, expect } from '@playwright/test';

test('login entry point exposes sign-in and sign-up email flows', async ({ page }) => {
  await page.route('**/api/project-account?action=config', route => route.fulfill({ json: { ready: false } }));
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('.site-menu-trigger')).toBeHidden();
  const loginLink = page.locator('.dg-workspace-rail').getByRole('link', { name: 'Log In', exact: true });
  await expect(loginLink).toHaveAttribute('href', '/login');
  await loginLink.click();
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('link', { name: 'Browse member projects' }).click();
  await expect(page).toHaveURL(/\/discover\?view=featured$/);
  await expect(page.getByRole('button', { name: /Members/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('http://127.0.0.1:4321/login');
  await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.getByRole('tab', { name: 'Create account' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Join Digivated.' })).toBeVisible();
  await expect(page.locator('#login-submit')).toHaveText('Create account');
  await expect(page.getByText('Account sign-in is temporarily unavailable.')).toBeVisible();
});

test('verified account keeps notifications, menu, welcome, and sign-out usable at both layouts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const email = 'verified@example.invalid';
  const user = { id: '4ad90c9b-5666-482d-899c-d0d3ef41ee46', email, email_confirmed_at: '2026-10-23T00:00:00Z', role: 'authenticated', aud: 'authenticated' };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, email, exp: expires, amr: [{ method: 'magiclink' }] })).toString('base64url'), 'fixture'].join('.');
  await page.addInitScript(({ token, user, expires }) => {
    if (sessionStorage.getItem('login-fixture-seeded')) return;
    sessionStorage.setItem('login-fixture-seeded', '1');
    localStorage.setItem('sb-fixture-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }));
  }, { token, user, expires });
  await page.route('**/api/project-account?action=config', route => route.fulfill({ json: { ready: true, url: 'https://fixture.supabase.co', key: 'sb_publishable_fixture' } }));
  await page.route('**/api/project-account?action=me', route => route.fulfill({ json: { email } }));
  await page.route('**/api/creator-profile', route => route.fulfill({
    json: { id: user.id, profile: { name: 'Test maker', public: true } },
  }));

  let submissionsAvailable = false;
  await page.route('**/api/project-account', route => submissionsAvailable ? route.fulfill({ json: { email, submissions: [] } }) : route.fulfill({ status: 503, json: { error: 'Submissions unavailable.' } }));
  let avatarAvailable = true;
  await page.route('**/api/creator-profile?action=avatar', route => route.fulfill(avatarAvailable ? {
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3foAAAAASUVORK5CYII=', 'base64'),
  } : { status: 204 }));
  await page.route('https://fixture.supabase.co/auth/v1/**', route => route.fulfill({ json: user }));
  await page.route('**/api/notifications?action=list', route => route.fulfill({ json: { items: [] } }));
  await page.goto('http://127.0.0.1:4321/discover?view=featured&signed_in=1');
  const menu = page.getByRole('button', { name: `Account menu for ${email}` });
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  const bar = (await page.locator('.dg-shell-bar').boundingBox())!;
  const siteMenu = (await page.locator('.site-menu-trigger').boundingBox())!;
  expect(siteMenu.x + siteMenu.width).toBeLessThanOrEqual(bar.x + bar.width);
  await page.setViewportSize({ width: 390, height: 900 });
  const avatar = page.locator('#header-account-avatar');
  await expect(avatar.locator('img')).toBeVisible();
  avatarAvailable = false;
  await page.evaluate(() => document.dispatchEvent(new Event('digivated:profile-logo-updated')));
  await expect(avatar).toHaveText('V');
  await page.locator('#header-notifications-link').click();
  const notifications = page.getByRole('dialog', { name: 'Notifications', exact: true });
  await expect(notifications).toContainText('You’re all caught up.');
  await expect(page).toHaveURL(/\/discover\?/);
  await page.keyboard.press('Escape');
  await expect(notifications).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebar = page.locator('.dg-workspace-rail');
  await expect(sidebar.getByRole('button', { name: `Account menu for ${email}` })).toBeVisible();
  await page.locator('#header-notifications-link').click();
  await expect(notifications).toContainText('You’re all caught up.');
  expect((await notifications.boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Escape');
  await expect(notifications).toBeHidden();
  await menu.click();
  const accountMenu = page.getByRole('menu');
  await expect(accountMenu).toBeVisible();
  const rail = (await sidebar.boundingBox())!;
  const panel = (await accountMenu.boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(rail.x);
  expect(panel.x + panel.width).toBeLessThanOrEqual(rail.x + rail.width);
  await expect(page.getByRole('menu')).toContainText(email);
  await page.getByRole('menuitem', { name: 'Your projects' }).click();
  await expect(page.locator('#account-state')).toContainText(`You're logged in as ${email}.`);
  await expect(page.locator('#creator-profile-link')).toHaveAttribute('href', `/creator?id=${user.id}`);
  await expect(page.locator('#account-submissions')).toContainText('Submissions unavailable.');
  submissionsAvailable = true;
  await page.reload();
  await expect(page.getByText('No submissions are linked to this account yet.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  const account = page.getByRole('tablist', { name: 'Dashboard sections' });
  await expect(account.getByRole('tab', { name: 'Following' })).toHaveCSS('color', 'rgb(48, 48, 48)');
  await account.getByRole('tab', { name: 'Settings' }).click();
  await expect(account.getByRole('tab', { name: 'Settings' })).toHaveCSS('background-color', 'rgb(36, 36, 36)');
  const settings = page.getByRole('tabpanel', { name: 'Settings' });
  await expect(settings.getByRole('link', { name: 'Manage notifications' })).toHaveAttribute('href', '/notifications');
  await expect(settings.getByRole('link', { name: 'Open inbox' })).toHaveAttribute('href', '/inbox');
  await expect(settings.getByRole('button', { name: 'Email me a reset link' })).toBeVisible();
  await page.locator('#account-sign-out').click();
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole('link', { name: 'Log In', exact: true })).toBeVisible();
});

test('signup requests a code, recovers from a typo, and signs in only after verification', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const email = 'new@example.com';
  const password = 'ExamplePassword123!';
  let verified = false;
  let requests = 0;
  const attempts: string[] = [];
  await page.route('**/api/project-account?action=config', route =>
    route.fulfill({ json: { ready: true, url: 'https://fixture.supabase.co', key: 'sb_publishable_fixture' } }));
  await page.route('**/api/project-account?action=signup', route => {
    const body = route.request().postDataJSON();
    if (!body.challenge) {
      expect(body).toEqual({ email });
      return route.fulfill({ status: 202, json: { challenge: 'challenge-' + ++requests } });
    }
    expect(body).toMatchObject({ challenge: 'challenge-2', email, password });
    attempts.push(body.code);
    if (body.code !== '123456') return route.fulfill({ status: 400, json: { error: 'That code is incorrect or expired.' } });
    verified = true;
    return route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route('https://fixture.supabase.co/auth/v1/token?grant_type=password', route => {
    expect(verified).toBe(true);
    const user = { id: '4ad90c9b-5666-482d-899c-d0d3ef41ee46', email };
    return route.fulfill({ json: { access_token: 'fixture', refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, user } });
  });
  await page.route('**/submit-project', route => route.fulfill({ body: 'Submission destination' }));
  await page.goto('http://127.0.0.1:4321/login?mode=signup&next=%2Fsubmit-project');
  await expect(page.locator('#login-code-form')).toBeHidden();
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('#login-submit').click();
  await expect(page.locator('#login-email-form')).toBeHidden();
  await expect(page.locator('#login-code-email')).toHaveText(email);
  await expect(page.locator('#login-code')).toBeFocused();
  await page.getByRole('button', { name: 'Send a new code' }).click();
  await expect(page.locator('#login-status')).toContainText('We sent a new code');
  await page.locator('#login-code').fill('654321');
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await expect(page.locator('#login-status')).toContainText('incorrect or expired');
  await page.locator('#login-code').fill('123456');
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await expect(page).toHaveURL(/\/submit-project$/);
  expect(attempts).toEqual(['654321', '123456']);
});
