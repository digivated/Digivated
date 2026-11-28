import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSubmissionHandler } from '../server/submissions.mjs';
import { makeLaunchesHandler } from '../server/launches.mjs';
import { badgeSnippet, checkPendingBadges, QUEUE } from '../server/launch-queue.mjs';

const origin = 'https://badge-first.test';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII=';
const input = { creator: 'Maker', email: 'maker@example.com', name: 'Badge First', url: 'https://example.com', description: 'A project that installs its badge before submitting.', category: 'Productivity', image: png, consent: true };
async function call(handler, body) {
  let out; const res = { statusCode: 200, setHeader() {}, end(v) { out = JSON.parse(v); } };
  await handler({ method: 'POST', url: '/api/submissions', body, headers: { origin, 'content-type': 'application/json', 'x-real-ip': 'fixture', authorization: 'Bearer fixture' } }, res);
  return { status: res.statusCode, body: out };
}

test('badge-first launch: reserve an ID, verify the badge, and save in one step', { skip: !process.env.DIGIVATED_TEST_REDIS_PORT }, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis(13);
  await redis(['FLUSHDB']);
  let page = '<html><body>No badge yet</body></html>';
  const handler = makeSubmissionHandler({ env: { SUBMISSIONS_ORIGIN: origin }, redis, verifyAccount: async () => ({ id: '123e4567-e89b-42d3-a456-426614174099', email: 'maker@example.com' }), readSite: async () => ({ html: page }) });

  const reserved = await call(handler, { action: 'reserve-badge' });
  assert.equal(reserved.status, 200);
  assert.match(reserved.body.id, /^[0-9a-f-]{36}$/);

  // A forged token is refused before anything is read or saved.
  assert.equal((await call(handler, { ...input, reservedId: reserved.body.id, reservedToken: 'x'.repeat(64), verifyBadge: true })).status, 400);

  // Badge installed: saved under the reserved ID, already verified and scheduled.
  page = `<html><body><footer>${badgeSnippet(reserved.body.id)}</footer></body></html>`;
  const ok = await call(handler, { ...input, reservedId: reserved.body.id, reservedToken: reserved.body.token });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.id, reserved.body.id);
  assert.ok(ok.body.launch.badgeVerifiedAt);
  const stored = JSON.parse(await redis(['GET', `digivated:submission:${reserved.body.id}`]));
  assert.equal(stored.status, 'pending');
  assert.ok(stored.launch.badgeVerifiedAt);

  let upcoming;
  const response = { statusCode: 0, setHeader() {}, end(body) { upcoming = JSON.parse(body); } };
  const list = makeLaunchesHandler({ redis });
  const request = { method: 'GET', url: '/api/launches?view=upcoming', headers: {} };
  await list(request, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(upcoming.items.map(project => project.id), [reserved.body.id]);
  assert.equal(upcoming.items[0].email, undefined);

  await redis(['ZREM', QUEUE, reserved.body.id]);
  await checkPendingBadges(redis, { readSite: async () => assert.fail('Verified project should not be scanned again'), mail: async () => assert.fail('No duplicate email expected') });
  await list(request, response);
  assert.deepEqual(upcoming.items.map(project => project.id), [reserved.body.id]);

  // The same reserved ID cannot be used twice.
  assert.equal((await call(handler, { ...input, reservedId: reserved.body.id, reservedToken: reserved.body.token })).status, 409);
  await redis(['FLUSHDB']);
  page = '<html><body>No badge yet</body></html>';
  const pending = await call(handler, { ...input, reservedId: reserved.body.id, reservedToken: reserved.body.token, verifyBadge: true });
  assert.equal(pending.status, 201);
  assert.equal(pending.body.id, reserved.body.id);
  assert.equal(pending.body.launch.badgeVerifiedAt, undefined);
  await list(request, response);
  assert.deepEqual(upcoming.items, []);
  await redis(['FLUSHDB']);
});

test('verifyBadge without a reserved ID is refused', { skip: !process.env.DIGIVATED_TEST_REDIS_PORT }, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis(13);
  const handler = makeSubmissionHandler({ env: { SUBMISSIONS_ORIGIN: origin }, redis, verifyAccount: async () => ({ id: '123e4567-e89b-42d3-a456-426614174098', email: 'maker@example.com' }), readSite: async () => ({ html: '' }) });
  assert.equal((await call(handler, { ...input, verifyBadge: true })).status, 400);
});

test('upcoming logos are served only for public, badge-verified projects in the launch queue', async () => {
  const now = Date.parse('2026-11-22T04:00:00Z');
  const scheduledAt = '2026-11-23T14:00:00.000Z';
  const record = { ...input, id: 'queued', status: 'pending', launch: { kind: 'free', scheduledAt, badgeVerifiedAt: new Date(now).toISOString() } };
  const records = new Map([
    ['queued', record],
    ['unverified', { ...record, id: 'unverified', launch: { ...record.launch, badgeVerifiedAt: null } }],
    ['unqueued', { ...record, id: 'unqueued' }],
    ['withdrawn', { ...record, id: 'withdrawn', consent: false }],
  ]);
  const queue = new Set(['queued', 'unverified', 'withdrawn']);
  const handler = makeLaunchesHandler({ now: () => now, redis: async ([command, key, id]) => {
    if (command === 'GET') return JSON.stringify(records.get(key.split(':').at(-1)) ?? null);
    if (command === 'ZSCORE') return queue.has(id) ? String(Date.parse(scheduledAt)) : null;
    if (command === 'ZRANGEBYSCORE') return [...queue];
    if (command === 'SCARD') return 0;
    assert.fail(`Unexpected Redis command: ${command}`);
  }});
  const get = async query => {
    const headers = {};
    let body;
    const res = { statusCode: 0, setHeader(name, value) { headers[name] = value; }, end(value) { body = value; } };
    await handler({ method: 'GET', url: '/api/launches?' + query, headers: {} }, res);
    return { body, headers, status: res.statusCode };
  };

  const list = JSON.parse((await get('view=upcoming')).body);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].email, undefined);
  assert.match(list.items[0].image, /^\/api\/launches\?image=queued&v=[a-f0-9]{12}$/);
  const image = await get('image=queued');
  assert.equal(image.status, 200);
  assert.equal(image.headers['Content-Type'], 'image/png');
  assert.equal(image.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(image.body, Buffer.from(png.split(',')[1], 'base64'));
  for (const id of ['unverified', 'unqueued', 'withdrawn', 'absent']) assert.equal((await get('image=' + id)).status, 404);
  queue.delete('queued');
  assert.equal((await get('image=queued')).status, 404);
});
