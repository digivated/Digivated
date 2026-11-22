// Which upload plan an account has. Free by default; a Gumroad purchase made
// with the account email upgrades it: the $3 Instant product → Starter (3
// projects), the $5 Membership → unlimited. Each sale is bound to the first
// account that claims it, so one purchase cannot upgrade several accounts.
import { createHmac } from 'node:crypto';
import { FoundingError, foundingConfig, readMember, verifyFoundingEmail } from './founding-access.mjs';
import { planOf, planRank } from '../src/lib/plans.mjs';

const FRESH_MS = 5 * 60 * 1000;
const KEEP_SECONDS = 7 * 24 * 60 * 60;
export const accountPlanKey = id => `digivated:account-plan:${id}`;
export const planBindingsKey = id => `digivated:plan-bindings:${id}`;
const planSeenKey = id => `digivated:plan-seen:${id}`;
const saleKey = (productId, saleId) => 'digivated:plan-sale:' + createHmac('sha256', 'digivated:plan-sale').update(`${productId}:${saleId}`).digest('hex');

// Binding is first-come: SET NX, then confirm the owner is this account.
const BIND = `if redis.call('SET',KEYS[1],ARGV[1],'NX') then redis.call('SADD',KEYS[2],KEYS[1]) return 1 end
if redis.call('GET',KEYS[1])==ARGV[1] then return 1 end return 0`;

async function bound(redis, account, productId, saleId) {
  const key = saleKey(productId, saleId);
  return Number(await redis(['EVAL', BIND, 2, key, planBindingsKey(account.id), account.id])) === 1;
}

async function saleFor(email, cfg, fetcher) {
  try { return (await verifyFoundingEmail(email, cfg, fetcher)).saleId; }
  catch (error) { if (error instanceof FoundingError && error.status === 401) return ''; throw error; }
}

async function lookUp({ req, env, account, redis, fetcher, starter }) {
  // Accounts that never proved they own their mailbox only claim purchases
  // made after Digivated first saw them (a checkout they started here).
  await redis(['SET', planSeenKey(account.id), String(Date.now()), 'NX']);
  const seen = Number(await redis(['GET', planSeenKey(account.id)]));
  const notBefore = account.mailboxVerified === false ? (Number.isFinite(seen) ? seen - 120000 : Infinity) : 0;

  const member = foundingConfig(env);
  if (member.enabled) {
    const saleId = await saleFor(account.email, { productId: member.productId, gumroadToken: member.gumroadToken, allowTest: member.allowTest, notBefore }, fetcher);
    if (saleId && await bound(redis, account, member.productId, saleId)) return 'member';
    // A Membership sign-in on this browser counts too (license or receipt email).
    const session = req ? await readMember(req, member, fetcher) : null;
    if (session?.saleId && await bound(redis, account, member.productId, session.saleId)) return 'member';
  }
  if (starter) {
    const saleId = await saleFor(account.email, { productId: starter.productId, gumroadToken: starter.gumroadToken, minimumPriceUSD: starter.price, allowTest: false, notBefore }, fetcher);
    if (saleId && await bound(redis, account, starter.productId, saleId)) return 'starter';
  }
  return 'free';
}

// Returns { plan, checkFailed }. Uses a 5 minute cache; if Gumroad can't be
// reached, falls back to the last known plan (kept 7 days), else free.
export async function resolvePlan({ req, env = process.env, account, redis, fetcher = fetch, starter = null, fresh = false }) {
  let cached = null;
  try { cached = JSON.parse(await redis(['GET', accountPlanKey(account.id)]) || 'null'); } catch { cached = null; }
  if (!fresh && cached?.plan && Date.now() - Number(cached.checkedAt) < FRESH_MS) return { plan: planOf(cached.plan).id, checkFailed: false };
  try {
    const plan = await lookUp({ req, env, account, redis, fetcher, starter });
    await redis(['SET', accountPlanKey(account.id), JSON.stringify({ plan, checkedAt: Date.now() }), 'EX', KEEP_SECONDS]);
    return { plan, checkFailed: false };
  } catch {
    return { plan: cached?.plan ? planOf(cached.plan).id : 'free', checkFailed: !cached?.plan };
  }
}

export const higherPlan = (a, b) => planRank(a) >= planRank(b) ? planOf(a).id : planOf(b).id;

// Projects this account has on the site now: waiting or live.
export async function plansUsage(redis, accountKey, accountId) {
  const ids = await redis(['ZRANGE', accountKey, 0, -1]);
  if (!Array.isArray(ids) || !ids.length) return 0;
  const rows = await redis(['MGET', ...ids.map(id => `digivated:submission:${id}`)]);
  return rows.reduce((count, raw) => {
    try {
      const row = JSON.parse(raw);
      const owned = !row.accountId || row.accountId === accountId;
      return owned && ['pending', 'approved', 'featured'].includes(row.status) ? count + 1 : count;
    } catch { return count; }
  }, 0);
}
