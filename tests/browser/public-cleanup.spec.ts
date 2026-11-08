import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4321';
const projects = [
  { id:'featured-one', name:'Featured fixture', status:'featured', creator:'Alex Builder' },
  { id:'approved-two', name:'Approved fixture', status:'approved', creator:'Unique Maker' },
].map(p => ({...p, category:'AI', description:'A useful independent tool for creative builders.', url:'https://example.invalid', image:'/digivated-new-mark.svg', views:0}));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('digivated-announcement-seen-v2', '1'));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if(url.pathname==='/api/projects')return route.fulfill({json:{items:projects,next:null}});
    if(url.pathname==='/api/project-account'&&url.searchParams.get('action')==='config')return route.fulfill({json:{ready:false}});
    return route.fulfill({json:{items:[],next:null,views:{},likes:{},counts:{}}});
  });
});
for(const width of [320,390,768,1440])test(`navigation and search remain usable at ${width}px`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width,height:900});
  await page.goto(base+'/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.header-search')).toBeVisible();
  await page.locator('.notebook-navigation>summary').click();
  await expect(page.locator('.navigation-panel')).toBeVisible();
  if(width<768){
    const panel=await page.locator('.navigation-panel').boundingBox(),header=await page.locator('.platform-header').boundingBox();
    expect(panel!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.notebook-navigation')).not.toHaveAttribute('open','');
  await expect(page.locator('.notebook-navigation>summary')).toBeFocused();
  await page.locator('.header-search').click();
  await expect(page.locator('#unified-search-input')).toBeFocused();
  await page.locator('#unified-search-input').fill('saved');
  await expect(page.locator('#unified-results').getByRole('link',{name:/Saved items/})).toHaveAttribute('href','/saved');
  await page.keyboard.press('Escape');
  await expect(page.locator('.header-search')).toBeFocused();
  await page.keyboard.press('/');
  await expect(page.locator('#discovery-search')).toBeVisible();
  await page.locator('#unified-search-input').fill('Unique Maker');
  const result=page.locator('#unified-results').getByRole('link',{name:/Approved fixture/});
  await expect(result).toHaveAttribute('href','/discover#project-approved-two');
  await result.click();
  await expect(page.locator('#wall-focus-title')).toHaveText('Approved fixture');
  await expect(page.locator('body')).toHaveClass(/wall-modal-open/);
  await page.keyboard.press('/');
  await expect(page.locator('#discovery-search')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wall-focus')).toHaveCount(0);
  await page.locator('.header-search').click();
  await page.locator('#unified-search-input').fill('Featured fixture');
  await page.locator('#unified-results').getByRole('link',{name:/Featured fixture/}).click();
  await expect(page.locator('#wall-focus-title')).toHaveText('Featured fixture');
  await expect(page.locator('body')).toHaveClass(/wall-modal-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wall-focus')).toHaveCount(0);
  await page.locator('.header-search').click();
  await page.locator('#unified-search-input').fill('Featured fixture');
  await page.locator('#unified-results').getByRole('link',{name:/Featured fixture/}).click();
  await expect(page.locator('#wall-focus-title')).toHaveText('Featured fixture');
  await expect(page.locator('body')).toHaveClass(/wall-modal-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wall-focus')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
test('featured links, active navigation, filter switches and modal keyboard loop',async({page})=>{
  await page.goto(base+'/discover?view=featured');
  await expect(page.getByRole('button',{name:'Featured',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.wall-tile')).toHaveCount(1);
  const active=page.locator('.header-primary a[aria-current=page]');
  await expect(active).toHaveCSS('color','rgb(237, 243, 252)');
  await page.getByRole('button',{name:'All projects',exact:true}).click();
  await expect(page).toHaveURL(base+'/discover');
  await expect(page.locator('.wall-tile')).toHaveCount(2);
  await page.getByRole('button',{name:'Open Featured fixture',exact:true}).click();
  await page.getByRole('button',{name:'Next project',exact:true}).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.wall-focus-actions a').last()).toBeFocused();
});
test('404 recovery uses the main site and offers working search',async({page})=>{
  await page.goto(base+'/404');
  await expect(page.getByRole('heading',{name:'Let’s get you back on track.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Explore projects',exact:true})).toHaveAttribute('href','/discover');
  await page.locator('main').getByRole('button',{name:'Search Digivated',exact:true}).click();
  await expect(page.locator('#discovery-search')).toBeVisible();
});

async function authFixture(page:any){
 const email='recovery@example.invalid',expires=Math.floor(Date.now()/1000)+3600;
 const user={id:'4ad90c9b-5666-482d-899c-d0d3ef41ee46',email,email_confirmed_at:'2026-10-23T00:00:00Z',role:'authenticated',aud:'authenticated'};
 const token=[Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,email,exp:expires})).toString('base64url'),'fixture'].join('.');
 await page.addInitScript(({token,user,expires})=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:expires,expires_in:3600,token_type:'bearer',user})),{token,user,expires});
 await page.route('**/api/project-account**',route=>{const u=new URL(route.request().url());return route.fulfill({json:u.searchParams.get('action')==='config'?{ready:true,url:'https://fixture.supabase.co',key:'sb_publishable_fixture'}:u.searchParams.get('action')==='me'?{email}:{email,submissions:[]}})});
 return user;
}
test('password recovery validates confirmation, updates only authenticated account and removes callback',async({page})=>{
 const user=await authFixture(page);let updates=0;
 await page.route('https://fixture.supabase.co/auth/v1/**',route=>{if(route.request().method()==='PUT'){updates++;expect(route.request().postDataJSON().password).toBe('a-long-fixture-password');}return route.fulfill({json:user});});
 await page.goto(base+'/account#type=recovery');
 await expect(page.getByRole('heading',{name:'Choose a new password.'})).toBeVisible();
 await expect(page.locator('#account-password-reset')).toBeVisible();
 await expect(page).toHaveURL(base+'/account?reset=password');
 await page.reload();
 await expect(page.locator('#account-password-reset')).toBeVisible();
 await page.getByLabel('New password',{exact:true}).fill('a-long-fixture-password');
 await page.getByLabel('Confirm new password',{exact:true}).fill('does-not-match');
 await page.getByRole('button',{name:'Save new password'}).click();
 await expect(page.locator('#account-state')).toContainText('do not match');expect(updates).toBe(0);
 await page.getByLabel('Confirm new password',{exact:true}).fill('a-long-fixture-password');
 await page.getByRole('button',{name:'Save new password'}).click();
 await expect(page.locator('#account-state')).toContainText("You're logged in");expect(updates).toBe(1);
});
test('reset request uses the current account route, without sending any email',async({page})=>{
 await authFixture(page); // Use only the configured client; remove the simulated session.
 await page.addInitScript(()=>localStorage.removeItem('sb-fixture-auth-token'));
 let redirect='';
 await page.route('https://fixture.supabase.co/auth/v1/**',route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/recover'))redirect=url.searchParams.get('redirect_to')||'';return route.fulfill({json:{}})});
 await page.goto(base+'/login');
 await page.getByLabel('Email address',{exact:true}).fill('fixture@example.invalid');
 await page.getByRole('button',{name:'Forgot password?'}).click();
 await expect(page.locator('#login-status')).toContainText('password setup link');
 expect(redirect).toBe(base+'/account');
});
test('an unverified recovery callback never exposes the password form or writes an account',async({page})=>{
 await page.route('**/api/project-account**',route=>route.fulfill({json:{ready:true,url:'https://fixture.supabase.co',key:'sb_publishable_fixture'}}));
 let writes=0;
 await page.route('https://fixture.supabase.co/auth/v1/**',route=>{if(route.request().method()!=='GET')writes++;return route.fulfill({status:401,json:{error:'Invalid session'}})});
 await page.goto(base+'/account#type=recovery');
 await expect(page.locator('#account-state')).toContainText('could not be verified');
 await expect(page.locator('#account-password-reset')).not.toBeVisible();
 expect(writes).toBe(0);
});

test('search surfaces projects before slower guides and keeps navigation out of default results',async({page})=>{
 let releaseGuides:()=>void=()=>{};
 const waiting=new Promise<void>(resolve=>{releaseGuides=resolve;});
 await page.route('**/api/carousels**',async route=>{await waiting;await route.fulfill({json:{items:[{slug:'fixture-guide',title:'Fixture guide',summary:'A helpful guide.'}],next:null}});});
 await page.goto(base+'/');
 await page.locator('.header-search').click();
 await expect(page.locator('#unified-results .unified-result')).toHaveCount(2,{timeout:1500});
 await expect(page.locator('#unified-results img').first()).toBeVisible();
 await expect(page.locator('#unified-results')).not.toContainText('Page · Digivated');
 await expect(page.locator('#unified-results a[href="/saved"]')).toHaveCount(0);
 releaseGuides();
 await page.locator('#discovery-search').getByRole('button',{name:'Guides',exact:true}).click();
 await expect(page.locator('#unified-results')).toContainText('Fixture guide');
 await page.locator('#unified-search-input').fill('no-such-matching-content');
 await expect(page.locator('#unified-search-empty')).toBeVisible();
 await page.locator('#reset-discovery-search').click();
 await expect(page.locator('#unified-search-input')).toHaveValue('');
 await expect(page.locator('#search-shortcuts')).toBeVisible();
 await expect(page.locator('#unified-results .unified-result')).toHaveCount(2);
});
for(const viewport of [{width:1280,height:720},{width:390,height:650}])test(`centered hero and bounded search at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);
 await page.goto(base+'/');
 const center=await page.locator('.home-editorial h1').evaluate(el=>{const r=el.getBoundingClientRect();return r.x+r.width/2;});
 expect(Math.abs(center-viewport.width/2)).toBeLessThan(1);
 const activityCenter=await page.locator('.site-activity').evaluate(el=>{const r=el.getBoundingClientRect();return r.x+r.width/2;});
 expect(Math.abs(activityCenter-center)).toBeLessThan(1);
 await page.locator('.header-search').click();
 await expect(page.locator('#unified-search-input')).toBeFocused();
 await expect(page.getByRole('heading',{name:'Search Digivated',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Close search',exact:true})).toBeVisible();
 const geometry=await page.locator('#discovery-search').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,wholeScroll:el.scrollHeight>el.clientHeight};});
 expect(geometry.left).toBeGreaterThanOrEqual(0);expect(geometry.right).toBeLessThanOrEqual(viewport.width);
 expect(geometry.top).toBeGreaterThanOrEqual(0);expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
 expect(geometry.wholeScroll).toBe(false);
 await page.locator('#unified-search-input').fill('Saved');
 await expect(page.locator('#clear-discovery-search')).toBeVisible();
 await page.locator('#clear-discovery-search').click();
 await expect(page.locator('#unified-search-input')).toHaveValue('');
 await expect(page.locator('#unified-search-input')).toBeFocused();
});
