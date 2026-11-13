import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFreeLaunch, badgeSnippet, verifyProjectBadge, publishQueued, makeLaunchQueueHandler } from '../server/launch-queue.mjs';
import { publicIPv4, readProjectSite, siteDetails, hasProjectBadge } from '../server/project-site.mjs';
import { validateEdit } from '../server/admin-store.mjs';
const record={id:'fixture-project',accountId:'owner',email:'owner@example.com',name:'Fixture',creator:'Builder',description:'A useful independent project.',category:'Other',url:'https://example.com',image:'data:image/png;base64,fixture',consent:true,status:'pending',date:'2026-11-13T00:00:00Z',launch:{kind:'free',scheduledAt:'2026-11-23T00:00:00Z',scheduledTimestamp:Date.parse('2026-11-23')}};
test('free dates are Mondays 7–14 days away including year rollover',()=>{
 assert.equal(nextFreeLaunch(Date.parse('2026-11-13T12:00:00Z')),'2026-11-23T00:00:00.000Z');
 assert.equal(nextFreeLaunch(Date.parse('2026-12-28T12:00:00Z')),'2027-01-11T00:00:00.000Z');
});
test('metadata import decodes text and caps form field lengths',()=>{
 assert.deepEqual(siteDetails('<title>A &amp; B</title><meta name="description" content="Useful &quot;tools&quot;">'),{name:'A & B',description:'Useful "tools"'});
 assert.equal(siteDetails('<meta property="og:site_name" content="'+ 'x'.repeat(200)+'">').name.length,120);
});
test('badge must reference the correct project in a real anchor',()=>{
 const badge=badgeSnippet(record.id);assert.equal(hasProjectBadge(badge,record.id),true);
 for(const html of ['<!--'+badge+'-->','<script>'+badge+'</script>','<textarea>'+badge+'</textarea>',badgeSnippet('other')])assert.equal(hasProjectBadge(html,record.id),false);
});
test('remote reads refuse private addresses, credentials, ports and redirects before request',async()=>{
 for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','172.16.0.1','192.168.0.1','100.64.1.1','::1'])assert.equal(publicIPv4(address),false);
 assert.equal(publicIPv4('93.184.216.34'),true);
 let called=false;
 for(const url of ['http://example.com','https://127.0.0.1','https://user:pass@example.com','https://example.com:8080'])await assert.rejects(readProjectSite(url,{resolve:async()=>{called=true;return [];}}));
 assert.equal(called,false);
 await assert.rejects(readProjectSite('https://example.com',{resolve:async()=>[{address:'127.0.0.1'}],transport:()=>{throw Error('transport should not run');}}),/cannot be checked/);
});
test('verification isolates accounts, rejects missing badges and detects revision conflicts',async()=>{
 const redis=async command=>command[0]==='GET'?JSON.stringify(record):0;
 await assert.rejects(verifyProjectBadge(redis,{id:'other'},record.id,async()=>{throw Error('must not fetch');}),/not awaiting/);
 await assert.rejects(verifyProjectBadge(redis,{id:'owner'},record.id,async()=>({html:''})),/Badge not found/);
 await assert.rejects(verifyProjectBadge(redis,{id:'owner'},record.id,async()=>({html:badgeSnippet(record.id)})),/changed/);
});
test('only verified, due, pending free projects publish; legacy and paid remain untouched',async()=>{
 let calls=0;const redis=async()=>{calls++;return 1;};
 for(const candidate of [record,{...record,launch:undefined},{...record,status:'archived',launch:{...record.launch,badgeVerifiedAt:'2026-11-13'}},{...record,launch:{...record.launch,kind:'instant',badgeVerifiedAt:'2026-11-13'}}])assert.equal(await publishQueued(redis,candidate,Date.parse('2026-11-24')),null);
 assert.equal(await publishQueued(redis,{...record,launch:{...record.launch,badgeVerifiedAt:'2026-11-13'}},Date.parse('2026-11-22')),null);assert.equal(calls,0);
 let saved;const projection=await publishQueued(async c=>{if(c[0]==='EVAL')saved=JSON.parse(c[8]);return 1;},{...record,launch:{...record.launch,badgeVerifiedAt:'2026-11-13'}},Date.parse('2026-11-24'));
 assert.equal(projection.publishedAt,'2026-11-24T00:00:00.000Z');assert.equal(projection.pageUrl,'/projects/listing/fixture-project');assert.equal(saved.status,'approved');
});
test('cron rejects missing or wrong credentials without database access',async()=>{
 const handler=makeLaunchQueueHandler({env:{CRON_SECRET:'test-secret'},redis:()=>{throw Error('must not access');}});
 for(const headers of [{},{authorization:'Bearer wrong'}]){const res={setHeader(){},end(){}};await handler({method:'GET',headers},res);assert.equal(res.statusCode,401);}
});
test('admin instant purchase moderation fails clearly when unpaid and allows verified purchases',()=>{
 const unpaid={...record,promotion:{requested:true,included:'instant-launch',verified:false}};
 assert.throws(()=>validateEdit('submission',{...unpaid,status:'approved',revision:0},unpaid),/verify their instant launch payment/);
 const paid={...unpaid,promotion:{...unpaid.promotion,verified:true}};
 assert.equal(validateEdit('submission',{...paid,image:undefined,status:'approved',revision:0},paid).status,'approved');
 assert.equal(validateEdit('submission',{...unpaid,image:undefined,status:'pending',revision:0},unpaid).status,'pending');
});

test('a damaged queue entry does not block other due launches', async () => {
 const due = {...record,launch:{...record.launch,scheduledAt:'2020-01-01T00:00:00Z',badgeVerifiedAt:'2020-01-01'}};
 const redis = async ([command,key]) => {
  if (command === 'ZRANGEBYSCORE') return ['damaged',record.id];
  if (command === 'GET') return key.endsWith('damaged') ? '{' : JSON.stringify(due);
  if (command === 'EVAL') return 1;
  assert.fail('Unexpected command: '+command);
 };
 const handler = makeLaunchQueueHandler({env:{CRON_SECRET:'test-secret'},redis});
 const res = {setHeader(){},end(body){this.body=JSON.parse(body);}};
 await handler({method:'GET',headers:{authorization:'Bearer test-secret'}},res);
 assert.equal(res.statusCode,503);
 assert.deepEqual(res.body,{checked:2,published:1,failed:1});
});
