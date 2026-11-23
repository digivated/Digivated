import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const project={id:'mobile-card',name:'Mobile Card',description:'A useful project',creator:'Builder',category:'Business',url:'https://example.com',image:'',status:'approved',pick:true,views:5};

for(const width of [320,375,390])test(`mobile controls and project card stay at a stable viewport at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:812});
 await page.route('**/api/projects*',route=>route.fulfill({json:{items:[project],next:null}}));
 await page.goto(base+'/discover');
 await expect(page.getByRole('button',{name:'Open Mobile Card'})).toBeVisible();
 const search=page.getByRole('searchbox',{name:'Search products or makers'});
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
 await page.goto(base+'/tools');
 for(const locator of [page.locator('[data-link-search]'),page.locator('[data-link-select]')]){
  await expect(locator).toBeVisible();
  expect(await locator.evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
 }
});

test('homepage stats fit at narrow sizes and between the desktop sidebars', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', route => route.fulfill({ json: { items: [], next: null } }));
  await page.goto(base + '/');
  await page.evaluate(() => document.fonts.ready);
  const stats = page.locator('.dg-hero-stats');
  await expect(stats.locator('time')).toHaveText(/\d+d \d+h \d+m/);

  for (const width of [320, 390, 681, 1200, 1366, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const counts of [['72', '2', '8,701'], ['12,345', '987', '1,234,567']]) {
      const layout = await stats.evaluate((grid, values) => {
        const selectors = ['[data-stat-products]', '[data-site-online]', '[data-site-visits]'];
        const counters = selectors.map(selector => grid.querySelector(selector)!);
        counters.forEach((counter, i) => { counter.textContent = values[i]; });
        const bounds = grid.getBoundingClientRect();
        return counters.map(counter => {
          const stat = counter.closest('.dg-hero-stat')!;
          const cell = stat.getBoundingClientRect();
          const text = [stat.querySelector('dt')!, counter].flatMap(element => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return [...range.getClientRects()];
          });
          const meter = stat.querySelector('.dg-activity-mark');
          if (meter) {
            const mark = meter.getBoundingClientRect();
            text.push(mark);
            if (counter.getBoundingClientRect().right > mark.left + 1) return { aligned: false, fits: false, row: 0, valueTop: 0 };
          }
          return {
            aligned: cell.left >= bounds.left - 1 && cell.right <= bounds.right + 1,
            fits: text.every(rect => rect.left >= cell.left - 1 && rect.right <= cell.right + 1),
            row: text[0].top,
            valueTop: counter.getBoundingClientRect().top,
          };
        });
      }, counts);
      for (const stat of layout) {
        expect(stat.aligned && stat.fits, `stats fit at ${width}px with ${counts.join(' / ')}`).toBe(true);
      }
      if (layout[0].row === layout[2].row) {
        expect(Math.abs(layout[0].valueTop - layout[2].valueTop)).toBeLessThan(4);
      }
    }
  }
});

for(const width of [320,375])test(`primary mobile routes never force sideways scrolling at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:812});
 for(const path of ['/','/discover','/news','/tools','/membership','/dashboard','/login','/new-launch']){
  await page.goto(base+path);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
 }
});


test('touch devices keep static navigation and skip pointer effects', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const effects: string[] = [];
    page.on('request', request => {
      if (/\/DigivatedSurfaces[.\w-]*\.js$/.test(new URL(request.url()).pathname)) effects.push(request.url());
    });
    await page.goto('http://127.0.0.1:4321/');
    await expect(page.getByRole('navigation', { name: 'Browse launches' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'This week’s launches' })).toBeVisible();
    await page.goto('http://127.0.0.1:4321/saved');
    await expect(page.getByRole('heading', { name: 'Saved items', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Saved items (0)' })).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('button', { name: 'New collection' })).toHaveCSS('color', 'rgb(11, 11, 12)');
    await expect(page.getByRole('heading', { name: 'Nothing saved yet.' })).toBeVisible();
    await expect(page.getByLabel('Search saved items')).toBeHidden();
    await page.getByRole('button', { name: 'New collection' }).click();
    const collection = page.getByRole('dialog', { name: 'New collection' });
    await collection.getByRole('textbox', { name: 'Name', exact: true }).fill('Weekend tools');
    await collection.getByRole('button', { name: 'Save collection' }).click();
    await expect(page.getByRole('heading', { name: 'Weekend tools' })).toBeVisible();
    expect(effects).toEqual([]);
  } finally {
    await context.close();
  }
});
