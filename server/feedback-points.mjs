import { createHmac, timingSafeEqual } from 'node:crypto';
import { redisClient } from './submissions.mjs';
import { validId, storageKey } from './admin-store.mjs';
import { verifiedAccount } from './project-account.mjs';
import { DAILY_POINT_CAP, scoreReview } from '../src/lib/feedback-score.mjs';
import { DiscussionError, ensureIdentity, guardPost, postComment, readJson, resolveSubject } from './discussions.mjs';

// Visit → comment → points.
// 1. "Visit" asks for a signed, stateless token bound to the project and visitor.
// 2. On return, a signed-in visitor can leave one comment; it is posted to the
//    project's discussion like any other comment (the maker is notified).
// 3. A specific comment after 20s+ on the product earns points once per project.
//    Points earned in the last seven days lift the commenter's own launch.
const WEEK = 7 * 86_400_000;
const TOKEN_MAX_AGE = 6 * 3_600_000;
export const pointsTotalKey = account => `digivated:points:total:${account}`;
export const pointsLedgerKey = account => `digivated:points:ledger:${account}`;

// KEYS: award marker, daily counter, ledger, total. ARGV: points, now, member, cap.
// Returns {awarded, total}; awarded 0 = already rewarded for this project, -1 = daily cap.
export const AWARD = `
if redis.call('EXISTS',KEYS[1])==1 then return {0,tonumber(redis.call('GET',KEYS[4]) or '0')} end
local used=tonumber(redis.call('GET',KEYS[2]) or '0')
local points=math.min(tonumber(ARGV[1]),tonumber(ARGV[4])-used)
if points<=0 then return {-1,tonumber(redis.call('GET',KEYS[4]) or '0')} end
redis.call('SET',KEYS[1],ARGV[2])
redis.call('INCRBY',KEYS[2],points); redis.call('EXPIRE',KEYS[2],172800)
redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3]..':'..points)
redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',tonumber(ARGV[2])-31536000000)
local total=redis.call('INCRBY',KEYS[4],points)
return {points,total}`;

const sign = (secret, value) => createHmac('sha256', secret).update(value).digest('base64url');
export function visitToken(secret, project, visitor, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ p: project, t: now })).toString('base64url');
  return `${payload}.${sign(secret, `${payload}.${visitor}`)}`;
}
export function visitSeconds(secret, token, project, visitor, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 400) return 0;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return 0;
  const expected = Buffer.from(sign(secret, `${payload}.${visitor}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 0;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return 0; }
  const age = now - Number(data?.t);
  if (data?.p !== project || !Number.isFinite(age) || age < 0 || age > TOKEN_MAX_AGE) return 0;
  return Math.floor(age / 1000);
}

// Sum of points from ledger members "<project>:<uuid>:<points>" in the last week.
export async function recentPoints(redis, account, now = Date.now()) {
  const members = await redis(['ZRANGEBYSCORE', pointsLedgerKey(account), now - WEEK, now]);
  return (Array.isArray(members) ? members : []).reduce((sum, member) => sum + (Number(String(member).split(':').pop()) || 0), 0);
}

// Adds `boost` (the owner's points from the last week) to ranking items. Failures leave items unchanged.
export async function withProjectBoosts(redis, items, now = Date.now()) {
  if (!items.length) return items;
  try {
    const raws = await redis(['MGET', ...items.map(item => storageKey('submission', item.id))]);
    const owners = (Array.isArray(raws) ? raws : []).map(raw => { try { return JSON.parse(raw)?.accountId || null; } catch { return null; } });
    const cache = new Map();
    return await Promise.all(items.map(async (item, index) => {
      const owner = owners[index];
      if (!owner) return item;
      if (!cache.has(owner)) cache.set(owner, recentPoints(redis, owner, now).catch(() => 0));
      const boost = await cache.get(owner);
      return boost > 0 ? { ...item, boost } : item;
    }));
  } catch { return items; }
}


export function makeFeedbackPointsHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Method not allowed.' }); }
      const env = deps.env || process.env;
      const fetcher = deps.fetcher || fetch;
      const url = new URL(req.url, 'https://digivated.invalid');
      if (url.pathname !== '/api/feedback-points') return send(404, { error: 'Not found.' });
      if (!deps.redis && (!env.SUBMISSIONS_REDIS_REST_URL || !env.SUBMISSIONS_REDIS_REST_TOKEN)) return send(503, { error: 'Points are temporarily unavailable.' });
      const redis = deps.redis || redisClient(env);
      const account = req.headers.authorization ? await (deps.verifyAccount || verifiedAccount)(req, env, fetcher) : null;
      const now = deps.now ? deps.now() : Date.now();

      if (req.method === 'GET') {
        if (url.searchParams.get('action') !== 'me') return send(404, { error: 'Not found.' });
        if (!account) return send(401, { error: 'Sign in to see your points.' });
        const [total, week] = await Promise.all([redis(['GET', pointsTotalKey(account.id)]), recentPoints(redis, account.id, now)]);
        return send(200, { total: Number(total || 0), week });
      }

      guardPost(req, env);
      const body = await readJson(req, 4096);
      const id = body.id;
      const subject = validId(id) ? await resolveSubject(redis, 'project', id) : null;
      if (!subject) return send(404, { error: 'This project is not available.' });
      const ip = req.headers['x-real-ip'];
      if (!deps.redis && (env.VERCEL !== '1' || typeof ip !== 'string' || !ip)) return send(503, { error: 'This action is temporarily unavailable.' });
      const secret = env.SUBMISSIONS_REDIS_REST_TOKEN || 'test-only';
      const visitor = createHmac('sha256', secret).update(`project:${id}:${ip || 'fixture'}`).digest('hex');

      if (body.action === 'visit') return send(200, { token: visitToken(secret, id, visitor, now) });
      if (body.action !== 'review') return send(400, { error: 'Unknown action.' });
      if (!account) return send(401, { error: 'Sign in to leave a comment.' });
      if (body.company) return send(400, { error: 'Check the form and try again.' });

      const identity = await ensureIdentity(redis, account, body.displayName);
      const entry = await postComment(redis, { subject, account, identity, body: body.comment, now, extra: { visitReview: true } });
      const seconds = visitSeconds(secret, body.token, id, visitor, now);
      const score = scoreReview({ comment: entry.body, seconds });
      const result = { ok: true, commentId: entry.id, href: `${subject.href}#comment-${entry.id}`, points: 0 };
      if (account.id === subject.ownerId) return send(201, { ...result, reason: 'own-project' });
      if (!score.useful) return send(201, { ...result, reason: 'not-specific' });
      if (!score.visited) return send(201, { ...result, reason: 'short-visit' });
      const day = new Date(now).toISOString().slice(0, 10);
      const [awarded, total] = await redis(['EVAL', AWARD, 4, `digivated:points:award:${account.id}:${id}`, `digivated:points:day:${account.id}:${day}`, pointsLedgerKey(account.id), pointsTotalKey(account.id), score.points, now, `${id}:${entry.id}`, DAILY_POINT_CAP]);
      const points = Math.max(0, Number(awarded) || 0);
      return send(201, { ...result, points, total: Number(total) || 0, reason: points ? 'awarded' : Number(awarded) === -1 ? 'daily-cap' : 'already-rewarded' });
    } catch (error) {
      if (error instanceof DiscussionError) return send(error.status, { error: error.message, ...error.extra });
      return send(503, { error: 'This action is temporarily unavailable. Please try again later.' });
    }
  };
}
