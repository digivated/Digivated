import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFeedbackPointsHandler, visitToken, visitSeconds, withProjectBoosts } from '../server/feedback-points.mjs';
import { makeDiscussionHandler } from '../server/discussions.mjs';
import { listNotifications } from '../server/notifications.mjs';
import { scoreReview, boostVotes } from '../src/lib/feedback-score.mjs';
import { caller, people, project, seed, verifyAccount } from './helpers/discussion-fixture.mjs';

const real = { skip: !process.env.DIGIVATED_TEST_REDIS_PORT };
const useful = 'The onboarding explains the pricing clearly and the demo loads quickly on my phone';

test('a comment earns points only when it is specific and follows a real visit', () => {
  assert.equal(scoreReview({ comment: 'nice', seconds: 60 }).points, 0);
  assert.equal(scoreReview({ comment: 'cool cool cool cool cool cool cool cool cool', seconds: 60 }).useful, false);
  assert.equal(scoreReview({ comment: 'Visit https://spam.test for more great stuff today friends', seconds: 60 }).useful, false);
  assert.deepEqual(scoreReview({ comment: useful, seconds: 3 }), { useful: true, visited: false, detailed: false, points: 0 });
  assert.equal(scoreReview({ comment: useful, seconds: 40 }).points, 5);
  assert.equal(scoreReview({ comment: `${useful}. I would add a comparison table for plans, an export button, keyboard shortcuts and a clearer empty state too`, seconds: 40 }).points, 10);
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

test('real Redis: a post-visit comment lands in the discussion, notifies the maker and awards points once', real, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis(7); await seed(redis);
  let clock = Date.parse('2026-11-17T12:00:00Z');
  const env = { SUBMISSIONS_ORIGIN: 'https://digivated.com' };
  const call = caller(makeFeedbackPointsHandler({ redis, env, verifyAccount, now: () => clock }));
  const discuss = caller(makeDiscussionHandler({ redis, env, verifyAccount, now: () => clock }));

  assert.equal((await call('POST', '/api/feedback-points', { action: 'visit', id: 'missing' })).status, 404);
  const { data: { token } } = await call('POST', '/api/feedback-points', { action: 'visit', id: 'project-one' });
  clock += 45_000;
  assert.equal((await call('POST', '/api/feedback-points', { action: 'review', id: 'project-one', token, comment: useful })).status, 401, 'commenting needs an account');

  const earned = await call('POST', '/api/feedback-points', { action: 'review', id: 'project-one', token, comment: useful, displayName: 'Sam' }, { as: 'sam' });
  assert.equal(earned.status, 201);
  assert.deepEqual([earned.data.points, earned.data.total, earned.data.reason, earned.data.href], [5, 5, 'awarded', `/projects/pocketlog#comment-${earned.data.commentId}`]);
  const thread = (await discuss('GET', '/api/discussions?type=project&id=project-one')).data.comments;
  assert.deepEqual(thread.map(c => [c.author.name, c.body]), [['Sam', useful]]);
  assert.deepEqual((await listNotifications(redis, people.maker.id)).items.map(n => [n.actor, n.verb, n.subject]), [['Sam', 'commented on', 'Pocketlog']]);

  const again = await call('POST', '/api/feedback-points', { action: 'review', id: 'project-one', token, comment: `${useful} again with more` }, { as: 'sam' });
  assert.deepEqual([again.data.points, again.data.reason], [0, 'already-rewarded']);
  const own = await call('POST', '/api/feedback-points', { action: 'review', id: 'project-one', token, comment: useful }, { as: 'maker' });
  assert.equal(own.data.reason, 'own-project');
  const quick = await call('POST', '/api/feedback-points', { action: 'review', id: 'project-one', token: 'bad', comment: useful, displayName: 'Dev' }, { as: 'dev' });
  assert.equal(quick.data.reason, 'short-visit');

  const me = await call('GET', '/api/feedback-points?action=me', undefined, { as: 'sam' });
  assert.deepEqual(me.data, { total: 5, week: 5 });

  // Points earned this week lift the commenter's own launch.
  await redis(['SET', 'digivated:submission:sam-project', JSON.stringify({ ...project, id: 'sam-project', accountId: people.sam.id })]);
  assert.deepEqual(await withProjectBoosts(redis, [{ id: 'sam-project' }, { id: 'project-one' }], clock), [{ id: 'sam-project', boost: 5 }, { id: 'project-one' }]);
  assert.deepEqual(await withProjectBoosts(redis, [{ id: 'sam-project' }], clock + 8 * 86_400_000), [{ id: 'sam-project' }]);
});
