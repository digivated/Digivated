import test from 'node:test';
import assert from 'node:assert/strict';
import { makeThreadsHandler, moderateThread, trendingScore, listThreadsForAdmin } from '../server/threads.mjs';
import { makeDiscussionHandler } from '../server/discussions.mjs';
import { listNotifications } from '../server/notifications.mjs';
import { threadSlug, forums } from '../src/data/forums.mjs';
import { caller, people, seed, verifyAccount } from './helpers/discussion-fixture.mjs';

const real = { skip: !process.env.DIGIVATED_TEST_REDIS_PORT };

test('thread slugs are readable, unique by id and safe in URLs', () => {
  assert.equal(threadSlug('What’s your 5-tool stack?!', 'abcdef12-3456'), 'what-s-your-5-tool-stack-abcdef12');
  assert.equal(threadSlug('!!!', 'abcdef12'), 'thread-abcdef12');
  assert.match(threadSlug('x'.repeat(200), 'abcdef12'), /^x{70}-abcdef12$/);
  assert.deepEqual(forums.map(f => f.slug), ['general', 'feedback', 'show', 'introductions', 'help']);
});

test('trending favours recent activity over old totals', () => {
  const now = Date.parse('2026-11-17T12:00:00Z');
  const fresh = { createdAt: '2026-11-17T10:00:00Z', votes: 3, comments: 2 };
  const old = { createdAt: '2026-10-01T10:00:00Z', votes: 40, comments: 30 };
  assert.ok(trendingScore(fresh, now) > trendingScore(old, now));
});

test('real Redis: members start, find, vote on and remove threads like Product Hunt forums', real, async () => {
  const { testRedis } = await import('./helpers/redis.mjs');
  const redis = testRedis(6); await seed(redis);
  let clock = Date.parse('2026-11-17T12:00:00Z');
  const env = { SUBMISSIONS_ORIGIN: 'https://digivated.com' };
  const call = caller(makeThreadsHandler({ redis, env, verifyAccount, now: () => clock }));
  const discuss = caller(makeDiscussionHandler({ redis, env, verifyAccount, now: () => clock }));
  const create = (as, fields) => call('POST', '/api/threads', { action: 'create', forum: 'general', title: 'What are your five essential tools?', body: 'Mine are a notebook, a timer and coffee.', ...fields }, { as });

  assert.equal((await create(undefined)).status, 401);
  assert.equal((await create('maker', { forum: 'nope' })).status, 400);
  assert.equal((await create('maker', { title: 'Short' })).status, 400);
  assert.equal((await create('maker', { body: 'tiny' })).status, 400);
  assert.equal((await create('sam')).data.needsName, true, 'members without a profile choose a display name');

  const first = (await create('maker')).data.thread;
  assert.deepEqual([first.author.name, first.forum, first.votes, first.comments, first.mine], ['Ana', 'general', 0, 0, true]);
  clock += 3_600_000;
  const second = (await create('sam', { forum: 'feedback', title: 'Roast my landing page please', body: 'Be honest, it is for a habit tracker.', displayName: 'Sam' })).data.thread;

  const page = (await call('GET', `/api/threads?slug=${first.slug}`)).data.thread;
  assert.deepEqual([page.title, page.body, page.forumName], ['What are your five essential tools?', 'Mine are a notebook, a timer and coffee.', 'General']);
  assert.equal((await call('GET', '/api/threads?slug=missing-thread')).status, 404);

  // Lists: newest, forum filter, search.
  assert.deepEqual((await call('GET', '/api/threads?sort=new')).data.threads.map(t => t.id), [second.id, first.id]);
  assert.deepEqual((await call('GET', '/api/threads?forum=feedback')).data.threads.map(t => t.id), [second.id]);
  assert.deepEqual((await call('GET', '/api/threads?q=coffee timer')).data.threads.map(t => t.id), [first.id]);
  assert.equal((await call('GET', '/api/threads?forum=unknown')).status, 404);

  // Votes are per account and toggle; the author gets one daily digest, never for their own vote.
  assert.deepEqual((await call('POST', '/api/threads', { action: 'vote', id: first.id }, { as: 'sam' })).data, { voted: true, votes: 1 });
  assert.deepEqual((await call('POST', '/api/threads', { action: 'vote', id: first.id }, { as: 'dev' })).data, { voted: true, votes: 2 });
  assert.deepEqual((await call('POST', '/api/threads', { action: 'vote', id: first.id }, { as: 'maker' })).data, { voted: true, votes: 3 });
  assert.deepEqual((await call('POST', '/api/threads', { action: 'vote', id: first.id }, { as: 'dev' })).data, { voted: false, votes: 2 });
  const digest = (await listNotifications(redis, people.maker.id)).items.filter(n => n.type === 'upvote');
  assert.deepEqual(digest.map(n => [n.count, n.subject, n.href]), [[2, 'What are your five essential tools?', `/threads/${first.slug}`]]);
  assert.deepEqual((await call('GET', '/api/threads?sort=top', undefined, { as: 'sam' })).data.threads.map(t => [t.id, t.voted === true]), [[first.id, true], [second.id, false]]);

  // Comments count on the list and appear in Recent comments with a link to the exact comment.
  const comment = (await discuss('POST', '/api/discussions', { type: 'thread', action: 'post', id: first.id, body: 'Linear, Figma and a whiteboard.' }, { as: 'sam' })).data.comment;
  assert.equal((await call('GET', '/api/threads?sort=new')).data.threads.find(t => t.id === first.id).comments, 1);
  clock += 1000;
  const projectComment = (await discuss('POST', '/api/discussions', { action: 'post', id: 'project-one', body: 'Nice launch!' }, { as: 'sam' })).data.comment;
  const recent = (await call('GET', '/api/threads?view=recent')).data.comments;
  assert.deepEqual(recent.map(c => c.subject.href), [`/projects/pocketlog#comment-${projectComment.id}`, `/threads/${first.slug}#comment-${comment.id}`]);

  // Pinned threads lead; authors can delete their own; the owner can remove any.
  await moderateThread(redis, second.id, { pinned: true });
  assert.equal((await call('GET', '/api/threads')).data.threads[0].id, second.id);
  assert.equal((await call('POST', '/api/threads', { action: 'delete', id: first.id }, { as: 'sam' })).status, 403);
  assert.equal((await call('POST', '/api/threads', { action: 'delete', id: first.id }, { as: 'maker' })).status, 200);
  assert.equal((await call('GET', `/api/threads?slug=${first.slug}`)).status, 410);
  assert.deepEqual((await call('GET', '/api/threads')).data.threads.map(t => t.id), [second.id]);
  assert.equal((await discuss('GET', `/api/discussions?type=thread&id=${first.id}`)).status, 404, 'a removed thread closes its discussion');
  await moderateThread(redis, first.id, { status: 'published' });
  assert.equal((await call('GET', `/api/threads?slug=${first.slug}`)).status, 200, 'the owner can restore a thread');
  assert.equal((await listThreadsForAdmin(redis)).items.length, 2);

  // Daily limit: five new threads per member.
  for (let i = 0; i < 3; i++) assert.equal((await create('dev', { title: `Thread number ${i} for limits`, displayName: 'Dev' })).status, 201);
  for (let i = 3; i < 5; i++) assert.equal((await create('dev', { title: `Thread number ${i} for limits` })).status, 201);
  assert.equal((await create('dev', { title: 'Thread number six for limits' })).status, 429);
});
