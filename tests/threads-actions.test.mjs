import test from 'node:test';
import assert from 'node:assert/strict';
import { commentKey } from '../server/card-interactions.mjs';
import { CREATE, VOTE, makeThreadsHandler } from '../server/threads.mjs';
import { caller, people, verifyAccount } from './helpers/discussion-fixture.mjs';

function memoryRedis(seed = {}) {
  const strings = new Map(Object.entries(seed));
  const sets = new Map();
  const zsets = new Map();
  const group = (map, key) => map.get(key) || map.set(key, new Map()).get(key);
  const setOf = key => sets.get(key) || sets.set(key, new Set()).get(key);
  return async command => {
    const [op, ...args] = command;
    if (op === 'GET') return strings.get(args[0]) ?? null;
    if (op === 'SET') {
      if (args.includes('NX') && strings.has(args[0])) return null;
      strings.set(args[0], String(args[1]));
      return 'OK';
    }
    if (op === 'DEL') { strings.delete(args[0]); sets.delete(args[0]); zsets.delete(args[0]); return 1; }
    if (op === 'MGET') return args.map(key => strings.get(key) ?? null);
    if (op === 'INCR') { const next = (Number(strings.get(args[0])) || 0) + 1; strings.set(args[0], String(next)); return next; }
    if (op === 'EXPIRE') return 1;
    if (op === 'ZADD') { group(zsets, args[0]).set(String(args[2]), Number(args[1])); return 1; }
    if (op === 'ZREM') return group(zsets, args[0]).delete(String(args[1])) ? 1 : 0;
    if (op === 'ZCARD') return group(zsets, args[0]).size;
    if (op === 'ZSCORE') { const score = group(zsets, args[0]).get(String(args[1])); return score == null ? null : String(score); }
    if (op === 'ZREVRANGE') {
      const rows = [...group(zsets, args[0]).entries()].sort((a, b) => b[1] - a[1]);
      return rows.slice(Number(args[1]), Number(args[2]) + 1).map(([member]) => member);
    }
    if (op === 'SADD') { setOf(args[0]).add(String(args[1])); return 1; }
    if (op === 'SREM') return setOf(args[0]).delete(String(args[1])) ? 1 : 0;
    if (op === 'SCARD') return setOf(args[0]).size;
    if (op === 'SISMEMBER') return setOf(args[0]).has(String(args[1])) ? 1 : 0;
    if (op === 'EVAL') {
      const nkeys = Number(args[1]);
      const keys = args.slice(2, 2 + nkeys);
      const argv = args.slice(2 + nkeys);
      if (args[0] === CREATE) {
        const count = (Number(strings.get(keys[0])) || 0) + 1;
        strings.set(keys[0], String(count));
        if (count > Number(argv[3])) return 0;
        if (strings.has(keys[2])) return -1;
        strings.set(keys[2], String(argv[2]));
        strings.set(keys[1], String(argv[0]));
        group(zsets, keys[3]).set(String(argv[2]), Number(argv[1]));
        group(zsets, keys[4]).set(String(argv[2]), Number(argv[1]));
        return 1;
      }
      if (args[0] === VOTE) {
        const members = setOf(keys[0]);
        if (members.has(String(argv[0]))) { members.delete(String(argv[0])); return [0, members.size]; }
        members.add(String(argv[0]));
        return [1, members.size];
      }
      throw new Error('Unknown script');
    }
    throw new Error(`Unsupported ${op}`);
  };
}

const newsId = 'd'.repeat(24);
const profile = JSON.stringify({ name: 'Ana', bio: '', website: '', social: '', public: true, hasLogo: false });
const redis = memoryRedis({
  [`digivated:creator:profile:${people.maker.id}`]: profile,
  [`digivated:creator:profile:${people.sam.id}`]: JSON.stringify({ name: 'Sam', bio: '', website: '', social: '', public: false, hasLogo: false }),
});
const call = caller(makeThreadsHandler({ redis, env: { SUBMISSIONS_ORIGIN: 'https://digivated.com' }, verifyAccount, now: () => Date.parse('2026-11-24T18:00:00Z') }));
const create = (as, fields) => call('POST', '/api/threads', { action: 'create', forum: 'general', title: 'What are your five essential tools?', body: 'Mine are a notebook, a timer and coffee.', ...fields }, { as });

test('forum counts, post style, reactions and a single news thread stay additive', async () => {
  await redis(['ZADD', 'digivated:news:index:published', Date.now(), newsId]);
  assert.equal((await create('maker', { kind: 'essay' })).status, 400);
  const ask = (await create('maker', { kind: 'ask', forum: 'feedback', title: 'Roast my landing page please' })).data.thread;
  assert.equal(ask.kind, 'ask');
  const counts = (await call('GET', '/api/threads?view=counts')).data.counts;
  assert.equal(counts.feedback, 1);
  assert.equal(counts.general, 0);

  const commentId = '5d4c8d69-7663-432e-a018-a6897a680e44';
  await redis(['SET', commentKey(commentId), JSON.stringify({ id: commentId, status: 'approved', type: 'thread', itemId: ask.id, accountId: people.sam.id, body: 'Try a shorter hero.' })]);
  assert.equal((await call('POST', '/api/threads', { action: 'helpful', id: ask.id, commentId }, { as: 'sam' })).status, 403);
  assert.equal((await call('POST', '/api/threads', { action: 'helpful', id: ask.id, commentId: '5d4c8d69-7663-432e-a018-a6897a680e44' }, { as: 'maker' })).data.helpfulCommentId, commentId);
  const own = '5d4c8d69-7663-432e-a018-a6897a680e45';
  await redis(['SET', commentKey(own), JSON.stringify({ id: own, status: 'approved', type: 'thread', itemId: ask.id, accountId: people.maker.id, body: 'My own note.' })]);
  assert.equal((await call('POST', '/api/threads', { action: 'helpful', id: ask.id, commentId: own }, { as: 'maker' })).status, 400);

  const reacted = (await call('POST', '/api/threads', { action: 'react', id: ask.id, kind: 'useful' }, { as: 'sam' })).data;
  assert.deepEqual(reacted, { kind: 'useful', reacted: true, count: 1 });
  assert.equal((await call('POST', '/api/threads', { action: 'react', id: ask.id, kind: 'useful' }, { as: 'sam' })).data.count, 0);
  const detail = (await call('GET', `/api/threads?slug=${ask.slug}`, undefined, { as: 'maker' })).data.thread;
  assert.equal(detail.reactions.useful, 0);
  assert.equal(detail.helpfulCommentId, commentId);

  assert.equal((await create('maker', { newsId: 'nope' })).status, 400);
  const first = (await create('maker', { newsId, title: 'Talk through this story together' })).data;
  assert.equal(first.thread.forum, 'general');
  const again = (await create('sam', { newsId, title: 'A second take on the same story' })).data;
  assert.equal(again.existing, true);
  assert.equal(again.thread.slug, first.thread.slug);
  assert.equal((await call('GET', `/api/threads?news=${newsId}`)).data.thread.slug, first.thread.slug);
  assert.equal((await call('GET', '/api/threads?forum=general')).data.threads.length, 1);
});
