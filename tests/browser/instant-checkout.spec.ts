import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const checkoutUrl='https://digivated.gumroad.com/l/instant-launch';
const freePlan={plan:'free',name:'Free',limit:1,used:0,remaining:1,instant:false,checkFailed:false,offers:{starter:{price:300,checkoutUrl,limit:3},member:{price:500,checkoutUrl:'https://digivated.gumroad.com/l/founding-member-pass'}}};
const starterPlan={plan:'starter',name:'Starter',limit:3,used:0,remaining:3,instant:true,checkFailed:false,offers:{starter:null,member:freePlan.offers.member}};
async function signedIn(page,{paidAfterChecks=1,submissions=[] as any[]}={}){
 const user={id:'instant-owner',email:'builder@example.com',email_confirmed_at:new Date().toISOString()};
 const expires=Math.floor(Date.now()/1000)+3600;
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,email:user.email,exp:expires})).toString('base64url'),'fixture'].join('.');
 await page.addInitScript(({token,user,expires})=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:expires,expires_in:3600,token_type:'bearer',user})),{token,user,expires});
 await page.route('https://fixture.supabase.co/**',route=>route.fulfill({json:user}));
 await page.context().route(/gumroad\.com/,route=>route.fulfill({contentType:'text/html',body:'<title>Gumroad checkout</title>checkout'}));
 const calls={submit:0,planChecks:0,fresh:0,cancel:0,payload:null as any};
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/project-account')return route.fulfill({json:url.searchParams.get('action')==='config'?{ready:true,url:'https://fixture.supabase.co',key:'sb_publishable_fixture'}:{id:user.id,email:user.email,submissions}});
  if(url.pathname==='/api/submissions'){
   if(route.request().method()==='GET')return route.fulfill({json:{instant:{price:300,checkoutUrl},nextFreeLaunch:'2026-11-23T00:00:00.000Z'}});
   const body=route.request().postDataJSON();
   if(body.action==='reserve-badge')return route.fulfill({json:{id:'123e4567-e89b-42d3-a456-426614174055',token:'signed-fixture'}});
   if(body.action==='plan'){calls.planChecks++;if(body.fresh)calls.fresh++;return route.fulfill({json:calls.fresh>=paidAfterChecks?starterPlan:freePlan});}
   if(body.action==='cancel-instant'){calls.cancel++;return route.fulfill({json:{cancelled:true}});}
   calls.submit++;calls.payload=body;
   return route.fulfill({status:201,json:{ok:true,id:'starter-fixture',status:'approved',plan:'starter',pageUrl:'/projects/listing/starter-fixture'}});
  }
  return route.fulfill({json:{ready:false,items:[],counts:{}}});
 });
 return calls;
}
async function fill(page){
 await page.goto(base+'/new-launch');
 await expect(page.locator('#submission-details')).toBeVisible();
 await page.getByRole('button', { name: 'Enter details manually' }).click();
 for(const [name,value] of Object.entries({name:'Orbit',url:'https://example.com',description:'A useful workspace for independent builders to organize projects.',creator:'Builder'}))await page.locator(`#project-form [name=${name}]`).fill(value);
 await page.locator('#project-form [name=category]').selectOption('Developer Tools');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d')!.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#project-image').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await page.locator('#project-form [name=consent]').check();
}
for(const width of [390,1440])test(`Starter: buy, check again, then publish instantly at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const calls=await signedIn(page);
 await fill(page);
 await expect(page.locator('#plan-status')).toContainText('Free');
 await expect(page.locator('#plan-status')).toContainText('0 of 1 project used');
 await page.locator('.dg-tiers [data-tier="instant"]').click();
 await expect(page.locator('#instant-launch-help')).toContainText('3 projects');
 const submit=page.locator('#project-form button[type=submit]');
 await expect(submit).toBeDisabled();
 await expect(submit).toContainText('Buy Starter above to publish');
 const buy=page.locator('#plan-buy');
 await expect(buy).toBeVisible();
 await expect(buy).toContainText('Buy Starter · $3 once');
 const href=new URL(await buy.getAttribute('href') as string);
 expect(href.origin+href.pathname).toBe(checkoutUrl);
 expect(href.searchParams.get('email')).toBe('builder@example.com');
 expect(href.searchParams.get('wanted')).toBe('true');
 await page.locator('#plan-recheck').click();
 await expect(page.locator('#plan-buy-status')).toContainText('You’re on Starter');
 await expect(page.locator('#membership-fields')).toBeHidden();
 await expect(page.locator('.dg-tiers [data-tier="instant"] [data-tier-own]')).toBeVisible();
 await expect(page.locator('.dg-tiers [data-tier="directory"]')).toBeHidden();
 await expect(submit).toBeEnabled();
 await expect(submit).toHaveText('Publish now');
 await submit.click();
 await expect(page.locator('#submission-status')).toContainText('Your project is live');
 await expect(page.locator('#submission-status a')).toHaveAttribute('href','/projects/listing/starter-fixture');
 expect(calls.submit).toBe(1);
 expect(calls.payload.submissionType).toBe('instant');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('free stays the default and keeps the badge flow when no purchase is found',async({page})=>{
 const calls=await signedIn(page,{paidAfterChecks:99});
 await fill(page);
 await page.locator('.dg-tiers [data-tier="founding-feature"]').click();
 await expect(page.locator('#plan-buy')).toContainText('Buy Pro · $5 once');
 await expect(page.locator('#plan-recheck')).toHaveCSS('color', 'rgb(11, 11, 12)');
 await expect(page.locator('#plan-buy-copy')).toHaveCSS('color', 'rgb(42, 42, 46)');
 await page.locator('#plan-recheck').click();
 await expect(page.locator('#plan-buy-status')).toContainText('No purchase found');
 await page.locator('.dg-tiers [data-tier="directory"]').click();
 await expect(page.locator('#membership-fields')).toBeHidden();
 await expect(page.locator('#project-form button[type=submit]')).toContainText('Verify badge & submit');
 expect(calls.submit).toBe(0);
});
test('an older unpaid instant draft can still be cancelled',async({page})=>{
 const calls=await signedIn(page,{paidAfterChecks:99,submissions:[{id:'old-draft',name:'Orbit',status:'pending',awaitingInstantPayment:true}]});
 await page.goto(base+'/new-launch');
 await expect(page.locator('#instant-launch-resume')).toBeVisible();
 await page.locator('#instant-launch-cancel').click();
 await expect(page.locator('#instant-launch-resume')).toBeHidden();
 await expect(page.locator('#submission-status')).toContainText('You weren’t charged');
 expect(calls.cancel).toBe(1);
});
