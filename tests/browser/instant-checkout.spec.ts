import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const checkoutUrl='https://digivated.gumroad.com/l/instant-launch';
async function signedIn(page,{paidAfter=2}:{paidAfter?:number}={}){
 const user={id:'instant-owner',email:'builder@example.com',email_confirmed_at:new Date().toISOString()};
 const expires=Math.floor(Date.now()/1000)+3600;
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,email:user.email,exp:expires})).toString('base64url'),'fixture'].join('.');
 await page.addInitScript(({token,user,expires})=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:expires,expires_in:3600,token_type:'bearer',user})),{token,user,expires});
 await page.route('https://fixture.supabase.co/**',route=>route.fulfill({json:user}));
 await page.context().route(/gumroad\.com/,route=>route.fulfill({contentType:'text/html',body:'<title>Gumroad checkout</title>checkout'}));
 const calls:{submit:number,checks:number,cancel?:number}={submit:0,checks:0};
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());
  // Password sign-in: the mailbox was never proven with an emailed link.
  if(url.pathname==='/api/project-account')return route.fulfill({json:url.searchParams.get('action')==='config'?{ready:true,url:'https://fixture.supabase.co',key:'sb_publishable_fixture'}:{id:user.id,email:user.email,mailboxVerified:false,submissions:[]}});
  if(url.pathname==='/api/submissions'){
   if(route.request().method()==='GET')return route.fulfill({json:{instant:{price:300,checkoutUrl},nextFreeLaunch:'2026-11-23T00:00:00.000Z'}});
   const body=route.request().postDataJSON();
   if(body.action==='cancel-instant'){calls.cancel=(calls.cancel||0)+1;return route.fulfill({json:{cancelled:true}});}
   if(body.action==='publish-instant'){calls.checks++;return calls.checks<paidAfter?route.fulfill({status:409,json:{error:'We could not find an eligible payment for your account email. If you just paid, wait a moment and try again.'}}):route.fulfill({json:{ok:true,id:'instant-fixture',pageUrl:'/projects/listing/instant-fixture'}});}
   calls.submit++;assert(body.submissionType==='instant');
   return route.fulfill({status:201,json:{ok:true,id:'instant-fixture',status:'pending'}});
  }
  return route.fulfill({json:{ready:false,items:[],counts:{}}});
 });
 return calls;
}
function assert(ok){if(!ok)throw new Error('unexpected request');}
async function fillAndPay(page){
 await page.goto(base+'/submit-project');
 await expect(page.locator('#submission-details')).toBeVisible();
 for(const [name,value] of Object.entries({name:'Orbit',url:'https://example.com',description:'A useful workspace for independent builders to organize projects.',creator:'Builder'}))await page.locator(`#project-form [name=${name}]`).fill(value);
 await page.locator('#project-form [name=category]').selectOption('Developer Tools');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d')!.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#project-image').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await page.locator('.dg-tiers [data-tier="instant"]').click();
 await page.locator('#project-form [name=consent]').check();
 await page.locator('#project-form button[type=submit]').click();
 await expect(page.locator('#instant-launch-resume')).toBeVisible();
}
for(const width of [390,1440])test(`instant checkout can be cancelled and the form comes back at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const calls=await signedIn(page,{paidAfter:99});
 await fillAndPay(page);
 await expect(page.locator('#instant-launch-cancel')).toBeVisible();
 await page.locator('#instant-launch-cancel').click();
 await expect(page.locator('#instant-launch-resume')).toBeHidden();
 await expect(page.locator('#submission-details')).toBeVisible();
 await expect(page.locator('#submission-status')).toContainText('you weren’t charged');
 await expect(page.locator('#project-form [name=name]')).toHaveValue('Orbit');
 expect(calls.cancel).toBe(1);
 // They can pick the free launch instead and keep going.
 await page.locator('.dg-tiers [data-tier="directory"]').click();
 await expect(page.locator('#project-form button[type=submit]')).toContainText('Save and get your badge');
});
for(const width of [390,1440])test(`instant publishing: save, open checkout, publish automatically at ${width}px`,async({page,context})=>{
 await page.setViewportSize({width,height:900});
 const calls=await signedIn(page);
 await page.goto(base+'/submit-project');
 await expect(page.locator('#submission-details')).toBeVisible();
 for(const [name,value] of Object.entries({name:'Orbit',url:'https://example.com',description:'A useful workspace for independent builders to organize projects.',creator:'Builder'}))await page.locator(`#project-form [name=${name}]`).fill(value);
 await page.locator('#project-form [name=category]').selectOption('Developer Tools');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d')!.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#project-image').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await page.locator('.dg-tiers [data-tier="instant"]').click();
 await expect(page.locator('#instant-launch-help')).not.toContainText('emailed link');
 await page.locator('#project-form [name=consent]').check();
 const submit=page.locator('#project-form button[type=submit]');
 await expect(submit).toContainText('Continue to payment — $3');
 const opened:string[]=[];context.on('request',request=>{if(/gumroad\.com/.test(request.url()))opened.push(request.url());});
 await submit.click();
 await expect.poll(()=>opened[0]||'').toContain('digivated.gumroad.com/l/instant-launch');
 expect(new URL(opened[0]).searchParams.get('email')).toBe('builder@example.com');
 expect(new URL(opened[0]).searchParams.get('wanted')).toBe('true');
 await expect(page.locator('#instant-launch-resume')).toBeVisible();
 await expect(page.locator('#instant-launch-email')).toHaveText('builder@example.com');
 // No "verify" click: the page notices the payment on its own.
 await expect(page.locator('#instant-launch-listing')).toBeVisible({timeout:15000});
 await expect(page.locator('#instant-launch-title')).toContainText('Your project is live');
 await expect(page.locator('#instant-launch-listing')).toHaveAttribute('href','/projects/listing/instant-fixture');
 expect(calls.submit).toBe(1);
});
