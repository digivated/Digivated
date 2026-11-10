import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('digivated:intro:v1','1'));
});

test('mobile glass menu remains readable and routes correctly',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/');
 await page.locator('.notebook-navigation>summary').click();
 const menu=page.locator('#explore-navigation');await expect(menu).toBeVisible();
 const material=await menu.evaluate(element=>({filter:getComputedStyle(element).backdropFilter,background:getComputedStyle(element).backgroundColor}));
 expect(material.filter).toContain('blur(');
 expect(material.background).toContain('0.973');
 await menu.getByRole('link',{name:'Resources'}).click();
 await expect(page).toHaveURL(/\/resources\/?$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('glass search stays usable at desktop and narrow widths',async({page})=>{
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/');
  await page.locator('.header-search').click();
  const dialog=page.locator('#discovery-search');await expect(dialog).toBeVisible();
  await expect(page.locator('#unified-search-input')).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('reduced motion keeps the glass surfaces and readable controls',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await page.goto(base+'/');
 await expect(page.locator('.home-editorial-actions .button').first()).toBeVisible();
 await page.locator('.notebook-navigation>summary').click();
 await expect(page.locator('#explore-navigation')).toBeVisible();
 expect(await page.locator('#explore-navigation').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
});
