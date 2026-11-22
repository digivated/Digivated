import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReturnEmailHandler, makeWeeklyDigestHandler } from '../server/return-emails.mjs';

const id='a5b2b29e-1aa2-4000-8000-63cfcc6be725',email='owner@example.com';
const env={SUBMISSIONS_REDIS_REST_TOKEN:'fixture-redis-secret',RESEND_API_KEY:'fixture-resend',ACCOUNT_EMAIL_FROM:'Digivated <hello@digivated.com>',WEEKLY_EMAIL_FROM:'Digivated <updates@digivated.com>',COMMUNITY_SUPABASE_SECRET_KEY:'fixture',WEEKLY_EMAIL_POSTAL_ADDRESS:'123 Example St, Test City, NY 10001',CRON_SECRET:'fixture-cron-secret'};
function fixture(){
 const entries=new Map(),members=new Map(),sent=[];
 const redis=async ([command,...args])=>{
  if(command==='GET')return entries.get(args[0])||null;
  if(command==='SET'){if(args.includes('NX')&&entries.has(args[0]))return null;entries.set(args[0],args[1]);return 'OK';}
  if(command==='DEL'){entries.delete(args[0]);return 1;}
  if(command==='INCR'){const n=Number(entries.get(args[0])||0)+1;entries.set(args[0],String(n));return n;}
  if(command==='EXPIRE')return 1;
  if(command==='ZADD'){
   if(args[1]==='XX'&&!members.has(args[3]))return 0;
   members.set(args.at(-1),Number(args.at(-2)));return 1;
  }
  if(command==='ZREM'){members.delete(args[1]);return 1;}
  if(command==='ZRANGEBYSCORE')return [...members].filter(([,score])=>score<=Number(args[2])).map(([key])=>key).slice(Number(args[4]),Number(args[4])+Number(args[5]));
  if(command==='ZREVRANGE')return [...entries.keys()].filter(key=>key.startsWith('digivated:submission:')).map(key=>key.slice('digivated:submission:'.length));
  if(command==='MGET')return args.map(key=>entries.get(key)||null);
  if(command==='EVAL'){
   const [script,,first,,third,fourth,arg1,arg2,arg3]=args;
   if(script.includes("redis.call('ZADD',KEYS[3],'NX'")){
    if(entries.get(first)!==arg1)return 0;
    entries.set(args[3],arg2);if(!members.has(arg3))members.set(arg3,0);
    entries.delete(first);entries.delete(fourth);return 1;
   }
   if(arg3==='yes'){entries.set(third,'1');entries.delete(fourth);members.delete(arg2);}
   entries.delete(first);members.delete(arg1);return 1;
  }
  throw Error(command);
 };
 const deps={env,redis,logger:{info(){},warn(){},error(){}},verifyAccount:async()=>({id,email}),adminClient:{auth:{admin:{getUserById:async userId=>({data:{user:{email:userId.startsWith('member-')?`${userId}@example.com`:email}}})}}},fetcher:async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true};}};
 async function invoke(handler,method,url,body,headers={}){const req={method,url,headers:{origin:'https://digivated.com','content-type':'application/json',...headers},body};let raw;const res={setHeader(){},end(value){raw=value;}};await handler(req,res);return {status:res.statusCode,body:raw?.startsWith('{')?JSON.parse(raw):raw};}
 return {entries,members,sent,deps,invoke};
}

test('weekly email requires mailbox confirmation and allows immediate unsubscribe',async()=>{
 const f=fixture(),handler=makeReturnEmailHandler(f.deps);
 const initial=await f.invoke(handler,'GET','/api/return-emails?action=status');assert.equal(initial.body.subscribed,false);
 const requested=await f.invoke(handler,'POST','/api/return-emails?action=on',{});assert.equal(requested.body.pending,true);
 assert.equal(f.members.size,0);assert.equal(f.sent.length,1);
 const token=[...f.entries.keys()].find(key=>key.includes(':confirm:')).split(':').at(-1);
 const confirmed=await f.invoke(handler,'POST','/api/return-emails?action=confirm',{token});assert.equal(confirmed.status,200);
 assert.equal((await f.invoke(handler,'GET','/api/return-emails?action=status')).body.subscribed,true);
 const off=await f.invoke(handler,'POST','/api/return-emails?action=off',{});assert.equal(off.body.subscribed,false);assert.equal(f.members.size,0);
});

test('digest requires the cron secret and configured mailing address',async()=>{
 const f=fixture(),handler=makeWeeklyDigestHandler(f.deps);
 assert.equal((await f.invoke(handler,'GET','/api/weekly-digest')).status,401);
 const result=await f.invoke(handler,'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`});assert.equal(result.status,200);assert.equal(result.body.sent,0);
 const noAddress=makeWeeklyDigestHandler({...f.deps,env:{...env,WEEKLY_EMAIL_POSTAL_ADDRESS:''}});
 assert.equal((await f.invoke(noAddress,'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`})).status,503);
 const preference=makeReturnEmailHandler({...f.deps,env:{...env,WEEKLY_EMAIL_POSTAL_ADDRESS:''}});
 assert.equal((await f.invoke(preference,'GET','/api/return-emails?action=status')).body.available,false);
 assert.equal((await f.invoke(preference,'POST','/api/return-emails?action=on',{})).status,503);
 assert.equal(f.sent.length,0);
});

test('digest sends only recent published projects and stops at ten recipients',async()=>{
 const f=fixture(),issue=new Date('2026-11-30T15:00:00Z');
 const handler=makeWeeklyDigestHandler({...f.deps,now:()=>+issue+1000});
 const now=+issue-1000;
 f.entries.set('digivated:submission:recent',JSON.stringify({status:'featured',name:'New tool',url:'https://example.com',publishedAt:new Date(now).toISOString(),reviewedAt:new Date(now-14*86400000).toISOString()}));
 f.entries.set('digivated:submission:private',JSON.stringify({status:'pending',name:'Private project',url:'https://private.example',reviewedAt:new Date(now).toISOString()}));
 for(let n=0;n<12;n++){const member=`member-${n}`;f.entries.set(`digivated:weekly:preference:${member}`,JSON.stringify({email:`${member}@example.com`}));f.members.set(member,0);}
 const result=await f.invoke(handler,'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`});
 assert.equal(result.body.sent,10);assert.equal(f.sent.length,10);
 assert.match(f.sent[0].text,/New tool/);assert.match(f.sent[0].html,/projects\/listing\/recent/);
 assert.equal(f.sent[0].headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');assert.doesNotMatch(f.sent[0].text,/Private project/);
 assert.match(f.sent[0].text,/Unsubscribe:/);assert.match(f.sent[0].text,/123 Example St/);
 assert.equal(f.sent[0].from,'Digivated <updates@digivated.com>');
 assert.equal([...f.members.values()].filter(score=>score>0).length,10);
});

test('footer signup verifies the mailbox, deduplicates account delivery, and unsubscribes by email', async () => {
 const f=fixture(),handler=makeReturnEmailHandler(f.deps);
 const signup='/api/return-emails?action=subscribe';
 const headers={'x-real-ip':'203.0.113.1'};
 assert.equal((await f.invoke(handler,'POST',signup,{email:'invalid'},headers)).status,400);
 assert.equal((await f.invoke(handler,'POST',signup,{email},{...headers,origin:'https://example.org'})).status,403);
 const first=await f.invoke(handler,'POST',signup,{email:' OWNER@EXAMPLE.COM '},headers);
 assert.equal(first.status,200);
 assert.deepEqual(first.body,{subscribed:false,pending:true});
 assert.equal(f.members.size,0);
 assert.equal((await f.invoke(handler,'POST',signup,{email},headers)).status,200);
 assert.equal(f.sent.length,1);
 assert.deepEqual(f.sent[0].to,[email]);
 const token=[...f.entries.keys()].find(key=>key.includes(':confirm:')).split(':').at(-1);
 const confirm=()=>f.invoke(handler,'POST','/api/return-emails?action=confirm',{token});
 assert.equal((await confirm()).status,200);
 assert.equal((await confirm()).status,410);
 const guest=[...f.members.keys()][0];
 assert.match(guest,/^email-[a-f0-9]{64}$/);
 assert.equal((await f.invoke(handler,'GET','/api/return-emails?action=status')).body.subscribed,true);
 f.entries.set(`digivated:weekly:preference:${id}`,JSON.stringify({email}));
 f.members.set(id,0);
 f.entries.set('digivated:submission:recent',JSON.stringify({status:'approved',name:'Weekly tool',publishedAt:'2026-11-21T15:00:00Z'}));
 const digest=makeWeeklyDigestHandler({...f.deps,now:()=>Date.parse('2026-11-22T16:00:00Z')});
 const send=()=>f.invoke(digest,'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`});
 assert.deepEqual((await send()).body,{sent:1,failed:0,skipped:1});
 const unsubscribe=f.sent[1].headers['List-Unsubscribe'].slice(1,-1);
 assert.equal((await f.invoke(handler,'GET',unsubscribe)).status,200);
 assert.ok(f.members.has(guest),'opening the link does not unsubscribe');
 assert.equal((await f.invoke(handler,'POST',unsubscribe)).status,200);
 assert.equal(f.members.has(guest),false);
 assert.equal((await f.invoke(handler,'GET','/api/return-emails?action=status')).body.subscribed,false);
});

test('weekly confirmation and digest use the same verified sending credentials', async () => {
 const f=fixture(), authorization='Bearer fixture-verified-key', sender='Digivated <mail@auth.example.com>';
 const deps={
  ...f.deps,
  env:{...env,SIGNUP_RESEND_API_KEY:'fixture-verified-key',SIGNUP_EMAIL_FROM:sender},
  fetcher:async (url, options) => {
   assert.equal(options.headers.Authorization, authorization);
   assert.equal(JSON.parse(options.body).from, sender);
   return f.deps.fetcher(url, options);
  },
 };
 const handler=makeReturnEmailHandler(deps);
 const signup='/api/return-emails?action=subscribe', headers={'x-real-ip':'203.0.113.1'};
 const rejected=makeReturnEmailHandler({...deps,fetcher:async()=>({ok:false,status:403})});
 assert.equal((await f.invoke(rejected,'POST',signup,{email},headers)).status,503);
 assert.equal(f.members.size,0);
 assert.ok(![...f.entries.keys()].some(key=>key.includes(':confirm:')));
 assert.deepEqual((await f.invoke(handler,'POST',signup,{email},headers)).body,{subscribed:false,pending:true});
 const token=[...f.entries.keys()].find(key=>key.includes(':confirm:')).split(':').at(-1);
 assert.equal((await f.invoke(handler,'POST','/api/return-emails?action=confirm',{token})).status,200);
 f.entries.set('digivated:submission:recent',JSON.stringify({status:'approved',name:'Weekly tool',publishedAt:'2026-11-23T14:00:00Z'}));
 const digest=makeWeeklyDigestHandler({...deps,now:()=>Date.parse('2026-11-23T15:01:00Z')});
 assert.deepEqual((await f.invoke(digest,'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`})).body,{sent:1,failed:0,skipped:0});
 assert.equal(f.sent.length,2);
});

test('temporary account and provider failures are visible and preserve subscriptions',async()=>{
 const f=fixture();
 const issue=new Date('2026-11-30T15:00:00Z');
 f.entries.set('digivated:submission:recent',JSON.stringify({status:'approved',name:'<A & B>',publishedAt:new Date(+issue-1000).toISOString()}));
 f.entries.set(`digivated:weekly:preference:${id}`,JSON.stringify({email}));f.members.set(id,0);
 const call=deps=>f.invoke(makeWeeklyDigestHandler({...deps,now:()=>+issue+1000}),'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`});
 const unavailable={auth:{admin:{getUserById:async()=>({error:{status:503}})}}};
 assert.equal((await call({...f.deps,adminClient:unavailable})).status,503);
 const rejected=await call({...f.deps,fetcher:async()=>({ok:false,status:429})});
 assert.deepEqual(rejected.body,{sent:0,failed:1,skipped:0});
 assert.equal(f.members.get(id),0);
 assert.equal((await call(f.deps)).body.sent,1);
 assert.match(f.sent[0].html,/&lt;A &amp; B&gt;/);
 assert.equal((await call(f.deps)).body.sent,0);
 assert.equal(f.sent.length,1);
});

test('Monday digest skips the Sunday overlap and carries its cutoff into the next week', async () => {
 const f=fixture();
 f.entries.set(`digivated:weekly:preference:${id}`,JSON.stringify({email}));
 f.members.set(id,Date.parse('2026-11-22T16:00:00Z'));
 for (const [key,name,publishedAt] of [
  ['sunday','Already in Sunday’s issue','2026-11-22T14:59:59Z'],
  ['monday','Monday launch','2026-11-23T14:00:00Z'],
  ['later','Later launch','2026-11-23T16:00:00Z'],
 ]) f.entries.set(`digivated:submission:${key}`, JSON.stringify({name,publishedAt,status:'approved'}));
 const send=now=>f.invoke(makeWeeklyDigestHandler({...f.deps,now:()=>Date.parse(now)}),
  'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`});
 assert.equal((await send('2026-11-23T15:01:00Z')).body.sent,1);
 assert.match(f.sent[0].text,/Monday launch/);
 assert.doesNotMatch(f.sent[0].text,/Already in Sunday|Later launch/);
 assert.equal((await send('2026-11-23T17:01:00Z')).body.sent,0);
 assert.equal((await send('2026-11-30T15:01:00Z')).body.sent,1);
 assert.match(f.sent[1].text,/Later launch/);
 assert.doesNotMatch(f.sent[1].text,/Monday launch/);
});

test('the November update reaches confirmed weekly readers with activity on, once, even without new projects',async()=>{
 const f=fixture();
 const disabled='a5b2b29e-1aa2-4000-8000-63cfcc6be726';
 const noEmailOptIn='a5b2b29e-1aa2-4000-8000-63cfcc6be727';
 for (const member of [id,disabled]) {
  f.entries.set(`digivated:weekly:preference:${member}`,JSON.stringify({email}));
  f.members.set(member,0);
 }
 for (const member of [id,noEmailOptIn]) {
  f.entries.set(`digivated:notifications:preferences:${member}`,JSON.stringify({enabled:true}));
 }
 const handler=makeWeeklyDigestHandler({...f.deps,now:()=>Date.parse('2026-11-15T15:01:00Z')});
 const send=()=>f.invoke(handler,'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`});
 assert.equal((await send()).body.sent,1);
 assert.equal(f.sent.length,1);
 assert.match(f.sent[0].subject,/What’s new on Digivated/);
 assert.match(f.sent[0].html,/Open Notifications/);
 assert.match(f.sent[0].text,/Unsubscribe:/);
 assert.equal((await send()).body.sent,0);
 const nextWeek=makeWeeklyDigestHandler({...f.deps,now:()=>Date.parse('2026-11-22T15:01:00Z')});
 assert.equal((await f.invoke(nextWeek,'GET','/api/weekly-digest',undefined,{authorization:`Bearer ${env.CRON_SECRET}`})).body.sent,0);
});
