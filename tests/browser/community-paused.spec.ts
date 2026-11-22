import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`Public site remains usable with Community paused at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // API fixtures keep this check isolated from member and production data.
 await page.route('**/api/**',r=>r.fulfill({json:{items:[],next:null,count:0}}));
 for(const path of ['/','/resources','/discover','/products','/submit-project','/about','/saved']){
  await page.goto('http://127.0.0.1:4321'+path);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('a[href="/community"]')).toHaveCount(0);
  await expect(page.locator('[data-community-view]')).toHaveCount(0);
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0 && r.right>innerWidth+1 && getComputedStyle(el).position!=='fixed';}).slice(0,12).map(el=>({tag:el.tagName,id:el.id,className:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))}));
  expect(overflow.scroll,JSON.stringify({path,...overflow})).toBeLessThanOrEqual(overflow.width);
 }
 await page.goto('http://127.0.0.1:4321/community');await expect(page).toHaveURL('http://127.0.0.1:4321/');
 expect(errors).toEqual([]);
});

for (const width of [390, 1440]) {
 test(`A signed-in owner can see an approval and open the listing at ${width}px`, async ({page}) => {
  const href = '/projects/listing/approved-fixture';
  await page.setViewportSize({width,height:900});
  await page.addInitScript(() => {
   localStorage.setItem('sb-fixture-auth-token', JSON.stringify({
    access_token:'fixture-token', refresh_token:'fixture-refresh',
    expires_at:Math.floor(Date.now()/1000)+3600, user:{id:'fixture-owner'},
   }));
  });
  await page.route('**/api/project-account?*', route => route.fulfill({
   json:route.request().url().includes('action=config')
    ? {ready:true,url:'https://fixture.supabase.co',key:'fixture-key'}
    : {email:'fixture@example.com'},
  }));
  await page.route('**/api/notifications?*', route => route.fulfill({json:{
   preferences:{enabled:false,reply:true,follow:true,message:true,feedback:true},
   approvals:[{name:'Studio Notes',href}],
   items:[{id:'fixture-alert',type:'approved',title:'Your project is approved and live',href,createdAt:new Date().toISOString(),unread:true}],
   unread:1,
  }}));
  await page.goto('http://127.0.0.1:4321/notifications');
  const approvals = page.getByRole('region',{name:'Your live projects'});
  await expect(approvals.getByText('Approved and live',{exact:true})).toBeVisible();
  await expect(approvals.getByRole('link',{name:/Studio Notes/})).toHaveAttribute('href',href);
  const notification = page.getByRole('region',{name:'Recent activity'}).getByRole('link',{name:/Your project is approved and live/});
  await expect(notification).toHaveAttribute('href',href);
  await expect(notification).toHaveCSS('background-color','rgb(228, 228, 228)');
  await expect(page.getByText('1 unread · 1 recent')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}

test('Share a Product offers all activity alerts and submits the exact checkbox choice on mobile', async ({page}) => {
 await page.setViewportSize({width:390,height:900});
 await page.addInitScript(() => {
  localStorage.setItem('sb-fixture-auth-token', JSON.stringify({
   access_token:'fixture-token', refresh_token:'fixture-refresh',
   expires_at:Math.floor(Date.now()/1000)+3600,
   user:{id:'fixture-owner',email:'fixture@example.com',email_confirmed_at:'2026-11-01T00:00:00Z'},
  }));
 });
 await page.route('**/api/project-account**', route => route.fulfill({
  json:route.request().url().includes('action=config')
   ? {ready:true,url:'https://fixture.supabase.co',key:'fixture-key'}
   : {email:'fixture@example.com',submissions:[],mailboxVerified:true},
 }));
 await page.route('**/api/submissions**', route => route.fulfill({json:route.request().method()==='POST'
  ? {ok:true,id:'test-project',activityNotifications:false}
  : {instant:null}}));
 await page.goto('http://127.0.0.1:4321/submit-project');
 await page.getByRole('button', { name: 'Enter details manually' }).click();
 const checkbox=page.getByRole('checkbox',{name:/Turn on all activity notifications/});
 await expect(checkbox).toBeVisible();
 await expect(checkbox).toBeChecked();
 await checkbox.uncheck();
 await page.locator('#project-form [name=name]').fill('Studio Notes');
 await page.locator('#project-form [name=url]').fill('https://example.com');
 await page.locator('#project-form [name=description]').fill('Simple project notes for independent developers.');
 await page.getByRole('combobox',{name:'Category',exact:true}).selectOption('Other');
 await page.locator('#project-form [name=creator]').fill('Test Creator');
 await page.locator('#project-image').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII=','base64')});
 const request=page.waitForRequest(req=>req.method()==='POST' && req.url().endsWith('/api/submissions'));
 await page.getByRole('button',{name:'Save and get your badge'}).click();
 expect((await request).postDataJSON().activityNotifications).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const width of [390, 1440]) test(`free launch can verify the badge and submit in one step at ${width}px`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 });
 await page.addInitScript(() => {
  localStorage.setItem('sb-fixture-auth-token', JSON.stringify({
   access_token:'fixture-token', refresh_token:'fixture-refresh',
   expires_at:Math.floor(Date.now()/1000)+3600,
   user:{id:'fixture-owner',email:'fixture@example.com',email_confirmed_at:'2026-11-01T00:00:00Z'},
  }));
 });
 let configRequests = 0;
 await page.route('**/api/project-account**', route => {
  if (route.request().url().includes('action=config')) {
   configRequests++;
   return route.fulfill({ json: { ready: true, url: 'https://fixture.supabase.co', key: 'fixture-key' } });
  }
  return route.fulfill({ json: { email: 'fixture@example.com', submissions: [], mailboxVerified: true } });
 });
 const reservedId = '123e4567-e89b-42d3-a456-426614174055';
 let submitted = null;
 await page.route('**/api/submissions**', route => {
  if (route.request().method() !== 'POST') return route.fulfill({ json: { instant: null } });
  const body = route.request().postDataJSON();
  if (body.action === 'reserve-badge') return route.fulfill({ json: { id: reservedId, token: 'signed-fixture' } });
  submitted = body;
  return route.fulfill({ status: 201, json: { ok: true, id: reservedId, status: 'pending', launch: { kind: 'free', scheduledAt: '2026-11-30T14:00:00.000Z', badgeVerifiedAt: '2026-11-19T00:00:00.000Z' } } });
 });
 await page.goto('http://127.0.0.1:4321/submit-project');
 await page.getByRole('button', { name: 'Enter details manually' }).click();
 await expect(page.locator('[data-tier=founding-feature] .dg-tier-head b')).toHaveText('$5');
 await expect(page.locator('#badge-first')).toBeVisible();
 const badgePanel = page.locator('#badge-first');
 await expect(badgePanel).toHaveCSS('background-color', 'rgb(255, 255, 255)');
 for (const step of await badgePanel.locator('.dg-badge-first-steps li').all()) {
  await expect(step.locator('strong')).toHaveCSS('color', 'rgb(27, 27, 27)');
  await expect(step.locator(':scope > span')).toHaveCSS('background-color', 'rgb(27, 27, 27)');
  await expect(step.locator(':scope > span')).toHaveCSS('color', 'rgb(255, 255, 255)');
 }
 const disclosures = badgePanel.locator('summary:visible');
 await expect(disclosures).toHaveCount(2);
 for (const disclosure of await disclosures.all()) {
  await expect(disclosure).toHaveCSS('color', 'rgb(27, 27, 27)');
 }

 await expect(page.locator('#badge-first .dg-badge-tip')).toContainText('ask your AI coding assistant');
 await expect(page.locator('#badge-first-later, #badge-first-later-note')).toHaveCount(0);
 const copyPrompt = page.getByRole('button', { name: 'Copy an AI prompt for the Dark badge' });
 await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
 await copyPrompt.click();
 await expect(copyPrompt).toHaveText('Copied ✓');
 expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(reservedId);

 const badgeCode = page.locator('#badge-first [data-badge-style=dark] code');
 await expect(badgeCode).toContainText(reservedId);
 await expect(badgeCode).toBeHidden();
 await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {
  value: () => Promise.reject(new Error('Clipboard permission denied')),
 }));
 await page.getByRole('button', { name: 'Copy Dark badge code' }).click();
 await expect(badgeCode).toBeVisible();
 await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toContain(reservedId);
 const moreStyles = page.locator('#badge-first').getByText('More badge styles', { exact: true });
 await expect(page.locator('#badge-first [data-badge-style=light]')).toBeHidden();
 await moreStyles.click();
 await expect(page.locator('#badge-first [data-badge-style=light]')).toBeVisible();
 await expect(page.locator('#badge-first [data-badge-style=text] code')).toContainText(reservedId);
 await moreStyles.click();
 await page.locator('#project-form [name=name]').fill('Studio Notes');
 await page.locator('#project-form [name=url]').fill('https://example.com');
 await page.locator('#project-form [name=description]').fill('Simple project notes for independent developers.');
 await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Other');
 await expect(page.getByRole('radio', { name: 'Free', exact: true })).toBeHidden();
 await page.getByText('Project pricing (optional)', { exact: true }).click();
 await page.getByRole('radio', { name: 'Free', exact: true }).check();
 await page.getByText('Project pricing (optional)', { exact: true }).click();
 await page.locator('#project-form [name=creator]').fill('Test Creator');
 await page.locator('#project-image').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII=', 'base64') });
 await page.getByRole('button', { name: 'Verify badge & submit' }).click();
 await expect(page.locator('#submission-status')).toContainText('Badge verified');
 expect(submitted).toMatchObject({ reservedId, reservedToken: 'signed-fixture', verifyBadge: true, pricing: 'Free' });
 await expect(page.locator('#submission-badge-title')).toHaveText('Badge found. You’re in the launch.');
 expect(configRequests).toBe(1);
});

test('signed-in overview keeps launch details and profile within reach', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 900 });
 await page.addInitScript(() => {
  localStorage.setItem('sb-fixture-auth-token', JSON.stringify({
   access_token: 'fixture-token', refresh_token: 'fixture-refresh',
   expires_at: Math.floor(Date.now() / 1000) + 3600,
   user: { id: 'fixture-owner', email: 'fixture@example.com', email_confirmed_at: '2026-11-01T00:00:00Z' },
  }));
 });
 await page.route('**/api/project-account**', route => route.fulfill({
  json: route.request().url().includes('action=config')
   ? { ready: true, url: 'https://fixture.supabase.co', key: 'fixture-key' }
   : { email: 'fixture@example.com', submissions: [{
    id: 'studio-notes', name: 'Studio Notes', status: 'approved',
    date: '2026-11-19T00:00:00Z', pageUrl: '/projects/listing/studio-notes',
   }] },
 }));
 await page.route('**/api/creator-profile**', route => route.fulfill({
  json: { id: 'fixture-owner', profile: { name: 'Studio North', public: false } },
 }));
 let analyticsRequests = 0;
 await page.route('**/api/maker-stats?*', route => {
  analyticsRequests++;
  return route.fulfill({ json: { days: [], totals: { views: 2, visits: 1, upvotes: 0, comments: 0 } } });
 });
 await page.goto('http://127.0.0.1:4321/account?tab=following');
 await expect(page).toHaveURL(/\/account$/);
 await expect(page.getByRole('tab', { name: 'Following' })).toHaveCount(0);
 await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
 const project = page.locator('#project-studio-notes');
 await expect(project.getByRole('link', { name: 'View project and feedback' })).toHaveAttribute('href', '/projects/listing/studio-notes');
 expect(analyticsRequests).toBe(0);
 await page.getByRole('tab', { name: 'Analytics' }).click();
 await expect(page.getByRole('region', { name: 'Launch stats for Studio Notes' }).getByText('Views')).toBeVisible();
 expect(analyticsRequests).toBe(1);
 await page.getByRole('tab', { name: 'Profile' }).click();
 await expect(page.getByLabel('Display name')).toHaveValue('Studio North');
 await page.getByRole('tab', { name: 'Settings' }).click();
 await expect(page.getByRole('link', { name: 'Manage notifications' })).toHaveAttribute('href', '/notifications#notification-preferences');
 await page.locator('#account-submit-cta').click();
 await expect(page).toHaveURL(/\/submit-project$/);
 await expect(page.getByRole('textbox', { name: 'Project URL' })).toBeVisible();
 const makerNavigation = page.getByRole('navigation', { name: 'Maker workspace' });
 await expect(makerNavigation.getByRole('link', {name:'New launch'})).toHaveAttribute('aria-current', 'page');
 await makerNavigation.getByRole('link', {name:'Analytics'}).click();
 await expect(page).toHaveURL(/\/account\?tab=analytics$/);
 await expect(page.getByRole('tab', {name:'Analytics'})).toHaveAttribute('aria-selected', 'true');
});
