import {test,expect} from '@playwright/test';

const base='http://127.0.0.1:4321';

test('public crawl files list canonical pages and exclude private routes',async({request})=>{
 const robots=await request.get(`${base}/robots.txt`);
 expect(robots.status()).toBe(200);
 expect(await robots.text()).toContain('Sitemap: https://digivated.com/sitemap.xml');
 const sitemap=await request.get(`${base}/sitemap.xml`);
 expect(sitemap.status()).toBe(200);
 const xml=await sitemap.text();
 expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
 expect(xml).toContain('<loc>https://digivated.com/discover</loc>');
 expect(xml).toContain('<loc>https://digivated.com/resources/guides</loc>');
 expect(xml).not.toMatch(/<loc>[^<]*\/(?:admin|account|inbox|login|saved)(?:<|\/)/);
});

for(const width of [390,1366]) test(`home shows launches without the extra panels at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/projects?*',route=>route.fulfill({json:{items:[{id:'audit-fixture',name:'Example project',description:'A useful independent project.',category:'Apps',status:'featured',date:new Date().toISOString(),pageUrl:'/projects/listing/audit-fixture',views:12,image:'/digivated-logo.webp',url:'https://example.com'}],next:null}}));
 const panelRequests: string[] = [];
 page.on('request', request => {
  const { pathname, searchParams } = new URL(request.url());
  if ((pathname === '/api/threads' && searchParams.get('sort') === 'trending') ||
      (pathname === '/api/submissions' && searchParams.get('action') === 'launch-options')) panelRequests.push(request.url());
 });
 await page.goto(base);
 await expect(page.getByRole('heading',{level:1,name:'Discover product launches'})).toBeVisible();
 await expect(page.getByText('See what makers are shipping.', {exact:true})).toBeVisible();
 await expect(page.getByRole('contentinfo').getByRole('link',{name:'About',exact:true})).toHaveAttribute('href','/about');
 await expect(page.locator('[data-launch-id="audit-fixture"]')).toBeVisible();
 await expect(page.locator('.dg-home-extras, [data-spot-grid], main [data-feedback-points]')).toHaveCount(0);
 expect(panelRequests).toEqual([]);
 const graph=await page.locator('script[type="application/ld+json"]').first().textContent();
 const types=JSON.parse(graph||'{}')['@graph'].map((node:{'@type':string})=>node['@type']);
 expect(types).toEqual(['Organization','WebSite','WebPage']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test('account pages declare noindex while public pages remain indexable',async({page})=>{
 await page.goto(`${base}/login`);
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
 await page.goto(`${base}/discover`);
 await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});
