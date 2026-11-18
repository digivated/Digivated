import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFoundingEmail } from '../server/founding-access.mjs';

const email = 'maker@example.com';
const sale = createdAt => ({
  id: 'sale_fixture_123', product_id: 'prod_fixture', currency: 'usd', price: 300, email, purchase_email: email,
  partially_refunded: false, chargedback: false, access_revoked: false, refunded: false, disputed: false,
  paid: true, test: false, created_at: createdAt
});
const fetcherFor = item => async url => {
  const path = new URL(url).pathname;
  const body = path.endsWith('/sales') ? { success: true, sales: [item] } : { success: true, sale: item };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const cfg = extra => ({ productId: 'prod_fixture', gumroadToken: 'token', minimumPriceUSD: 300, allowTest: false, ...extra });

test('instant checkout accepts a purchase made after the project was saved', async () => {
  const saved = Date.parse('2026-11-18T04:45:00Z');
  const result = await verifyFoundingEmail(email, cfg({ notBefore: saved - 120000 }), fetcherFor(sale('2026-11-18T04:46:10Z')));
  assert.equal(result.saleId, 'sale_fixture_123');
});

test('instant checkout ignores older purchases for unverified password accounts', async () => {
  const saved = Date.parse('2026-11-18T04:45:00Z');
  await assert.rejects(verifyFoundingEmail(email, cfg({ notBefore: saved - 120000 }), fetcherFor(sale('2026-11-10T10:00:00Z'))), { status: 401 });
  await assert.rejects(verifyFoundingEmail(email, cfg({ notBefore: saved }), fetcherFor(sale(undefined))), { status: 401 });
});

test('without a time limit any eligible purchase still counts', async () => {
  const result = await verifyFoundingEmail(email, cfg({}), fetcherFor(sale('2026-11-10T10:00:00Z')));
  assert.equal(result.saleId, 'sale_fixture_123');
});

import { makeSubmissionHandler } from '../server/submissions.mjs';
const cancel = async (record, account = { id: 'owner', email }) => {
  const calls = [];
  const redis = async command => { calls.push(command); if (command[0] === 'GET') return record ? JSON.stringify(record) : null; if (command[0] === 'EVAL') return 1; return null; };
  const req = { method: 'POST', headers: { origin: 'https://digivated.com', 'content-type': 'application/json', authorization: 'Bearer fixture' }, body: { action: 'cancel-instant', id: '11111111-2222-4333-8444-555555555555' } };
  let data; const res = { setHeader() {}, end: value => { data = JSON.parse(value); } };
  await makeSubmissionHandler({ env: {}, redis, verifyAccount: async () => account })(req, res);
  return { status: res.statusCode, data, calls };
};
const unpaid = { id: '11111111-2222-4333-8444-555555555555', accountId: 'owner', email, status: 'pending', date: '2026-11-18T05:00:00Z', promotion: { requested: true, included: 'instant-launch', verified: false } };

test('makers can back out of an unpaid instant checkout', async () => {
  const result = await cancel(unpaid);
  assert.equal(result.status, 200);
  assert.equal(result.data.cancelled, true);
  const evalCall = result.calls.find(command => command[0] === 'EVAL');
  assert.ok(evalCall, 'removes the unpaid draft');
  assert.ok(evalCall.includes('digivated:submissions'));
});

test('cancelling never touches paid, live or someone else’s projects', async () => {
  assert.equal((await cancel({ ...unpaid, promotion: { ...unpaid.promotion, verified: true }, status: 'approved' })).status, 409);
  assert.equal((await cancel({ ...unpaid, accountId: 'someone-else' })).status, 404);
  assert.equal((await cancel({ ...unpaid, promotion: { requested: true, included: 'founding-membership' } })).status, 404);
  const gone = await cancel(null);
  assert.equal(gone.status, 200);
  assert.equal(gone.calls.some(command => command[0] === 'EVAL'), false);
});
