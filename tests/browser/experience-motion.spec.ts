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
 await expect(page.locator('canvas[data-site-backdrop]')).toBeVisible();
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
 await expect(p.locator('canvas[data-site-backdrop]')).toHaveAttribute('width', '1');
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

test('activity indicators follow system motion preferences and launch links stay usable', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.goto(base + '/');
 const orbit = page.locator('.dg-activity-mark-orbit .dg-activity-dot').first();
 const ribbon = page.locator('.dg-activity-mark-ribbon .dg-activity-dot').first();
 await expect(orbit).toHaveCSS('background-color', 'rgb(57, 100, 86)');
 await expect(ribbon).toHaveCSS('background-color', 'rgb(97, 99, 91)');
 await expect(orbit).toHaveCSS('animation-name', 'dg-orbit-signal');
 await expect(ribbon).toHaveCSS('animation-name', 'dg-ribbon-signal');
 await expect(page.locator('[data-scene-toggle]')).toHaveCount(0);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(page.locator('canvas[data-site-backdrop]')).toBeVisible();
 await expect(orbit).toHaveCSS('animation-name', 'none');
 await expect(ribbon).toHaveCSS('animation-name', 'none');

 await page.emulateMedia({ reducedMotion: 'no-preference' });
 await expect(ribbon).toHaveCSS('animation-name', 'dg-ribbon-signal');

 await page.getByRole('link', { name: 'Browse launches', exact: true }).focus();
 await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/#this-week$/);
});


test('one particle backdrop stays fixed across public layouts', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.emulateMedia({ reducedMotion: 'reduce' });
 for (const path of ['/', '/discover', '/threads', '/resources', '/login', '/start', '/submit-project']) {
  await page.goto(base + path);
  const scene = page.locator('[data-site-backdrop]');
  await expect(scene).toHaveCount(1);
  await expect(scene).toHaveAttribute('aria-hidden', 'true');
  await expect(scene).toHaveCSS('position', 'fixed');
  await expect(scene).toHaveCSS('pointer-events', 'none');
  await expect(scene).toHaveJSProperty('tagName', 'CANVAS');
  await expect(page.locator('picture[data-site-backdrop], [data-ascii-field], .ascii-ambient, .ascii-rule')).toHaveCount(0);
  await expect.poll(() => scene.evaluate((canvas: HTMLCanvasElement) => {
   const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
   return pixels.some((value, index) => index % 4 === 3 && value > 0);
  })).toBe(true);
  const frame = await scene.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await scene.boundingBox()).toEqual(frame);
 }
});

test('forced colors hides the backdrop and leaves search usable', async ({ page }) => {
 await page.emulateMedia({ forcedColors: 'active' });
 await page.goto(base + '/discover');
 await expect(page.locator('[data-site-backdrop]')).toHaveCSS('visibility', 'hidden');
 await page.getByRole('button', { name: 'Search Digivated' }).click();
 await expect(page.locator('#unified-search-input')).toBeFocused();
});

test('the particle field animates and becomes still when reduced motion is enabled', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 700 });
 await page.goto(base + '/');
 const scene = page.locator('canvas[data-site-backdrop]');
 const frame = () => scene.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
 await expect.poll(() => scene.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(1);
 const firstFrame = await frame();
 await expect.poll(frame).not.toBe(firstFrame);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect.poll(async () => {
  const stillFrame = await frame();
  // Wait longer than one particle frame to distinguish a redraw from the frame cap.
  await page.evaluate(() => new Promise(resolve => {
   const start = performance.now();
   const wait = (now: number) => now - start > 75 ? resolve(undefined) : requestAnimationFrame(wait);
   requestAnimationFrame(wait);
  }));
  return await frame() === stillFrame;
 }).toBe(true);
});
