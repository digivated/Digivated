import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMemberStatusHandler } from '../server/member-status.mjs';
import { FOUNDING_COOKIE } from '../server/founding-access.mjs';

async function call(handler, cookie = '', method = 'GET') {
  const headers = {};
  let body;
  const res = { statusCode: 0, setHeader: (key, value) => { headers[key] = value; }, end: value => { body = JSON.parse(value); } };
  await handler({ method, headers: { cookie } }, res);
  return { status: res.statusCode, headers, body };
}

test('membership status returns only a boolean and does not cache it', async () => {
  let checks = 0;
  const handler = makeMemberStatusHandler({ readMember: async () => { checks++; return { saleId: 'private' }; } });
  const anonymous = await call(handler);
  assert.deepEqual(anonymous.body, { member: false });
  assert.equal(checks, 0);
  const verified = await call(handler, `${FOUNDING_COOKIE}=fixture`);
  assert.deepEqual(verified.body, { member: true });
  assert.equal(verified.headers['Cache-Control'], 'private, no-store');
  assert.equal(verified.headers.Vary, 'Cookie');
  assert.equal(checks, 1);
});
