import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const fixtureKey='Gumroad-SECRET-browser-fixture-1234567890';
test('owner enters a masked key and it is cleared before the authenticated request completes',async({page})=>{
 await page.route('**/api/admin**',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:new URL(r.request().url()).searchParams.get('action')==='list'?{items:[],next:null}:{csrf:'owner-fixture',ready:false}});
  const body=r.request().postDataJSON();expect(body).toEqual({action:'gumroad-membership',gumroadToken:fixtureKey});expect(r.request().headers()['x-admin-csrf']).toBe('owner-fixture');
  await expect(page.locator('#owner-gumroad-token')).toHaveValue('');
  await r.fulfill({json:{ok:true,ready:true}});
 });
 await page.goto(base+'/admin#gumroad-setup');
 await expect(page.locator('#owner-dashboard')).toBeVisible();
 const input=page.locator('#owner-gumroad-token');await expect(input).toHaveAttribute('type','password');
 await input.fill(fixtureKey);await page.locator('#owner-gumroad-apply').click();
 await expect(page.locator('#owner-gumroad-status')).toContainText('checkout is open');
 await expect(input).toHaveValue('');await expect(page.locator('#owner-gumroad-form')).toBeHidden();
 expect(await page.evaluate(key=>JSON.stringify({...localStorage,...sessionStorage}).includes(key),fixtureKey)).toBe(false);
 expect(await page.locator('body').innerText()).not.toContain(fixtureKey);
});
test('signed-out visitors cannot see the seller key form',async({page})=>{
 await page.route('**/api/admin**',r=>r.fulfill({status:401,json:{error:'Sign in to manage Digivated.'}}));await page.goto(base+'/admin');
 await expect(page.locator('#owner-login')).toBeVisible();await expect(page.locator('#owner-gumroad-form')).toBeHidden();
});
test('membership checkout opens only for the exact verified five-dollar one-time offer',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{items:[],member:false,next:null}}));
 await page.route('**/api/membership-checkout',r=>r.fulfill({json:{ready:true,priceUSD:5,billing:'one-time',checkoutUrl:'https://digivated.gumroad.com/l/founding-member-pass'}}));
 await page.goto(base+'/membership');await expect(page.locator('a.membership-checkout')).toHaveText('Get membership · $5 once ↗');
 await expect(page.locator('.membership-checkout-note')).toBeHidden();
 await page.route('**/api/membership-checkout',r=>r.fulfill({json:{ready:true,priceUSD:5,billing:'monthly',checkoutUrl:'https://other.invalid/'}}));
 await page.reload();await expect(page.locator('button.membership-checkout')).toBeDisabled();
});

test('ready membership retains an explicit way to reapply branding',async({page})=>{
 await page.route('**/api/admin**',r=>r.fulfill({json:new URL(r.request().url()).searchParams.get('action')==='list'?{items:[],next:null}:{csrf:'owner-fixture',ready:true}}));
 await page.goto(base+'/admin#gumroad-setup');
 await expect(page.locator('#owner-gumroad-form')).toBeHidden();
 await page.getByRole('button',{name:'Reapply Gumroad branding',exact:true}).click();
 await expect(page.locator('#owner-gumroad-form')).toBeVisible();
 await expect(page.locator('#owner-gumroad-token')).toBeFocused();
 await expect(page.locator('#owner-gumroad-token')).toHaveValue('');
 await expect(page.locator('#owner-gumroad-apply')).toHaveText('Reapply Gumroad branding');
});
