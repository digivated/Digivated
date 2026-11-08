import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSiteActivityHandler, HISTORICAL_VISITS } from '../server/site-activity.mjs';
import { testRedis } from './helpers/redis.mjs';

const origin = 'https://digivated.com';
const view = 'e46682d0-9eab-4c5e-9881-6ea3059f82ea';
async function invoke(handler, { method = 'POST', id = view, headers = {} } = {}) {
  let body;
  const response = { statusCode: 200, setHeader() {}, end(value) { body = JSON.parse(value); } };
  await handler({ method, url: `/api/site-activity${id ? `?view=${id}` : ''}`, headers: { origin, 'x-real-ip': '192.0.2.1', 'user-agent': 'Mozilla/5.0', ...headers } }, response);
  return { status: response.statusCode, body };
}
test('activity rejects invalid writes and fails without fabricated counts', async () => {
  const handler = makeSiteActivityHandler({ redis: async () => { throw Error('offline'); } });
  assert.equal((await invoke(handler, { method: 'DELETE' })).status, 405);
  assert.equal((await invoke(handler, { headers: { origin: 'https://other.test' } })).status, 403);
  assert.equal((await invoke(handler, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await invoke(handler, { id: 'bad' })).status, 400);
  assert.equal((await invoke(handler, { headers: { 'x-real-ip': '' } })).status, 503);
  assert.deepEqual((await invoke(handler)).body, { error: 'Activity temporarily unavailable.' });
});
test('real Redis: concurrent retries, multiple tabs, expiry, history and bots', { skip: !process.env.DIGIVATED_TEST_REDIS_PORT }, async () => {
  const redis = testRedis(13);
  await redis(['FLUSHDB']);
  try {
    const handler = makeSiteActivityHandler({ redis });
    const results = await Promise.all(Array.from({ length: 10 }, () => invoke(handler)));
    assert.ok(results.every(r => r.body.visits === HISTORICAL_VISITS + 1 && r.body.online === 1));
    assert.equal((await invoke(handler, { id: '' })).body.visits, HISTORICAL_VISITS + 1);
    const tab = await invoke(handler, { id: 'e46682d0-9eab-4c5e-9881-6ea3059f82eb' });
    assert.equal(tab.body.visits, HISTORICAL_VISITS + 2);
    assert.equal(tab.body.online, 1);
    const other = await invoke(handler, { headers: { 'x-real-ip': '192.0.2.2' } });
    assert.equal(other.body.online, 2);
    const bot = await invoke(handler, { headers: { 'user-agent': 'Googlebot' } });
    assert.equal(bot.body.visits, HISTORICAL_VISITS + 3);
    assert.equal(bot.body.online, 2);
    const members = await redis(['ZRANGE', 'digivated:site:online', 0, -1]);
    for (const member of members) await redis(['ZADD', 'digivated:site:online', 1, member]);
    const expired = await invoke(handler, { method: 'GET', id: '' });
    assert.equal(expired.body.online, 0);
    assert.equal(expired.body.visits, HISTORICAL_VISITS + 3);
    const keys = await redis(['KEYS', 'digivated:site:*']);
    assert.ok(keys.every(k => !k.includes('192.0.2') && !k.includes('Mozilla')));
    assert.equal(await redis(['TTL', 'digivated:site:visits']), -1);
  } finally { await redis(['FLUSHDB']); }
});
