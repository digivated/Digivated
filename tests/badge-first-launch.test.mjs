import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSubmissionHandler } from '../server/submissions.mjs';
import { badgeSnippet } from '../server/launch-queue.mjs';

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

  // Badge missing: a clear problem, and nothing is saved.
  const missing = await call(handler, { ...input, reservedId: reserved.body.id, reservedToken: reserved.body.token, verifyBadge: true });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /Badge not found/);
  assert.equal(await redis(['EXISTS', `digivated:submission:${reserved.body.id}`]), 0);

  // Badge installed: saved under the reserved ID, already verified and scheduled.
  page = `<html><body><footer>${badgeSnippet(reserved.body.id)}</footer></body></html>`;
  const ok = await call(handler, { ...input, reservedId: reserved.body.id, reservedToken: reserved.body.token, verifyBadge: true });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.id, reserved.body.id);
  assert.ok(ok.body.launch.badgeVerifiedAt);
  const stored = JSON.parse(await redis(['GET', `digivated:submission:${reserved.body.id}`]));
  assert.equal(stored.status, 'pending');
  assert.ok(stored.launch.badgeVerifiedAt);

  // The same reserved ID cannot be used twice.
  assert.equal((await call(handler, { ...input, reservedId: reserved.body.id, reservedToken: reserved.body.token })).status, 409);
  await redis(['FLUSHDB']);
});

test('verifyBadge without a reserved ID is refused', { skip: !process.env.DIGIVATED_TEST_REDIS_PORT }, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis(13);
  const handler = makeSubmissionHandler({ env: { SUBMISSIONS_ORIGIN: origin }, redis, verifyAccount: async () => ({ id: '123e4567-e89b-42d3-a456-426614174098', email: 'maker@example.com' }), readSite: async () => ({ html: '' }) });
  assert.equal((await call(handler, { ...input, verifyBadge: true })).status, 400);
});
