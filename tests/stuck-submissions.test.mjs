import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stuckSubmissions, deleteStuckSubmissions } from '../server/admin-store.mjs';
import { testRedis } from './helpers/redis.mjs';

test('real Redis: only stuck submissions are deleted, and each is rechecked first', { skip: !process.env.DIGIVATED_TEST_REDIS_PORT }, async () => {
  const redis = testRedis(11); await redis(['FLUSHDB']);
  try {
    const records = {
      'stuck-review': { status: 'pending', name: 'Manual pending', slug: 'manual-pending' },
      'promo-claim': { status: 'pending', name: 'Promo claimed', promotion: { requested: true } },
      'stuck-unpaid': { status: 'pending', name: 'Unpaid instant', promotion: { included: 'instant-launch', verified: false } },
      'paid-instant': { status: 'pending', name: 'Paid instant', promotion: { included: 'instant-launch', verified: true } },
      'badge-wait': { status: 'pending', name: 'Badge waiting', launch: { kind: 'free' } },
      'scheduled': { status: 'pending', name: 'Date locked', launch: { kind: 'free', badgeVerifiedAt: '2026-11-20' } },
      'spotlight': { status: 'pending', name: 'Member', promotion: { included: 'founding-membership' } },
      'live': { status: 'approved', name: 'Live' }, 'featured': { status: 'featured', name: 'Featured' },
      'rejected': { status: 'rejected', name: 'Rejected' }, 'archived': { status: 'archived', name: 'Archived' },
    };
    let score = 0;
    for (const [id, record] of Object.entries(records)) { await redis(['SET', 'digivated:submission:' + id, JSON.stringify({ id, date: '2026-11-01', ...record })]); await redis(['ZADD', 'digivated:submissions', score++, id]); }
    await redis(['SET', 'digivated:launch-slug:manual-pending', 'stuck-review']);
    const preview = await stuckSubmissions(redis);
    assert.deepEqual(preview.map(row => row.id).sort(), ['stuck-review', 'stuck-unpaid']);
    // Paid between preview and confirm: it must be kept.
    await redis(['SET', 'digivated:submission:stuck-unpaid', JSON.stringify({ id: 'stuck-unpaid', status: 'pending', name: 'Unpaid instant', promotion: { included: 'instant-launch', verified: true } })]);
    assert.equal(await deleteStuckSubmissions(redis, [...preview.map(row => row.id), 'live', 'badge-wait', '../bad']), 1);
    assert.equal(await redis(['EXISTS', 'digivated:submission:stuck-review']), 0);
    assert.equal(await redis(['EXISTS', 'digivated:launch-slug:manual-pending']), 0);
    for (const id of Object.keys(records).filter(id => id !== 'stuck-review')) assert.equal(await redis(['EXISTS', 'digivated:submission:' + id]), 1, id);
    assert.equal(await redis(['ZCARD', 'digivated:submissions']), Object.keys(records).length - 1);
  } finally { await redis(['FLUSHDB']); }
});
