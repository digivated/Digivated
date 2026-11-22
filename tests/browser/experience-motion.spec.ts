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
 await expect(page.locator('.dg-launch-scene-hero canvas')).toBeHidden();
 await expect(page.locator('.dg-activity-dot').first()).toHaveCSS('animation-name', 'none');
 const [hero, title, actions] = await Promise.all(['[data-discovery-hero]', '#dg-home-title', '.dg-hero-actions'].map(selector => page.locator(selector).boundingBox()));
 for (const bounds of [title, actions]) {
  expect(bounds!.x).toBeCloseTo(hero!.x, 0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(hero!.x + hero!.width + 1);
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
 const poster = p.locator('.dg-launch-scene-hero .dg-scene-poster img');
 await expect.poll(() => poster.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await expect(p.locator('.dg-launch-scene-hero canvas')).toBeHidden();
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

test('the ASCII field moves, pauses, and keeps native launch links usable', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.clock.install();
 await page.goto(base + '/');
 const hero = page.locator('[data-discovery-hero]');
 const canvas = page.locator('.dg-launch-scene-hero canvas');
 await expect(canvas).toBeVisible();
 const orbit = page.locator('.dg-activity-mark-orbit .dg-activity-dot').first();
 const ribbon = page.locator('.dg-activity-mark-ribbon .dg-activity-dot').first();
 await expect(orbit).toHaveCSS('background-color', 'rgb(57, 100, 86)');
 await expect(ribbon).toHaveCSS('background-color', 'rgb(97, 99, 91)');
 await expect(orbit).toHaveCSS('animation-name', 'dg-orbit-signal');
 await expect(ribbon).toHaveCSS('animation-name', 'dg-ribbon-signal');
 const capture = () => canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
 const first = await capture();
 await page.clock.runFor(8000);
 expect(await capture()).not.toBe(first);

 const pause = hero.getByRole('button', { name: 'Pause animation' });
 await pause.click();
 await expect(orbit).toHaveCSS('animation-play-state', 'paused');
 await expect(ribbon).toHaveCSS('animation-play-state', 'paused');
 const frozen = await capture();
 await page.clock.runFor(1200);
 expect(await capture()).toBe(frozen);
 await hero.getByRole('button', { name: 'Play animation' }).click();
 await page.clock.runFor(1200);
 expect(await capture()).not.toBe(frozen);
 await expect(ribbon).toHaveCSS('animation-play-state', 'running');

 await page.getByRole('link', { name: 'Browse launches', exact: true }).focus();
 await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/#this-week$/);
});


test('the ASCII backdrop stays pinned beyond the masthead and carries across light layouts', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.emulateMedia({ reducedMotion: 'reduce' });
 for (const [path, variant] of [['/', 'hero'], ['/discover', 'masthead'], ['/login', 'quiet'], ['/start', 'quiet']]) {
  await page.goto(base + path);
  const scene = page.locator('[data-launch-scene]');
  await expect(scene).toHaveCount(1);
  await expect(scene).toHaveAttribute('data-scene-size', variant);
  await expect(scene).toHaveAttribute('aria-hidden', 'true');
  await expect(scene).toHaveCSS('position', 'fixed');
  await expect(scene).toHaveCSS('pointer-events', 'none');
  await expect(scene.locator('canvas')).toBeHidden();
  await expect.poll(() => scene.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const frame = await scene.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await scene.boundingBox()).toEqual(frame);
 }
});

test('the static ASCII art stays visible when a canvas context is unavailable', async ({ page }) => {
 await page.addInitScript(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
   return type === '2d' ? null : Reflect.apply(getContext, this, [type, options]);
  } as typeof getContext;
 });
 await page.goto(base + '/discover');
 const scene = page.locator('[data-launch-scene]');
 await expect(scene.locator('canvas')).toBeHidden();
 await expect.poll(() => scene.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await page.getByRole('button', { name: 'Search Digivated' }).click();
 await expect(page.locator('#unified-search-input')).toBeFocused();
});
