import { makePublicRouter } from '../server/public-router.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCreatorPage, makeCreatorPageHandler } from '../server/creator-page.mjs';
const id='e89d2693-ace8-4e03-a1a5-b853ecade2ba';
const template='<html><head><title>Creator profile · Digivated</title><link rel="canonical" href="https://digivated.com/creator"><meta name="description" content="Generic"><meta property="og:url" content="https://digivated.com/creator"><meta property="og:title" content="Creator"><meta name="twitter:title" content="Creator"><script type="application/ld+json">{"@graph":[{"@type":"WebPage","url":"https://digivated.com/creator"}]}</script></head><body><h1 id="creator-title">Creator profile</h1><p id="creator-bio"></p><button id="creator-follow" hidden>Follow</button></body></html>';
function response(){return {headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};}
test('creator SEO is present without JavaScript and untrusted profile text is escaped',()=>{
 const name='Maker $& </script><script>alert(1)</script>',bio='Build <b>helpful</b> software & tools';
 const html=renderCreatorPage(template,{id,profile:{name,bio}});
 assert.ok(html.includes(`href="https://digivated.com/creator?id=${id}"`));
 assert.ok(html.includes(`property="og:url" content="https://digivated.com/creator?id=${id}"`));
 assert.ok(html.includes('Maker $&amp; &lt;/script&gt;'));
 assert.ok(html.includes('Build &lt;b&gt;helpful&lt;/b&gt; software &amp; tools'));
 assert.ok(html.includes('<button id="creator-follow" hidden>Follow</button>'));
 assert.equal(html.includes('<script>alert(1)</script>'),false);
 const schema=JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/)[1]);
 assert.equal(schema['@graph'][0].url,`https://digivated.com/creator?id=${id}`);
 assert.equal(schema['@graph'][0].name,name);
});
test('creator HTML only exposes public name and bio and ignores auth and unrelated query fields',async()=>{
 const commands=[];const handler=makeCreatorPageHandler({template,redis:async cmd=>{commands.push(cmd);return JSON.stringify({public:true,name:'Maker',bio:'Building tools',email:'private@example.com'});}});
 const res=response();await handler({method:'GET',url:`/api/creator-page?id=${id}&action=feed`,headers:{authorization:'Bearer private'}},res);
 assert.equal(res.statusCode,200);assert.equal(commands.length,1);
 assert.deepEqual(commands[0],['GET',`digivated:creator:profile:${id}`]);
 assert.ok(res.body.includes('<title>Maker · Digivated</title>'));assert.equal(res.body.includes('private@example.com'),false);
 assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('private, missing, and invalid profiles return noindex 404 without exposing records',async()=>{
 for(const record of [null,{public:false,name:'Secret creator'}]){
  const handler=makeCreatorPageHandler({template,redis:async()=>record?JSON.stringify(record):null});
  const res=response();await handler({method:'GET',url:`/creator?id=${id}`},res);
  assert.equal(res.statusCode,404);assert.equal(res.headers['X-Robots-Tag'],'noindex, follow');assert.equal(res.body.includes('Secret creator'),false);
 }
 const res=response();await makeCreatorPageHandler({template,redis:()=>assert.fail('invalid IDs must not query storage')})({method:'GET',url:'/creator?id=bad'},res);assert.equal(res.statusCode,404);
});
test('creator page has safe outage, HEAD, and unsupported method behavior',async()=>{
 const handler=makeCreatorPageHandler({template,redis:async()=>{throw Error('storage unavailable');}});
 let res=response();await handler({method:'GET',url:`/creator?id=${id}`},res);assert.equal(res.statusCode,503);assert.equal(res.headers['Retry-After'],'60');
 res=response();await handler({method:'HEAD',url:`/creator?id=${id}`},res);assert.equal(res.body,'');
 res=response();await handler({method:'POST',url:`/creator?id=${id}`},res);assert.equal(res.statusCode,405);assert.equal(res.headers.Allow,'GET, HEAD');
});

test('preview HTML uses only the published profile API when storage is not configured',async()=>{
 const handler=makeCreatorPageHandler({template,env:{VERCEL_ENV:'preview'},fetcher:async(url,options)=>{
  assert.equal(url,`https://digivated.com/api/creator-profile?id=${id}`);assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>({profile:{id,name:'Published maker',bio:'Public bio',email:'private@example.com'}})};
 }});
 const res=response();await handler({method:'GET',url:`/creator?id=${id}`},res);
 assert.equal(res.statusCode,200);assert.ok(res.body.includes('Published maker'));assert.equal(res.body.includes('private@example.com'),false);
});

test('Vercel creator rewrites dispatch with either the original or destination URL',async()=>{
 const handler=makeCreatorPageHandler({template,redis:async()=>JSON.stringify({public:true,name:'Maker',bio:'Building'})});
 const router=makePublicRouter({'creator-page':handler});
 for(const path of ['/creator','/creator/','/api/creator-page']){
  const res=response();await router({method:'GET',url:`${path}?id=${id}`},res);
  assert.equal(res.statusCode,200,path);assert.ok(res.body.includes('<title>Maker · Digivated</title>'));
 }
});
