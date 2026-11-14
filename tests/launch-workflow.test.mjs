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
test('a verified badge saves a queue timestamp and retries preserve verification',async()=>{
 const scheduledAt=nextFreeLaunch();
 let stored={...record,launch:{kind:'free',scheduledAt}};
 const redis=async command=>{
  if(command[0]==='GET')return JSON.stringify(stored);
  assert.equal(command[0],'EVAL');
  stored=JSON.parse(command[8]);
  return 1;
 };
 const owner={id:'owner'};
 assert.deepEqual(await verifyProjectBadge(redis,owner,record.id,async()=>({html:badgeSnippet(record.id)})),{verified:true,scheduledAt});
 assert.equal(stored.launch.scheduledTimestamp,Date.parse(scheduledAt));
 const previous=stored;
 const noFurtherRead=async()=>assert.fail('A verified project should not need another website fetch');
 assert.deepEqual(await verifyProjectBadge(redis,owner,record.id,noFurtherRead),{verified:true,scheduledAt});
 assert.equal(stored,previous);
 stored={...previous,status:'approved'};
 assert.equal((await verifyProjectBadge(redis,owner,record.id,noFurtherRead)).pageUrl,'/projects/listing/fixture-project');
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

test('hidden and inert anchors do not count as a displayed badge',()=>{
 const badge=badgeSnippet(record.id);
 for(const extra of ['hidden','hidden="false"','inert','style="display:none"','style="visibility: hidden !important"']) {
  assert.equal(hasProjectBadge(badge.replace('<a ',`<a ${extra} `),record.id),false,extra);
 }
 assert.equal(hasProjectBadge(badge.replace('<a ','<a title="hidden badge example" data-hidden="false" aria-hidden="false" '),record.id),true);
});

test('real Redis: badge verification queues a project and the cycle publishes it once', {skip:!process.env.DIGIVATED_TEST_REDIS_PORT},async()=>{
 const {testRedis}=await import('./helpers/redis.mjs');
 const redis=testRedis(12);await redis(['FLUSHDB']);
 try{
  const scheduledAt=nextFreeLaunch(),scheduled=Date.parse(scheduledAt);
  const fixture={...record,launch:{kind:'free',scheduledAt,scheduledTimestamp:scheduled}};
  await redis(['SET',`digivated:submission:${fixture.id}`,JSON.stringify(fixture)]);
  const {makeSubmissionHandler}=await import('../server/submissions.mjs');
  const submit=makeSubmissionHandler({redis,env:{SUBMISSIONS_ORIGIN:'https://digivated.test'},verifyAccount:async()=>({id:'owner',email:'owner@example.com'}),readSite:async()=>({html:badgeSnippet(fixture.id)})});
  const verificationResponse={setHeader(){},end(body){this.body=JSON.parse(body);}};
  await submit({method:'POST',url:'/api/submissions',headers:{origin:'https://digivated.test','content-type':'application/json',authorization:'Bearer fixture-session'},body:{action:'verify-badge',id:fixture.id}},verificationResponse);
  assert.equal(verificationResponse.statusCode,200);
  const verified=verificationResponse.body;
  assert.equal(verified.verified,true);
  assert.equal(verified.pageUrl,undefined);
  assert.equal(Number(await redis(['ZSCORE','digivated:launch:free',fixture.id])),scheduled);
  assert.equal(await redis(['GET',`digivated:public:submission:${fixture.id}`]),null);
  let now=scheduled-1;
  const handler=makeLaunchQueueHandler({redis,now:()=>now,env:{CRON_SECRET:'fixture-secret'}});
  async function cycle(){const res={setHeader(){},end(body){this.body=JSON.parse(body);}};await handler({method:'GET',headers:{authorization:'Bearer fixture-secret'}},res);return res;}
  assert.deepEqual((await cycle()).body,{checked:0,published:0,failed:0});
  now=scheduled;
  const published=await cycle();assert.equal(published.statusCode,200);assert.equal(published.body.published,1);
  const saved=JSON.parse(await redis(['GET',`digivated:submission:${fixture.id}`]));
  assert.equal(saved.status,'approved');assert.equal(saved.publishedAt,scheduledAt);
  assert.equal(JSON.parse(await redis(['GET',`digivated:public:submission:${fixture.id}`])).pageUrl,`/projects/listing/${fixture.id}`);
  assert.deepEqual(await redis(['ZRANGE','digivated:public:submissions',0,-1]),[fixture.id]);
  assert.equal(await redis(['ZSCORE','digivated:launch:free',fixture.id]),null);
  assert.deepEqual((await cycle()).body,{checked:0,published:0,failed:0});
  assert.equal((await verifyProjectBadge(redis,{id:'owner'},fixture.id,()=>assert.fail('Already verified'))).pageUrl,`/projects/listing/${fixture.id}`);
  // Two workers holding the same revision cannot publish twice.
  await redis(['SET',`digivated:submission:${fixture.id}`,JSON.stringify({...fixture,launch:{...fixture.launch,badgeVerifiedAt:new Date().toISOString()}})]);
  const concurrent=await Promise.all([1,2].map(()=>publishQueued(redis,{...fixture,launch:{...fixture.launch,badgeVerifiedAt:new Date().toISOString()}},now)));
  assert.equal(concurrent.filter(Boolean).length,1);
 }finally{await redis(['FLUSHDB']);}
});

test('verification runtime fits the website-check deadline and cycle has its own budget',async()=>{
 const {readFile}=await import('node:fs/promises');
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(config.functions['api/submissions.js'].maxDuration>=30);
 assert.ok(config.functions['api/[route].js'].maxDuration>=60);
 assert.ok(config.crons.some(c=>c.path==='/api/launch-queue'&&c.schedule==='10 0 * * *'));
});

test('website verification follows apex/www redirects but refuses unrelated domains',async()=>{
 const {EventEmitter}=await import('node:events');let requests=0;
 function transport(url,_options,onResponse){
  const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
   requests++;const res=new EventEmitter();res.statusCode=requests===1?301:200;
   res.headers=requests===1?{location:'https://www.example.com/project'}:{'content-type':'text/html'};res.resume=()=>{};
   onResponse(res);if(requests>1){res.emit('data',Buffer.from(badgeSnippet(record.id)));res.emit('end');}req.emit('close');
  });req.destroy=error=>{if(error)req.emit('error',error);req.emit('close');};return req;
 }
 const options={resolve:async()=>[{address:'93.184.216.34'}],transport};
 assert.equal((await readProjectSite('https://example.com',options)).url,'https://www.example.com/project');
 requests=0;
 const hostile=(url,options,callback)=>transport(url,options,res=>{res.headers.location='https://other.example.net/';callback(res);});
 await assert.rejects(readProjectSite('https://example.com',{...options,transport:hostile}),/another site/);
});
