import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testRedis } from './helpers/redis.mjs';
import { deleteAccount, DELETED_NAME } from '../server/account-deletion.mjs';
import { accountIndex, makeProjectAccountHandler } from '../server/project-account.mjs';

const live = !!process.env.DIGIVATED_TEST_REDIS_PORT;
const secret = 'test-only';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const account = { id: A, email: 'maker@example.com' };
const env = {
  COMMUNITY_SUPABASE_URL: 'https://fixture.supabase.co', COMMUNITY_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  COMMUNITY_SUPABASE_SECRET_KEY: 'sb_secret_fixture', SUBMISSIONS_REDIS_REST_TOKEN: secret,
};

function request({ origin = 'https://digivated.com', body = { confirm: 'DELETE' }, type = 'application/json' } = {}) {
  return { method: 'POST', url: '/api/project-account?action=delete-account', headers: { origin, 'content-type': type, authorization: 'Bearer fixture-token-000000000000' }, body };
}
function response() {
  const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = text; } };
  return res;
}

test('delete-account refuses cross-site requests, a missing DELETE, and signed-out callers', async () => {
  let calls = 0;
  const handler = makeProjectAccountHandler({ env, redis: async () => null, adminClient: {}, verifyAccount: async () => account, deleteAccount: async () => { calls++; return {}; } });
  for (const [req, status] of [
    [request({ origin: 'https://evil.example' }), 403],
    [request({ type: 'text/plain' }), 403],
    [request({ body: { confirm: 'delete' } }), 400],
    [request({ body: {} }), 400],
  ]) {
    const res = response(); await handler(req, res);
    assert.equal(res.statusCode, status);
  }
  const signedOut = makeProjectAccountHandler({ env, redis: async () => null, adminClient: {}, verifyAccount: async () => null, deleteAccount: async () => { calls++; return {}; } });
  const res = response(); await signedOut(request(), res);
  assert.equal(res.statusCode, 401);
  assert.equal(calls, 0, 'nothing is deleted unless every check passes');
});

test('delete-account deletes only the verified caller and reports failures without details', async () => {
  const seen = [];
  const ok = makeProjectAccountHandler({ env, redis: async () => null, adminClient: { auth: { admin: { deleteUser: async () => ({}) } } }, verifyAccount: async () => account, deleteAccount: async input => { seen.push(input.account.id); return { archived: 1, anonymized: 2 }; } });
  let res = response(); await ok(request(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { deleted: true, archived: 1, anonymized: 2 });
  assert.deepEqual(seen, [A]);
  const failing = makeProjectAccountHandler({ env, redis: async () => null, adminClient: {}, verifyAccount: async () => account, deleteAccount: async () => { throw new Error('ECONNRESET secret detail'); } });
  res = response(); await failing(request(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.body).error, 'Your account could not be deleted. Please try again.');
});

test('deleting an account clears its data, archives its launches, anonymizes its words, and leaves others alone', { skip: !live }, async () => {
  const redis = testRedis(13);
  await redis(['FLUSHDB']);
  const index = accountIndex(account.email, secret);
  const submission = (id, owner, email, status, extra = {}) => ({ id, accountId: owner, email, status, name: id, revision: 3, tags: [], date: '2026-11-10', consent: true, ...extra });
  const rows = [
    submission('s-live', A, account.email, 'approved'),
    submission('s-free', A, account.email, 'pending', { launch: { kind: 'free', badgeVerifiedAt: '2026-11-11', scheduledTimestamp: 1795000000000 } }),
    submission('s-old', A, account.email, 'rejected'),
    submission('s-other', B, 'other@example.com', 'approved'),
  ];
  for (const row of rows) {
    await redis(['SET', `digivated:submission:${row.id}`, JSON.stringify(row)]);
    await redis(['ZADD', 'digivated:submissions', 1, row.id]);
    if (row.status === 'approved') { await redis(['SET', `digivated:public:submission:${row.id}`, '{}']); await redis(['ZADD', 'digivated:public:submissions', 1, row.id]); }
    if (row.accountId === A) await redis(['ZADD', index, 1, row.id]);
  }
  await redis(['ZADD', 'digivated:launch:free', 1795000000000, 's-free']);
  await redis(['SET', `${index}:legacy-scanned`, '1']);
  await redis(['SET', `digivated:creator:profile:${A}`, '{"name":"Maker"}']);
  await redis(['SET', `digivated:creator:logo:${A}`, 'png']);
  await redis(['ZADD', 'digivated:creator:public', 1, A, 2, B]);
  await redis(['SADD', `digivated:creator:following:${A}`, B]); await redis(['SADD', `digivated:creator:followers:${B}`, A]);
  await redis(['SADD', `digivated:creator:following:${B}`, A]); await redis(['SADD', `digivated:creator:followers:${A}`, B]);
  await redis(['SADD', `digivated:launch:watching:${A}`, 's-up']); await redis(['SADD', 'digivated:launch:watchers:s-up', A, B]);
  await redis(['ZADD', `digivated:notifications:index:${A}`, 1, 'n1']); await redis(['SET', 'digivated:notifications:item:n1', '{}']);
  await redis(['SET', `digivated:notifications:unread:${A}`, '1']); await redis(['SET', `digivated:notifications:preferences:${A}`, '{}']);
  await redis(['SET', `digivated:weekly:preference:${A}`, '{}']); await redis(['ZADD', 'digivated:weekly:members', 0, A, 0, B]);
  await redis(['SET', `digivated:points:total:${A}`, '12']); await redis(['ZADD', `digivated:points:ledger:${A}`, 1, 'p']);
  await redis(['SET', 'digivated:card:comment:c-a', JSON.stringify({ id: 'c-a', accountId: A, name: 'Maker', avatar: '/a.png', profileUrl: '/creator?id=a', body: 'Nice', maker: true })]);
  await redis(['SET', 'digivated:card:comment:c-b', JSON.stringify({ id: 'c-b', accountId: B, name: 'Other', body: 'Hi' })]);
  await redis(['ZADD', 'digivated:card:comments:all', 1, 'c-a', 2, 'c-b']);
  await redis(['SET', 'digivated:thread:t-a', JSON.stringify({ id: 't-a', authorId: A, authorName: 'Maker', authorAvatar: '/a.png', title: 'Hello' })]);
  await redis(['ZADD', 'digivated:threads:all', 1, 't-a']);

  const deleted = [];
  const result = await deleteAccount({ redis, account, secret, deleteUser: async id => { deleted.push(id); return {}; } });
  assert.deepEqual(result, { archived: 2, anonymized: 2 });
  assert.deepEqual(deleted, [A], 'the sign-in is removed last, once');

  const read = async id => JSON.parse(await redis(['GET', `digivated:submission:${id}`]));
  const liveRow = await read('s-live');
  assert.equal(liveRow.status, 'archived');
  assert.equal(liveRow.revision, 4);
  assert.deepEqual(liveRow.tags, [], 'record JSON keeps its exact shape');
  assert.equal(await redis(['GET', 'digivated:public:submission:s-live']), null);
  assert.equal(await redis(['ZSCORE', 'digivated:public:submissions', 's-live']), null);
  assert.equal((await read('s-free')).status, 'archived');
  assert.equal(await redis(['ZSCORE', 'digivated:launch:free', 's-free']), null, 'scheduled free launch leaves the queue');
  assert.equal((await read('s-old')).status, 'rejected', 'already-closed records are left as they were');
  assert.equal((await read('s-other')).status, 'approved', 'other people’s launches are untouched');
  assert.notEqual(await redis(['ZSCORE', 'digivated:public:submissions', 's-other']), null);

  for (const key of [`digivated:creator:profile:${A}`, `digivated:creator:logo:${A}`, `digivated:notifications:preferences:${A}`, `digivated:notifications:unread:${A}`, 'digivated:notifications:item:n1', `digivated:weekly:preference:${A}`, `digivated:points:total:${A}`, `${index}:legacy-scanned`]) {
    assert.equal(await redis(['GET', key]), null, key);
  }
  for (const key of [index, `digivated:notifications:index:${A}`, `digivated:points:ledger:${A}`]) assert.equal(await redis(['ZCARD', key]), 0, key);
  assert.deepEqual(await redis(['ZRANGE', 'digivated:creator:public', 0, -1]), [B]);
  assert.deepEqual(await redis(['ZRANGE', 'digivated:weekly:members', 0, -1]), [B]);
  assert.deepEqual(await redis(['SMEMBERS', 'digivated:launch:watchers:s-up']), [B]);
  assert.deepEqual(await redis(['SMEMBERS', `digivated:creator:followers:${B}`]), []);
  assert.deepEqual(await redis(['SMEMBERS', `digivated:creator:following:${B}`]), []);
  assert.equal(await redis(['SCARD', `digivated:creator:following:${A}`]), 0);

  const mine = JSON.parse(await redis(['GET', 'digivated:card:comment:c-a']));
  assert.equal(mine.name, DELETED_NAME); assert.equal(mine.avatar, ''); assert.equal(mine.profileUrl, ''); assert.equal(mine.accountId, undefined); assert.equal(mine.body, 'Nice');
  assert.equal(JSON.parse(await redis(['GET', 'digivated:card:comment:c-b'])).name, 'Other');
  const thread = JSON.parse(await redis(['GET', 'digivated:thread:t-a']));
  assert.equal(thread.authorName, DELETED_NAME); assert.equal(thread.authorId, ''); assert.equal(thread.title, 'Hello');

  // Safe to repeat: a second attempt (for example after a network error) changes nothing else.
  const again = await deleteAccount({ redis, account, secret, deleteUser: async () => ({ error: { message: 'User not found' } }) });
  assert.deepEqual(again, { archived: 0, anonymized: 0 });
  assert.equal((await read('s-other')).status, 'approved');
  await redis(['FLUSHDB']);
});

test('if removing the sign-in fails, the caller is told to try again', { skip: !live }, async () => {
  const redis = testRedis(13);
  await redis(['FLUSHDB']);
  await assert.rejects(deleteAccount({ redis, account, secret, deleteUser: async () => ({ error: { message: 'Database error deleting user' } }) }), /could not be deleted/);
  await redis(['FLUSHDB']);
});
