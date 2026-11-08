import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
  await page.route('**/api/**',r=>{
    const u=new URL(r.request().url());
    if(u.pathname==='/api/admin'||u.pathname==='/api/edition')return r.fulfill({status:401,json:{error:'Sign in required'}});
    return r.fulfill({json:{ready:false,items:[],next:null,views:{},counts:{}}});
  });
});
for(const width of [390,1440])test(`dark surfaces stay readable across all layouts at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  for(const path of ['/','/submit-project','/saved','/about','/resources','/login','/library','/builder','/toolkit','/admin']){
    await page.goto(base+path);
    await expect(page.locator('html')).toHaveCSS('color-scheme','dark');
    await expect(page.locator('body')).toHaveCSS('background-color','rgb(2, 3, 4)');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    // Visible text and native controls must not fall back to black-on-black or light fields.
    const failures=await page.locator('input:not([type=checkbox]):not([type=radio]),textarea,select').evaluateAll(elements=>elements.filter(e=>{
      if(!(e as HTMLElement).offsetWidth)return false;
      const s=getComputedStyle(e),rgb=s.backgroundColor.match(/\d+/g)?.map(Number)||[];
      return rgb.length>=3&&Math.min(...rgb.slice(0,3))>150;
    }).map(e=>e.id));
    expect(failures).toEqual([]);
  }
});
test('toolkit builder keeps its working prompt and draft in the dark theme',async({page})=>{
  await page.goto(base+'/builder');
  for(const [name,value] of Object.entries({app:'Orbit',screen:'Project dashboard',audience:'Independent builders',goal:'Find the next task'}))await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('#builder-form').getByRole('button',{name:'Build my prompt'}).click();
  await expect(page.locator('#built-prompt')).toHaveValue(/Orbit/);
  await expect(page.locator('#copy-built')).toBeEnabled();
  await page.reload();
  await expect(page.locator('[name="app"]')).toHaveValue('Orbit');
});
test('owner review editor remains usable with glass fields and actions',async({page})=>{
  const record={id:'theme-fixture',name:'Orbit',creator:'Builder',status:'pending',category:'Apps',url:'https://example.invalid',description:'An independent project.',revision:1};
  await page.route('**/api/admin**',r=>{
    const action=new URL(r.request().url()).searchParams.get('action');
    return r.fulfill({json:action==='list'?{items:[record],next:null}:action==='detail'?{record}:{csrf:'fixture'}});
  });
  await page.goto(base+'/admin');
  await page.getByRole('button',{name:'Review & approve',exact:true}).click();
  await expect(page.locator('#owner-editor')).toBeVisible();
  await expect(page.locator('#edit-name')).toHaveValue('Orbit');
  await expect(page.locator('.owner-review-summary')).not.toHaveCSS('background-color','rgb(250, 250, 249)');
  await expect(page.getByRole('button',{name:'Approve & publish',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.locator('#owner-editor')).not.toBeVisible();
});
