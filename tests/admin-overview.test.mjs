import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminOverview} from '../server/admin-overview.mjs';
import {passwordHash,verifyPassword,adminConfig,createSession,requireSession,ADMIN_COOKIE} from '../server/admin-auth.mjs';
import {makeAdminHandler} from '../server/admin-handler.mjs';
import {testRedis} from './helpers/redis.mjs';

test('requested password length is accepted, shorter passwords rejected, rotation invalidates sessions',async()=>{
 await assert.rejects(passwordHash('short123!'));
 const hash=await passwordHash('Fixture12!');
 const cfg=adminConfig({DIGIVATED_ADMIN_PASSWORD_HASH:hash,DIGIVATED_ADMIN_SESSION_SECRET:'a'.repeat(64)});
 assert(await verifyPassword('Fixture12!',cfg));assert.equal(await verifyPassword('incorrect',cfg),false);
 const map=new Map(),redis=async([cmd,key,value])=>cmd==='SET'?map.set(key,value):map.get(key);
 const session=await createSession(redis,cfg),req={headers:{cookie:ADMIN_COOKIE+'='+session.token}};
 assert.equal((await requireSession(req,redis,cfg)).csrf,session.csrf);
 const rotated={...cfg,fingerprint:'different'};await assert.rejects(requireSession(req,redis,rotated),error=>error.status===401);
});
test('overview remains behind owner session authentication',async()=>{
 const env={DIGIVATED_ADMIN_PASSWORD_HASH:await passwordHash('Owner fixture password!'),DIGIVATED_ADMIN_SESSION_SECRET:'a'.repeat(64)};
 let status,body;await makeAdminHandler({env,redis:async()=>null})({method:'GET',url:'/api/admin?action=overview',headers:{}},{setHeader(){},set statusCode(v){status=v},end(v){body=JSON.parse(v)}});
 assert.equal(status,401);assert.deepEqual(Object.keys(body),['error']);
});
test('real Redis: overview aggregates all pages, keeps UTC dates, and returns no private content',{skip:!process.env.DIGIVATED_TEST_REDIS_PORT},async()=>{
 const redis=testRedis(12);await redis(['FLUSHDB']);
 try{
  for(let i=0;i<253;i++){const id='fixture-'+i;await redis(['SET','digivated:submission:'+id,JSON.stringify({status:i%2?'approved':'pending',date:i===252?'2026-11-02T23:59:59.000Z':'2026-11-09T00:01:00.000Z',email:'private@example.com',notes:'PRIVATE NOTE',image:'PRIVATE IMAGE'})]);await redis(['ZADD','digivated:submissions',i,id]);}
  await redis(['ZADD','digivated:submissions',999,'missing-record']);
  await redis(['SET','digivated:card:comment:test',JSON.stringify({status:'pending',date:'2026-11-09T00:00:00Z',body:'PRIVATE FEEDBACK'})]);await redis(['ZADD','digivated:card:comments:all',1,'test']);
  const data=await adminOverview(redis,new Date('2026-11-09T08:00:00Z'));
  assert.equal(data.submissions.total,253);assert.equal(data.submissions.statuses.pending,127);assert.equal(data.submissions.statuses.approved,126);
  assert.equal(data.submissions.activity.length,7);assert.equal(data.submissions.activity[0].date,'2026-11-03');assert.equal(data.submissions.activity[6].count,252);assert.equal(data.comments.statuses.pending,1);
  const output=JSON.stringify(data);for(const privateValue of ['PRIVATE','private@example.com','fixture-'])assert(!output.includes(privateValue));
 }finally{await redis(['FLUSHDB']);}
});
