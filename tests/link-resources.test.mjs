import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceGroups,resourceLinkCount} from '../src/data/link-resources.mjs';

test('the resource directory keeps a unique, safe outbound URL for every submitted link',()=>{
 const links=resourceGroups.flatMap(group=>group.links);
 assert.equal(resourceGroups.length,29);
 assert.equal(resourceLinkCount,1259);
 assert.equal(new Set(links.map(link=>link.href)).size,links.length);
 for(const link of links){const url=new URL(link.href);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');assert.ok(link.label);}
 for(const href of ['https://60fps.design','https://ui.shadcn.com','https://openai.com','https://supabase.com','https://zenbusiness.com','https://zoom.us'])assert.ok(links.some(link=>link.href===href),href);
});
