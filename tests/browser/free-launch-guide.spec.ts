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
 await page.goto(base+'/submit-project');
 await expect(page.locator('.free-launch-guide ol>li')).toHaveCount(4);
 await expect(page.locator('.free-launch-guide')).toContainText('Verification is required.');
 await expect(page.locator('.free-launch-guide')).toContainText('Monday at 9:00 AM Eastern');
 await expect(page.locator('#submission-details')).toBeVisible();
 await expect(page.locator('#submission-progress li.is-current')).toContainText('Project');
 for(const [name,value] of Object.entries({name:'Orbit',url:'https://example.com',description:'A useful workspace for independent builders to organize projects.',creator:'Builder'}))await page.locator(`#project-form [name=${name}]`).fill(value);
 await page.locator('#project-form [name=category]').selectOption('Developer Tools');
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
 await picker.locator('[data-copy-badge=light]').click();
 await expect(picker.locator('[data-copy-badge=light]')).toHaveText('Copied ✓');
 await expect(page.locator('#submission-badge-launch')).toContainText('November 23, 2026');
 await expect(page.locator('#submission-badge')).toContainText('Verification is required.');
 await expect(page.locator('#sub-step-details')).toBeHidden();
 await expect(page.locator('#submission-badge .fl-tracker [aria-current=step]')).toContainText('Badge verified');
 await page.goto(base+'/account#account-submissions');
 await expect(page.locator('[data-submission-state]')).toHaveText('Action needed');
 await expect(page.locator('.account-launch')).toContainText('Verification is required before automatic publication.');
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
 await expect(later.locator('[data-badge-style=dark] .fl-badge-tag')).toHaveText('Recommended');
 await expect(later.locator('[data-copy-badge]:visible')).toHaveCount(3);
 await later.locator('.fl-badge-more summary').click();
 await expect(later.locator('[data-copy-badge=text]')).toBeVisible();
 const bounds=await page.locator('.account-launch').boundingBox();
 expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

test('saved screen verifies the badge without leaving the page',async({page})=>{
 await page.setViewportSize({width:390,height:900});await signedIn(page);
 await page.goto(base+'/submit-project');
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
