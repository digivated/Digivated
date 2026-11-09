import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const items=Array.from({length:15},(_,i)=>({id:'project-'+i,name:'Project '+i,category:i===0?'Education':'Apps',description:'A useful independent project.',creator:'Builder',status:i<2?'featured':'approved',image:'/digivated-new-mark.svg',url:'https://example.com',views:12}));
test('All projects retains upload order across pages and collection switches',async({page})=>{
 const catalog=items.map((p,i)=>({...p,status:i===5||i===13?'featured':'approved',date:new Date(Date.UTC(2026,10,15-i)).toISOString()}));
 await page.route('**/api/**',r=>{const u=new URL(r.request().url());return r.fulfill({json:u.pathname==='/api/projects'?(u.searchParams.get('offset')==='100'?{items:catalog.slice(10),next:null}:{items:catalog.slice(0,10),next:100}):{items:[],ready:false}});});
 await page.goto(base+'/discover');await expect(page.locator('.wall-tile')).toHaveCount(12);
 const names=()=>page.locator('.wall-tile-caption strong').allTextContents();
 await expect.poll(names).toEqual(catalog.slice(0,12).map(p=>p.name));
 await page.getByRole('button',{name:'Next group of projects'}).click();await expect.poll(names).toEqual(catalog.slice(12).map(p=>p.name));
 await page.getByRole('button',{name:'Featured',exact:true}).click();await expect.poll(names).toEqual(['Project 5','Project 13']);
 await page.getByRole('button',{name:'All projects',exact:true}).click();await expect.poll(names).toEqual(catalog.slice(0,12).map(p=>p.name));
 await page.getByRole('button',{name:'Open Project 0',exact:true}).click();await expect(page.locator('#wall-focus-title')).toHaveText('Project 0');
 await page.keyboard.press('Escape');await page.reload();await expect.poll(names).toEqual(catalog.slice(0,12).map(p=>p.name));
});
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
for(const width of [320,1440])test(`Resources category and search navigation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(base+'/resources');
 await expect(page.locator('[data-link-group]:visible')).toHaveCount(1);
 await expect(page.locator('a[href="https://60fps.design"]')).toBeVisible();
 if(width<760)await page.locator('[data-link-select]').selectOption('security-privacy');
 else await page.locator('[data-link-category="security-privacy"]').click();
 await expect(page.locator('a[href="https://haveibeenpwned.com"]')).toBeVisible();
 await expect(page.locator('a[href="https://60fps.design"]')).toBeHidden();
 await page.locator('[data-link-search]').fill('supabase');
 await expect(page.locator('a[href="https://supabase.com"]')).toBeVisible();
 await expect(page.locator('a[href="https://haveibeenpwned.com"]')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('link',{name:'Explore Digivated guides'})).toHaveCount(0);
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
