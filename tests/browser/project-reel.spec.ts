import { test, expect } from '@playwright/test';
const base='http://127.0.0.1:4321';
const project=(id:string,status='approved')=>({id,name:`Project ${id}`,status,creator:`Maker ${id}`,category:'Apps',description:'An independent project with useful ideas for builders.',url:'https://example.invalid',image:'/digivated-new-mark.svg',views:0});
const first=[project('alpha','featured'),project('beta'),project('private','pending')];
const second=[project('beta'),project('gamma'),project('delta')];
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/api/projects')return route.fulfill({json:url.searchParams.get('offset')==='100'?{items:second,next:null}:{items:first,next:100}});if(url.pathname==='/api/project-account')return route.fulfill({json:{ready:false}});return route.fulfill({json:{items:[],next:null,views:{},likes:{},counts:{}}});});
});
for(const path of['/','/discover'])test(`one reel includes the whole paginated catalogue on ${path}`,async({page})=>{
 await page.goto(base+path);
 await expect(page.locator('[data-project-ticker]')).toHaveCount(1);
 await expect(page.locator('[data-reel-count]')).toHaveText('4 projects in the mix');
 const originals=page.locator('.project-reel-card:not([aria-hidden])');
 await expect(originals).toHaveCount(4);
 expect(await originals.evaluateAll(links=>links.map(a=>(a as HTMLElement).dataset.reelProject))).toEqual(['alpha','beta','gamma','delta']);
 await expect(page.locator('.project-reel-card[data-reel-project="private"]')).toHaveCount(0);
 await expect(originals.first()).toHaveAttribute('href','/discover#project-alpha');
 await page.locator('.project-reel').scrollIntoViewIfNeeded();
 await page.locator('[data-reel-window]').hover();
 await expect(page.locator('.project-reel')).toHaveAttribute('data-moving','false');
 await originals.first().click();
 await expect(page.locator('#wall-focus-title')).toHaveText('Project alpha');
});
test('automatic motion pauses, resumes and allows manual keyboard browsing',async({page})=>{
 await page.goto(base+'/');
 const reel=page.locator('.project-reel'),rail=page.locator('[data-reel-window]');
 await expect(reel).toHaveAttribute('data-ready','true');
 await reel.scrollIntoViewIfNeeded();await page.mouse.move(0,0);
 await expect(reel).toHaveAttribute('data-moving','true');
 const initial=await rail.evaluate(e=>e.scrollLeft);
 await expect.poll(()=>rail.evaluate(e=>e.scrollLeft)).toBeGreaterThan(initial+3);
 await page.getByRole('button',{name:'Pause project reel',exact:true}).click();
 await expect(reel).toHaveAttribute('data-moving','false');
 const stopped=await rail.evaluate(e=>e.scrollLeft);await page.waitForTimeout(150);expect(await rail.evaluate(e=>e.scrollLeft)).toBe(stopped);
 await page.getByRole('button',{name:'Play project reel',exact:true}).click();
 await expect(reel).toHaveAttribute('data-moving','true');
 await rail.focus();await expect(reel).toHaveAttribute('data-moving','false');
 const before=await rail.evaluate(e=>e.scrollLeft);await page.keyboard.press('ArrowRight');
 await expect.poll(()=>rail.evaluate(e=>e.scrollLeft)).toBeGreaterThan(before);
 await expect(page.getByRole('button',{name:'Play project reel',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('reduced motion stays still and arrow controls still browse',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'/');
 const reel=page.locator('.project-reel'),rail=page.locator('[data-reel-window]');
 await expect(reel).toHaveAttribute('data-ready','true');await reel.scrollIntoViewIfNeeded();await page.mouse.move(0,0);
 await expect(reel).toHaveAttribute('data-moving','false');
 await expect(page.getByRole('button',{name:'Automatic motion disabled by your preferences'})).toBeDisabled();
 expect(await page.locator('.project-reel-card').first().evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 const start=await rail.evaluate(e=>e.scrollLeft);await page.waitForTimeout(120);expect(await rail.evaluate(e=>e.scrollLeft)).toBe(start);
 await page.getByRole('button',{name:'Next projects',exact:true}).click();expect(await rail.evaluate(e=>e.scrollLeft)).toBeGreaterThan(start);
});
test('a missing thumbnail keeps its project in the reel and mobile never overflows',async({page})=>{
 await page.setViewportSize({width:320,height:750});
 await page.route('**/digivated-new-mark.svg',route=>route.fulfill({status:404,body:'Missing fixture image'}));
 await page.goto(base+'/');
 await expect(page.locator('[data-reel-count]')).toHaveText('4 projects in the mix');await page.locator('.project-reel').scrollIntoViewIfNeeded();
 await expect(page.locator('.project-reel-card:not([aria-hidden])')).toHaveCount(4);
 await expect(page.locator('.project-reel-monogram').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('a failed catalogue hides the optional reel without breaking the directory',async({page})=>{
 await page.route('**/api/projects**',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
 await page.goto(base+'/');await expect(page.locator('.project-reel')).toBeHidden();
 await expect(page.locator('.home-editorial h1')).toBeVisible();
 await expect(page.locator('.header-search')).toBeVisible();
});
