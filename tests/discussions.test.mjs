import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDiscussionHandler } from '../server/discussions.mjs';
import { moderateComment } from '../server/card-interactions.mjs';
import { listNotifications } from '../server/notifications.mjs';
import { caller, people, project, seed, verifyAccount } from './helpers/discussion-fixture.mjs';

const real = { skip: !process.env.DIGIVATED_TEST_REDIS_PORT };
const url = (id = 'project-one', type = 'project') => `/api/discussions?type=${type}&id=${id}`;

test('real Redis: project discussions need an account, name the poster and notify the right people', real, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis(5); await seed(redis);
  let clock = Date.parse('2026-11-17T12:00:00Z');
  const call = caller(makeDiscussionHandler({ redis, env: { SUBMISSIONS_ORIGIN: 'https://digivated.com' }, verifyAccount, now: () => clock++ }));

  const empty = await call('GET', url());
  assert.deepEqual(empty.data, { comments: [], count: 0, viewer: { signedIn: false } });
  assert.equal((await call('GET', url('missing'))).status, 404);
  assert.equal((await call('POST', '/api/discussions', { action: 'post', id: 'project-one', body: 'Hello there' })).status, 401);
  assert.equal((await call('POST', '/api/discussions', { action: 'post', id: 'project-one', body: 'Hello there' }, { as: 'sam', headers: { origin: 'https://evil.test' } })).status, 403);

  // First post: a display name is required once and saved as a private profile.
  const needs = await call('POST', '/api/discussions', { action: 'post', id: 'project-one', body: 'Love the onboarding.' }, { as: 'sam' });
  assert.equal(needs.status, 409); assert.equal(needs.data.needsName, true);
  const first = await call('POST', '/api/discussions', { action: 'post', id: 'project-one', body: 'Love the onboarding.', displayName: 'Sam' }, { as: 'sam' });
  assert.equal(first.status, 201);
  const root = first.data.comment;
  assert.deepEqual([root.author.name, root.mine, root.badge], ['Sam', true, undefined]);
  assert.equal(JSON.parse(await redis(['GET', `digivated:creator:profile:${people.sam.id}`])).public, false);

  // The maker replies with a Maker badge; Dev replies to the maker.
  const makerReply = (await call('POST', '/api/discussions', { action: 'post', id: 'project-one', parentId: root.id, body: 'Thank you Sam!' }, { as: 'maker' })).data.comment;
  assert.deepEqual([makerReply.parentId, makerReply.replyTo, makerReply.badge, makerReply.author.name], [root.id, 'Sam', 'Maker', 'Ana']);
  const devReply = (await call('POST', '/api/discussions', { action: 'post', id: 'project-one', parentId: makerReply.id, body: 'Does it sync?', displayName: 'Dev' }, { as: 'dev' })).data.comment;
  assert.deepEqual([devReply.parentId, devReply.replyTo], [root.id, 'Ana'], 'replies stay one level deep and mention who they answer');

  const makerFeed = (await listNotifications(redis, people.maker.id)).items;
  assert.equal(makerFeed.length, 2, 'the maker hears about Sam’s comment and Dev’s reply, once each');
  const samComment = makerFeed.find(item => item.actor === 'Sam');
  assert.deepEqual([samComment.type, samComment.verb, samComment.subject, samComment.excerpt, samComment.href], ['feedback', 'commented on', 'Pocketlog', 'Love the onboarding.', `/projects/pocketlog#comment-${root.id}`]);
  const devToMaker = makerFeed.find(item => item.actor === 'Dev');
  assert.deepEqual([devToMaker.type, devToMaker.verb], ['reply', 'replied to your comment on']);
  const samFeed = (await listNotifications(redis, people.sam.id)).items;
  assert.deepEqual(samFeed.map(item => [item.type, item.actor, item.verb]), [['reply', 'Ana', 'replied to your comment on']]);
  assert.equal((await listNotifications(redis, people.dev.id)).items.length, 0, 'nobody is notified about their own posts');

  // Comment upvotes: account-based, toggle, and one daily digest for the author.
  assert.deepEqual((await call('POST', '/api/discussions', { action: 'like', id: 'project-one', commentId: root.id }, { as: 'dev' })).data, { liked: true, likes: 1 });
  assert.deepEqual((await call('POST', '/api/discussions', { action: 'like', id: 'project-one', commentId: root.id }, { as: 'maker' })).data, { liked: true, likes: 2 });
  assert.deepEqual((await call('POST', '/api/discussions', { action: 'like', id: 'project-one', commentId: root.id }, { as: 'sam' })).data, { liked: true, likes: 3 });
  assert.deepEqual((await call('POST', '/api/discussions', { action: 'like', id: 'project-one', commentId: root.id }, { as: 'dev' })).data, { liked: false, likes: 2 });
  const digests = (await listNotifications(redis, people.sam.id)).items.filter(item => item.type === 'upvote');
  assert.equal(digests.length, 1, 'upvotes are grouped into one daily notification');
  assert.deepEqual([digests[0].count, digests[0].subject, digests[0].href], [2, 'Pocketlog', `/projects/pocketlog#comment-${root.id}`]);
  assert.equal((await call('POST', '/api/discussions', { action: 'like', id: 'project-one', commentId: 'nope' }, { as: 'dev' })).status, 404);

  const viewed = (await call('GET', url(), undefined, { as: 'maker' })).data;
  assert.equal(viewed.count, 3);
  assert.equal(viewed.comments.find(c => c.id === root.id).liked, true);
  assert.deepEqual(viewed.viewer, { signedIn: true, name: 'Ana', avatar: '', needsName: false });
  assert.equal(JSON.stringify(viewed).includes(people.sam.id), false, 'account ids never reach the browser');

  // Only the author can delete; replies to a deleted comment disappear with it.
  assert.equal((await call('POST', '/api/discussions', { action: 'delete', id: 'project-one', commentId: root.id }, { as: 'dev' })).status, 403);
  assert.equal((await call('POST', '/api/discussions', { action: 'delete', id: 'project-one', commentId: root.id }, { as: 'sam' })).status, 200);
  assert.equal((await call('GET', url())).data.count, 0);
});

test('real Redis: owner moderation still hides discussion comments', real, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis(5); await seed(redis);
  const call = caller(makeDiscussionHandler({ redis, env: { SUBMISSIONS_ORIGIN: 'https://digivated.com' }, verifyAccount }));
  const comment = (await call('POST', '/api/discussions', { action: 'post', id: 'project-one', body: 'Spam spam', displayName: 'Dev' }, { as: 'dev' })).data.comment;
  assert.equal(await moderateComment(redis, comment.id, 'rejected'), 1);
  assert.equal((await call('GET', url())).data.count, 0);
});

test('real Redis: thread discussions badge the author and notify them of replies', real, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis(5); await seed(redis);
  const thread = { id: '7f1c2c55-2f3b-4f4e-8b1a-4c1d1e1f1a11', slug: 'how-do-you-price-7f1c2c55', forum: 'general', title: 'How do you price?', body: 'Curious how people price.', authorId: people.sam.id, authorName: 'Sam', createdAt: new Date().toISOString(), status: 'published' };
  await redis(['SET', `digivated:thread:${thread.id}`, JSON.stringify(thread)]);
  const call = caller(makeDiscussionHandler({ redis, env: { SUBMISSIONS_ORIGIN: 'https://digivated.com' }, verifyAccount }));
  const reply = (await call('POST', '/api/discussions', { type: 'thread', action: 'post', id: thread.id, body: 'Value-based, always.' }, { as: 'maker' })).data.comment;
  assert.equal(reply.badge, undefined);
  await redis(['SET', `digivated:creator:profile:${people.sam.id}`, JSON.stringify({ name: 'Sam', public: false })]);
  const own = (await call('POST', '/api/discussions', { type: 'thread', action: 'post', id: thread.id, parentId: reply.id, body: 'Thanks!' }, { as: 'sam' })).data.comment;
  assert.equal(own.badge, 'Author');
  const feed = (await listNotifications(redis, people.sam.id)).items;
  assert.deepEqual(feed.map(item => [item.type, item.verb, item.subject, item.href]), [['reply', 'replied to your thread', 'How do you price?', `/threads/${thread.slug}#comment-${reply.id}`]]);
  assert.deepEqual((await listNotifications(redis, people.maker.id)).items.map(item => item.verb), ['replied to your comment on']);
  void project;
});
