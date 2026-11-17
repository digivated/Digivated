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
test('site atmosphere moves without covering controls or widening mobile pages',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.goto(base+'/resources');
 const atmosphere=page.locator('.site-atmosphere');
 await expect(atmosphere).toBeVisible();
 const styles=await atmosphere.evaluate(element=>({pointer:getComputedStyle(element).pointerEvents,motion:getComputedStyle(element,'::before').animationName}));
 expect(styles.pointer).toBe('none');
 expect(styles.motion).toBe('digivated-atmosphere-orbit');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.header-search').click();await expect(page.locator('#discovery-search')).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(atmosphere).toBeHidden();
});
test('home ambient points stay light and do not block hero actions',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.goto(base+'/');
 await expect(page.locator('.home-signal')).toHaveCount(0);
 await expect(page.locator('.home-kinetic-beam')).toHaveCount(0);
 const motion=await page.locator('.home-kinetic').evaluate(element=>({pointer:getComputedStyle(element).pointerEvents,animation:getComputedStyle(element.querySelector('.home-kinetic-spark')).animationName}));
 expect(motion.pointer).toBe('none');expect(motion.animation).toBe('digivated-signal-drift');
 await expect(page.locator('.home-editorial-actions a').first()).toHaveAttribute('href','/discover#project-wall');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await page.locator('.home-kinetic-spark').first().evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
});
