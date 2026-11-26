import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const scheduledAt='2026-11-23T00:00:00.000Z';
const badge='<a href="https://digivated.com/projects/listing/badge-fixture" data-digivated-project="badge-fixture">[ listed on Digivated ]</a>';
async function signedIn(page){
 const user={id:'badge-owner',email:'builder@example.com',email_confirmed_at:new Date().toISOString()};
 const expires=Math.floor(Date.now()/1000)+3600;
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,email:user.email,exp:expires})).toString('base64url'),'fixture'].join('.');
 await page.addInitScript(({token,user,expires})=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:expires,expires_in:3600,token_type:'bearer',user})),{token,user,expires});
 await page.route('https://fixture.supabase.co/**',route=>route.fulfill({json:user}));
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/project-account')return route.fulfill({json:url.searchParams.get('action')==='config'?{ready:true,url:'https://fixture.supabase.co',key:'sb_publishable_fixture'}:{id:user.id,email:user.email,mailboxVerified:true,submissions:[{id:'badge-fixture',name:'Orbit',date:'2026-11-14',status:'pending',launch:{kind:'free',scheduledAt,badge}}]}});
  if(url.pathname==='/api/submissions'){
   if(route.request().method()==='GET')return route.fulfill({json:{instant:null,nextFreeLaunch:scheduledAt}});
   const body=route.request().postDataJSON();
   return route.fulfill({status:body.action==='verify-badge'?200:201,json:body.action==='verify-badge'?{verified:true,scheduledAt}:{ok:true,id:'badge-fixture',status:'pending',launch:{kind:'free',scheduledAt,badge}}});
  }
  return route.fulfill({json:{ready:false,items:[],counts:{}}});
 });
}
for(const width of [390,1440])test(`free launch instructions, saved badge and verified state at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await signedIn(page);
 await page.goto(base+'/new-launch');
 await page.getByRole('button', { name: 'Enter details manually' }).click();
 await expect(page.locator('#submission-details')).toBeVisible();
 await expect(page.getByLabel('Project URL')).toBeVisible();
 const form = page.locator('#project-form');
 await expect(form).toHaveCSS('background-color', 'rgb(255, 255, 255)');
 expect((await form.boundingBox())!.width).toBeLessThanOrEqual(Math.min(740,width));
 const sections = page.locator('#submission-details fieldset[id^=sub-step], #launch-editor > .submission-review');
 const boxes = await sections.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
 expect(boxes).toHaveLength(5);
 for (let i=1; i<boxes.length; i++) {
  expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i-1].bottom-1);
  expect(boxes[i].right).toBeLessThanOrEqual(width);
 }
 const guide = page.getByText('How free launches work', { exact: true });
 await expect(page.locator('.free-launch-guide')).toBeHidden();
 await guide.click();
 await expect(page.locator('.free-launch-guide')).toBeVisible();
 await expect(page.locator('.free-launch-guide')).toContainText('Mondays at 9:00 AM Eastern');
 await expect(page.locator('.free-launch-guide a')).toHaveAttribute('href', '/dashboard#account-submissions');
 await guide.click();
 const preview = page.getByText('Preview your public listing', { exact: true });
 await expect(page.locator('[data-listing-name]')).toBeHidden();
 await preview.click();
 await expect(page.locator('[data-listing-name]')).toBeVisible();
 await preview.click();
 for(const [name,value] of Object.entries({name:'Orbit',url:'https://example.com',description:'A useful workspace for independent builders to organize projects.',creator:'Builder'}))await page.locator(`#project-form [name=${name}]`).fill(value);
 await page.locator('#project-form [name=category]').selectOption('Developer Tools');
 await preview.click();
 await expect(page.locator('[data-listing-name]')).toHaveText('Orbit');
 await expect(page.locator('[data-listing-category]')).toHaveText('Developer Tools');
 await preview.click();
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d')!.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#project-image').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await page.locator('#project-form [name=consent]').check();
 await page.locator('#project-form button[type=submit]').click();
 await expect(page.locator('#submission-badge')).toBeVisible();
 const picker=page.locator('#submission-badge [data-badge-picker]');
 await expect(picker.locator('[data-badge-style]')).toHaveCount(4);
 await expect(picker.locator('[data-badge-style=dark] img')).toBeVisible();
 await expect(picker.locator('[data-badge-style=dark] code')).toContainText('data-digivated-project="badge-fixture"');
 await expect(picker.locator('[data-badge-style=text] code')).toHaveText(badge);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await picker.getByRole('radio',{name:'Light'}).click();
 await picker.locator('[data-copy-badge=light]').click();
 await expect(picker.locator('[data-copy-badge=light]')).toHaveText('Copied ✓');
 await expect(page.locator('#submission-badge-launch')).toContainText('November 23, 2026');
 await expect(page.locator('#submission-badge-launch')).toContainText('Projects publish every Monday at 9:00 AM Eastern.');
 await expect(page.locator('#sub-step-details')).toBeHidden();
 await expect(page.locator('#submission-badge .fl-tracker [aria-current=step]')).toContainText('Badge verified');
 await page.goto(base+'/dashboard?tab=profile#project-badge-fixture');
 await expect(page).toHaveURL(/\/dashboard#project-badge-fixture$/);
 await expect(page.locator('#project-badge-fixture')).toBeInViewport();
 if(width===390){
  await page.goto(base+'/login?next='+encodeURIComponent('/dashboard#project-badge-fixture'));
  await expect(page).toHaveURL(/\/dashboard#project-badge-fixture$/);
  await expect(page.locator('#project-badge-fixture')).toBeInViewport();
 }
 await expect(page.locator('[data-submission-state]')).toHaveText('Action needed');
 await expect(page.locator('.account-launch')).toContainText('Free launches need our badge on your site.');
 await expect(page.locator('.account-launch [data-badge-style]')).toHaveCount(4);
 await page.locator('[data-verify-badge]').click();
 await expect(page.locator('[data-submission-state]')).toHaveText('Scheduled');
 await expect(page.locator('.account-launch')).toContainText('Monday 9:00 AM Eastern publish');
 await expect(page.locator('.account-launch')).toContainText('No admin approval needed.');
 await expect(page.locator('[data-copy-badge]')).toHaveCount(0);
 await expect(page.locator('.fl-tracker [aria-current=step]')).toContainText('Launch day');
 const later=page.locator('[data-badge-later]');
 await expect(later).toBeVisible();
 await later.locator('summary').click();
 await expect(later.locator('[data-copy-badge]:visible')).toHaveCount(1);
 await later.getByRole('radio',{name:'Text link'}).click();
 await expect(later.locator('[data-copy-badge=text]')).toBeVisible();
 const bounds=await page.locator('.account-launch').boundingBox();
 expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

test('saved screen verifies the badge without leaving the page',async({page})=>{
 await page.setViewportSize({width:390,height:900});await signedIn(page);
 await page.goto(base+'/new-launch');
 await page.getByRole('button', { name: 'Enter details manually' }).click();
 for(const [name,value] of Object.entries({name:'Orbit',url:'https://example.com',description:'A useful workspace for independent builders to organize projects.',creator:'Builder'}))await page.locator(`#project-form [name=${name}]`).fill(value);
 await page.locator('#project-form [name=category]').selectOption('Developer Tools');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d')!.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#project-image').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await page.locator('#project-form [name=consent]').check();
 await page.locator('#project-form button[type=submit]').click();
 const verify=page.locator('#submission-badge-verify');
 await expect(verify).toBeVisible();
 await expect(page.locator('#submission-badge-dashboard')).toBeVisible();
 await verify.click();
 await expect(page.locator('#submission-badge-status')).toContainText('Badge verified. Your launch is scheduled for November 23, 2026');
 await expect(page.locator('#submission-badge .fl-tracker [aria-current=step]')).toContainText('Launch day');
 await expect(verify).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('badge examples stay optional and share one account link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4321/badges');
  const styles = page.getByRole('region', { name: 'Badge styles' });
  const accountLinks = styles.locator('a[href^="/dashboard"]');
  await expect(accountLinks).toHaveCount(1);
  await expect(accountLinks.first()).toHaveAttribute('href', '/dashboard#account-submissions');

  const darkBadge = styles.locator('[data-badge-style=dark]');
  await expect(darkBadge.locator('img')).toBeVisible();
  await expect(darkBadge.locator('code')).toBeHidden();
  await darkBadge.getByText('Example embed code', { exact: true }).click();
  await expect(darkBadge.locator('code')).toContainText('YOUR_PROJECT_ID?theme=dark');
  await expect(darkBadge.locator('code')).toBeVisible();
  await styles.getByText('Use a text badge', { exact: true }).click();
  await expect(styles.locator('[data-badge-style=text]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('product URL opens an editable draft without publishing', async ({ page }) => {
 await signedIn(page);
 const actions: string[] = [];
 await page.route('**/api/submissions', async route => {
  if (route.request().method() !== 'POST') return route.fallback();
  const body = route.request().postDataJSON();
  actions.push(body.action);
  if (body.action === 'read-site') return route.fulfill({json:{name:'Orbit',description:'An independent planning tool for product makers.'}});
  return route.fallback();
 });
 await page.goto(base+'/new-launch');
 await expect(page.getByLabel('Project name')).toBeHidden();
 await expect(page.locator('#submission-account-status')).toBeVisible();
 for (const width of [320, 390, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  const form = (await page.locator('#project-form').boundingBox())!;
  const field = (await page.getByLabel('Project URL').boundingBox())!;
  const primary = (await page.getByRole('button', { name: 'Draft from link' }).boundingBox())!;
  const manual = (await page.getByRole('button', { name: 'Enter details manually' }).boundingBox())!;
  expect(field.x - form.x).toBeGreaterThanOrEqual(16);
  expect(form.x + form.width - field.x - field.width).toBeGreaterThanOrEqual(16);
  expect(primary.x).toBeCloseTo(field.x, 0);
  expect(primary.y - field.y - field.height).toBeGreaterThanOrEqual(10);
  expect(manual.y >= primary.y + primary.height || manual.x >= primary.x + primary.width + 12).toBe(true);
  const bottomInset = form.y + form.height - manual.y - manual.height;
  expect(bottomInset).toBeGreaterThanOrEqual(12);
  expect(bottomInset).toBeLessThanOrEqual(32);
 }
 await page.getByLabel('Project URL').fill('example.com');
 await page.locator('#project-import').click();
 await expect(page.getByLabel('Project name')).toHaveValue('Orbit');
 await expect(page.getByLabel('Project URL')).toHaveValue('https://example.com');
 await expect(page.locator('#submission-badge')).toBeHidden();
 expect(actions).toContain('read-site');
 expect(actions.filter(action => !action)).toHaveLength(0);
});
