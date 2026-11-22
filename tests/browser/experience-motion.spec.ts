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
  expect(bounds!.x).toBeGreaterThanOrEqual(hero!.x);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(hero!.x + hero!.width + 1);
 }
 expect(title!.x + title!.width / 2).toBeCloseTo(actions!.x + actions!.width / 2, 0);

 expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.id==='digivated-content-entrance').length)).toBe(0);
 expect(await page.locator('.dg-hero').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 const login = page.getByRole('link', { name: 'Log In', exact: true });
 await login.focus();
 await page.keyboard.press('/');await expect(page.locator('#unified-search-input')).toBeFocused();
 await page.keyboard.press('Escape');await expect(login).toBeFocused();
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
 const menu = p.locator('.site-menu-trigger');
 await menu.click();
 await expect(p.getByRole('link',{name:'Submit a product',exact:true})).toHaveAttribute('href','/submit-project');
 await menu.click();
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await p.getByRole('searchbox').fill('indie projects');
 await p.getByRole('button',{name:'Search products',exact:true}).click();
 await expect(p).toHaveURL(/\/discover\?q=indie\+projects$/);
 await c.close();
});
test('the new backdrop leaves resources search and home hero actions usable',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 await page.goto(base+'/resources');
 await page.keyboard.press('/');
 await expect(page.locator('#discovery-search')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goto(base+'/');
 await expect(page.locator('[data-ascii-field],.ascii-ambient')).toHaveCount(0);
 await expect(page.locator('.dg-hero-panel [role=timer]')).toBeVisible();
 await page.getByRole('link',{name:'Submit launch',exact:true}).click();
 await expect(page).toHaveURL(base + '/submit-project');
});

test('activity indicators follow system motion preferences and launch links stay usable', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.goto(base + '/');
 const orbit = page.locator('.dg-activity-mark-orbit .dg-activity-dot').first();
 const ribbon = page.locator('.dg-activity-mark-ribbon .dg-activity-dot').first();
 await expect(orbit).toHaveCSS('background-color', 'rgb(68, 68, 68)');
 await expect(ribbon).toHaveCSS('background-color', 'rgb(65, 65, 65)');
 await expect(orbit).toHaveCSS('animation-name', 'dg-orbit-signal');
 await expect(ribbon).toHaveCSS('animation-name', 'dg-ribbon-signal');
 await expect(page.locator('[data-scene-toggle]')).toHaveCount(0);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(page.locator('canvas[data-site-backdrop]')).toBeVisible();
 await expect(orbit).toHaveCSS('animation-name', 'none');
 await expect(ribbon).toHaveCSS('animation-name', 'none');

 await page.emulateMedia({ reducedMotion: 'no-preference' });
 await expect(ribbon).toHaveCSS('animation-name', 'dg-ribbon-signal');

 await page.getByRole('link', { name: 'Submit launch', exact: true }).focus();
 await page.keyboard.press('Enter');
 await expect(page).toHaveURL(base + '/submit-project');
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
 await page.keyboard.press('/');
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

test('the centered homepage search sits directly on the page background', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + '/');
  const hero = page.locator('[data-discovery-hero]');
  await expect(hero).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(hero).toHaveCSS('background-image', 'none');
  await expect(hero).toHaveCSS('border-top-width', '0px');
  await expect(hero).toHaveCSS('box-shadow', 'none');
  await expect(hero).not.toHaveAttribute('data-nav-reflection', '');
  const title = (await hero.getByRole('heading').boundingBox())!;
  const frame = (await page.locator('#main').boundingBox())!;
  expect(title.x + title.width / 2).toBeCloseTo(frame.x + frame.width / 2, 0);
  await expect(hero.getByRole('searchbox')).toBeVisible();
});

test('React Bits sidebar and action effects animate without changing link targets', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + '/');
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
  const directory = nav.getByRole('link', { name: 'Directory', exact: true });
  const row = nav.locator('.line-sidebar__item').filter({ has: page.getByRole('link', { name: 'Directory', exact: true }) });
  const action = page.getByRole('link', { name: 'Submit launch', exact: true });
  const band = action.locator('.glare-hover__band').first();
  const bandTransform = () => band.evaluate(element => element.style.transform);
  await expect.poll(bandTransform).toContain('translateX');

  await directory.hover();
  await expect.poll(() => row.evaluate(element => Number(element.style.getPropertyValue('--effect')))).toBeGreaterThan(.6);

  const resting = await bandTransform();
  await action.hover();
  await expect.poll(bandTransform).not.toBe(resting);
  await expect(action).toHaveAttribute('href', '/submit-project');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(action.locator('.glare-hover__glare')).toBeHidden();
  await expect(directory.locator('.line-sidebar__label')).toHaveCSS('transform', 'none');
  await directory.press('Enter');
  await expect(page).toHaveURL(base + '/discover');
  await expect(directory).toHaveAttribute('aria-current', 'page');
});
