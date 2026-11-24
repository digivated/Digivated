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
  await expect(page.getByRole('button', { name: /^Pro$/ })).toHaveAttribute('aria-pressed', 'true');
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
  const email = 'verified-builder-with-a-long-account-name@example.invalid';
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
  let avatarStatus = 200;
  let avatarResponseReady: Promise<void> | undefined;
  await page.route('**/api/creator-profile?action=avatar', async route => {
    const status = avatarStatus;
    await avatarResponseReady;
    return route.fulfill(status === 200 ? {
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3foAAAAASUVORK5CYII=', 'base64'),
    } : { status });
  });
  await page.route('https://fixture.supabase.co/auth/v1/**', route => route.fulfill({ json: user }));
  let resetEmail = '';
  await page.route('https://fixture.supabase.co/auth/v1/recover**', route => {
    resetEmail = route.request().postDataJSON().email;
    return route.fulfill({ json: {} });
  });
  let weeklySubscribed = false;
  await page.route('**/api/return-emails?*', route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    if (action !== 'status') weeklySubscribed = action === 'on';
    return route.fulfill({ json: { subscribed: weeklySubscribed, available: true } });
  });
  await page.route('**/api/notifications?action=list', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/feedback-points?action=me', route => route.fulfill({ json: { total: 12, week: 4 } }));
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
  avatarStatus = 503;
  let releaseAvatarResponse!: () => void;
  avatarResponseReady = new Promise(resolve => { releaseAvatarResponse = resolve; });
  const refresh = page.waitForResponse('**/api/creator-profile?action=avatar');
  try {
    await page.reload();
    await expect(avatar.locator('img')).toBeVisible();
  } finally {
    releaseAvatarResponse();
    avatarResponseReady = undefined;
  }
  await refresh;
  await expect(avatar.locator('img')).toBeVisible();
  avatarStatus = 204;
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
  await expect(accountMenu).toContainText(email);
  await expect(accountMenu.getByRole('menuitem', { name: 'Inbox' })).toHaveCount(0);
  await expect(accountMenu).toHaveCSS('position', 'static');
  await expect(accountMenu).toHaveCSS('overflow-y', 'visible');
  await expect(sidebar).toHaveCSS('border-top-right-radius', '0px');
  await expect(accountMenu.locator('#header-account-email')).toHaveAttribute('title', email);
  await expect(accountMenu.locator('#header-menu-points')).toHaveCSS('color', 'rgb(68, 68, 68)');
  // The account card sits at the bottom of the sidebar, below the page links.
  const primaryNav = (await sidebar.getByRole('navigation', { name: 'Workspace navigation' }).boundingBox())!;
  expect(primaryNav.y + primaryNav.height).toBeLessThanOrEqual(panel.y + 1);
  expect(panel.y + panel.height).toBeLessThanOrEqual(rail.y + rail.height + 1);
  await page.setViewportSize({ width: 1120, height: 430 });
  await accountMenu.getByRole('menuitem', { name: 'Sign out' }).scrollIntoViewIfNeeded();
  await expect(accountMenu.getByRole('menuitem', { name: 'Sign out' })).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('menuitem', { name: 'Your projects' }).click();
  await expect(page.locator('#account-state')).toContainText(`You're logged in as ${email}.`);
  await expect(page.locator('#creator-profile-link')).toHaveAttribute('href', `/creator?id=${user.id}`);
  await expect(page.locator('#account-submissions')).toContainText('Submissions unavailable.');
  await page.locator('.account-points summary').click();
  const points = page.locator('main [data-feedback-points]');
  await expect(points.locator('[data-fp-me]')).toBeVisible();
  await expect(points.locator('[data-fp-me]')).toHaveText('✦ 12 pts');
  await expect(points.locator('[data-fp-progress-copy]')).toContainText('4 points this week');
  await expect(points.getByRole('link', { name: /feedback/i })).toHaveAttribute('href', '/discover?sort=needs');
  submissionsAvailable = true;
  await page.reload();
  await expect(page.getByText('No launches yet')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  const account = page.getByRole('tablist', { name: 'Dashboard sections' });
  await expect(account.getByRole('tab')).toHaveText(['Overview', 'Analytics', 'Profile', 'Settings']);
  await account.getByRole('tab', { name: 'Settings' }).click();
  await expect(account.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
  const settings = page.getByRole('tabpanel', { name: 'Settings' });
  await expect(settings.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  await expect(settings.getByRole('link', { name: 'View recent activity' })).toHaveAttribute('href', '/notifications#notification-activity');
  await expect(settings.getByRole('link', { name: 'Manage notifications' })).toHaveAttribute('href', '/notifications#notification-preferences');
  await expect(settings.getByRole('link', { name: 'Open inbox' })).toHaveCount(0);
  await settings.getByRole('button', { name: 'Get weekly emails' }).click();
  await expect(settings.getByRole('button', { name: 'Stop weekly emails' })).toBeVisible();
  await settings.getByRole('button', { name: 'Stop weekly emails' }).click();
  await expect(settings.getByRole('button', { name: 'Get weekly emails' })).toBeVisible();
  await settings.getByRole('button', { name: 'Email me a reset link' }).click();
  await expect(settings.getByText('Check your inbox', { exact: false })).toBeVisible();
  expect(resetEmail).toBe(email);
  await menu.click();
  await expect(accountMenu.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  await expect(accountMenu).toHaveCSS('position', 'absolute');
  await accountMenu.getByRole('menuitem', { name: 'Settings' }).press('Escape');
  await expect(accountMenu).toBeHidden();

  let preferences = { enabled: true, emailEnabled: false, feedback: true, reply: true, upvote: true, launch: true, award: true, follow: true };
  let rejectSave = false;
  let unread = 1;
  await page.route('**/api/notifications?action=list', route => route.fulfill({ json: {
    preferences, unread, approvals: [],
    items: [{ id: user.id, type: 'feedback', href: '/projects/listing/example#feedback', title: 'New project feedback', unread: !!unread, createdAt: new Date().toISOString() }],
  } }));
  await page.route('**/api/notifications?action=preferences', route => {
    if (rejectSave) return route.fulfill({ status: 503, json: { error: 'Please try again.' } });
    preferences = { ...preferences, ...route.request().postDataJSON().preferences };
    return route.fulfill({ json: { preferences } });
  });
  await page.route('**/api/notifications?action=read-all', route => {
    unread = 0;
    return route.fulfill({ json: { ok: true } });
  });
  await settings.getByRole('link', { name: 'Manage notifications' }).click();
  await expect(page).toHaveURL(/\/notifications#notification-preferences$/);
  const notificationSettings = page.getByRole('region', { name: 'Notification settings' });
  await expect(notificationSettings.getByRole('heading')).toBeInViewport();
  const sections = page.getByRole('navigation', { name: 'Notifications sections' });
  await expect(sections.getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '#notification-activity');
  await expect(sections.getByRole('link', { name: 'Preferences' })).toHaveAttribute('href', '#notification-preferences');
  await expect(notificationSettings.getByRole('switch', { name: 'Activity alerts' })).toBeChecked();
  const emailAlerts = notificationSettings.getByRole('checkbox', { name: 'Email me activity alerts' });
  await emailAlerts.check();
  await expect(notificationSettings.getByRole('status')).toHaveText('Preferences saved.');
  await page.reload();
  await expect(emailAlerts).toBeChecked();
  rejectSave = true;
  await emailAlerts.click();
  await expect(notificationSettings.getByRole('status')).toHaveText('Please try again.');
  await expect(emailAlerts).toBeChecked();
  rejectSave = false;
  const activityAlerts = notificationSettings.getByRole('switch', { name: 'Activity alerts' });
  await activityAlerts.click();
  await expect(notificationSettings.getByRole('status')).toHaveText('Preferences saved.');
  await expect(emailAlerts).toBeDisabled();
  await expect(notificationSettings.getByRole('checkbox', { name: 'Weekly podium' })).toBeDisabled();
  await expect(notificationSettings.getByText('Project updates stay on.')).toBeVisible();
  await activityAlerts.click();
  await expect(emailAlerts).toBeEnabled();
  await expect(emailAlerts).toBeChecked();
  await page.setViewportSize({ width: 1440, height: 900 });
  const recent = page.getByRole('region', { name: 'Recent activity' });
  await recent.getByRole('tab', { name: 'All' }).press('ArrowRight');
  await expect(recent.getByRole('tab', { name: 'Unread' })).toBeFocused();
  await expect(recent.getByRole('tabpanel')).toContainText('New project feedback');
  await recent.getByRole('button', { name: 'Mark all read' }).click();
  await expect(recent.getByRole('tabpanel')).toContainText('No unread notifications.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('http://127.0.0.1:4321/dashboard?tab=settings');
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
  await page.route('**/new-launch', route => route.fulfill({ body: 'Submission destination' }));
  await page.goto('http://127.0.0.1:4321/login?mode=signup&next=%2Fnew-launch');
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
  await expect(page).toHaveURL(/\/new-launch$/);
  expect(attempts).toEqual(['654321', '123456']);
});
