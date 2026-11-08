import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`News is temporarily removed at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[],next:null,counts:{},views:{}}}));
 await page.goto('http://127.0.0.1:4321/');
 await expect(page.locator('.header-primary a')).toHaveCount(3);
 await page.locator('.notebook-navigation>summary').click();
 await expect(page.locator('.navigation-panel')).toBeVisible();
 await expect(page.locator('a[href="/news"]')).toHaveCount(0);
 await page.keyboard.press('Escape');await page.locator('.header-search').click();
 await page.locator('#unified-search-input').fill('news');
 await expect(page.locator('#discovery-search a[href="/news"]')).toHaveCount(0);
 await page.goto('http://127.0.0.1:4321/news');
 await expect(page).toHaveURL('http://127.0.0.1:4321/');
 await expect(page.locator('#home-title')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
