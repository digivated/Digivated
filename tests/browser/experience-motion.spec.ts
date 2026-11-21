import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[{id:'motion-fixture',name:'Motion project',creator:'Builder',category:'Apps',status:'featured',url:'https://example.invalid',image:'/digivated-dark-mark.svg',description:'An independent project.'}],next:null,views:{},counts:{}}}));
});
test('spot cards and launch rows stay lightweight and calm under reduced motion',async({page})=>{
 await page.setViewportSize({width:1440,height:950});await page.goto(base+'/');
 const spot=page.locator('[data-spot-grid] .dg-spot').first();await expect(spot).toBeVisible();await spot.hover();
 await expect(page.locator('[data-spot-grid] .dg-spot.is-open')).toHaveCount(1);
 await expect(page.locator('[data-spot-grid] .dg-spot.is-open')).toHaveAttribute('href','/submit-project?spot=1#project-form');
 const costs=await page.locator('.dg-spot,.dg-row,.dg-vote').evaluateAll(elements=>elements.map(e=>getComputedStyle(e).backdropFilter));
 expect(costs.length).toBeGreaterThan(0);
 expect(costs.every(blur=>blur==='none')).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await spot.evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await expect(spot).toBeVisible();
});
test('reduced motion keeps all content visible and native search focus working',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:900});await page.goto(base+'/');
 await expect(page.locator('#dg-home-title')).toBeVisible();
 await expect(page.locator('[data-discovery-lights]')).toBeHidden();
 const [hero, title, actions] = await Promise.all(['[data-discovery-hero]', '#dg-home-title', '.dg-hero-actions'].map(selector => page.locator(selector).boundingBox()));
 for (const bounds of [title, actions]) {
  expect(Math.abs((hero!.x + hero!.width / 2) - (bounds!.x + bounds!.width / 2))).toBeLessThan(2);
 }

 expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.id==='digivated-content-entrance').length)).toBe(0);
 expect(await page.locator('.dg-hero').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await page.locator('[data-open-search]').click();await expect(page.locator('#unified-search-input')).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.locator('[data-open-search]')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('section entrances never leave content hidden and stop after completion',async({page})=>{
 await page.goto(base+'/');await expect(page.locator('#dg-home-title')).toBeVisible();
 await expect.poll(()=>page.locator('#dg-home-title').evaluate(e=>Number(getComputedStyle(e).opacity))).toBe(1);
 await page.locator('#this-week .dg-list-head').scrollIntoViewIfNeeded();
 await expect.poll(()=>page.locator('#this-week .dg-list-head').evaluate(e=>Number(getComputedStyle(e).opacity))).toBe(1);
 await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.id==='digivated-content-entrance').length)).toBe(0);
});
test('hero stays readable when JavaScript is disabled',async({browser})=>{
 const c=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});const p=await c.newPage();await p.goto(base+'/');
 await expect(p.locator('#dg-home-title')).toBeVisible();
 await expect(p.locator('.dg-discovery-poster img')).toHaveJSProperty('complete', true);
 await expect(p.getByRole('link',{name:'Submit your product',exact:true})).toHaveAttribute('href','/submit-project');
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await c.close();
});
test('the new backdrop leaves resources search and home hero actions usable',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 await page.goto(base+'/resources');
 await page.locator('[data-open-search]').click();
 await expect(page.locator('#discovery-search')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goto(base+'/');
 await expect(page.locator('[data-ascii-field],.ascii-ambient')).toHaveCount(0);
 await expect(page.locator('.dg-hero-panel [role=timer]')).toBeVisible();
 await expect(page.getByRole('link',{name:'Submit your product',exact:true})).toHaveAttribute('href','/submit-project');
 await page.getByRole('link',{name:'Browse launches',exact:true}).click();
 await expect(page).toHaveURL(/#this-week$/);
});

test('the dot matrix changes poses and leaves native launch links usable', async ({ page }) => {
 await page.route('https://images.higgs.ai/**', route => route.fulfill({
   contentType: 'image/svg+xml',
   headers: { 'Access-Control-Allow-Origin': '*' },
   body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="905"><rect width="1600" height="905" fill="white"/><path d="M0 140h670v85H0zM910 158h690v72H910zM0 605h660v160H0zM910 620h690v160H910z" fill="#222"/></svg>',
 }));
 await page.setViewportSize({width:1440,height:900});
 await page.goto(base+'/');
 const hero=page.locator('[data-discovery-hero]');
 const canvas=hero.locator('canvas');
 await expect(canvas).toBeVisible();
 const pose = (time:number) => canvas.evaluate((element, seconds)=>{
   (window as any).__render(seconds);
   return (element as HTMLCanvasElement).toDataURL();
 },time);
 const closed = await pose(0);
 expect(await pose(8)).not.toBe(closed);
 expect(await pose(20)).toBe(closed);
 const browse=hero.getByRole('link',{name:'Browse launches',exact:true});
 await browse.focus();
 await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/#this-week$/);
});
