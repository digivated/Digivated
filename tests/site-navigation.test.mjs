import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {primaryLinks,menuLinks,footerGroups} from '../src/data/site-navigation.mjs';
test('shared public destinations use canonical current routes without repeated footer links',async()=>{
 const footer=footerGroups.flatMap(group=>group.links);
 assert.equal(new Set(footer.map(([href])=>href)).size,footer.length);
 for(const [href] of [...primaryLinks,...menuLinks,...footer]){
  if(!href.startsWith('/'))continue;
  assert.ok(!['/shop','/products','/promote','/founding-members','/community'].includes(href));
  await readFile(new URL('../src/pages'+href+(href==='/resources'?'/index':'')+'.astro',import.meta.url));
 }
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 for(const source of ['/shop','/products','/promote','/founding-members']){
  assert.deepEqual(config.redirects.find(r=>r.source===source),{source,destination:'/membership',permanent:true});
 }
});
