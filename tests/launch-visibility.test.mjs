import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testRedis } from './helpers/redis.mjs';
import { caller, people, verifyAccount } from './helpers/discussion-fixture.mjs';
import { launchBounds, fairStart, fairOrder } from '../src/lib/launch-calendar.mjs';
import { accountIndex } from '../server/project-account.mjs';
import { makeDiscussionHandler } from '../server/discussions.mjs';
import { makeLaunchesHandler } from '../server/launches.mjs';
import { makeMakerStatsHandler } from '../server/maker-stats.mjs';
import { makeBadgeHandler, renderAwardBadge } from '../server/badge.mjs';
import { listNotifications, notifyProjectApproval, saveNotificationPreferences } from '../server/notifications.mjs';
import { awardBadgeSnippet } from '../server/badge-snippets.mjs';
import {
  VOTE_WEIGHT, bumpStat, finalizeLastWeek, forgetVoteWeight, isFresh, launchScores, notePost, readStats,
  recordVoteWeight, voteWeightKey, withLaunchScores, trustFirstKey, bestPlace,
} from '../server/launch-score.mjs';

const DAY = 86_400_000;
const live = !process.env.DIGIVATED_TEST_REDIS_PORT;
const secret = 'test-only';

test('fair start runs from the Monday 9 AM Eastern hand-over for 24 hours and shuffles hourly', () => {
  const launch = Date.parse('2026-11-16T14:00:00Z');
  assert.equal(fairStart(launch - 1).active, false);
  assert.equal(fairStart(launch + 3_600_000).active, true);
  assert.equal(fairStart(launch + 23 * 3_600_000).active, true);
  assert.equal(fairStart(launch + 24 * 3_600_000).active, false);
  assert.equal(fairStart(launch + 24 * 3_600_000).endsAt, Date.parse('2026-11-17T14:00:00Z'));
  assert.equal(fairStart(Date.parse('2026-11-21T12:00:00Z')).active, false);
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const order = at => ids.slice().sort((x, y) => fairOrder(x, at) - fairOrder(y, at)).join('');
  assert.equal(order(monday + 60_000), order(monday + 3_000_000), 'stable within the hour');
  assert.ok([1, 2, 3, 4, 5].some(h => order(monday + h * 3_600_000) !== order(monday)), 'rotates across hours');
});

test('award badges label the place and week, and the snippet keeps the verifying anchor', () => {
  const svg = renderAwardBadge('dark', { rank: 2, week: '2026-11-09T00:00:00.000Z' });
  assert.match(svg, /#2 LAUNCH OF THE WEEK/);
  assert.match(svg, /NOV 9/);
  assert.match(renderAwardBadge('terminal', { rank: 9 }), /\$ #1 of the week/, 'unknown ranks fall back to #1 styling only for drawing');
  assert.match(awardBadgeSnippet('pocketlog', 'light'), /data-digivated-project="pocketlog"[\s\S]*theme=light&award=week/);
});

async function seedProject(redis, { id, name, accountId, email = 'maker@fixture.test', publishedAt, status = 'approved' }) {
  const record = { id, name, creator: name + ' team', description: name + ' does one thing well.', status, consent: true, image: 'data:image/png;base64,AA==', url: `https://${id}.test/`, accountId, email, date: publishedAt, publishedAt, revision: 1 };
  await redis(['SET', `digivated:submission:${id}`, JSON.stringify(record)]);
  if (status === 'approved' || status === 'featured') {
    await redis(['SET', `digivated:public:submission:${id}`, JSON.stringify({ id, name })]); // production projections are partial
    await redis(['ZADD', 'digivated:public:submissions', Date.parse(publishedAt), id]);
  }
  return record;
}
const vote = (redis, id, visitor, at, weight) => Promise.all([redis(['ZADD', `digivated:card:votes:project:${id}`, at, visitor]), weight ? redis(['HSET', voteWeightKey(id), visitor, String(weight)]) : null]);

test('real Redis: trust-weighted launch score, momentum and one weighted vote per account', { skip: live }, async () => {
  const redis = testRedis(8); await redis(['FLUSHDB']);
  try {
    const now = Date.parse('2026-11-19T12:00:00Z'); // Thursday: after fair start
    const { start } = launchBounds('current', now);
    await seedProject(redis, { id: 'pocketlog', name: 'Pocketlog', accountId: people.maker.id, publishedAt: new Date(start + 14 * 3_600_000).toISOString() });
    // Votes: trusted (3), member (2), guest (1); one vote last week is outside the window.
    await vote(redis, 'pocketlog', 'v-trusted', now - 2 * DAY, 3);
    await vote(redis, 'pocketlog', 'v-member', now - 3_600_000, 2);
    await vote(redis, 'pocketlog', 'v-guest', now - 3_600_000);
    await vote(redis, 'pocketlog', 'v-old', start - DAY, 3);
    // Comments: two other members count once each; the maker's own comment never counts.
    const discuss = caller(makeDiscussionHandler({ redis, verifyAccount, now: () => now - 3_600_000 }));
    for (const [as, body] of [['sam', 'The streak view is great.'], ['sam', 'Also: dark mode please.'], ['dev', 'Does it sync across devices?'], ['maker', 'Thanks both!']]) {
      const r = await discuss('POST', '/api/discussions', { action: 'post', type: 'project', id: 'pocketlog', body, displayName: as }, { as });
      assert.equal(r.status, 201, JSON.stringify(r.data));
    }
    // 15 feedback points the maker earned this week = one boost vote.
    await redis(['ZADD', `digivated:points:ledger:${people.maker.id}`, now - DAY, 'other:aaaa:10', now - 2 * DAY, 'more:bbbb:5', start - DAY, 'stale:cccc:10']);
    const scores = await launchScores(redis, ['pocketlog'], { start, end: now + 1, now });
    assert.deepEqual(scores.get('pocketlog'), { upvotes: 3, weighted: 6, commenters: 2, points: 15, score: 6 + 2 * 2 + 1, rising: 3 + 2 * 2 });

    const { items, fair } = await withLaunchScores(redis, [{ id: 'pocketlog', publishedAt: new Date(start + 14 * 3_600_000).toISOString(), votes: { all: 4, daily: 2, weekly: 3, monthly: 4 } }], now);
    assert.equal(fair.active, false);
    assert.equal(items[0].score, 11); assert.equal(items[0].commenters, 2); assert.equal(items[0].boost, 15); assert.equal(items[0].rising, 7);
    // During fair start the same launch is marked fresh and every count is withheld.
    const monday = start + 20 * 3_600_000;
    const fresh = await withLaunchScores(redis, [{ id: 'pocketlog', publishedAt: new Date(start + 14 * 3_600_000).toISOString(), votes: { all: 4, daily: 2, weekly: 3, monthly: 4 }, boost: 15 }], monday);
    assert.equal(fresh.fair.active, true);
    assert.deepEqual(fresh.items[0], { id: 'pocketlog', publishedAt: new Date(start + 14 * 3_600_000).toISOString(), fresh: true, votes: { all: null, daily: null, weekly: null, monthly: null } });
    assert.equal(await isFresh(redis, 'pocketlog', monday), true);
    assert.equal(await isFresh(redis, 'pocketlog', now), false);

    // An account lends its weight to one vote per launch.
    assert.equal(await recordVoteWeight(redis, { id: 'pocketlog', visitor: 'guest-x', account: null, now }), VOTE_WEIGHT.guest);
    assert.equal(await redis(['HGET', voteWeightKey('pocketlog'), 'guest-x']), null);
    assert.equal(await recordVoteWeight(redis, { id: 'pocketlog', visitor: 'net-a', account: people.dev, now }), VOTE_WEIGHT.member);
    assert.equal(await recordVoteWeight(redis, { id: 'pocketlog', visitor: 'net-b', account: people.dev, now }), VOTE_WEIGHT.guest);
    assert.equal(await redis(['HGET', voteWeightKey('pocketlog'), 'net-b']), null);
    // Trusted: here for 7+ days and has posted.
    await redis(['SET', trustFirstKey(people.sam.id), String(now - 8 * DAY)]);
    await notePost(redis, people.sam.id, now);
    assert.equal(await recordVoteWeight(redis, { id: 'pocketlog', visitor: 'net-c', account: people.sam, now }), VOTE_WEIGHT.trusted);
    await forgetVoteWeight(redis, { id: 'pocketlog', visitor: 'net-a', account: people.dev });
    assert.equal(await redis(['HGET', voteWeightKey('pocketlog'), 'net-a']), null);
    assert.equal(await recordVoteWeight(redis, { id: 'pocketlog', visitor: 'net-b', account: people.dev, now }), VOTE_WEIGHT.member, 'weight can move after the first vote is removed');
  } finally { await redis(['FLUSHDB']); }
});

test('real Redis: last week freezes once, the podium is notified and badges only draw earned places', { skip: live }, async () => {
  const redis = testRedis(8); await redis(['FLUSHDB']);
  try {
    const now = Date.parse('2026-11-17T15:00:00Z');
    const { start, end } = launchBounds('previous', now);
    const owners = { alpha: people.maker.id, beta: people.sam.id, gamma: people.dev.id, delta: null };
    for (const [id, accountId] of Object.entries(owners)) await seedProject(redis, { id, name: id[0].toUpperCase() + id.slice(1), accountId, publishedAt: new Date(start + 14 * 3_600_000).toISOString() });
    await seedProject(redis, { id: 'thisweek', name: 'This week', accountId: null, publishedAt: new Date(now - 3_600_000).toISOString() });
    const t = start + DAY;
    await vote(redis, 'beta', 'b1', t, 3); await vote(redis, 'beta', 'b2', t, 3);           // 6
    await vote(redis, 'alpha', 'a1', t); await vote(redis, 'alpha', 'a2', t, 2); await vote(redis, 'alpha', 'a3', t); // 4
    await vote(redis, 'gamma', 'g1', t, 2);                                                  // 2
    await vote(redis, 'gamma', 'g-late', end + 3_600_000, 3);                               // after the week: ignored
    const week = await finalizeLastWeek(redis, now);
    assert.deepEqual(week.podium.map(p => [p.id, p.rank, p.score]), [['beta', 1, 6], ['alpha', 2, 4], ['gamma', 3, 2]]);
    assert.deepEqual(week.results.map(r => r.id), ['beta', 'alpha', 'gamma', 'delta']);
    assert.deepEqual(await finalizeLastWeek(redis, now), week, 'second call reads the frozen week');
    assert.deepEqual(await bestPlace(redis, 'beta'), { week: week.start, rank: 1 });
    assert.equal(await bestPlace(redis, 'delta'), null);
    const samFeed = await listNotifications(redis, people.sam.id);
    assert.equal(samFeed.items.filter(i => i.type === 'award').length, 1);
    assert.equal(samFeed.items[0].href, '/#last-week');
    assert.match(samFeed.items[0].verb, /placed #1/);

    // Badges: the award is drawn only for an earned place.
    const badge = makeBadgeHandler({ redis });
    const draw = async url => { let body = ''; const res = { statusCode: 0, setHeader() {}, end(v) { body = v; } }; await badge({ method: 'GET', url }, res); return body; };
    assert.match(await draw('/api/badge?id=beta&theme=dark&award=week'), /#1 LAUNCH OF THE WEEK/);
    assert.doesNotMatch(await draw('/api/badge?id=delta&award=week'), /OF THE WEEK/);

    // Launches API: podium (with current public data) and the winners archive.
    const launches = caller(makeLaunchesHandler({ redis, verifyAccount, now: () => now }));
    const podium = await launches('GET', '/api/launches?view=podium');
    assert.equal(podium.status, 200);
    assert.deepEqual(podium.data.week.podium.map(p => [p.id, p.rank, p.name, p.pageUrl]), [['beta', 1, 'Beta', '/projects/listing/beta'], ['alpha', 2, 'Alpha', '/projects/listing/alpha'], ['gamma', 3, 'Gamma', '/projects/listing/gamma']]);
    assert.deepEqual(podium.data.order, ['beta', 'alpha', 'gamma', 'delta']);
    await redis(['DEL', 'digivated:public:submission:alpha']);
    const winners = await launches('GET', '/api/launches?view=winners');
    assert.deepEqual(winners.data.weeks[0].podium.map(p => p.id), ['beta', 'gamma'], 'removed projects drop out of the archive');
    assert.equal(winners.data.next, null);
  } finally { await redis(['FLUSHDB']); }
});

test('real Redis: upcoming launches, Notify me, and one alert to watchers and followers at launch', { skip: live }, async () => {
  const redis = testRedis(8); await redis(['FLUSHDB']);
  try {
    const now = Date.now();
    const launchAt = now + 3 * DAY;
    const record = { id: 'nextup', name: 'Nextup', creator: 'Ana', description: 'Coming Monday.', status: 'pending', consent: true, image: 'data:image/png;base64,AA==', url: 'https://nextup.test/', accountId: people.maker.id, email: 'maker@fixture.test', date: new Date(now).toISOString(), revision: 2, launch: { kind: 'free', scheduledAt: new Date(launchAt).toISOString(), scheduledTimestamp: launchAt, badgeVerifiedAt: new Date(now).toISOString() } };
    await redis(['SET', 'digivated:submission:nextup', JSON.stringify(record)]);
    await redis(['ZADD', 'digivated:launch:free', launchAt, 'nextup']);
    await redis(['SET', 'digivated:submission:unverified', JSON.stringify({ ...record, id: 'unverified', launch: { ...record.launch, badgeVerifiedAt: null } })]);
    await redis(['ZADD', 'digivated:launch:free', launchAt, 'unverified']);
    const launches = caller(makeLaunchesHandler({ redis, verifyAccount }));
    const list = await launches('GET', '/api/launches?view=upcoming', null, { as: 'sam' });
    assert.deepEqual(list.data.items.map(i => [i.id, i.watchers, i.watching]), [['nextup', 0, false]]);
    assert.equal(list.data.items[0].email, undefined, 'no private fields');
    assert.equal((await launches('POST', '/api/launches', { action: 'watch', id: 'nextup' })).status, 401);
    assert.equal((await launches('POST', '/api/launches', { action: 'watch', id: 'unverified' }, { as: 'sam' })).status, 404);
    const watched = await launches('POST', '/api/launches', { action: 'watch', id: 'nextup' }, { as: 'sam' });
    assert.deepEqual(watched.data, { watching: true, watchers: 1, alertsEnabled: true });
    await saveNotificationPreferences(redis, people.sam.id, { enabled: true, launch: false });
    const paused = await launches('POST', '/api/launches', { action: 'watch', id: 'nextup' }, { as: 'sam' });
    assert.deepEqual(paused.data, { watching: true, watchers: 1, alertsEnabled: false });
    await saveNotificationPreferences(redis, people.sam.id, { enabled: true, launch: true });
    assert.equal((await launches('GET', '/api/launches?view=upcoming', null, { as: 'sam' })).data.items[0].watching, true);
    // Dev follows the maker; both hear about the launch exactly once.
    await redis(['SADD', `digivated:creator:followers:${people.maker.id}`, people.dev.id, people.sam.id]);
    const live = { ...record, status: 'approved', publishedAt: new Date(now).toISOString() };
    await notifyProjectApproval(redis, record, live);
    await notifyProjectApproval(redis, record, live);
    for (const person of [people.sam, people.dev]) {
      const feed = await listNotifications(redis, person.id);
      const alerts = feed.items.filter(i => i.type === 'launch');
      assert.equal(alerts.length, 1, person.email);
      assert.equal(alerts[0].href, '/projects/listing/nextup');
      assert.equal(alerts[0].actor, 'Nextup');
    }
    assert.equal((await listNotifications(redis, people.maker.id)).items.filter(i => i.type === 'launch').length, 0, 'never to the maker');
  } finally { await redis(['FLUSHDB']); }
});

test('real Redis: maker stats are private to the owner and show 14 days and this week', { skip: live }, async () => {
  const redis = testRedis(8); await redis(['FLUSHDB']);
  try {
    const now = Date.parse('2026-11-19T12:00:00Z');
    const { start } = launchBounds('current', now);
    await seedProject(redis, { id: 'pocketlog', name: 'Pocketlog', accountId: people.maker.id, email: people.maker.email, publishedAt: new Date(start + 14 * 3_600_000).toISOString() });
    await seedProject(redis, { id: 'rival', name: 'Rival', accountId: people.sam.id, email: people.sam.email, publishedAt: new Date(start + 14 * 3_600_000).toISOString() });
    const index = accountIndex(people.maker.email, secret);
    await redis(['ZADD', index, 1, 'pocketlog']); await redis(['SET', `${index}:legacy-scanned`, '1']);
    await redis(['SET', `${accountIndex(people.sam.email, secret)}:legacy-scanned`, '1']);
    await vote(redis, 'pocketlog', 'p1', now - DAY, 2); await vote(redis, 'rival', 'r1', now - DAY, 3); await vote(redis, 'rival', 'r2', now - DAY);
    for (const field of ['views', 'views', 'visits', 'upvotes']) await bumpStat(redis, 'pocketlog', field, now);
    await bumpStat(redis, 'pocketlog', 'views', now - 2 * DAY);
    await bumpStat(redis, 'pocketlog', 'views', now - 20 * DAY);
    const days = await readStats(redis, 'pocketlog', now);
    assert.equal(days.length, 14);
    assert.deepEqual(days.at(-1), { date: '2026-11-19', views: 2, visits: 1, upvotes: 0, comments: 0 });
    assert.equal(days.at(-2).upvotes, 1, 'upvotes come from their timestamps, so history is kept');
    // Lifetime numbers come from the existing public counters, not just the new daily ones.
    await redis(['SET', 'digivated:project-views:pocketlog', '40']); await redis(['SET', 'digivated:card:likes:project:pocketlog', '7']);
    await redis(['ZADD', 'digivated:card:comments:project:pocketlog', now - 40 * DAY, 'old-comment']);
    const stats = caller(makeMakerStatsHandler({ redis, verifyAccount, now: () => now }));
    assert.equal((await stats('GET', '/api/maker-stats?id=pocketlog')).status, 401);
    assert.equal((await stats('GET', '/api/maker-stats?id=pocketlog', null, { as: 'sam' })).status, 404, 'not your project');
    const mine = await stats('GET', '/api/maker-stats?id=pocketlog', null, { as: 'maker' });
    assert.equal(mine.status, 200, JSON.stringify(mine.data));
    assert.deepEqual(mine.data.totals, { views: 3, visits: 1, upvotes: 1, comments: 0 });
    assert.deepEqual(mine.data.allTime, { views: 40, visits: 1, upvotes: 7, comments: 1 });
    assert.deepEqual(mine.data.week, { score: 2, upvotes: 1, commenters: 0, points: 0, rank: 2, of: 2 });
    assert.deepEqual(mine.data.places, []);
    assert.equal(mine.data.award, undefined);
    // range=7: the last 7 days, the 7 before them for trends, and the newest published comments.
    const ranged = await stats('GET', '/api/maker-stats?id=pocketlog&range=7', null, { as: 'maker' });
    assert.equal(ranged.status, 200);
    assert.equal(ranged.data.range, 7);
    assert.equal(ranged.data.days.length, 7);
    assert.equal(ranged.data.history.length, 14);
    assert.deepEqual(Object.keys(ranged.data.previous).sort(), ['comments', 'upvotes', 'views', 'visits']);
    assert.ok(Array.isArray(ranged.data.comments) && ranged.data.comments.every(comment => typeof comment.body === 'string' && !('accountId' in comment) && !('email' in comment)));
    assert.equal((await stats('GET', '/api/maker-stats?id=pocketlog&range=999', null, { as: 'maker' })).data.days.length, 14, 'unknown ranges fall back to the default');
  } finally { await redis(['FLUSHDB']); }
});

test('real Redis: a signed-in upvote carries member weight and counts in maker stats', { skip: live }, async () => {
  const redis = testRedis(8); await redis(['FLUSHDB']);
  try {
    const { makeCardInteractionHandler } = await import('../server/card-interactions.mjs');
    await seedProject(redis, { id: 'pocketlog', name: 'Pocketlog', accountId: people.maker.id, publishedAt: new Date(Date.now() - 20 * DAY).toISOString() });
    const cards = caller(makeCardInteractionHandler({ redis, verifyAccount, env: { SUBMISSIONS_ORIGIN: 'https://digivated.com' } }));
    const up = await cards('POST', '/api/card-interactions', { type: 'project', id: 'pocketlog', action: 'upvote', includePeriods: true }, { as: 'sam', ip: '192.0.2.50' });
    assert.equal(up.status, 200, JSON.stringify(up.data));
    assert.equal(up.data.liked, true); assert.equal(up.data.likes, 1);
    assert.deepEqual(Object.values(await redis(['HGETALL', voteWeightKey('pocketlog')])).filter((_, i) => i % 2), ['2']);
    const guest = await cards('POST', '/api/card-interactions', { type: 'project', id: 'pocketlog', action: 'upvote' }, { ip: '192.0.2.51' });
    assert.equal(guest.data.likes, 2);
    assert.equal(Number(await redis(['HLEN', voteWeightKey('pocketlog')])), 1, 'guests keep the default weight');
    assert.equal((await readStats(redis, 'pocketlog')).at(-1).upvotes, 2);
    const down = await cards('POST', '/api/card-interactions', { type: 'project', id: 'pocketlog', action: 'remove-upvote' }, { as: 'sam', ip: '192.0.2.50' });
    assert.equal(down.data.liked, false);
    assert.equal(Number(await redis(['HLEN', voteWeightKey('pocketlog')])), 0);
  } finally { await redis(['FLUSHDB']); }
});
