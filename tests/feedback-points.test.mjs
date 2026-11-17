import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFeedbackPointsHandler, visitToken, visitSeconds, withProjectBoosts, AWARD } from '../server/feedback-points.mjs';
import { scoreReview, boostVotes } from '../src/lib/feedback-score.mjs';

const origin = 'https://digivated.com';
function fixtureRedis() {
  const values = new Map(), sorted = new Map();
  const set = key => { if (!sorted.has(key)) sorted.set(key, new Map()); return sorted.get(key); };
  const redis = async ([command, ...args]) => {
    if (command === 'GET') return values.get(args[0]) ?? null;
    if (command === 'MGET') return args.map(key => values.get(key) ?? null);
    if (command === 'ZRANGEBYSCORE') return [...set(args[0])].filter(([, score]) => score >= Number(args[1]) && score <= Number(args[2])).map(([member]) => member);
    if (command === 'ZADD' || command === 'ZCARD' || command === 'ZREVRANGE' || command === 'INCR' || command === 'EXPIRE' || command === 'SET') {
      if (command === 'SET') { values.set(args[0], args[1]); return 'OK'; }
      if (command === 'ZADD') { set(args[0]).set(args[2], Number(args[1])); return 1; }
      if (command === 'ZCARD') return set(args[0]).size;
      if (command === 'ZREVRANGE') return [...set(args[0])].sort((a, b) => b[1] - a[1]).map(([m]) => m);
      if (command === 'INCR') { const n = Number(values.get(args[0]) || 0) + 1; values.set(args[0], String(n)); return n; }
      return 1;
    }
    if (command === 'EVAL') {
      const [script, n, ...rest] = args, keys = rest.slice(0, Number(n)), argv = rest.slice(Number(n));
      if (script.includes('local n=redis.call')) {
        const count = Number(values.get(keys[0]) || 0) + 1; values.set(keys[0], String(count));
        if (count > 3) return 0;
        values.set(keys[1], argv[0]); set(keys[2]).set(argv[2], Number(argv[1])); if (argv[3] === 'approved') set(keys[3]).set(argv[2], Number(argv[1]));
        return 1;
      }
      if (script === AWARD) {
        const total = () => Number(values.get(keys[3]) || 0);
        if (values.has(keys[0])) return [0, total()];
        const used = Number(values.get(keys[1]) || 0), points = Math.min(Number(argv[0]), Number(argv[3]) - used);
        if (points <= 0) return [-1, total()];
        values.set(keys[0], argv[1]); values.set(keys[1], String(used + points));
        set(keys[2]).set(`${argv[2]}:${points}`, Number(argv[1]));
        values.set(keys[3], String(total() + points)); return [points, total()];
      }
      throw Error('unexpected script');
    }
    if (['LPUSH', 'LTRIM', 'HINCRBY', 'INCRBY', 'PUBLISH', 'ZREMRANGEBYSCORE', 'LRANGE', 'HGET', 'HSET'].includes(command)) return 0;
    throw Error(`Unexpected Redis command ${command}`);
  };
  return { redis, values, sorted };
}
const project = { id: 'project-one', name: 'Original', status: 'approved', consent: true, image: 'image', url: 'https://fixture.test/', accountId: 'owner-account' };
async function call(handler, method, body, headers = {}, url = '/api/feedback-points') {
  let data; const res = { statusCode: 200, setHeader() {}, end(value) { data = JSON.parse(value); } };
  await handler({ url, method, headers: { origin, 'content-type': 'application/json', 'x-real-ip': '192.0.2.10', 'user-agent': 'Mozilla/5.0', ...headers }, body }, res);
  return { status: res.statusCode, data };
}
const useful = { works: 'The onboarding explains the pricing clearly and the demo loads quickly on my phone', improve: 'Add a short comparison table so I can see how plans differ before signing up' };

test('usefulness scoring rewards specific, two-sided reviews and rejects filler', () => {
  assert.equal(scoreReview({ works: 'nice', improve: 'good' }).useful, false);
  assert.equal(scoreReview({ works: 'cool cool cool cool cool cool cool cool cool' }).useful, false);
  assert.equal(scoreReview({ works: 'Visit https://spam.test for more great stuff today friends' }).useful, false);
  const full = scoreReview({ ...useful, impression: 'clear', seconds: 40 });
  assert.equal(full.useful, true); assert.equal(full.checks.visited, true); assert.equal(full.points, 5 + 3 + 5 + 1);
  assert.equal(scoreReview({ ...useful, seconds: 3 }).checks.visited, false);
  assert.equal(boostVotes(29), 2);
});

test('visit tokens are bound to project and visitor and measure time away', () => {
  const token = visitToken('secret', 'project-one', 'visitor', 1_000);
  assert.equal(visitSeconds('secret', token, 'project-one', 'visitor', 31_000), 30);
  assert.equal(visitSeconds('secret', token, 'project-two', 'visitor', 31_000), 0);
  assert.equal(visitSeconds('secret', token, 'project-one', 'other', 31_000), 0);
  assert.equal(visitSeconds('other', token, 'project-one', 'visitor', 31_000), 0);
  assert.equal(visitSeconds('secret', token, 'project-one', 'visitor', 1_000 + 7 * 3_600_000), 0);
  assert.equal(visitSeconds('secret', token + 'x', 'project-one', 'visitor', 31_000), 0);
});

test('reviews save as public feedback; only signed-in, visited, specific reviews earn points once', async () => {
  const { redis, values, sorted } = fixtureRedis();
  values.set('digivated:submission:project-one', JSON.stringify(project));
  let clock = 1_800_000_000_000;
  const accounts = { 'Bearer reviewer': { id: 'reviewer-account', email: 'r@fixture.test' }, 'Bearer owner': { id: 'owner-account', email: 'o@fixture.test' } };
  const handler = makeFeedbackPointsHandler({ redis, env: { SUBMISSIONS_ORIGIN: origin }, now: () => clock, verifyAccount: async req => accounts[req.headers.authorization] || null });

  assert.equal((await call(handler, 'POST', { action: 'visit', id: 'missing' })).status, 404);
  assert.equal((await call(handler, 'POST', { action: 'visit', id: 'project-one' }, { origin: 'https://evil.test' })).status, 403);
  const { data: { token } } = await call(handler, 'POST', { action: 'visit', id: 'project-one' });
  clock += 45_000;

  const guest = await call(handler, 'POST', { action: 'review', id: 'project-one', token, ...useful, impression: 'clear' });
  assert.equal(guest.status, 201); assert.equal(guest.data.points, 0); assert.equal(guest.data.reason, 'signed-out'); assert.equal(guest.data.possible, 14);
  const stored = [...sorted.get('digivated:card:comments:project:project-one').keys()].map(id => JSON.parse(values.get(`digivated:card:comment:${id}`)));
  assert.match(stored[0].body, /^First impression: Instantly clear\.\nWhat works: The onboarding/);
  assert.equal(stored[0].status, 'approved');

  const awarded = await call(handler, 'POST', { action: 'review', id: 'project-one', token, ...useful, impression: 'clear' }, { authorization: 'Bearer reviewer', 'x-real-ip': '192.0.2.11' });
  assert.equal(awarded.data.points, 0); assert.equal(awarded.data.reason, 'short-visit', 'a token from another visitor does not count as a visit');

  const { data: { token: own } } = await call(handler, 'POST', { action: 'visit', id: 'project-one' }, { 'x-real-ip': '192.0.2.11' });
  clock += 30_000;
  const earned = await call(handler, 'POST', { action: 'review', id: 'project-one', token: own, ...useful, impression: 'clear' }, { authorization: 'Bearer reviewer', 'x-real-ip': '192.0.2.11' });
  assert.deepEqual([earned.data.points, earned.data.total, earned.data.reason], [14, 14, 'awarded']);
  const again = await call(handler, 'POST', { action: 'review', id: 'project-one', token: own, ...useful }, { authorization: 'Bearer reviewer', 'x-real-ip': '192.0.2.11' });
  assert.deepEqual([again.data.points, again.data.reason], [0, 'already-rewarded']);

  const self = await call(handler, 'POST', { action: 'review', id: 'project-one', token, ...useful }, { authorization: 'Bearer owner' });
  assert.equal(self.data.reason, 'own-project');
  const thin = await call(handler, 'POST', { action: 'review', id: 'project-one', token: own, works: 'nice', improve: '' }, { authorization: 'Bearer reviewer', 'x-real-ip': '192.0.2.12' });
  assert.equal(thin.data.reason, 'not-specific');

  const me = await call(handler, 'GET', undefined, { authorization: 'Bearer reviewer' }, '/api/feedback-points?action=me');
  assert.deepEqual(me.data, { total: 14, week: 14 });
  assert.equal((await call(handler, 'GET', undefined, {}, '/api/feedback-points?action=me')).status, 401);

  values.set('digivated:submission:reviewer-project', JSON.stringify({ ...project, id: 'reviewer-project', accountId: 'reviewer-account' }));
  const boosted = await withProjectBoosts(redis, [{ id: 'reviewer-project' }, { id: 'project-one' }], clock);
  assert.deepEqual(boosted, [{ id: 'reviewer-project', boost: 14 }, { id: 'project-one' }]);
  assert.deepEqual(await withProjectBoosts(redis, [{ id: 'reviewer-project' }], clock + 8 * 86_400_000), [{ id: 'reviewer-project' }]);
});

test('reviews validate input and share the existing daily feedback limit', async () => {
  const { redis, values } = fixtureRedis();
  values.set('digivated:submission:project-one', JSON.stringify(project));
  const handler = makeFeedbackPointsHandler({ redis, env: { SUBMISSIONS_ORIGIN: origin } });
  assert.equal((await call(handler, 'POST', { action: 'review', id: 'project-one', works: '', improve: '' })).status, 400);
  assert.equal((await call(handler, 'POST', { action: 'review', id: 'project-one', works: 'x'.repeat(300) })).status, 400);
  for (let i = 0; i < 3; i++) assert.equal((await call(handler, 'POST', { action: 'review', id: 'project-one', works: 'Works well for me' })).status, 201);
  assert.equal((await call(handler, 'POST', { action: 'review', id: 'project-one', works: 'Works well for me' })).status, 429);
});
