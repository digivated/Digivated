import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const items=Array.from({length:15},(_,i)=>({id:'project-'+i,name:'Project '+i,category:i===0?'Education':'Apps',description:'A useful independent project.',creator:'Builder',status:i<2?'featured':'approved',image:'/digivated-new-mark.svg',url:'https://example.com',views:12}));
for(const width of [320,390,768,1440])test(`plain pagination, category filtering and separate controls at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:950});await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{items,next:null,views:12,ready:false}}));await page.goto(base+'/discover');
 await expect(page.locator('.wall-tile')).toHaveCount(12);
 await expect(page.locator('.wall-page-controls')).not.toContainText(' / ');
 await expect(page.locator('.wall-tile-caption small').first()).toHaveText('Education');
 await page.getByRole('button',{name:'Next group of projects'}).click();await expect(page.locator('.wall-tile')).toHaveCount(3);
 await page.getByRole('combobox',{name:'Project category',exact:true}).selectOption('Education');await expect(page.locator('.wall-tile')).toHaveCount(1);
 await page.getByRole('button',{name:'Open Project 0',exact:true}).click();await expect(page.locator('.wall-focus-category')).toHaveText('Education');
 const bounds=await page.locator('.wall-focus-controls button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
 for(let i=1;i<bounds.length;i++)expect(bounds[i].left).toBeGreaterThanOrEqual(bounds[i-1].right);
 await page.keyboard.press('Escape');await expect(page.locator('.wall-focus')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const rects=await page.locator('.wall-navigation button,.wall-navigation select,.wall-navigation input').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];expect(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1).toBe(false);}
 await page.screenshot({path:test.info().outputPath(`directory-${width}.png`),fullPage:true});
});
test('AI categories only show relevant tools and keep the remainder out of Other',async({page})=>{
 const tools=[{...items[0],id:'daf77018-7d73-4753-a24c-539ed2f80f4d',name:'Kling 4.0',category:'AI',description:'Generate AI videos with marketing examples.'},{...items[1],id:'da7df430-bf8d-4f15-8b20-79fad9dc498e',name:'AINav',category:'AI',description:'Discover tools for video, writing and coding.'}];
 await page.route('**/api/**',r=>r.fulfill({json:{items:tools,next:null,ready:false}}));await page.goto(base+'/ai-tools');
 await expect(page.locator('.ai-category-card')).toHaveCount(2);
 await expect(page.locator('.ai-category-card').filter({hasText:'AI directories'})).toContainText('AINav');
 await expect(page.locator('.ai-category-card').filter({hasText:'Video'})).not.toContainText('AINav');
 await expect(page.getByRole('button',{name:'Other AI tools',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Video',exact:true}).click();await expect(page.locator('.launch-row')).toHaveCount(1);await expect(page.locator('.launch-row')).toContainText('Kling 4.0');
});

test('approved logo keeps its purple and white colours on each site layout',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:{items:[],next:null,ready:false}}));
 for(const path of ['/','/login','/admin','/start']){
  await page.goto(base+path);
  const logo=page.locator('header img[src="/digivated-logo.webp"]').first();
  await expect(logo).toBeVisible();await expect(logo).toHaveCSS('filter','none');
  await expect.poll(()=>logo.evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href','/digivated-favicon.png');
 }
});
