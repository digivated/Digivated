import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEdit } from '../server/admin-store.mjs';
import { makeAdminHandler } from '../server/admin-handler.mjs';
import { adminConfig, createSession, ADMIN_COOKIE } from '../server/admin-auth.mjs';
import { checkPendingBadges, makeLaunchQueueHandler, QUEUE } from '../server/launch-queue.mjs';
import { makeLaunchesHandler } from '../server/launches.mjs';
import { testRedis } from './helpers/redis.mjs';

const scheduledAt = '2099-01-05T14:00:00.000Z';
const record = { id: 'owner-queued', accountId: 'owner', name: 'Owner queued', creator: 'Maker', email: 'maker@example.com', description: 'A useful independent project.', category: 'Other', url: 'https://example.com', image: 'data:image/png;base64,fixture', consent: true, date: new Date().toISOString(), status: 'pending', launch: { kind: 'free', scheduledAt }, revision: 0 };
const edit = extra => ({ ...record, image: undefined, ...extra });

test('owner queue approval is explicit, preserves the date and does not claim a verified badge', () => {
  const saved = validateEdit('submission', edit({ approveFreeLaunch: true }), record);
  assert.ok(saved.launch.ownerApprovedAt);
  assert.equal(saved.launch.badgeVerifiedAt, undefined);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.launch.scheduledAt, scheduledAt);
  assert.equal(saved.launch.scheduledTimestamp, Date.parse(scheduledAt));
  assert.equal(validateEdit('submission', edit({ launch: { ...record.launch, ownerApprovedAt: 'forged' } }), record).launch.ownerApprovedAt, undefined);
  for (const previous of [{ ...record, launch: undefined }, { ...record, launch: { kind: 'instant', scheduledAt } }, { ...record, status: 'approved' }, { ...record, promotion: { included: 'instant-launch' } }, { ...record, launch: { kind: 'free', scheduledAt: '2020-01-06T14:00:00Z' } }]) {
    assert.throws(() => validateEdit('submission', { ...edit({ approveFreeLaunch: true }), revision: 0 }, previous), /pending free launch/);
  }
  const changed = validateEdit('submission', edit({ url: 'https://changed.example', revision: saved.revision }), saved);
  assert.equal(changed.launch.ownerApprovedAt, undefined);
});

test('real Redis: only the owner can queue an exception, which publishes once on its date', { skip: !process.env.DIGIVATED_TEST_REDIS_PORT }, async () => {
  const redis = testRedis(11);
  await redis(['FLUSHDB']);
  try {
    await redis(['SET', `digivated:submission:${record.id}`, JSON.stringify(record)]);
    await redis(['ZADD', 'digivated:submissions', Date.parse(record.date), record.id]);
    const env = { DIGIVATED_ADMIN_PASSWORD_HASH: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`, DIGIVATED_ADMIN_SESSION_SECRET: 'c'.repeat(64), DIGIVATED_ADMIN_ORIGIN: 'https://owner.test' };
    const session = await createSession(redis, adminConfig(env));
    const handler = makeAdminHandler({ env, redis, notifyProjectUpdate: async () => 'skipped' });
    const body = { action: 'save', kind: 'submission', record: edit({ approveFreeLaunch: true }) };
    const invoke = async headers => {
      const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
      await handler({ method: 'POST', url: '/api/admin', headers: { origin: env.DIGIVATED_ADMIN_ORIGIN, 'content-type': 'application/json', ...headers }, body }, res);
      return res;
    };
    assert.equal((await invoke({})).statusCode, 401);
    const cookie = `${ADMIN_COOKIE}=${session.token}`;
    assert.equal((await invoke({ cookie })).statusCode, 403);
    assert.equal(await redis(['ZSCORE', QUEUE, record.id]), null);
    const response = await invoke({ cookie, 'x-admin-csrf': session.csrf });
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.record.launch.ownerApprovedAt);
    assert.equal(response.body.record.launch.badgeVerifiedAt, undefined);
    assert.equal(Number(await redis(['ZSCORE', QUEUE, record.id])), Date.parse(scheduledAt));
    assert.equal(await redis(['GET', `digivated:public:submission:${record.id}`]), null);
    const upcoming = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await makeLaunchesHandler({ redis })({ method: 'GET', url: '/api/launches?view=upcoming', headers: {} }, upcoming);
    assert.ok(upcoming.body.items.some(item => item.id === record.id));
    const scan = await checkPendingBadges(redis, { readSite: async () => assert.fail('Owner approval does not need a badge'), mail: async () => assert.fail('No badge reminder expected') });
    assert.equal(scan.waiting, 0);
    let now = Date.parse(scheduledAt) - 1;
    const publish = makeLaunchQueueHandler({ redis, env: { CRON_SECRET: 'fixture' }, now: () => now });
    const cycle = async () => { const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } }; await publish({ method: 'GET', headers: { authorization: 'Bearer fixture' } }, res); return res.body; };
    assert.equal((await cycle()).published, 0);
    now++;
    assert.equal((await cycle()).published, 1);
    assert.equal((await cycle()).published, 0);
    const saved = JSON.parse(await redis(['GET', `digivated:submission:${record.id}`]));
    assert.equal(saved.status, 'approved');
    assert.equal(saved.launch.badgeVerifiedAt, undefined);
  } finally { await redis(['FLUSHDB']); }
});
