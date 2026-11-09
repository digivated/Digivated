import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
const fixtures=()=>Array.from({length:35},(_,i)=>({id:'rank-'+i,name:i===0?'A project with a particularly long name for the leaderboard':'Project '+i,description:'An independent project with practical tools for creative people and small teams.',creator:'Builder '+i,category:i%2?'AI':'Apps',image:'/digivated-new-mark.svg',url:'https://example.com/project-'+i,pageUrl:'/discover#project-rank-'+i,date:'2026-11-01',votes:{daily:35-i,weekly:i*2,monthly:i,all:i*3}}));
for(const width of [320,390,768,1440])test(`ranking presentation and filtering at ${width}px`,async({page})=>{
 const items=fixtures();await page.setViewportSize({width,height:1000});
 await page.addInitScript(()=>sessionStorage.setItem('digivated-announcement-seen-v2','1'));
 await page.route('**/api/**',r=>r.fulfill({json:{items,next:null,ready:false}}));
 await page.goto(base+'/rankings');
 await expect(page.locator('.launch-row')).toHaveCount(30);
 await expect(page.locator('.ranking-front-runner')).toHaveCount(3);
 await expect(page.locator('[data-launch-total]')).toHaveText('35 projects');
 await expect(page.locator('[data-ranking-votes]')).toHaveText('630 upvotes');
 await expect(page.locator('.launch-row').first()).toHaveAttribute('data-project-id','rank-0');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const controls=await page.locator('.launch-periods button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
 for(let i=0;i<controls.length;i++){expect(controls[i].height).toBeGreaterThanOrEqual(44);if(i)expect(controls[i].left).toBeGreaterThanOrEqual(controls[i-1].right);}
 await page.screenshot({path:test.info().outputPath(`rankings-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'Show more',exact:true}).click();await expect(page.locator('.launch-row')).toHaveCount(35);
 await page.getByRole('button',{name:'This week',exact:true}).click();
 await expect(page.locator('[data-ranking-title]')).toHaveText("This week's rankings");
 await expect(page.locator('.launch-row').first()).toHaveAttribute('data-project-id','rank-34');
 await expect(page.locator('[data-ranking-votes]')).toHaveText('1,190 upvotes');
 await page.getByRole('button',{name:'AI',exact:true}).click();await expect(page.locator('.launch-row')).toHaveCount(17);
 await page.getByRole('searchbox',{name:'Search projects',exact:true}).fill('Builder 33');
 await expect(page.locator('.launch-row')).toHaveCount(1);await expect(page.locator('.launch-row')).toHaveAttribute('data-project-id','rank-33');
 await expect(page.locator('[data-ranking-votes]')).toHaveText('66 upvotes');
 await page.getByRole('searchbox',{name:'Search projects',exact:true}).fill('no such project');
 await expect(page.locator('.launch-row')).toHaveCount(0);await expect(page.locator('[data-launch-status]')).toContainText('No projects match');
 await expect(page.locator('[data-ranking-votes]')).toHaveText('0 upvotes');
 await page.getByText('How rankings work',{exact:true}).click();await expect(page.locator('.rankings-context details')).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('votes reload authoritative totals, can be removed, and report failures',async({page})=>{
 const items=fixtures().slice(0,4);let liked=false,fail=false;const actions:string[]=[];
 await page.route('**/api/**',async r=>{
  if(r.request().url().includes('/card-interactions')){
   actions.push(r.request().postDataJSON().action);
   if(fail)return r.fulfill({status:503,json:{error:'Voting is temporarily unavailable.'}});
   liked=!liked;items[1].votes.daily=liked?40:34;return r.fulfill({json:{liked}});
  }
  return r.fulfill({json:{items,next:null,ready:false}});
 });
 await page.goto(base+'/rankings');await expect(page.locator('.launch-row')).toHaveCount(4);
 await page.getByRole('button',{name:'Upvote Project 1',exact:true}).click();
 await expect(page.locator('.launch-row').first()).toHaveAttribute('data-project-id','rank-1');
 await expect(page.getByRole('button',{name:'Upvote Project 1',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-ranking-votes]')).toHaveText('140 upvotes');
 await page.getByRole('button',{name:'Upvote Project 1',exact:true}).click();
 await expect(page.locator('.launch-row').first()).toHaveAttribute('data-project-id','rank-0');
 await expect(page.locator('[data-ranking-votes]')).toHaveText('134 upvotes');
 fail=true;await page.getByRole('button',{name:'Upvote Project 1',exact:true}).click();
 await expect(page.locator('[data-launch-status]')).toHaveText('Voting is temporarily unavailable.');
 await expect(page.getByRole('button',{name:'Upvote Project 1',exact:true})).toBeEnabled();
 expect(actions).toEqual(['upvote','remove-upvote','upvote']);
});
test('unavailable projects show an error and no invented rankings',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Unavailable'}}));await page.goto(base+'/rankings');
 await expect(page.locator('[data-launch-status]')).toContainText('Projects are temporarily unavailable');await expect(page.locator('.launch-row')).toHaveCount(0);
});
