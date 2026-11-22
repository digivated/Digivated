import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
async function setup(page){
 await page.route('**/api/**',r=>r.fulfill({json:{items:[],next:null,ready:false}}));
 await page.goto(base+'/');await page.waitForTimeout(250);
 const counter=page.locator('[data-site-visits]');await counter.scrollIntoViewIfNeeded();await expect(counter).toBeInViewport();await counter.evaluate(e=>e.textContent='1,234');await page.waitForTimeout(30);return counter;
}
test('a changed live total settles and highlights once, without replacing its content',async({page})=>{
 const counter=await setup(page);
 const iterations=await counter.evaluate(async e=>{
  e.textContent='1,235';
  await Promise.resolve();
  return e.getAnimations().map(animation=>animation.effect?.getTiming().iterations);
 });
 expect(iterations).toEqual([1]);
 await expect(counter).toHaveText('1,235');
 await expect.poll(()=>counter.evaluate(e=>e.getAnimations().length)).toBe(0);
 await counter.evaluate(e=>e.textContent='1,235');await page.waitForTimeout(30);expect(await counter.evaluate(e=>e.getAnimations().length)).toBe(0);
});
test('reduced motion and offscreen counters update immediately without animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const counter=await setup(page);await counter.evaluate(e=>e.textContent='1,235');await page.waitForTimeout(30);await expect(counter).toHaveText('1,235');expect(await counter.evaluate(e=>e.getAnimations().length)).toBe(0);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await expect(counter).not.toBeInViewport();await counter.evaluate(e=>e.textContent='1,236');await page.waitForTimeout(30);expect(await counter.evaluate(e=>e.getAnimations().length)).toBe(0);
});
test('project view updates retain icons and honor a reduced-motion change mid-effect',async({page})=>{
 const counter=await setup(page);
 await counter.evaluate(e=>{const label=document.createElement('span');label.dataset.projectViews='motion-fixture';label.innerHTML='<svg aria-hidden="true" width="12" height="12"></svg><span>12 views</span>';e.parentElement!.append(label);});await page.waitForTimeout(30);
 const label=page.locator('[data-project-views="motion-fixture"]');
 const animations=await label.evaluate(async e=>{
  e.querySelector('span')!.textContent='13 views';
  await Promise.resolve();
  return e.getAnimations().length;
 });
 expect(animations).toBe(1);
 await expect(label.locator('svg')).toHaveCount(1);
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>label.evaluate(e=>e.getAnimations().length)).toBe(0);await expect(label).toHaveText('13 views');
});
