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
