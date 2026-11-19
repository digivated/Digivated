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
  await expect(page.getByRole('region',{name:'Recent activity'}).getByRole('link',{name:/Your project is approved and live/})).toHaveAttribute('href',href);
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

test('free launch can verify the badge and submit in one step', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 900 });
 await page.addInitScript(() => {
  localStorage.setItem('sb-fixture-auth-token', JSON.stringify({
   access_token:'fixture-token', refresh_token:'fixture-refresh',
   expires_at:Math.floor(Date.now()/1000)+3600,
   user:{id:'fixture-owner',email:'fixture@example.com',email_confirmed_at:'2026-11-01T00:00:00Z'},
  }));
 });
 await page.route('**/api/project-account**', route => route.fulfill({ json: route.request().url().includes('action=config') ? { ready: true, url: 'https://fixture.supabase.co', key: 'fixture-key' } : { email: 'fixture@example.com', submissions: [], mailboxVerified: true } }));
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
 await expect(page.locator('#badge-first')).toBeVisible();
 await expect(page.locator('#badge-first [data-badge-style=dark] code')).toContainText(reservedId);
 await page.locator('#project-form [name=name]').fill('Studio Notes');
 await page.locator('#project-form [name=url]').fill('https://example.com');
 await page.locator('#project-form [name=description]').fill('Simple project notes for independent developers.');
 await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Other');
 await page.locator('#project-form [name=creator]').fill('Test Creator');
 await page.locator('#project-image').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII=', 'base64') });
 await page.getByRole('button', { name: 'Verify badge & submit' }).click();
 await expect(page.locator('#submission-status')).toContainText('Badge verified');
 expect(submitted).toMatchObject({ reservedId, reservedToken: 'signed-fixture', verifyBadge: true });
 await expect(page.locator('#submission-badge-title')).toHaveText('Badge found. You’re in the launch.');
});
