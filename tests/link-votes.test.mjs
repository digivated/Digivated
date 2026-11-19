import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLinkVoteHandler, LINK_VOTE, LINK_VOTES } from '../server/link-votes.mjs';
import { resourceGroups } from '../src/data/link-resources.mjs';

const origin = 'https://votes.test';
const firstId = resourceGroups[0].links[0].id;
async function invoke(handler, { method = 'POST', body = { id: firstId, action: 'up' }, headers = {} } = {}) {
  let out;
  const res = { statusCode: 200, setHeader() {}, end(value) { out = JSON.parse(value); } };
  await handler({ method, url: '/api/link-votes', body, headers: { origin, 'content-type': 'application/json', 'x-real-ip': '192.0.2.1', 'user-agent': 'Mozilla/5.0', ...headers } }, res);
  return { status: res.statusCode, body: out };
}

test('every resource link has a unique stable id', () => {
  const ids = resourceGroups.flatMap(group => group.links.map(link => link.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^l[a-z0-9]{1,8}$/.test(id)));
});

test('link votes validate the request before touching storage', async () => {
  const commands = [];
  const redis = async command => { commands.push(command); return command[0] === 'HGETALL' ? [firstId, '3', 'unknown', '9', 'lzero', '0'] : [1, 1]; };
  const handler = makeLinkVoteHandler({ redis, env: { SUBMISSIONS_ORIGIN: origin } });
  assert.equal((await invoke(handler, { method: 'PUT' })).status, 405);
  assert.equal((await invoke(handler, { headers: { origin: 'https://other.test' } })).status, 403);
  assert.equal((await invoke(handler, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await invoke(handler, { body: { id: 'nope', action: 'up' } })).status, 404);
  assert.equal((await invoke(handler, { body: { id: firstId, action: 'boost' } })).status, 400);
  assert.equal((await invoke(handler, { headers: { 'user-agent': 'Googlebot' } })).status, 403);
  assert.equal(commands.length, 0);
  assert.deepEqual((await invoke(handler)).body, { count: 1, voted: true });
  assert.equal(commands[0][0], 'EVAL');
  assert.equal(commands[0][4], LINK_VOTES);
  assert.deepEqual((await invoke(handler, { method: 'GET' })).body, { counts: { [firstId]: 3 } });
  const limited = makeLinkVoteHandler({ redis: async () => [-1, 0], env: { SUBMISSIONS_ORIGIN: origin } });
  assert.equal((await invoke(limited)).status, 429);
  const offline = makeLinkVoteHandler({ redis: async () => { throw Error('offline'); }, env: { SUBMISSIONS_ORIGIN: origin } });
  assert.equal((await invoke(offline)).status, 503);
});

test('the vote script counts one vote per visitor and never goes negative', { skip: !process.env.DIGIVATED_TEST_REDIS_PORT }, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis();
  await redis(['FLUSHDB']);
  const run = (action, visitor = 'a', limit = 120) => redis(['EVAL', LINK_VOTE, 3, `v:${visitor}`, LINK_VOTES, `lim:${visitor}`, action, firstId, limit]);
  assert.deepEqual(await run('up'), [1, 1]);
  assert.deepEqual(await run('up'), [1, 1]);
  assert.deepEqual(await run('up', 'b'), [2, 1]);
  assert.deepEqual(await run('down'), [1, 0]);
  assert.deepEqual(await run('down'), [1, 0]);
  assert.deepEqual(await run('up', 'c', 0), [-1, 0]);
  await redis(['FLUSHDB']);
});
