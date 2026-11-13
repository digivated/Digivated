import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const items=[['current','2026-11-10'],['previous','2026-11-08'],['older','2026-10-31'],['future','2026-11-16']].map(([id,date])=>({id,name:id,description:'Independent project for launch testing.',category:'Apps',creator:'Builder',url:'https://example.com',pageUrl:'/projects/listing/'+id,image:'/favicon.svg',date,votes:{daily:0,weekly:2,all:5}}));
for(const width of [375,1440])test(`launch links, dates and filters persist at ${width}`,async({page})=>{
 await page.clock.install({time:new Date('2026-11-13T12:00:00Z')});await page.setViewportSize({width,height:900});
 await page.route('**/api/projects*',route=>route.fulfill({json:{items,next:null}}));
 await page.goto(base+'/rankings?launch=previous');
 await expect(page.locator('.launch-row')).toHaveCount(1);await expect(page.locator('.launch-copy h3 a')).toHaveAttribute('href',/\/projects\/listing\/previous$/);
 await expect(page.locator('[data-period=all]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-ranking-title]')).toContainText('Nov 2, 2026 – Nov 8, 2026');
 await page.locator('[data-launch-batch]').selectOption('current');await expect(page.locator('.launch-copy h3')).toHaveText('current');
 await expect(page).toHaveURL(/launch=current/);await expect(page.locator('[data-period=weekly]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-period=all]').click();await page.reload();await expect(page.locator('[data-period=all]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.launch-copy h3')).toHaveText('current');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
