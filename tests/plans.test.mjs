// Upload plans against a real local Redis: Free 1 project, Starter ($3) 3, Membership unlimited.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testRedis } from './helpers/redis.mjs';
import { makeSubmissionHandler } from '../server/submissions.mjs';
import { saveRecord, SAVE_EDIT } from '../server/admin-store.mjs';
import { PLANS, planLimit } from '../src/lib/plans.mjs';

const live = Boolean(process.env.DIGIVATED_TEST_REDIS_PORT);
const starterId = 'starter-product-id';
const env = {
  SUBMISSIONS_ORIGIN: 'https://digivated.com', SUBMISSIONS_REDIS_REST_TOKEN: 'test-only',
  INSTANT_LAUNCH_ENABLED: 'true', INSTANT_LAUNCH_PRICE_CENTS: '300',
  INSTANT_LAUNCH_CHECKOUT_URL: 'https://digivated.gumroad.com/l/instant-launch', FOUNDING_GUMROAD_ACCESS_TOKEN: 'gumroad-fixture-token-123456',
};
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII=';
const project = (email, n) => ({ creator: 'Maker', email, name: `Project ${n}`, url: `https://example.com/${n}`, description: 'A useful independent project for plan testing.', category: 'Apps', consent: true, image });

// Gumroad: the Starter product exists; `buyers` decides which emails bought it.
function gumroad(buyers) {
  return async url => {
    const href = new URL(String(url));
    if (href.pathname === '/v2/products') return Response.json({ success: true, products: [{ id: starterId, custom_permalink: 'instant-launch', published: true, price: 300, currency: 'usd' }] });
    const sale = email => ({ id: `sale-${email.replace(/\W/g, '')}`, email, purchase_email: email, product_id: starterId, price: 300, currency: 'usd', created_at: '2026-11-01T00:00:00Z', refunded: false, partially_refunded: false, chargedback: false, access_revoked: false, disputed: false, paid: true, test: false });
    if (href.pathname.startsWith('/v2/sales/')) { const email = [...buyers].find(e => href.pathname.endsWith(e.replace(/\W/g, ''))); return Response.json({ success: true, sale: sale(email) }); }
    const email = href.searchParams.get('email');
    return Response.json({ success: true, sales: buyers.has(email) ? [sale(email)] : [] });
  };
}
async function send(redis, buyers, account, body) {
  let raw = '';
  const res = { statusCode: 0, setHeader() {}, end: value => { raw = value; } };
  await makeSubmissionHandler({ env, redis, fetcher: gumroad(buyers), verifyAccount: async () => account })({
    method: 'POST', headers: { origin: env.SUBMISSIONS_ORIGIN, authorization: 'Bearer fixture', 'content-type': 'application/json', 'x-real-ip': '127.0.0.1' }, body,
  }, res);
  return { status: res.statusCode, data: JSON.parse(raw) };
}
const flush = redis => redis(['FLUSHDB']);

test('plan limits are 1, 3 and unlimited', () => {
  assert.equal(planLimit('free'), 1); assert.equal(planLimit('starter'), 3); assert.equal(planLimit('member'), 0);
  assert.equal(planLimit('unknown'), 1); assert.equal(PLANS.starter.priceUSD, 3); assert.equal(PLANS.member.priceUSD, 5);
});

test('free accounts get one project; archiving it frees the slot', { skip: !live }, async () => {
  const redis = testRedis(12); await flush(redis);
  const account = { id: 'free-account', email: 'free@example.com' };
  const first = await send(redis, new Set(), account, project(account.email, 1));
  assert.equal(first.status, 201); assert.equal(first.data.status, 'pending'); assert.equal(first.data.plan, 'free');
  const second = await send(redis, new Set(), account, project(account.email, 2));
  assert.equal(second.status, 409); assert.match(second.data.error, /1 project/);
  const plan = await send(redis, new Set(), account, { action: 'plan' });
  assert.deepEqual([plan.data.plan, plan.data.limit, plan.data.used, plan.data.remaining], ['free', 1, 1, 0]);
  assert.equal(plan.data.offers.starter.price, 300);
  // Paid options are refused on the free plan, and nothing is saved.
  const instant = await send(redis, new Set(), account, { ...project(account.email, 3), submissionType: 'instant' });
  assert.equal(instant.status, 403);
  const record = JSON.parse(await redis(['GET', `digivated:submission:${first.data.id}`]));
  await saveRecord(redis, 'submission', { ...record, status: 'archived', revision: record.revision || 0, socialUrl: '' });
  const again = await send(redis, new Set(), account, project(account.email, 4));
  assert.equal(again.status, 201);
});

test('Starter publishes 3 projects instantly, then asks for Membership', { skip: !live }, async () => {
  const redis = testRedis(12); await flush(redis);
  const account = { id: 'starter-account', email: 'starter@example.com' };
  const buyers = new Set([account.email]);
  for (const n of [1, 2, 3]) {
    const saved = await send(redis, buyers, account, { ...project(account.email, n), submissionType: n === 1 ? 'instant' : 'directory' });
    assert.equal(saved.status, 201); assert.equal(saved.data.status, 'approved'); assert.equal(saved.data.plan, 'starter');
    assert.ok(saved.data.pageUrl);
    assert.ok(await redis(['GET', `digivated:public:submission:${saved.data.id}`]));
  }
  const fourth = await send(redis, buyers, account, project(account.email, 4));
  assert.equal(fourth.status, 409); assert.match(fourth.data.error, /3 projects/);
  // The same Gumroad sale cannot upgrade a second account with the same email.
  const other = { id: 'someone-else', email: account.email };
  const otherPlan = await send(redis, buyers, other, { action: 'plan', fresh: true });
  assert.equal(otherPlan.data.plan, 'free');
});

test('a live-project check counts the account plan when an admin publishes', { skip: !live }, async () => {
  const redis = testRedis(12); await flush(redis);
  const save = (record, revision = 0) => redis(['EVAL', SAVE_EDIT, 4, `digivated:submission:${record.id}`, 'digivated:submissions', `digivated:public:submission:${record.id}`, 'digivated:public:submissions', revision, JSON.stringify({ ...record, revision: revision + 1 }), '{"id":"x"}', Date.now(), 'submission']);
  const base = { accountId: 'admin-check', email: 'a@example.com', status: 'approved' };
  assert.equal(await save({ ...base, id: 'one' }), 1);
  assert.equal(await save({ ...base, id: 'two' }), -2); // free: 1 live
  await redis(['SET', 'digivated:account-plan:admin-check', JSON.stringify({ plan: 'starter', checkedAt: Date.now() })]);
  assert.equal(await save({ ...base, id: 'two' }), 1);
  assert.equal(await save({ ...base, id: 'three' }), 1);
  assert.equal(await save({ ...base, id: 'four' }), -2); // starter: 3 live
  assert.equal(await save({ ...base, id: 'four', plan: 'member' }), 1); // member: unlimited
});
