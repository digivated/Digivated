import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const items=Array.from({length:15},(_,i)=>({id:'nav-fixture-'+i,name:'Project '+i,creator:'Maker',description:'An independent project for useful work.',category:i%2?'Apps':'Design',status:i<3?'featured':'approved',image:'/digivated-logo.webp',url:'https://example.com',views:12}));
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/edition')return route.fulfill({status:401,json:{code:'invalid_access'}});
  return route.fulfill({json:{ready:false,items,views:12,next:null,counts:{},member:false}});
 });
});
for(const width of [320,390,768,1024,1440])test(`collection buttons keep separate hit areas at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(base+'/discover');
 const group=page.getByRole('group',{name:'Project collection',exact:true});
 await expect(page.locator('.wall-tile')).toHaveCount(12);
 for(const name of ['Featured','All projects']){
  await group.getByRole('button',{name,exact:true}).click();
  await expect(group.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page).toHaveURL(name==='Featured'?/\/discover\?view=featured$/:/\/discover$/);
  await expect(page.locator('.wall-tile')).toHaveCount(name==='Featured'?3:12);
  const bounds=await group.locator('button').evaluateAll(es=>es.map(e=>({rect:e.getBoundingClientRect().toJSON(),shadow:getComputedStyle(e).boxShadow})));
  expect(bounds[1].rect.left-bounds[0].rect.right).toBeGreaterThanOrEqual(12);
  for(const button of bounds){expect(button.rect.height).toBeGreaterThanOrEqual(44);expect(button.shadow).toBe('none');}
 }
 const controls=await page.locator('.wall-navigation button,.wall-navigation input,.wall-navigation select').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()).filter(r=>r.width&&r.height));
 for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
  const a=controls[i],b=controls[j];expect(Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1).toBe(false);
 }
 await group.getByRole('button',{name:'Featured',exact:true}).click();await page.reload();
 await expect(group.getByRole('button',{name:'Featured',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.locator('.wall-navigation').scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath(`toolbar-${width}.png`)});
});
for(const width of [390,1440])test(`footer destinations use the current theme at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(base+'/');
 const footer=page.locator('.platform-footer');
 await expect(footer.locator('.footer-columns>nav')).toHaveCount(4);
 const paths=await footer.locator('a[href^="/"]').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
 expect(new Set(paths).size).toBe(paths.length);
 expect(paths).toEqual(expect.arrayContaining(['/discover','/rankings','/resources','/submit-project','/account','/saved','/membership','/about','/privacy','/terms']));
 for(const path of paths.filter(p=>p!=='/')){
  const response=await page.goto(base+path);expect(response?.status(),path).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(5, 5, 5)');
  await expect(page.locator('html')).toHaveCSS('color-scheme','dark');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://digivated.com'+path);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
  const light=await page.locator('main form,main article,main fieldset,main section,main .saved-sidebar').evaluateAll(es=>es.filter(e=>{
   if(!e.getBoundingClientRect().width)return false;const c=getComputedStyle(e).backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
   return c.length>=3&&c.slice(0,3).every(n=>n>200)&&(c[3]??1)>.5;
  }).map(e=>e.className));expect(light,path).toEqual([]);
 }
 await page.locator('.platform-footer').scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath(`footer-${width}.png`)});
});
test('previous purchase routes retain theme, access form and their own canonical URL',async({page})=>{
 for(const path of ['/access','/start','/library','/toolkit','/carousels','/ui-ux-prompt-packet']){
  await page.goto(base+path);await expect(page.locator('body')).toHaveCSS('background-color','rgb(5, 5, 5)');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://digivated.com'+path);
  await expect(page.locator('a[href*="gumroad.com/l/"]')).toHaveCount(0);
 }
 await page.goto(base+'/access');await expect(page.locator('#unlock-form')).toBeVisible();
});
test('saved collection creation still works',async({page})=>{
 await page.goto(base+'/saved');await page.locator('#new-collection').click();await page.locator('#collection-name').fill('My project shortlist');
 await page.locator('#collection-manager-form button[type=submit]').click();await expect(page.locator('#saved-heading')).toHaveText('My project shortlist');
 await page.reload();await expect(page.locator('#saved-folders')).toContainText('My project shortlist');
});
