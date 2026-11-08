import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[],next:null,member:false,counts:{},views:{}}}));
});
for(const width of [390,1440])test(`one membership offer is honest and usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:950});
 for(const path of ['/membership','/shop','/products','/promote','/founding-members']){
  await page.goto(base+path);await expect(page.locator('.membership-offer')).toHaveCount(1);
  await expect(page.locator('.membership-price strong')).toHaveText('$5');
  await expect(page.locator('.membership-soon')).toHaveText('Coming soon');
  await expect(page.locator('.membership-checkout')).toBeDisabled();
  await expect(page.locator('a[href*="gumroad.com/l/"]')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('previous purchase pages keep working without standalone buy links',async({page})=>{
 for(const path of ['/access','/library','/ui-ux-prompt-packet','/resources','/carousels','/submit-project']){
  await page.goto(base+path);await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('a[href*="gumroad.com/l/"]')).toHaveCount(0);
 }
 await page.goto(base+'/access');await expect(page.locator('#unlock-form')).toBeVisible();
});
test('membership sign-in preserves the verified member spotlight flow',async({page})=>{
 let member=false;
 await page.route('**/api/carousels',r=>r.fulfill({json:{member,items:[]}}));
 await page.route('**/api/founding-access',async r=>{
  const body=r.request().postDataJSON();expect(body).toEqual({email:'member@example.com'});member=true;await r.fulfill({json:{ok:true}});
 });
 await page.goto(base+'/membership');await page.locator('#founding-access-form input[name=email]').fill('member@example.com');
 await page.locator('#founding-access-form button').click();
 await expect(page.locator('#membership-verified')).toBeVisible();
 await expect(page.locator('#founding-access-form')).toBeHidden();
 await expect(page.locator('#membership-verified a')).toHaveAttribute('href','/submit-project?membership=1#project-form');
});
