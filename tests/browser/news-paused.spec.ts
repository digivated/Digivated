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
test('News desk protects its contents when signed out',async({page})=>{
 await page.route('**/api/admin*',r=>r.fulfill({status:401,json:{error:'Sign in required.'}}));
 await page.goto('http://127.0.0.1:4321/admin/news');
 await expect(page.locator('#news-owner')).toBeHidden();
 await expect(page.locator('#news-owner-signin')).toBeVisible();
});
test('News desk loads a review and requires source confirmation to publish',async({page})=>{
 const at=new Date().toISOString(),record={id:'b'.repeat(24),revision:0,headline:'Verified source candidate for review',summary:'A concise supported summary with sufficient detail for the member briefing.',category:'security',classification:'update',status:'review',sourceName:'Microsoft Security',sourceUrl:'https://www.microsoft.com/en-us/security/blog/',sourcePublishedAt:at,sourceText:'Original source evidence.',evidence:{verified:true},reasons:['Importance needs review']};
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/admin*',r=>{const action=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:action==='news-list'?{items:[record],next:null}:action==='news-record'?{record,audit:[]}:action==='news-status'?{enabled:true,status:'ok',paused:false,lastCheckedAt:at,report:{sources:[]}}:{csrf:'fixture-only'}});});
 await page.goto('http://127.0.0.1:4321/admin/news');
 await expect(page.locator('#news-owner')).toBeVisible();
 await expect(page.locator('#news-owner-filter')).toHaveValue('published');
 await expect(page.locator('.news-owner-summary')).toHaveText(record.summary);
 await expect(page.getByRole('link',{name:'Read original article',exact:true})).toHaveAttribute('href',record.sourceUrl);
 await page.getByRole('button',{name:'Review story',exact:true}).click();
 await expect(page.locator('#news-review-dialog')).toBeVisible();
 await page.locator('#news-review-state').selectOption('published');
 await expect(page.locator('#news-review-confirm')).toHaveAttribute('required','');
 await expect(page.locator('#news-review-source-time')).not.toHaveValue('');
 expect(errors).toEqual([]);
});

test('Markets labels issuer announcements and explicit tickers without exposing member summaries',async({page})=>{
 const at=new Date().toISOString();
 const item={id:'c'.repeat(24),headline:'Example reports quarterly financial results',summary:'',locked:true,category:'markets',sourceType:'issuer-release',tickers:[{exchange:'NASDAQ',symbol:'SMALL'}],classification:'update',sourceName:'GlobeNewswire',sourceUrl:'https://www.globenewswire.com/news-release/example.html',sourcePublishedAt:at,publishedAt:at};
 await page.route('**/api/news*',r=>r.fulfill({json:{items:[item],featured:null,next:null,member:false,markets:{items:[]},pipeline:{status:'ok'}}}));
 await page.goto('http://127.0.0.1:4321/news?category=markets');
 await expect(page.locator('.news-story')).toContainText('Company announcement');
 await expect(page.locator('.news-story')).toContainText('NASDAQ: SMALL');
 await expect(page.locator('.news-story')).toContainText('Full briefing for Digivated members');
});
