import test from 'node:test';
import assert from 'node:assert/strict';
import { accountIndex, makeProjectAccountHandler, verifiedAccount } from '../server/project-account.mjs';
import { makeSubmissionHandler } from '../server/submissions.mjs';
import { validateEdit, projectPublic } from '../server/admin-store.mjs';

const env={COMMUNITY_SUPABASE_URL:'https://cglkjclolglwizwepvmy.supabase.co',COMMUNITY_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUBMISSIONS_REDIS_REST_TOKEN:'test-secret',SUBMISSIONS_ORIGIN:'https://digivated.com'};
const account={id:'4ad90c9b-5666-482d-899c-d0d3ef41ee46',email:'creator@example.com'};
async function invoke(handler,req){let body;const res={setHeader(){},end(value){body=JSON.parse(value);}};await handler(req,res);return {status:res.statusCode,body};}
const submission={creator:'Creator',email:account.email,name:'Sample',url:'https://example.com',description:'A sample project for account testing.',category:'Apps',consent:true,image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII='};
test('verified submissions are indexed by email and visible only to that account without private fields',async()=>{
 const commands=[];
 const saved=await invoke(makeSubmissionHandler({env,verifyAccount:async()=>account,redis:async c=>{commands.push(c);return 1;}}),{method:'POST',url:'/api/submissions',headers:{origin:env.SUBMISSIONS_ORIGIN,authorization:'Bearer fixture','content-type':'application/json','x-real-ip':'127.0.0.1'},body:submission});
 assert.equal(saved.status,201);
 const command=commands.find(c=>c[0]==='EVAL');assert.equal(command[6],accountIndex(account.email,env.SUBMISSIONS_REDIS_REST_TOKEN));
 const stored=JSON.parse(command[7]);assert.equal(stored.accountId,account.id);
 assert.equal(saved.body.launch.kind,'free');
 assert.equal(saved.body.launch.badge,`<a href="https://digivated.com/projects/listing/${stored.id}" data-digivated-project="${stored.id}" target="_blank" rel="noopener">\n  <img src="https://digivated.com/badge/${stored.id}?theme=dark" alt="Featured on Digivated" width="250" height="54">\n</a>`);
 assert.equal(stored.launch.badge,undefined);
 const redis=async c=>c[0]==='GET'?'1':c[0]==='ZREVRANGE'?[stored.id]:[JSON.stringify({...stored,notes:'private',promotion:{receiptReference:'secret'},reviewFeedback:'Please clarify your audience.'})];
 const handler=makeProjectAccountHandler({env,verifyAccount:async()=>account,redis});
 const result=await invoke(handler,{method:'GET',url:'/api/project-account?route=project-account',headers:{authorization:'Bearer fixture'}});
 assert.equal(result.status,200);assert.equal(result.body.submissions[0].feedback,'Please clarify your audience.');
 assert.equal(result.body.submissions[0].launch.badge,saved.body.launch.badge);
 assert.equal(JSON.stringify(result.body).includes('private'),false);assert.equal(JSON.stringify(result.body).includes('secret'),false);
 const anonymous=await invoke(makeProjectAccountHandler({env,verifyAccount:async()=>null,redis}),{method:'GET',url:'/api/project-account',headers:{}});
 assert.equal(anonymous.status,401);
});
test('verified mailbox sees earlier guest submissions and other accounts stay isolated',async()=>{
 const earlier={...submission,id:'legacy-id',date:'2026-10-01T00:00:00Z',status:'pending',reviewFeedback:'A private review.',notes:'hidden'};
 const another={...earlier,id:'owned-by-other',accountId:'different-account-id'};
 const redisCommands=[];const index=new Map();let scanned=false;
 const redis=async c=>{
  redisCommands.push(c);
  if(c[0]==='GET')return scanned?'1':null;
  if(c[0]==='SET'){scanned=true;return 'OK';}
  if(c[0]==='ZREVRANGE'&&c[1]==='digivated:submissions')return [earlier.id,'100',another.id,'90'];
  if(c[0]==='ZADD'){for(let i=2;i<c.length;i+=2)index.set(c[i+1],c[i]);return 1;}
  if(c[0]==='ZREVRANGE')return [...index.keys()];
  if(c[0]==='MGET')return c.slice(1).map(key=>JSON.stringify(key.endsWith(another.id)?another:earlier));
  throw Error(`Unexpected command: ${c[0]}`);
 };
 const handler=makeProjectAccountHandler({env,verifyAccount:async()=>account,redis});
 const req={method:'GET',url:'/api/project-account',headers:{authorization:'Bearer fixture'}};
 const result=await invoke(handler,req);
 assert.equal(result.status,200);assert.deepEqual(result.body.submissions.map(row=>row.id),[earlier.id]);
 assert.equal(result.body.submissions[0].feedback,'A private review.');
 assert.equal(JSON.stringify(result.body).includes('hidden'),false);
 assert.deepEqual([...index.keys()],[earlier.id]);
 await invoke(handler,req);
 assert.equal(redisCommands.filter(c=>c[1]==='digivated:submissions').length,1);
});
test('password account cannot claim an earlier guest submission by email alone',async()=>{
 const legacy={...submission,id:'old',date:'2026-10-01',status:'pending',reviewFeedback:'private'};
 const redis=async c=>c[0]==='ZREVRANGE'?['old']:c[0]==='MGET'?[JSON.stringify(legacy)]:null;
 const result=await invoke(makeProjectAccountHandler({env,verifyAccount:async()=>({...account,mailboxVerified:false}),redis}),{method:'GET',url:'/api/project-account',headers:{authorization:'Bearer fixture'}});
 assert.equal(result.status,200);assert.deepEqual(result.body.submissions,[]);
});
test('new guest submissions are rejected without writing',async()=>{
 const commands=[];
 const result=await invoke(makeSubmissionHandler({env,redis:async c=>{commands.push(c);return 1;}}),{method:'POST',url:'/api/submissions',headers:{origin:env.SUBMISSIONS_ORIGIN,'content-type':'application/json','x-real-ip':'127.0.0.1'},body:submission});
 assert.equal(result.status,401);
 assert.equal(commands.length,0);
});
test('a verified account cannot submit using another email',async()=>{
 const result=await invoke(makeSubmissionHandler({env,verifyAccount:async()=>account,redis:async()=>{throw Error('should not write');}}),{method:'POST',url:'/api/submissions',headers:{origin:env.SUBMISSIONS_ORIGIN,authorization:'Bearer fixture','content-type':'application/json','x-real-ip':'127.0.0.1'},body:{...submission,email:'someone@example.com'}});
 assert.equal(result.status,403);
});
test('account status is independent of submission storage and rejects other sessions',async()=>{
 const withoutRedis={...env,SUBMISSIONS_REDIS_REST_TOKEN:''};
 const ok=await invoke(makeProjectAccountHandler({env:withoutRedis,verifyAccount:async()=>account}),{method:'GET',url:'/api/project-account?action=me',headers:{authorization:'Bearer fixture'}});
 assert.equal(ok.status,200);assert.deepEqual(ok.body,{email:account.email});
 const denied=await invoke(makeProjectAccountHandler({env:withoutRedis,verifyAccount:async()=>null}),{method:'GET',url:'/api/project-account?action=me'});
 assert.equal(denied.status,401);
 const submissions=await invoke(makeProjectAccountHandler({env:withoutRedis,verifyAccount:async()=>account}),{method:'GET',url:'/api/project-account',headers:{authorization:'Bearer fixture'}});
 assert.equal(submissions.status,503);
});
test('account tokens require provider verification and confirmed email',async()=>{
 const payload={sub:account.id,email:account.email,amr:[{method:'magiclink'}]};
 const token=['e30',Buffer.from(JSON.stringify(payload)).toString('base64url'),'signature'].join('.');
 const req={headers:{authorization:`Bearer ${token}`}};
 const fetcher=async(_url,options)=>({ok:true,json:async()=>({...account,email_confirmed_at:'2026-10-23T00:00:00Z'})});
 assert.deepEqual(await verifiedAccount(req,env,fetcher),account);
 assert.equal(await verifiedAccount({headers:{authorization:'Bearer forged'}},env,fetcher),null);
 const password=['e30',Buffer.from(JSON.stringify({...payload,amr:[{method:'password'}]})).toString('base64url'),'signature'].join('.');
 assert.deepEqual(await verifiedAccount({headers:{authorization:`Bearer ${password}`}},env,fetcher),{...account,mailboxVerified:false});
 assert.equal(await verifiedAccount(req,env,async()=>({ok:false})),null);
 assert.equal(await verifiedAccount(req,env,async()=>({ok:true,json:async()=>({...account,email_confirmed_at:null})})),null);
});
test('Google sign-in counts only when Google verified the same email',async()=>{
 const oauth=['e30',Buffer.from(JSON.stringify({sub:account.id,email:account.email,amr:[{method:'oauth'}]})).toString('base64url'),'signature'].join('.');
 const req={headers:{authorization:`Bearer ${oauth}`}};
 const user=identities=>async()=>({ok:true,json:async()=>({...account,email_confirmed_at:'2026-10-23T00:00:00Z',identities})});
 assert.deepEqual(await verifiedAccount(req,env,user([{provider:'google',identity_data:{email:account.email,email_verified:true}}])),account);
 assert.equal(await verifiedAccount(req,env,user([{provider:'google',identity_data:{email:account.email,email_verified:false}}])),null);
 assert.equal(await verifiedAccount(req,env,user([{provider:'google',identity_data:{email:'someone-else@example.com',email_verified:true}}])),null);
 assert.equal(await verifiedAccount(req,env,user([{provider:'github',identity_data:{email:account.email,email_verified:true}}])),null);
 assert.equal(await verifiedAccount(req,env,user(undefined)),null);
});
test('signup creates an account only after the one-time email code is verified', {skip:!process.env.DIGIVATED_TEST_REDIS_PORT}, async()=>{
 const redis=testRedis(11);await redis(['FLUSHDB']);
 try {
  const created=[];let code;
  const handler=makeProjectAccountHandler({
   env:{...env,COMMUNITY_SUPABASE_SECRET_KEY:'test-secret',SIGNUP_RESEND_API_KEY:'test-mail',SIGNUP_EMAIL_FROM:'accounts@auth.example.com',VERCEL:'1'},
   redis,
   fetcher:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');const message=JSON.parse(options.body);assert.deepEqual(message.to,[account.email]);assert.equal(message.from,'accounts@auth.example.com');code=message.text.match(/verification code is (\d{6})/)[1];return {ok:true};},
   adminClient:{auth:{admin:{createUser:async input=>{created.push(input);return {data:{user:{id:account.id}},error:null};}}}},
  });
  const signup=body=>invoke(handler,{method:'POST',url:'/api/project-account?action=signup',headers:{origin:'https://digivated.com','content-type':'application/json','x-real-ip':'127.0.0.1'},body:{email:account.email,...body}});
  const started=await signup({});
  assert.equal(started.status,202);assert.deepEqual(Object.keys(started.body),['challenge']);assert.equal(created.length,0);
  assert.equal((await signup({})).status,429);
  const verification={challenge:started.body.challenge,password:'long-safe-password'};
  assert.equal((await signup({...verification,code:code==='111111'?'222222':'111111'})).status,400);
  assert.equal(created.length,0);
  const results=await Promise.all([signup({...verification,code}),signup({...verification,code})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
  assert.deepEqual(created,[{email:account.email,password:'long-safe-password',email_confirm:true}]);
 } finally {await redis(['FLUSHDB']);}
});
test('owner feedback stays private through review and public projection',()=>{
 const previous={...submission,id:'4ad90c9b-5666-482d-899c-d0d3ef41ee46',date:'2026-10-23T00:00:00Z',status:'pending',revision:0};
 const edit=validateEdit('submission',{id:previous.id,revision:0,name:previous.name,creator:previous.creator,url:previous.url,description:previous.description,category:previous.category,status:'approved',socialUrl:'',reviewFeedback:'Please clarify the audience.'},previous);
 assert.equal(edit.reviewFeedback,'Please clarify the audience.');
 assert.equal('reviewFeedback' in projectPublic(edit),false);
});

import {testRedis} from './helpers/redis.mjs';
import {defaultNotificationPreferences, getNotificationPreferences, saveNotificationPreferences} from '../server/notifications.mjs';

test('Redis saves the submitter’s explicit activity choice only with a successful submission', {skip:!process.env.DIGIVATED_TEST_REDIS_PORT}, async () => {
 const redis = testRedis(11);
 await redis(['FLUSHDB']);
 try {
  const handler = makeSubmissionHandler({env,redis,verifyAccount:async()=>account});
  const submit = activityNotifications => invoke(handler,{
   method:'POST',url:'/api/submissions',
   headers:{origin:env.SUBMISSIONS_ORIGIN,authorization:'Bearer fixture','content-type':'application/json'},
   body:{...submission,activityNotifications},
  });
  await saveNotificationPreferences(redis,account.id,{...defaultNotificationPreferences,message:false});
  const first = await submit(true);
  assert.equal(first.status,201);
  assert.equal(first.body.activityNotifications,true);
  assert.deepEqual(await getNotificationPreferences(redis,account.id),{...defaultNotificationPreferences,enabled:true});
  assert.equal((await submit(false)).status,409);
  assert.equal((await getNotificationPreferences(redis,account.id)).enabled,true);
  assert.equal(await redis(['ZCARD','digivated:weekly:members']),0);

  const key = `digivated:submission:${first.body.id}`;
  const record = JSON.parse(await redis(['GET',key]));
  await redis(['SET',key,JSON.stringify({...record,status:'archived'})]);
  await saveNotificationPreferences(redis,account.id,{...defaultNotificationPreferences,enabled:true,message:false});
  assert.equal((await submit(false)).status,201);
  assert.deepEqual(await getNotificationPreferences(redis,account.id),{...defaultNotificationPreferences,enabled:false,message:false});
 } finally { await redis(['FLUSHDB']); }
});
