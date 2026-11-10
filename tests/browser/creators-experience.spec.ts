import {test,expect} from '@playwright/test';

const base='http://127.0.0.1:4321';
const people=[{id:'11111111-1111-4111-8111-111111111111',name:'Ada Maker',bio:'Building helpful software',logoUrl:''},{id:'22222222-2222-4222-8222-222222222222',name:'Noah Builder',bio:'Designing useful tools',logoUrl:''}];

for(const width of [375,1440])test(`Creators feed starts cleanly and stays usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/creator-profile*',route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('action')==='discover')return route.fulfill({json:{creators:people}});
  if(url.searchParams.get('action')==='posts')return route.fulfill({json:{posts:[],next:null}});
  return route.fulfill({status:401,json:{error:'Sign in required'}});
 });
 await page.route('**/api/projects*',route=>route.fulfill({json:{items:[],next:null}}));
 await page.goto(base+'/creators');
 await expect(page.locator('#creator-people-strip')).toBeVisible();
 await expect(page.getByRole('link',{name:/Ada Maker/}).first()).toBeVisible();
 if(width>1000){
  await expect(page.locator('.creator-hub-rail')).toBeVisible();
  await expect(page.locator('#creator-suggestions')).toContainText('Noah Builder');
  await page.locator('#creator-see-people').click();
  await expect(page.locator('#creators-grid')).toContainText('Ada Maker');
 }
 await expect(page.locator('#creators-status')).not.toContainText('Loading');
 await page.getByRole('button',{name:'People',exact:true}).click();
 await expect(page.locator('#creators-grid')).toContainText('Ada Maker');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});

test('a shared creator post remains visible after the latest feed loads',async({page})=>{
 const id='33333333-3333-4333-8333-333333333333';
 await page.route('**/api/creator-profile*',route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('action')==='discover')return route.fulfill({json:{creators:people}});
  if(url.searchParams.get('action')==='posts')return route.fulfill({json:{posts:url.searchParams.has('post')?[{id,body:'A new project is on the way',createdAt:'2026-11-10T12:00:00.000Z',author:people[0],likes:0,replies:0}]:[],next:null}});
  return route.fulfill({status:401,json:{error:'Sign in required'}});
 });
 await page.route('**/api/projects*',route=>route.fulfill({json:{items:[],next:null}}));
 await page.goto(base+'/creators?post='+id);
 await expect(page.locator('.creator-post')).toContainText('A new project is on the way');
 await expect(page.locator('.creator-post-permalink')).toHaveAttribute('href','/creators?post='+id);
 await expect(page.locator('#creators-status')).toContainText('Shared conversation');
});
test('switching to People does not let an older feed request replace the directory',async({page})=>{
 let delayPosts=false;
 await page.route('**/api/creator-profile*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  if(action==='discover')return route.fulfill({json:{creators:people}});
  if(action==='posts'){
   if(delayPosts)await new Promise(resolve=>setTimeout(resolve,150));
   return route.fulfill({json:{posts:[],next:null}});
  }
  return route.fulfill({status:401,json:{error:'Sign in required'}});
 });
 await page.route('**/api/projects*',route=>route.fulfill({json:{items:[],next:null}}));
 await page.goto(base+'/creators');
 await expect(page.locator('#creators-status')).not.toContainText('Loading');
 delayPosts=true;
 await page.getByRole('button',{name:'Latest',exact:true}).click();
 await page.getByRole('button',{name:'People',exact:true}).click();
 await expect(page.locator('#creators-grid')).toContainText('Ada Maker');
 await page.waitForTimeout(200);
 await expect(page.locator('#creators-status')).toContainText('2 creators');
 await expect(page.locator('#creators-feed')).toBeHidden();
});
test('older creator posts load as the reader reaches the end of the feed',async({page})=>{
 const first='44444444-4444-4444-8444-444444444444',older='55555555-5555-4555-8555-555555555555';
 await page.setViewportSize({width:390,height:700});
 await page.route('**/api/creator-profile*',route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('action')==='discover')return route.fulfill({json:{creators:people}});
  if(url.searchParams.get('action')==='posts'){
   const later=url.searchParams.get('offset')==='50';
   return route.fulfill({json:{posts:[{id:later?older:first,body:later?'An earlier update':'The latest update',createdAt:'2026-11-10T12:00:00.000Z',author:people[0],likes:0,replies:0}],next:later?null:50}});
  }
  return route.fulfill({status:401,json:{error:'Sign in required'}});
 });
 await page.route('**/api/projects*',route=>route.fulfill({json:{items:[],next:null}}));
 await page.goto(base+'/creators');
 await expect(page.locator('.creator-post')).toHaveCount(1);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await expect(page.locator('.creator-post')).toHaveCount(2);
 await expect(page.locator('#creators-more')).toBeHidden();
});

test('the inbox handles unavailable sign-in without trapping visitors',async({page})=>{
 await page.goto(base+'/inbox');
 await expect(page.locator('#inbox-list-status')).not.toContainText('Loading');
 await expect(page.getByRole('link',{name:/Creators/}).last()).toHaveAttribute('href','/creators');
});

test('a public creator profile keeps post actions and projects in one place',async({page})=>{
 const person=people[0],postId='33333333-3333-4333-8333-333333333333';
 await page.route('**/api/creator-profile*',route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('action')==='posts')return route.fulfill({json:{posts:[{id:postId,body:'Testing a new launch',createdAt:'2026-11-10T12:00:00.000Z',likes:2,replies:1,author:person}],next:null}});
  return route.fulfill({json:{profile:{name:person.name,bio:person.bio,website:'',social:'',logoUrl:''},projects:[],followers:3,following:false,ownProfile:false}});
 });
 await page.goto(base+'/creator?id='+person.id);
 await expect(page.getByRole('heading',{name:person.name})).toBeVisible();
 await expect(page.locator('#creator-posts')).toContainText('Testing a new launch');
 await expect(page.locator('#creator-posts').getByRole('link',{name:/Reply/})).toHaveAttribute('href',/\/creators\?post=/);
 await expect(page.locator('#creator-posts').getByRole('button',{name:/Like/})).toBeVisible();
 await expect(page.locator('#creator-posts').getByRole('button',{name:'Save'})).toBeVisible();
});

test('creator profile and inbox fit a narrow phone viewport',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const person=people[0];
 await page.route('**/api/creator-profile*',route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('action')==='posts')return route.fulfill({json:{posts:[],next:null}});
  return route.fulfill({json:{profile:{name:person.name,bio:person.bio,website:'',social:'',logoUrl:''},projects:[],followers:0,following:false,ownProfile:false}});
 });
 for(const path of ['/creator?id='+person.id,'/inbox']){
  await page.goto(base+path);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
 }
});
