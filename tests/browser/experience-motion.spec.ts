import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[{id:'motion-fixture',name:'Motion project',creator:'Builder',category:'Apps',status:'featured',url:'https://example.invalid',image:'/digivated-dark-mark.svg',description:'An independent project.'}],next:null,views:{},counts:{}}}));
});
test('spot cards and launch rows stay lightweight and calm under reduced motion',async({page})=>{
 await page.setViewportSize({width:1440,height:950});await page.goto(base+'/');
 const spot=page.locator('[data-spot-rail] .dg-spot').first();await expect(spot).toBeVisible();await spot.hover();
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
 expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.id==='digivated-content-entrance').length)).toBe(0);
 expect(await page.locator('.dg-hero').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await page.locator('.header-search').click();await expect(page.locator('#unified-search-input')).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.locator('.header-search')).toBeFocused();
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
 await expect(p.locator('#dg-home-title')).toBeVisible();await expect(p.locator('.dg-hero-actions a').first()).toHaveAttribute('href','/submit-project');
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await c.close();
});
test('the new backdrop leaves resources search and home hero actions usable',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 await page.goto(base+'/resources');
 await page.locator('.header-search').click();
 await expect(page.locator('#discovery-search')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goto(base+'/');
 await expect(page.locator('[data-ascii-field],.ascii-ambient')).toHaveCount(0);
 await expect(page.locator('.dg-hero-panel [role=timer]')).toBeVisible();
 await expect(page.locator('.dg-hero-actions a').first()).toHaveAttribute('href','/submit-project');
 await page.getByRole('link',{name:'Browse launches',exact:true}).click();
 await expect(page).toHaveURL(/#this-week$/);
});
