import {test,expect} from '@playwright/test';
for(const width of [320,390,768,1024,1440])test(`compact menu fits and keeps all destinations at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[],next:null}}));
 await page.goto('http://127.0.0.1:4321/');
 const trigger=page.locator('.notebook-navigation>summary');
 await expect(trigger).toHaveText('');await expect(trigger.locator('.navigation-trigger-menu')).toBeVisible();
 await expect(page.locator('.header-membership')).toBeVisible();await expect(page.locator('.header-membership')).toHaveAttribute('href','/membership');
 const controls=await page.locator('.compact-header-actions>button,.compact-header-actions>a,.notebook-navigation>summary').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect().toJSON()));
 for(let i=0;i<controls.length;i++){expect(controls[i].x).toBeGreaterThanOrEqual(0);expect(controls[i].right).toBeLessThanOrEqual(width);if(i)expect(controls[i].left).toBeGreaterThanOrEqual(controls[i-1].right);}
 await page.screenshot({path:test.info().outputPath(`header-${width}.png`)});
 await trigger.click();await expect(trigger.locator('.navigation-trigger-close')).toBeVisible();
 const menu=page.locator('#explore-navigation');await expect(menu).toBeVisible();
 await expect(menu.locator('.navigation-destinations>a')).toHaveText(['Projects','Rankings','AI tools','News','Membership','Submit a project']);
 await expect(menu.locator('small,.navigation-icon,.navigation-builder,.navigation-products')).toHaveCount(0);
 await expect(menu.locator('a[href="/membership"]')).toHaveCount(1);await expect(menu.locator('a[href="/submit-project"]')).toHaveCount(1);
 const rect=await menu.boundingBox();expect(rect!.height).toBeLessThan(430);expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(width);
 await expect(menu).toHaveCSS('background-color','rgb(13, 12, 16)');
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(page.locator('.notebook-navigation>summary')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('header supports keyboard menu entry, dismissal and search',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[],next:null}}));
 await page.goto('http://127.0.0.1:4321/rankings');
 await expect(page.locator('.header-primary a[aria-current=page]')).toHaveText('Rankings');
 const trigger=page.locator('.notebook-navigation>summary');await trigger.focus();await page.keyboard.press('ArrowDown');
 await expect(page.locator('#explore-navigation a').first()).toBeFocused();await expect(trigger).toHaveAttribute('aria-expanded','true');
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await expect(trigger).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'Search Digivated',exact:true}).click();
 await expect(page.locator('#discovery-search')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#discovery-search')).toBeHidden();
});
test('signed-in account label does not overflow the compact mobile header',async({page})=>{
 await page.setViewportSize({width:320,height:900});await page.route('**/api/**',r=>r.fulfill({json:{ready:false,items:[],next:null}}));await page.goto('http://127.0.0.1:4321/');
 await page.locator('#header-account-link').evaluate(e=>e.textContent='My account');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
