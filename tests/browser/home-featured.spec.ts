import { test, expect } from '@playwright/test';
const base='http://127.0.0.1:4321';
const project=(id:string,status='featured')=>({id,name:`Project ${id}`,status,creator:`Maker ${id}`,category:'Apps',description:'An independent project for creative people.',url:'https://example.invalid',image:'/digivated-new-mark.svg',views:0});
for(const width of[1440,390])test(`compact featured projects sit above the only reel at ${width}px`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:1000});
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/api/projects')return route.fulfill({json:{items:u.searchParams.get('offset')==='100'?[project('gamma'),project('alpha')]:[project('alpha'),project('beta'),project('approved','approved')],next:u.searchParams.get('offset')==='100'?null:100}});if(u.pathname==='/api/project-account')return route.fulfill({json:{ready:false}});return route.fulfill({json:{items:[],next:null,views:{},likes:{},counts:{}}})});
 await page.goto(base+'/');
 await expect(page.locator('[data-home-featured]')).toHaveAttribute('data-ready','true');
 await expect(page.locator('.home-featured-card')).toHaveCount(3);
 expect(await page.locator('.home-featured-card').evaluateAll(es=>es.map(e=>(e as HTMLElement).dataset.featuredProject))).toEqual(['alpha','beta','gamma']);
 const order=await page.evaluate(()=>{const featured=document.querySelector('[data-home-featured]')!,reel=document.querySelector('.project-reel')!;return Boolean(featured.compareDocumentPosition(reel)&Node.DOCUMENT_POSITION_FOLLOWING)});
 expect(order).toBe(true);
 await expect(page.locator('[data-project-ticker]')).toHaveCount(1);
 await expect(page.locator('.project-wall')).toHaveCount(0);
 await expect(page.locator('.wall-search,.wall-page-controls')).toHaveCount(0);
 await expect(page.getByRole('link',{name:'View featured',exact:true})).toHaveAttribute('href','/discover?view=featured');
 const card=page.locator('.home-featured-card').first();
 await expect(card).toHaveCSS('animation-name','none');
 expect(await card.evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(154);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await card.click();
 await expect(page.locator('#wall-focus-title')).toHaveText('Project alpha');
 await expect(page.locator('.project-wall')).toHaveCount(1);
 expect(errors).toEqual([]);
});
test('featured failure leaves an honest fallback and empty featured sections disappear',async({page})=>{
 let fail=true;
 await page.route('**/api/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/api/projects'&&u.searchParams.get('view')==='featured')return route.fulfill(fail?{status:503,json:{error:'Unavailable'}}:{json:{items:[],next:null}});if(u.pathname==='/api/project-account')return route.fulfill({json:{ready:false}});return route.fulfill({json:{items:[],next:null,views:{},likes:{},counts:{}}})});
 await page.goto(base+'/');await expect(page.locator('[data-featured-status]')).toContainText('temporarily unavailable');
 await expect(page.locator('[data-featured-rail]')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('.home-featured-card')).toHaveCount(0);
 fail=false;await page.reload();await expect(page.locator('[data-home-featured]')).toBeHidden();
 await expect(page.locator('.home-editorial h1')).toBeVisible();
});

test('featured views show real totals and update only after a visible impression',async({page})=>{
 let impressions=0;
 await page.route('**/api/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/api/projects')return route.fulfill({json:{items:[{...project('views'),views:1234}],next:null}});if(u.pathname==='/api/project-views'){impressions++;return route.fulfill({json:{views:1235}});}return route.fulfill({json:{items:[],ready:false,next:null}});});
 await page.goto(base+'/');
 const count=page.locator('.home-featured-card [data-project-views="views"]');
 await expect(count).toHaveText('1,234 views');
 await count.scrollIntoViewIfNeeded();
 await expect(count).toHaveText('1,235 views');
 expect(impressions).toBe(1);
 await expect(page.locator('.home-featured-views svg')).toHaveCount(1);
});
