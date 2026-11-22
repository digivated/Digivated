import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { AccessError, COOKIE, PRODUCT_ID, verifyLicense } from '../server/access.mjs';
import { FOUNDING_COOKIE, foundingConfig, sealFoundingSession } from '../server/founding-access.mjs';
import { makeHandler } from '../server/handler.mjs';
import { makeSubmissionHandler, validateSubmission } from '../server/submissions.mjs';
import { validateEdit, projectPublic } from '../server/admin-store.mjs';
import { launchPublic } from '../server/launch-pages.mjs';
import { publicRecord } from '../server/community-publication.mjs';

const packetLicense = 'A1B2C3D4-E5F60718-9ABCDEF0-1234ABCD';
const foundingLicense = 'B1B2C3D4-E5F60718-9ABCDEF0-1234ABCD';
const otherLicense = 'C1B2C3D4-E5F60718-9ABCDEF0-1234ABCD';
const productId = 'founding-product-id';
const saleId = 'sale-fixture';
const otherSaleId = 'other-sale1';
const emailSaleId = 'B28UKN-dvxYabdavG97Y-Q==';
const edition = { version: 1, prompts: [{ id: 2, prompt: 'PAID_FIXTURE' }], workflows: [], checklists: [] };
const accessEnv = {
  ACCESS_ENABLED: 'true',
  APP_ORIGIN: 'https://example.test',
  GUMROAD_PRODUCT_ID: PRODUCT_ID,
  SESSION_SECRET: randomBytes(32).toString('hex'),
  EDITION_KEY: randomBytes(32).toString('hex'),
  VERCEL_ENV: 'production',
  FOUNDING_ACCESS_ENABLED: 'true',
  FOUNDING_GUMROAD_PRODUCT_ID: productId,
  FOUNDING_SESSION_SECRET: randomBytes(32).toString('hex'),
  FOUNDING_GUMROAD_ACCESS_TOKEN: 'seller-token-fixture-value',
};
const packetPurchase = { product_id: PRODUCT_ID, sale_id: 'packet-sale', refunded: false, chargebacked: false, disputed: false, dispute_won: false, test: false };
const foundingPurchase = (id, key) => ({ product_id: productId, sale_id: id, license_key: key, refunded: false, chargebacked: false, disputed: false, dispute_won: false, test: false });
const project = { creator: 'Creator', email: 'checkout@example.com', name: 'Project', url: 'https://example.com', description: 'A useful independent project for testing.', category: 'Apps', consent: true,image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII=' };

function purchaseResponse(purchase, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, purchase }), { status });
}

function packetFetcher() {
  return async (url, options) => {
    assert.equal(url, 'https://api.gumroad.com/v2/licenses/verify');
    assert.equal(options.body.get('product_id'), PRODUCT_ID);
    const key = options.body.get('license_key');
    if (key !== packetLicense) return new Response('{}', { status: 404 });
    return purchaseResponse(packetPurchase);
  };
}

function foundingFetcher(state = {}) {
  return async (url, options) => {
    state.calls = (state.calls || 0) + 1;
    const href = String(url);
    if (href.endsWith('/licenses/verify')) {
      assert.equal(options.body.get('product_id'), productId);
      assert.notEqual(options.body.get('product_id'), PRODUCT_ID);
      const key = options.body.get('license_key');
      if (state.outage) return new Response('{}', { status: 503 });
      if (key === foundingLicense) return purchaseResponse(state.purchase || foundingPurchase(saleId, key));
      if (key === otherLicense) return purchaseResponse(foundingPurchase(otherSaleId, key));
      return new Response('{}', { status: 404 });
    }
    const record = {
      id: emailSaleId, email: 'member@example.test', purchase_email: 'member@example.test', product_id: productId,
      refunded: false, partially_refunded: false, chargedback: false, access_revoked: false, disputed: false, dispute_won: false,
      paid: true, test: false, subscription_id: null, license_disabled: false,
    };
    if (href.includes('/v2/sales/')) return Response.json({ success: true, sale: record });
    return Response.json({ success: true, sales: [record] });
  };
}

async function invoke(action, { env = accessEnv, body, headers = {}, url, fetcher, verify, foundingState } = {}) {
  const responseHeaders = {};
  let raw = '';
  const res = { statusCode: 0, setHeader: (key, value) => { responseHeaders[key.toLowerCase()] = value; }, end: value => { raw = value; } };
  const packetVerify = verify || ((key, cfg) => verifyLicense(key, cfg, packetFetcher()));
  await makeHandler(action, {
    env, verify: packetVerify, limit: async () => {}, load: async () => edition, audit: () => {}, fetcher: fetcher || foundingFetcher(foundingState),
  })({
    method: action === 'edition' ? 'GET' : 'POST',
    url: url || `/api/${action}`,
    headers: { origin: env.APP_ORIGIN, 'content-type': 'application/json', ...headers },
    body,
  }, res);
  return { status: res.statusCode, headers: responseHeaders, body: JSON.parse(raw) };
}

test('a packet buyer still activates and reads the edition without a founding check', async () => {
  const foundingState = { calls: 0 };
  const activated = await invoke('activate', { body: { license: packetLicense }, foundingState });
  assert.equal(activated.status, 200);
  assert.match(activated.headers['set-cookie'], new RegExp(`^${COOKIE}=`));
  assert.doesNotMatch(activated.headers['set-cookie'], /__Host-founding-session/);
  assert.equal(foundingState.calls, 0);
  const cookie = activated.headers['set-cookie'].split(';')[0];
  const read = await invoke('edition', { headers: { cookie }, foundingState });
  assert.equal(read.status, 200);
  assert.equal(read.body.prompts[0].prompt, 'PAID_FIXTURE');
  assert.equal(foundingState.calls, 0);
});

test('a founding license unlocks the packet through the founding session', async () => {
  const foundingState = {};
  const activated = await invoke('activate', { body: { license: foundingLicense }, foundingState });
  assert.equal(activated.status, 200);
  assert.match(activated.headers['set-cookie'], new RegExp(`^${FOUNDING_COOKIE}=`));
  assert.doesNotMatch(activated.headers['set-cookie'], new RegExp(COOKIE));
  const cookie = activated.headers['set-cookie'].split(';')[0];
  const read = await invoke('edition', { headers: { cookie }, foundingState });
  assert.equal(read.status, 200);
  assert.equal(read.body.prompts[0].prompt, 'PAID_FIXTURE');
  assert.equal(read.headers['set-cookie'], undefined);
});

test('an email founding session unlocks the packet, and a bad key stays locked', async () => {
  const cfg = foundingConfig(accessEnv);
  const token = await sealFoundingSession({ method: 'email', email: 'member@example.test', saleId: emailSaleId }, cfg);
  const read = await invoke('edition', { headers: { cookie: `${FOUNDING_COOKIE}=${token}` } });
  assert.equal(read.status, 200);
  assert.equal(read.body.prompts[0].prompt, 'PAID_FIXTURE');
  const invalidKey = await invoke('activate', { body: { license: 'D1B2C3D4-E5F60718-9ABCDEF0-1234ABCD' } });
  assert.equal(invalidKey.status, 401);
  assert.equal(invalidKey.headers['set-cookie'], undefined);
  const prelaunch = await invoke('activate', {
    env: { ...accessEnv, FOUNDING_ACCESS_ENABLED: 'false' },
    body: { license: foundingLicense },
    fetcher: async () => { throw new Error('founding should stay unused'); },
  });
  assert.equal(prelaunch.status, 401);
  assert.equal(prelaunch.headers['set-cookie'], undefined);
  const outage = await invoke('activate', { body: { license: foundingLicense }, foundingState: { outage: true } });
  assert.equal(outage.status, 503);
  assert.equal(outage.headers['set-cookie'], undefined);
  const queried = await invoke('activate', { url: `/api/activate?license=${foundingLicense}`, body: { license: foundingLicense } });
  assert.equal(queried.status, 400);
});

test('a refunded packet session still opens when the founding session is valid', async () => {
  const cfg = foundingConfig(accessEnv);
  const founding = await sealFoundingSession({ method: 'license', license: foundingLicense, saleId }, cfg);
  const packet = await invoke('activate', { body: { license: packetLicense } });
  const cookie = `${packet.headers['set-cookie'].split(';')[0]}; ${FOUNDING_COOKIE}=${founding}`;
  const read = await invoke('edition', {
    headers: { cookie },
    verify: () => { throw new AccessError(401, 'invalid_access', 'refunded'); },
  });
  assert.equal(read.status, 200);
  assert.equal(read.body.prompts[0].prompt, 'PAID_FIXTURE');
  assert.equal(read.headers['set-cookie'], undefined);
});

const submissionEnv = {
  ...accessEnv,
  APP_ORIGIN: 'https://digivated.com',
  SUBMISSIONS_ORIGIN: 'https://digivated.com',
  SUBMISSIONS_REDIS_REST_TOKEN: 'test-only',
};

async function submit(body, { cookie = '', redis, fetcher = foundingFetcher() } = {}) {
  let data = '';
  const responseHeaders = {};
  const res = { statusCode: 0, setHeader: (key, value) => { responseHeaders[key.toLowerCase()] = value; }, end: value => { data = value; } };
  await makeSubmissionHandler({ env: submissionEnv, redis, fetcher, verifyAccount: async () => ({ id: 'member-account', email: body.email.toLowerCase() }) })({
    method: 'POST',
    headers: { origin: submissionEnv.SUBMISSIONS_ORIGIN, authorization: 'Bearer member-fixture', 'content-type': 'application/json', 'x-real-ip': '127.0.0.1', cookie },
    body,
  }, res);
  return { status: res.statusCode, data: JSON.parse(data), headers: responseHeaders };
}

async function memberCookie(license, id) {
  const cfg = foundingConfig(submissionEnv);
  return `${FOUNDING_COOKIE}=${await sealFoundingSession({ method: 'license', license, saleId: id }, cfg)}`;
}

function planRedis() {
  const commands = [];
  const redis = async command => {
    commands.push(command);
    if (command[0] === 'GET') return null;
    if (command[0] === 'SET') return 'OK';
    if (command[0] === 'EVAL') return 1;
    if (['ZRANGE', 'ZREVRANGE', 'SMEMBERS', 'MGET'].includes(command[0])) return [];
    return 0;
  };
  const saves = () => commands.filter(c => c[0] === 'EVAL' && c[3]?.startsWith?.('digivated:limit:'));
  return { redis, commands, saves };
}

test('Membership publishes unlimited projects instantly; without a plan the paid options are refused and free stays the same', async () => {
  const store = planRedis();
  // No plan: the member option is refused before anything is saved.
  const refused = await submit({ ...project, submissionType: 'founding-feature', promotionVerified: true, status: 'featured' }, { redis: store.redis });
  assert.equal(refused.status, 403);
  assert.match(refused.data.error, /Starter \(\$3\) or Membership \(\$5\)/);
  assert.equal(store.saves().length, 0);
  // A Membership sign-in on this browser upgrades the account and publishes at once.
  const cookie = await memberCookie(foundingLicense, saleId);
  const saved = await submit({ ...project, submissionType: 'founding-feature', promotionVerified: true, verified: true, status: 'featured' }, { cookie, redis: store.redis });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.status, 'approved');
  assert.equal(saved.data.plan, 'member');
  const stored = JSON.parse(store.saves().at(-1)[7]);
  assert.equal(stored.plan, 'member');
  assert.equal(stored.status, 'pending');
  assert.equal(stored.promotion, undefined);
  assert.equal(stored.launch, undefined);
  const publish = store.commands.filter(c => c[0] === 'EVAL' && c[3] === `digivated:submission:${stored.id}`).at(-1);
  assert.equal(JSON.parse(publish[8]).status, 'approved');
  assert.equal(JSON.parse(publish[9]).member, true);
  // Free and promo submissions behave as before.
  const free = await submit(project, { redis: planRedis().redis });
  assert.equal(free.status, 201);
  assert.equal(free.data.status, 'pending');
  assert.equal(free.data.plan, 'free');
  assert.equal(free.data.launch.kind, 'free');
  const promoStore = planRedis();
  const paid = await submit({ ...project, submissionType: 'promotion', promotionPurchased: true, promotionReceipt: 'ORDER-TEST' }, { redis: promoStore.redis });
  assert.equal(paid.status, 201);
  assert.deepEqual(JSON.parse(promoStore.saves().at(-1)[7]).promotion, { requested: true, receiptReference: 'ORDER-TEST', verified: false });
});

test('a member feature stays private until review, then publishes without the sale id', () => {
  const claimed = validateSubmission({ ...project, submissionType: 'founding-feature', promotionVerified: true, memberSaleId: 'client-sale' });
  assert.equal(claimed.status, 'pending');
  assert.deepEqual(claimed.promotion, { requested: true, included: 'founding-membership', verified: false });
  const pending = { ...claimed, promotion: { ...claimed.promotion, memberSaleId: saleId, receiptReference: 'founding-membership' }, id: 'member-feature', revision: 0, date: '2026-10-20' };
  assert.equal(projectPublic(pending), null);
  assert.equal(publicRecord(pending), null);
  assert.equal(launchPublic(pending), null);
  const approved = validateEdit('submission', { ...pending, status: 'approved', socialUrl: '' }, pending);
  assert.equal(approved.promotion.verified, true);
  assert.equal(approved.promotion.memberSaleId, saleId);
  for (const view of [projectPublic(approved), publicRecord(approved), launchPublic({ ...approved, pagePublished: true, page: { consent: true, gallery: [] }, slug: 'project-member-feature' })]) {
    assert.equal(view.sponsored, true);
    const text = JSON.stringify(view);
    for (const hidden of [saleId, 'checkout@example.com', 'memberSaleId', 'receiptReference', 'founding-membership']) assert.equal(text.includes(hidden), false);
  }
});

test('one-time membership advertises one offer and leaves checkout gated during the seller remap', async () => {
  const { membership } = await import('../src/data/membership.mjs');
  assert.equal(membership.priceUSD, 5);
  assert.equal(membership.billing, 'one-time');
  assert.equal(membership.projectLimit, 0); // unlimited
  assert.equal(membership.newsStatus, 'live');
  const payload = JSON.parse(readFileSync(new URL('../gumroad/membership-product.json', import.meta.url), 'utf8'));
  assert.equal(payload.price, 500);
  assert.equal(payload.name, membership.name);
  assert.equal(Object.hasOwn(payload, 'subscription_duration'), false);
  assert.equal(Object.hasOwn(payload, 'files'), false); // Preserve existing buyers' delivered files.
  assert.match(payload.description, /full News access/i);
  assert.match(payload.custom_receipt, /unlimited project uploads/i);
  assert.match(payload.description, /unlimited project uploads/i);
  const page = readFileSync(new URL('../src/components/MembershipOffer.astro', import.meta.url), 'utf8');
  assert.match(page, /membership.checkoutReady/);
  assert.match(page, /Loading checkout\. Give it a second\./);
  assert.match(page, /Previous purchases|previous purchase/);
});
