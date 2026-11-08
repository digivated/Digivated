import {test,expect} from '@playwright/test';
for(const width of [320,390,768,1440])test(`compact menu fits and keeps all destinations at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[],next:null}}));
 await page.goto('http://127.0.0.1:4321/');await page.locator('.notebook-navigation>summary').click();
 const menu=page.locator('#explore-navigation');await expect(menu).toBeVisible();
 await expect(menu.locator('.navigation-destinations>a')).toHaveText(['Projects','Rankings','AI tools','Membership','Submit a project']);
 await expect(menu.locator('small,.navigation-icon,.navigation-builder,.navigation-products')).toHaveCount(0);
 await expect(menu.locator('a[href="/membership"]')).toHaveCount(1);await expect(menu.locator('a[href="/submit-project"]')).toHaveCount(1);
 const rect=await menu.boundingBox();expect(rect!.height).toBeLessThan(430);expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(width);
 await expect(menu).toHaveCSS('background-color','rgb(13, 12, 16)');
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(page.locator('.notebook-navigation>summary')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('signed-in account label does not overflow the compact mobile header',async({page})=>{
 await page.setViewportSize({width:320,height:900});await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[],next:null}}));await page.goto('http://127.0.0.1:4321/');
 await page.locator('#header-account-link').evaluate(e=>e.textContent='My account');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
