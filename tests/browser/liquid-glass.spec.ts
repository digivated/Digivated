import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('digivated:intro:v1','1'));
});

test('mobile glass menu remains readable and routes correctly',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/');
 await page.locator('.site-menu-trigger').click();
 const menu=page.locator('#explore-navigation');await expect(menu).toBeVisible();
 const material=await menu.evaluate(element=>({filter:getComputedStyle(element).backdropFilter,background:getComputedStyle(element).backgroundColor}));
 expect(material.filter).toContain('blur(');
 expect(Number(material.background.split(',').at(-1)?.replace(')', ''))).toBeLessThan(.5);
 await menu.getByRole('link',{name:'Resources'}).click();
 await expect(page).toHaveURL(/\/resources\/?$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('glass search stays usable at desktop and narrow widths',async({page,browserName})=>{
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/');
  const search = page.getByRole('button', { name: 'Search Digivated', exact: true });
  await expect(search).toHaveClass(/lq-button/);
  await search.focus();
  if (browserName === 'chromium') await expect(search).toHaveAttribute('data-liquid-lens', 'true');
  await search.click();
  const dialog=page.locator('#discovery-search');await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('backdrop-filter', /blur/);
  if (browserName === 'chromium') await expect(dialog).toHaveCSS('backdrop-filter', /url\(/);
  const tint = await dialog.evaluate(element => Number(getComputedStyle(element).backgroundColor.split(',').at(-1)?.replace(')', '')));
  expect(tint).toBeGreaterThan(.8);
  await expect(dialog.locator('.search-subtitle')).toHaveCSS('color', 'rgb(97, 99, 91)');
  await expect(dialog.getByRole('button',{name:'Guides',exact:true})).toHaveCSS('color', 'rgb(97, 99, 91)');
  await expect(page.locator('#unified-search-input')).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('reduced motion keeps the glass surfaces and readable controls',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await page.goto(base+'/');
 const launch = page.getByRole('link', { name: 'Browse launches', exact: true });
 await expect(launch).toBeVisible();
 await expect(launch).toHaveAttribute('href', '#this-week');
 await expect(launch).toHaveCSS('transition-duration', '0s');
 await page.locator('.site-menu-trigger').click();
 await expect(page.locator('#explore-navigation')).toBeVisible();
 expect(await page.locator('#explore-navigation').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
});
