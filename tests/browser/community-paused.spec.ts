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
  const approvals = page.getByRole('region',{name:'Project approvals'});
  await expect(approvals.getByText('Approved and live',{exact:true})).toBeVisible();
  await expect(approvals.getByRole('link',{name:/Studio Notes/})).toHaveAttribute('href',href);
  await expect(page.getByRole('region',{name:'Recent activity'}).getByRole('link',{name:/Your project is approved and live/})).toHaveAttribute('href',href);
  await expect(page.getByText('1 unread · 1 recent')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}
