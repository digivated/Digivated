import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { renderCreatorPage } from '../../server/creator-page.mjs';
const id='e89d2693-ace8-4e03-a1a5-b853ecade2ba';
const template=readFileSync(new URL('../../server/generated/creator.html',import.meta.url),'utf8');
for(const width of [375,1440])test(`server-rendered creator metadata preserves the profile experience at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const profile={name:'SEO Test Maker',bio:'Building useful software & tools',website:'https://example.com',social:'',logoUrl:''};
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/creator?id=*',route=>route.fulfill({contentType:'text/html',body:renderCreatorPage(template,{id,profile})}));
 await page.route('**/api/creator-profile*',route=>{
  if(new URL(route.request().url()).searchParams.get('action')==='posts')return route.fulfill({json:{posts:[],next:null}});
  return route.fulfill({json:{profile,projects:[],followers:0,following:false,ownProfile:false}});
 });
 const response=await page.goto('http://127.0.0.1:4321/creator?id='+id);
 const source=await response!.text();
 expect(source).toContain('<title>SEO Test Maker · Digivated</title>');
 expect(source).toContain('https://digivated.com/creator?id='+id);
 await expect(page.locator('#creator-title')).toHaveText(profile.name);
 await expect(page.locator('#creator-bio')).toHaveText(profile.bio);
 await expect(page.locator('#creator-public-status')).toHaveText('No posts yet.');
 await expect(page.locator('#creator-follow')).toBeVisible();
 await page.getByRole('button',{name:'Projects',exact:true}).click();
 await expect(page.locator('#creator-public-status')).toHaveText('No published projects yet.');
 await page.getByRole('button',{name:'Posts',exact:true}).click();
 await expect(page.locator('#creator-public-status')).toHaveText('No posts yet.');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
