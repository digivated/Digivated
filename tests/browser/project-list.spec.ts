import {test,expect} from '@playwright/test';

const projects=[
 {id:'featured-1',name:'A very useful independent project with a long name',creator:'Maker',description:'A concise description of the project and why people might use it.',category:'Apps',status:'featured',image:'/digivated-mark.svg',views:27,url:'https://example.com'},
 {id:'featured-2',name:'Second project',creator:'Builder',description:'A helpful tool for builders.',category:'Design',status:'featured',image:'/digivated-mark.svg',views:14,url:'https://example.com'},
 {id:'featured-3',name:'Third project',creator:'Creator',description:'A simple creative tool.',category:'Apps',status:'featured',image:'/digivated-mark.svg',views:5,url:'https://example.com'},
 {id:'regular-1',name:'Regular project',creator:'Builder',description:'A project in the directory.',category:'Apps',status:'approved',image:'/digivated-mark.svg',views:2,url:'https://example.com'},
];

test.beforeEach(async({page})=>{
 await page.route('**/api/projects?*',route=>route.fulfill({json:{items:projects,next:null}}));
});

for(const width of [390,1440]) test(`project list stays compact and usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 await page.goto('http://127.0.0.1:4321/discover');
 const rows=page.locator('.wall-dom-grid .wall-tile');
 await expect(rows).toHaveCount(4);
 await expect(rows.first().locator('.wall-list-summary')).toContainText('concise description');
 const geometry=await rows.first().evaluate(element=>({height:element.getBoundingClientRect().height,width:element.getBoundingClientRect().width,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
 expect(geometry.height).toBeLessThan(180);
 expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport+1);
 await rows.first().getByRole('button',{name:/Open A very useful/}).click();
 await expect(page.locator('#wall-focus-title')).toContainText('A very useful');
 await page.locator('.wall-focus-close').click();
 await expect(page.locator('.wall-focus')).toHaveCount(0);
});

test('featured rows retain view ranking and animated label',async({page})=>{
 await page.goto('http://127.0.0.1:4321/');
 const cards=page.locator('.home-featured-card');
 await expect(cards).toHaveCount(3);
 await expect(cards.first()).toHaveAttribute('data-featured-rank','gold');
 await expect(cards.first().locator('.home-featured-ribbon')).toHaveAttribute('aria-label','Featured project');
 await expect(cards.first().locator('.home-featured-summary')).toContainText('concise description');
 await expect(cards.first().locator('.home-featured-views')).toContainText('27');
 expect(await cards.first().locator('.home-featured-ribbon-track').evaluate(element=>getComputedStyle(element).animationName)).toBe('featured-ribbon-scroll');
});
