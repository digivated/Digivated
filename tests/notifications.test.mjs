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

test('notifications are opt-in, private, and controllable per activity type', async () => {
  const {redis,values} = memoryRedis();
  assert.deepEqual(await getNotificationPreferences(redis,alice),defaultNotificationPreferences);
  assert.equal(await addNotification(redis,{recipientId:alice,type:'reply',actorId:bob,targetId:post}),false);
  assert.equal((await listNotifications(redis,alice)).items.length,0);
  const preferences = {...defaultNotificationPreferences,enabled:true,message:false};
  assert.deepEqual(await saveNotificationPreferences(redis,alice,preferences),preferences);
  assert.equal(await addNotification(redis,{recipientId:alice,type:'message',actorId:bob}),false);
  assert.equal(await addNotification(redis,{recipientId:alice,type:'reply',actorId:bob,targetId:post}),true);
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
  const added = await addNotification(redis,{recipientId:alice,type:'reply',actorId:bob,targetId:post});
  assert.equal(added,true);
  assert.equal((await call('Alice','GET','list')).items.length,1);
  assert.equal((await call('Alice','POST','read',{id:bob})).status,404);
  assert.equal((await call('Alice','POST','read-all',{})).status,200);
  assert.equal((await call('Alice','GET','summary')).unread,0);
});

test('a delivered creator message adds a notification only for an opted-in recipient', async () => {
  const {redis,values} = memoryRedis();
  values.set(`digivated:creator:profile:${alice}`,JSON.stringify({name:'Alice',public:true}));
  values.set(`digivated:creator:profile:${bob}`,JSON.stringify({name:'Bob',public:true}));
  const handler = makeCreatorInboxHandler({redis,env:{},verifyAccount:async req => ({id:req.headers.authorization === 'Alice' ? alice : bob})});
  const send = async () => {
    let raw; const res = {setHeader(){},end(value){raw=value;}};
    await handler({method:'POST',url:'/api/creator-inbox?action=send',body:{to:bob,body:'How is your project going?'},headers:{authorization:'Alice',origin:'https://digivated.com','content-type':'application/json'}},res);
    return {status:res.statusCode,...JSON.parse(raw)};
  };
  assert.equal((await send()).status,201);
  assert.equal((await listNotifications(redis,bob)).items.length,0);
  await saveNotificationPreferences(redis,bob,{...defaultNotificationPreferences,enabled:true});
  assert.equal((await send()).status,201);
  const activity = await listNotifications(redis,bob);
  assert.equal(activity.items.length,1);
  assert.equal(activity.items[0].href,`/inbox?id=${alice}`);
  assert(!JSON.stringify(activity).includes('How is your project going?'));
});
