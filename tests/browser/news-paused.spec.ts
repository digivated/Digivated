import {test,expect} from '@playwright/test';
for(const width of [320,390,1440])test(`News access, categories and layout at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 const at=new Date().toISOString();
 await page.route('**/api/**',r=>{
  if(!r.request().url().includes('/api/news'))return r.fulfill({json:{ready:false,items:[],next:null,counts:{},views:{}}});
  const category=new URL(r.request().url()).searchParams.get('category');
  const item={id:'a'.repeat(24),headline:'Microsoft confirms a critical Windows security update',summary:'',locked:true,category:'security',classification:'breaking',sourceName:'Microsoft Security',sourceUrl:'https://www.microsoft.com/en-us/security/blog/',sourcePublishedAt:at,publishedAt:at,verifiedAt:at};
  return r.fulfill({json:{items:category==='markets'?[]:[item],featured:category==='markets'?null:item,next:null,member:false,updatedAt:at,pipeline:{status:'ok'},markets:{status:'unavailable',items:[]}}});
 });
 await page.goto('http://127.0.0.1:4321/news');
 await expect(page.locator('#news-title')).toBeVisible();
 await expect(page.locator('.news-editorial')).toContainText('Microsoft');
 await expect(page.locator('[data-news-page] a[href="/membership#member-sign-in"]').first()).toBeVisible();
 await expect(page.locator('[data-news-page] a[href^="https://www.microsoft.com"]').first()).toHaveAttribute('rel',/noopener/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('[data-news-category="markets"]').click();
 await expect(page.locator('.news-editorial')).not.toContainText('Microsoft');
 await page.locator('[data-news-category="security"]').click();
 await expect(page.locator('.news-editorial')).toContainText('Microsoft');
 await page.locator('[data-news-search]').fill('Windows');
 await expect.poll(()=>new URL(page.url()).searchParams.get('q')).toBe('Windows');
});
test('News failure offers an honest retry without showing sample reporting',async({page})=>{
 await page.route('**/api/news*',r=>r.fulfill({status:503,json:{error:'News is temporarily unavailable.'}}));
 await page.goto('http://127.0.0.1:4321/news');
 await expect(page.locator('[data-news-page]')).toContainText('temporarily unavailable');
 await expect(page.locator('[data-news-refresh]')).toBeEnabled();
});
