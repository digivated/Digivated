import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {primaryLinks,footerGroups} from '../src/data/site-navigation.mjs';
test('shared public destinations use canonical current routes without repeated footer links',async()=>{
 const header=primaryLinks;
 const footer=footerGroups.flatMap(group=>group.links);
 assert.equal(new Set(header.map(([href])=>href)).size,header.length);
 assert.deepEqual(primaryLinks.map(([href])=>href),['/','/categories','/dashboard','/shop','/news','/threads','/tools']);
 assert.equal(new Set(footer.map(([href])=>href)).size,footer.length);
 for(const [link] of [...header,...footer]){
  if(!link.startsWith('/'))continue;
  const href=link.split('?')[0];
  assert.ok(!['/membership','/products','/promote','/founding-members','/community'].includes(href));
  const base=href==='/'?'/index':href;
  await readFile(new URL('../src/pages'+base+'.astro',import.meta.url)).catch(()=>readFile(new URL('../src/pages'+base+'/index.astro',import.meta.url)));
 }
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.redirects.find(r=>r.source==='/shop'),undefined,'/shop is the shop page');
 for(const [source,destination] of [['/winners','/#last-week'],['/points','/discover?sort=needs']]){
  assert.ok(![...header,...footer].some(([href])=>href===source));
  assert.deepEqual(config.redirects.find(r=>r.source===source),{source,destination,permanent:true});
 }
 for(const source of ['/products','/promote','/founding-members']){
  assert.deepEqual(config.redirects.find(r=>r.source===source),{source,destination:'/membership',permanent:true});
 }
});
