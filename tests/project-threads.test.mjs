import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProjectThreadHandler, POST, LIKE } from '../server/project-threads.mjs';
import { moderateComment } from '../server/card-interactions.mjs';

const origin = 'https://digivated.com';
function fixtureRedis() {
  const values = new Map(), sorted = new Map();
  const set = key => { if (!sorted.has(key)) sorted.set(key, new Map()); return sorted.get(key); };
  const redis = async ([command, ...args]) => {
    if (command === 'GET') return values.get(args[0]) ?? null;
    if (command === 'SET') { values.set(args[0], args[1]); return 'OK'; }
    if (command === 'MGET') return args.map(key => values.get(key) ?? null);
    if (command === 'ZREVRANGE') return [...set(args[0])].sort((a, b) => b[1] - a[1]).slice(Number(args[1]), Number(args[2]) + 1).map(([m]) => m);
    if (command === 'EVAL') {
      const [script, n, ...rest] = args, keys = rest.slice(0, Number(n)), argv = rest.slice(Number(n));
      if (script === POST) { const c = Number(values.get(keys[0]) || 0) + 1; values.set(keys[0], String(c)); if (c > Number(argv[3])) return 0; values.set(keys[1], argv[0]); set(keys[2]).set(argv[2], Number(argv[1])); set(keys[3]).set(argv[2], Number(argv[1])); return 1; }
      if (script === LIKE) { if (values.has(keys[0])) { values.delete(keys[0]); const c = Math.max(0, Number(values.get(keys[1]) || 0) - 1); values.set(keys[1], String(c)); return [0, c]; } values.set(keys[0], '1'); const c = Number(values.get(keys[1]) || 0) + 1; values.set(keys[1], String(c)); return [1, c]; }
      // card-interactions MODERATE
      const record = JSON.parse(values.get(keys[0])); record.status = argv[0]; values.set(keys[0], JSON.stringify(record)); if (argv[0] === 'approved') set(keys[1]).set(record.id, Number(argv[1])); else set(keys[1]).delete(record.id); return 1;
    }
    if (['LPUSH', 'LTRIM', 'HINCRBY', 'INCRBY', 'ZADD', 'EXPIRE', 'HGET', 'HSET'].includes(command)) return 0;
    throw Error(`Unexpected Redis command ${command}`);
  };
  return { redis, values };
}
const project = { id: 'project-one', name: 'Original', creator: 'Ana', status: 'approved', consent: true, image: 'image', url: 'https://fixture.test/', accountId: 'owner-account' };
async function call(handler, method, body, headers = {}, url = '/api/project-threads') {
  let data; const res = { statusCode: 200, setHeader() {}, end(value) { data = JSON.parse(value); } };
  await handler({ url, method, headers: { origin, 'content-type': 'application/json', 'x-real-ip': '192.0.2.10', 'user-agent': 'Mozilla/5.0', ...headers }, body }, res);
  return { status: res.statusCode, data };
}

test('threads support comments, one level of replies, maker badge and comment upvotes', async () => {
  const { redis, values } = fixtureRedis();
  values.set('digivated:submission:project-one', JSON.stringify(project));
  let clock = 1_800_000_000_000;
  const handler = makeProjectThreadHandler({ redis, env: { SUBMISSIONS_ORIGIN: origin }, now: () => clock++, verifyAccount: async req => req.headers.authorization === 'Bearer owner' ? { id: 'owner-account', email: 'o@fixture.test' } : null });

  assert.equal((await call(handler, 'GET', undefined, {}, '/api/project-threads?id=missing')).status, 404);
  assert.equal((await call(handler, 'POST', { action: 'post', id: 'project-one', body: 'Hi' }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call(handler, 'POST', { action: 'post', id: 'project-one', body: 'x' })).status, 400);

  const root = (await call(handler, 'POST', { action: 'post', id: 'project-one', body: 'Love the onboarding.', name: 'Sam' })).data.comment;
  assert.equal(root.name, 'Sam'); assert.equal(root.parentId, undefined);
  const makerReply = (await call(handler, 'POST', { action: 'post', id: 'project-one', parentId: root.id, body: 'Thanks Sam!' }, { authorization: 'Bearer owner' })).data.comment;
  assert.deepEqual([makerReply.parentId, makerReply.replyTo, makerReply.maker, makerReply.name], [root.id, 'Sam', true, 'Ana']);
  const nested = (await call(handler, 'POST', { action: 'post', id: 'project-one', parentId: makerReply.id, body: 'Glad to help' })).data.comment;
  assert.equal(nested.parentId, root.id, 'replies to replies stay in the same thread');
  assert.equal(nested.replyTo, 'Ana');
  assert.equal((await call(handler, 'POST', { action: 'post', id: 'project-one', parentId: 'missing', body: 'Hello' })).status, 404);

  assert.deepEqual((await call(handler, 'POST', { action: 'like', id: 'project-one', commentId: root.id })).data, { liked: true, likes: 1 });
  assert.deepEqual((await call(handler, 'POST', { action: 'like', id: 'project-one', commentId: root.id }, { 'x-real-ip': '192.0.2.11' })).data, { liked: true, likes: 2 });
  assert.deepEqual((await call(handler, 'POST', { action: 'like', id: 'project-one', commentId: root.id })).data, { liked: false, likes: 1 });

  const thread = (await call(handler, 'GET', undefined, { 'x-real-ip': '192.0.2.11' }, '/api/project-threads?id=project-one')).data;
  assert.equal(thread.count, 3);
  const rootRow = thread.comments.find(c => c.id === root.id);
  assert.deepEqual([rootRow.likes, rootRow.liked], [1, true]);
  assert.equal(JSON.stringify(thread).includes('accountId'), false, 'account ids never leave the server');

  // Moderation removes a top-level comment and hides its replies.
  assert.equal(await moderateComment(redis, root.id, 'rejected'), 1);
  assert.equal((await call(handler, 'GET', undefined, {}, '/api/project-threads?id=project-one')).data.count, 0);
});

test('threads enforce a daily posting limit per visitor and project', async () => {
  const { redis, values } = fixtureRedis();
  values.set('digivated:submission:project-one', JSON.stringify(project));
  const handler = makeProjectThreadHandler({ redis, env: { SUBMISSIONS_ORIGIN: origin } });
  for (let i = 0; i < 10; i++) assert.equal((await call(handler, 'POST', { action: 'post', id: 'project-one', body: 'Comment ' + i })).status, 201);
  assert.equal((await call(handler, 'POST', { action: 'post', id: 'project-one', body: 'One more' })).status, 429);
});
