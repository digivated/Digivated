import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addNotification, clearNotifications, defaultNotificationPreferences, getNotificationPreferences,
  listNotifications, markAllNotificationsRead, markNotificationRead, notificationSummary,
  saveNotificationPreferences,
} from '../server/notifications.mjs';
import { makeNotificationsHandler } from '../server/notifications-handler.mjs';
import { makeCreatorInboxHandler } from '../server/creator-inbox.mjs';

const alice = '123e4567-e89b-42d3-a456-426614174000';
const bob = '123e4567-e89b-42d3-a456-426614174001';
const post = '123e4567-e89b-42d3-a456-426614174002';
function memoryRedis() {
  const values = new Map(), sorted = new Map(), sets = new Map();
  const redis = async ([cmd, key, ...args]) => {
    if (cmd === 'GET') return values.get(key) ?? null;
    if (cmd === 'SET') {
      if (args.includes('NX') && values.has(key)) return null;
      values.set(key, args[0]); return 'OK';
    }
    if (cmd === 'EXPIRE') return 1;
    if (cmd === 'INCR') { const next = Number(values.get(key) || 0) + 1; values.set(key,next); return next; }
    if (cmd === 'EVAL') { const rateKey = args[1]; const next = Number(values.get(rateKey) || 0) + 1; values.set(rateKey,next); return next; }
    if (cmd === 'DEL') { for (const item of [key,...args]) { values.delete(item); sorted.delete(item); sets.delete(item); } return 1; }
    if (cmd === 'ZADD') { const list = sorted.get(key) || []; list.push({id:args[1],score:Number(args[0])}); sorted.set(key,list); return 1; }
    if (cmd === 'ZCARD') return (sorted.get(key) || []).length;
    if (cmd === 'ZREVRANGE') return (sorted.get(key) || []).slice().reverse().slice(Number(args[0]),Number(args[1])+1).map(item=>item.id);
    if (cmd === 'ZRANGE') return (sorted.get(key) || []).slice(Number(args[0]),Number(args[1]) === -1 ? undefined : Number(args[1])+1).map(item=>item.id);
    if (cmd === 'ZRANGEBYSCORE') return (sorted.get(key) || []).filter(item => item.score <= Number(args[1])).map(item=>item.id);
    if (cmd === 'ZREM') { const ids=new Set(args);sorted.set(key,(sorted.get(key)||[]).filter(item=>!ids.has(item.id)));return ids.size; }
    if (cmd === 'MGET') return [key,...args].map(item => values.get(item) ?? null);
    if (cmd === 'SADD') { const group = sets.get(key) || new Set(); for (const item of args) group.add(item); sets.set(key,group); return group.size; }
    if (cmd === 'SREM') { const group = sets.get(key); for (const item of args) group?.delete(item); return group?.size || 0; }
    if (cmd === 'SMEMBERS') return [...(sets.get(key) || [])];
    if (cmd === 'SCARD') return (sets.get(key) || new Set()).size;
    if (cmd === 'SISMEMBER') return (sets.get(key) || new Set()).has(args[0]) ? 1 : 0;
    throw new Error('Unsupported Redis command: ' + cmd);
  };
  return {redis,values};
}

test('notifications are on by default, private, and controllable per activity type', async () => {
  const {redis,values} = memoryRedis();
  assert.deepEqual(await getNotificationPreferences(redis,alice),defaultNotificationPreferences);
  assert.equal(defaultNotificationPreferences.enabled,true);
  // An explicit opt-out is respected.
  await saveNotificationPreferences(redis,alice,{...defaultNotificationPreferences,enabled:false});
  assert.equal(await addNotification(redis,{recipientId:alice,type:'reply',actorId:bob,link:'/threads/example#comment-'+post}),false);
  assert.equal((await listNotifications(redis,alice)).items.length,0);
  const preferences = {...defaultNotificationPreferences,enabled:true,message:false};
  assert.deepEqual(await saveNotificationPreferences(redis,alice,preferences),preferences);
  assert.equal(await addNotification(redis,{recipientId:alice,type:'message',actorId:bob}),false);
  assert.equal(await addNotification(redis,{recipientId:alice,type:'reply',actorId:bob,link:'/threads/example#comment-'+post}),true);
  assert.equal(await addNotification(redis,{recipientId:alice,type:'follow',actorId:bob}),true);
  assert.equal(await addNotification(redis,{recipientId:alice,type:'follow',actorId:bob}),false);
  const listing = await listNotifications(redis,alice);
  assert.equal(listing.items.length,2);
  assert.equal(listing.unread,2);
  assert.equal(listing.items[0].href,`/creator?id=${bob}`);
  assert.equal(await markNotificationRead(redis,bob,listing.items[0].id),false);
  assert.equal(await markNotificationRead(redis,alice,listing.items[0].id),true);
  assert.equal((await notificationSummary(redis,alice)).unread,1);
  await markAllNotificationsRead(redis,alice);
  assert.equal((await notificationSummary(redis,alice)).unread,0);
  await clearNotifications(redis,alice);
  assert.equal((await listNotifications(redis,alice)).items.length,0);
  assert(listing.items.every(item => !values.has(`digivated:notifications:item:${item.id}`)));
  assert(!JSON.stringify([...values.values()]).includes('private@example.com'));
});

test('notification settings reject unknown fields and unsafe targets', async () => {
  const {redis} = memoryRedis();
  await assert.rejects(saveNotificationPreferences(redis,alice,{...defaultNotificationPreferences,unknown:true}));
  assert.equal(await addNotification(redis,{recipientId:alice,type:'reply',actorId:bob,targetId:'//unsafe'}),false);
  assert.equal(await addNotification(redis,{recipientId:alice,type:'reply',actorId:alice,targetId:post}),false);
});

test('expired activity leaves no stale unread badge', async () => {
  const {redis,values} = memoryRedis();
  const oldId = post;
  values.set(`digivated:notifications:item:${oldId}`,JSON.stringify({id:oldId,recipientId:alice,type:'reply'}));
  await redis(['ZADD',`digivated:notifications:index:${alice}`,Date.now()-91*86400000,oldId]);
  await redis(['SADD',`digivated:notifications:unread:${alice}`,oldId]);
  assert.equal((await notificationSummary(redis,alice)).unread,0);
  assert.equal(values.has(`digivated:notifications:item:${oldId}`),false);
});

test('historical notices remain readable without linking to retired pages', async () => {
  const {redis,values} = memoryRedis();
  for (const [id,type,href] of [[post,'reply','/creators?post=retired'],[bob,'message','/inbox?id=retired']]) {
    values.set(`digivated:notifications:item:${id}`,JSON.stringify({id,recipientId:alice,type,href}));
    await redis(['ZADD',`digivated:notifications:index:${alice}`,Date.now(),id]);
  }
  const {items} = await listNotifications(redis,alice);
  assert.equal(items.length,2);
  assert.ok(items.every(item=>item.href===null));
});

test('notification API requires sign-in, same-site writes, and ownership', async () => {
  const {redis} = memoryRedis();
  const handler = makeNotificationsHandler({redis,env:{},verifyAccount:async req => req.headers.authorization === 'Alice' ? {id:alice} : null});
  const call = async (auth,method,action,body,origin='https://digivated.com') => {
    let raw; const res = {setHeader(){},end(value){raw=value;}};
    await handler({method,url:'/api/notifications?action='+action,body,headers:{...(auth?{authorization:auth}:{}),origin,'content-type':'application/json'}},res);
    return {status:res.statusCode,...JSON.parse(raw)};
  };
  assert.equal((await call(null,'GET','list')).status,401);
  assert.equal((await call('Alice','POST','preferences',{preferences:{...defaultNotificationPreferences,enabled:true}},'https://elsewhere.example')).status,403);
  assert.equal((await call('Alice','POST','preferences',{preferences:{...defaultNotificationPreferences,enabled:true}})).status,200);
  const added = await addNotification(redis,{recipientId:alice,type:'reply',actorId:bob,link:'/threads/example#comment-'+post});
  assert.equal(added,true);
  assert.equal((await call('Alice','GET','list')).items.length,1);
  assert.equal((await call('Alice','POST','read',{id:bob})).status,404);
  assert.equal((await call('Alice','POST','read-all',{})).status,200);
  assert.equal((await call('Alice','GET','summary')).unread,0);
});

test('the legacy message API still delivers messages without creating inbox notifications', async () => {
  const {redis,values} = memoryRedis();
  values.set(`digivated:creator:profile:${alice}`,JSON.stringify({name:'Alice',public:true}));
  values.set(`digivated:creator:profile:${bob}`,JSON.stringify({name:'Bob',public:true}));
  const handler = makeCreatorInboxHandler({redis,env:{},verifyAccount:async req => ({id:req.headers.authorization === 'Alice' ? alice : bob})});
  const send = async () => {
    let raw; const res = {setHeader(){},end(value){raw=value;}};
    await handler({method:'POST',url:'/api/creator-inbox?action=send',body:{to:bob,body:'How is your project going?'},headers:{authorization:'Alice',origin:'https://digivated.com','content-type':'application/json'}},res);
    return {status:res.statusCode,...JSON.parse(raw)};
  };
  await saveNotificationPreferences(redis,bob,{...defaultNotificationPreferences,enabled:false});
  assert.equal((await send()).status,201);
  assert.equal((await listNotifications(redis,bob)).items.length,0);
  await saveNotificationPreferences(redis,bob,{...defaultNotificationPreferences,enabled:true});
  assert.equal((await send()).status,201);
  const activity = await listNotifications(redis,bob);
  assert.equal(activity.items.length,0);
  assert.equal(activity.unread,0);
});

import {notifyProjectApproval} from '../server/notifications.mjs';
import {testRedis} from './helpers/redis.mjs';
test('real Redis: approval appears with social alerts off, is private, and retries do not duplicate it', {skip:!process.env.DIGIVATED_TEST_REDIS_PORT},async()=>{
 const redis=testRedis(10);await redis(['FLUSHDB']);
 try {
  await saveNotificationPreferences(redis,alice,{...defaultNotificationPreferences,enabled:false});
  const record={id:'approval-fixture',accountId:alice,status:'approved',revision:1,consent:true,image:'fixture',url:'https://example.com'};
  const results=await Promise.all(Array.from({length:5},()=>notifyProjectApproval(redis,{status:'pending'},record)));
  assert.equal(results.filter(Boolean).length,1);
  const feed=await listNotifications(redis,alice);
  assert.equal(feed.preferences.enabled,false);assert.equal(feed.unread,1);assert.equal(feed.items[0].type,'approved');
  assert.equal(feed.items[0].href,'/projects/listing/approval-fixture');assert.equal((await listNotifications(redis,bob)).items.length,0);
  assert.equal(await notifyProjectApproval(redis,record,{...record,status:'featured',revision:2}),false);
  assert.equal(await notifyProjectApproval(redis,record,{...record,status:'rejected',revision:2}),false);
  await markNotificationRead(redis,alice,feed.items[0].id);assert.equal((await notificationSummary(redis,alice)).unread,0);
 } finally {await redis(['FLUSHDB']);}
});

test('real Redis: the signed-in feed restores a missing approval without exposing other projects or reviving cleared alerts', {skip:!process.env.DIGIVATED_TEST_REDIS_PORT}, async () => {
  const redis = testRedis(10);
  await redis(['FLUSHDB']);
  try {
    const email = 'owner@example.com';
    const secret = 'test-token';
    const {accountIndex} = await import('../server/project-account.mjs');
    const key = accountIndex(email, secret);
    const record = {id:'already-live',name:'Live project',email,accountId:alice,status:'approved',revision:3,consent:true,image:'fixture',url:'https://example.com',publishedAt:new Date(Date.now()-60000).toISOString()};
    for (const row of [
      record,
      {...record,id:'old-live',publishedAt:new Date(Date.now()-91*86400000).toISOString()},
      {...record,id:'already-notified',revision:4},
      {...record,id:'private',image:''},
      {...record,id:'other-owner',accountId:bob},
    ]) {
      await redis(['SET',`digivated:submission:${row.id}`,JSON.stringify(row)]);
      await redis(['ZADD',key,1,row.id]);
    }
    // The original notice was cleared, and the project was subsequently edited.
    await redis(['SET',`digivated:notifications:approval:${alice}:already-notified:2`,'1']);
    const handler = makeNotificationsHandler({redis,env:{SUBMISSIONS_REDIS_REST_TOKEN:secret},verifyAccount:async () => ({id:alice,email,mailboxVerified:false})});
    const load = async () => {
      let raw;
      const res = {setHeader(){},end(value){raw=value;}};
      await handler({method:'GET',url:'/api/notifications',headers:{}},res);
      assert.equal(res.statusCode,200);
      return JSON.parse(raw);
    };
    const feed = await load();
    assert.deepEqual(feed.approvals.map(project => project.href).sort(), ['already-live','already-notified','old-live'].map(id => `/projects/listing/${id}`));
    assert.equal(feed.unread,1);
    assert.equal(feed.items[0].href,'/projects/listing/already-live');
    await clearNotifications(redis,alice);
    assert.equal((await load()).unread,0);
    assert.equal((await load()).approvals.length,3);
  } finally { await redis(['FLUSHDB']); }
});

test('real Redis: verifying a badge sends one private launch-scheduled notice', {skip:!process.env.DIGIVATED_TEST_REDIS_PORT}, async () => {
  const redis = testRedis(10);
  await redis(['FLUSHDB']);
  try {
    const {verifyProjectBadge} = await import('../server/launch-queue.mjs');
    const id = '0f4d3a52-9b51-4c7e-8a2f-6d2e7b1c9a10';
    const scheduledAt = new Date(Date.now() + 9 * 86400000).toISOString();
    const record = {id,name:'Badge project',email:'owner@example.com',accountId:alice,status:'pending',revision:1,consent:true,image:'fixture',url:'https://example.com',date:new Date().toISOString(),launch:{kind:'free',version:1,scheduledAt,scheduledTimestamp:Date.parse(scheduledAt)}};
    await redis(['SET',`digivated:submission:${id}`,JSON.stringify(record)]);
    await redis(['ZADD','digivated:submissions',Date.now(),id]);
    const readSite = async () => ({html:`<footer><a href="https://digivated.com/projects/listing/${id}" data-digivated-project="${id}">[ listed on Digivated ]</a></footer>`});
    const result = await verifyProjectBadge(redis,{id:alice},id,readSite);
    assert.equal(result.verified,true);
    assert.equal(result.pageUrl,undefined);
    // Re-checking an already verified badge does not repeat the notice.
    await verifyProjectBadge(redis,{id:alice},id,readSite);
    const feed = await listNotifications(redis,alice);
    const scheduled = feed.items.filter(item => item.type === 'scheduled');
    assert.equal(scheduled.length,1);
    assert.equal(scheduled[0].href,`/account#project-${id}`);
    assert.equal((await listNotifications(redis,bob)).items.length,0);
  } finally { await redis(['FLUSHDB']); }
});
