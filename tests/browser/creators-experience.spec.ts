import {test,expect} from '@playwright/test';

const base='http://127.0.0.1:4321';
const people=[{id:'11111111-1111-4111-8111-111111111111',name:'Ada Maker',bio:'Building helpful software',logoUrl:''},{id:'22222222-2222-4222-8222-222222222222',name:'Noah Builder',bio:'Designing useful tools',logoUrl:''}];

test('retired creator pages forward bookmarks without exposing the old pages', async ({page}) => {
 for (const [source, destination, heading] of [
  ['/creators?post=old-post', '/threads', /Threads/],
  ['/inbox?id=old-contact', '/dashboard', 'Maker dashboard'],
 ] as const) {
  await page.goto(base + source);
  await expect(page).toHaveURL(base + destination);
  await expect(page.getByRole('heading', {level:1, name:heading})).toBeVisible();
  await expect(page.locator('a[href^="/creators"], a[href^="/inbox"]')).toHaveCount(0);
 }
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
 await expect(page.locator('#post-'+postId)).toContainText('Testing a new launch');
 await expect(page.locator('a[href^="/creators"], a[href^="/inbox"]')).toHaveCount(0);
 await expect(page.locator('#creator-posts').getByRole('button',{name:/Like/})).toBeVisible();
 await expect(page.locator('#creator-posts').getByRole('button',{name:'Save'})).toBeVisible();
});

for (const width of [1100, 390]) {
 test(`creator profile header is ordered and nothing overlaps at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const person=people[0];
  await page.route('**/api/creator-profile*',route=>{
   const url=new URL(route.request().url());
   if(url.searchParams.get('action')==='posts')return route.fulfill({json:{posts:[],next:null}});
   return route.fulfill({json:{profile:{name:person.name,bio:person.bio,website:'',social:'',logoUrl:''},projects:[],followers:0,following:false,ownProfile:false}});
  });
  await page.goto(base+'/creator?id='+person.id);
  await expect(page.getByRole('heading',{name:person.name})).toBeVisible();
  await expect(page.locator('#creator-public-status')).toBeVisible();
  // Sample the layout in one frame so entrance motion cannot skew comparisons.
  await page.evaluate(()=>document.fonts.ready);
  const [avatar, title, tabs, status, intro] = await page.evaluate(() =>
   ['#creator-avatar', '#creator-title', '.creator-public > .creator-tabs', '#creator-public-status', '.creator-public-intro'].map(selector =>
    document.querySelector(selector)!.getBoundingClientRect().toJSON()));
  expect(avatar.top).toBeGreaterThanOrEqual(intro.top);
  expect(avatar.right).toBeLessThanOrEqual(title.left);
  expect((await page.locator('.creator-cover').count())).toBe(0);
  expect(status.top,'status text sits under the tabs').toBeGreaterThanOrEqual(tabs.bottom-1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('creator profile fits a narrow phone viewport',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const person=people[0];
 await page.route('**/api/creator-profile*',route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('action')==='posts')return route.fulfill({json:{posts:[],next:null}});
  return route.fulfill({json:{profile:{name:person.name,bio:person.bio,website:'',social:'',logoUrl:''},projects:[],followers:0,following:false,ownProfile:false}});
 });
 await page.goto(base+'/creator?id='+person.id);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [320, 768, 1440])for(const ownProfile of [false,true])test(`all profile variants preserve visibility and tabs at ${width}px (own=${ownProfile})`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const person=people[ownProfile?1:0];
 const name=ownProfile?'Builder'+ 'WithALongName'.repeat(8):person.name;
 await page.route('**/api/creator-profile*',route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('action')==='posts')return route.fulfill({json:{posts:[],next:null}});
  return route.fulfill({json:{profile:{name,bio:'Building '+ 'software'.repeat(60),website:'',social:'',logoUrl:ownProfile?'/digivated-ascii-icon-transparent.png':''},projects:[{id:'example',name:'A published project',description:'Useful software',url:'https://example.com'}],followers:1,ownProfile}});
 });
 await page.goto(base+'/creator?id='+person.id);
 await expect(page.locator('#creator-title')).toHaveText(name);
 await expect(page.locator('#creator-public-status')).toHaveText('No posts yet.');
 for(const selector of ['#creator-website','#creator-social','#creator-projects','#creator-projects-title'])await expect(page.locator(selector)).toBeHidden();
 if(ownProfile)await expect(page.locator('#creator-follow')).toBeHidden();
 else await expect(page.locator('#creator-follow')).toBeVisible();
 await expect(page.locator('#creator-message')).toHaveCount(0);
 await page.getByRole('button',{name:'Projects',exact:true}).click();
 await expect(page.locator('#creator-projects')).toBeVisible();
 await expect(page.locator('#creator-projects')).toContainText('A published project');
 await expect(page.locator('#creator-posts')).toBeHidden();
 await page.getByRole('button',{name:'Posts',exact:true}).click();
 await expect(page.locator('#creator-projects')).toBeHidden();
 await expect(page.locator('#creator-posts')).not.toHaveAttribute('hidden');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Projects works while the creator’s posts are still loading', async ({ page }) => {
 const person = people[0];
 let releasePosts!: () => void;
 const postsReady = new Promise<void>(resolve => { releasePosts = resolve; });
 await page.route('**/api/creator-profile*', async route => {
  if (new URL(route.request().url()).searchParams.get('action') === 'posts') {
   await postsReady;
   return route.fulfill({ json: { posts: [], next: null } });
  }
  return route.fulfill({
   json: { profile: { name: person.name, bio: person.bio }, projects: [], followers: 0, ownProfile: false },
  });
 });
 await page.goto(base + '/creator?id=' + person.id);
 try {
  await expect(page.locator('#creator-public-status')).toHaveText('Loading posts…');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('#creator-public-status')).toHaveText('No published projects yet.');
 } finally {
  releasePosts();
 }
 await page.getByRole('button', { name: 'Posts', exact: true }).click();
 await expect(page.locator('#creator-public-status')).toHaveText('No posts yet.');
});
