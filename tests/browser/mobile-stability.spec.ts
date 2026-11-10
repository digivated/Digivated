import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const project={id:'mobile-card',name:'Mobile Card',description:'A useful project',creator:'Builder',category:'Business',url:'https://example.com',image:'',status:'approved',pick:true,views:5};

for(const width of [320,375,390])test(`mobile controls and project card stay at a stable viewport at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:812});
 await page.route('**/api/projects*',route=>route.fulfill({json:{items:[project],next:null}}));
 await page.goto(base+'/discover');
 await expect(page.getByRole('button',{name:'Open Mobile Card'})).toBeVisible();
 const search=page.getByRole('searchbox',{name:'Search the wall'});
 expect(await search.evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
 const open=page.getByRole('button',{name:'Open Mobile Card'});
 expect(await open.evaluate(element=>getComputedStyle(element).touchAction)).toBe('manipulation');
 await open.scrollIntoViewIfNeeded();
 const before=await page.evaluate(()=>scrollY);
 await open.evaluate(element=>(element as HTMLElement).click());
 await expect(page.locator('#wall-focus-title')).toHaveText('Mobile Card');
 expect(await page.evaluate(()=>({scale:visualViewport?.scale,overflow:document.documentElement.scrollWidth-innerWidth}))).toEqual({scale:1,overflow:0});
 await page.locator('.wall-focus-close').evaluate(element=>(element as HTMLElement).click());
 expect(Math.abs((await page.evaluate(()=>scrollY))-before)).toBeLessThanOrEqual(2);
});

test('resource search and category picker use iOS-safe text sizes',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.goto(base+'/resources');
 for(const locator of [page.locator('[data-link-search]'),page.locator('[data-link-select]')]){
  await expect(locator).toBeVisible();
  expect(await locator.evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
 }
});

for(const width of [320,375])test(`primary mobile routes never force sideways scrolling at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:812});
 for(const path of ['/','/discover','/creators','/inbox','/news','/resources','/rankings','/membership','/account','/login','/submit-project']){
  await page.goto(base+path);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
 }
});
