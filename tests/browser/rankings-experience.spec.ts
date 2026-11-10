import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const items=Array.from({length:4},(_,i)=>({id:'pick-'+i,name:'Project '+i,description:'A useful independent project.',creator:'Builder '+i,category:'Apps',image:'/digivated-new-mark.svg',url:'https://example.com/'+i,pageUrl:'/discover#project-pick-'+i,date:'2026-11-10',votes:{daily:4-i,weekly:8-i,monthly:9-i,all:10-i}}));

for(const width of [375,1440])test(`rankings shows personal picks without disturbing the board at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>localStorage.setItem('digivated:liked:project:pick-1','1'));
 await page.route('**/api/projects*',route=>route.fulfill({json:{items,next:null}}));
 let voted=false;
 await page.route('**/api/card-interactions',route=>{voted=!voted;return route.fulfill({json:{liked:voted}});});
 await page.goto(base+'/rankings');
 await expect(page.locator('.launch-row')).toHaveCount(4);
 await expect(page.locator('[data-ranking-picks-count]')).toHaveText('1');
 await expect(page.locator('[data-ranking-picks] a')).toHaveText('Project 1');
 await expect(page.locator('[data-ranking-picks] a')).toHaveAttribute('href',/\/discover#project-pick-1$/);
 await expect(page.getByRole('button',{name:/Share rankings/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Upvote Project 0'}).click();
 await expect(page.locator('[data-ranking-picks-count]')).toHaveText('2');
 await page.getByRole('button',{name:'This week'}).click();
 await expect(page.locator('[data-ranking-picks] a')).toHaveCount(2);
});

test('rankings respects reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/projects*',route=>route.fulfill({json:{items,next:null}}));
 await page.goto(base+'/rankings');
 await expect(page.locator('.ranking-front-runner')).toHaveCount(3);
 await expect(page.locator('.ranking-front-runner').first()).toHaveCSS('animation-name','none');
});
