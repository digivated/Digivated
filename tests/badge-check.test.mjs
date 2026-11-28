import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkPendingBadges, reminderStage, badgeSnippet, makeBadgeCheckHandler } from '../server/launch-queue.mjs';
import { hasProjectBadge, badgeProblem } from '../server/project-site.mjs';
import { badgeEmail } from '../server/account-mail.mjs';
import { makeAdminHandler } from '../server/admin-handler.mjs';
import { ADMIN_COOKIE, adminConfig, createSession } from '../server/admin-auth.mjs';

const DAY = 86_400_000, now = Date.parse('2026-11-18T16:00:00Z');
const base = (id, extra = {}) => ({ id, accountId: '11111111-1111-4111-8111-111111111111', email: `${id}@example.com`, name: id, creator: 'Maker', description: 'A useful project.', category: 'Other', url: `https://${id}.example`, image: 'data:image/png;base64,x', consent: true, status: 'pending', date: new Date(now - 2 * DAY).toISOString(), launch: { kind: 'free', scheduledAt: new Date(now + 5 * DAY).toISOString() }, ...extra });

function fakeRedis(records) {
  const store = new Map(records.map(r => [`digivated:submission:${r.id}`, JSON.stringify(r)])), keys = new Set();
  const redis = async ([cmd, ...args]) => {
    if (cmd === 'ZRANGEBYSCORE') return records.map(r => r.id);
    if (cmd === 'GET') return store.get(args[0]) ?? null;
    if (cmd === 'SET') { if (args.includes('NX') && keys.has(args[0])) return null; keys.add(args[0]); store.set(args[0], args[1]); return 'OK'; }
    if (cmd === 'DEL') { keys.delete(args[0]); store.delete(args[0]); return 1; }
    if (cmd === 'EXISTS') return keys.has(args[0]) ? 1 : 0;
    if (cmd === 'EVAL') { if (args[1] === 4) store.set(args[2], args[7]); return 1; }
    return null;
  };
  return { redis, store, keys };
}

test('daily check verifies badges makers added without pressing the button', async () => {
  const found = base('found'), missing = base('missing'), live = base('live', { status: 'approved' });
  const { redis, store } = fakeRedis([found, missing, live]);
  const mails = [];
  const result = await checkPendingBadges(redis, { now, readSite: async url => ({ html: url.includes('found') ? `<footer>${badgeSnippet('found')}</footer>` : '<p>Nothing</p>' }), mail: async (r, stage) => { mails.push([r.id, stage]); return 'sent'; } });
  assert.equal(result.waiting, 2); assert.equal(result.verified, 1); assert.equal(result.reminded, 1);
  assert.ok(JSON.parse(store.get('digivated:submission:found')).launch.badgeVerifiedAt);
  assert.equal(JSON.parse(store.get('digivated:submission:missing')).launch.badgeVerifiedAt, undefined);
  assert.deepEqual(mails.sort(), [['found', 'verified'], ['missing', 'finish']]);
});

test('a badge added after the first scan is automatically queued without changing its launch date', async () => {
  const record = base('late-badge', { launch: { kind: 'free', scheduledAt: '2026-11-30T14:00:00.000Z' } });
  const { redis, store } = fakeRedis([record]);
  let html = '', reads = 0;
  const mails = [];
  const opts = { now, readSite: async () => { reads++; return { html }; }, mail: async (r, stage) => { mails.push(stage); return 'sent'; } };
  await checkPendingBadges(redis, opts);
  assert.equal(JSON.parse(store.get(`digivated:submission:${record.id}`)).launch.badgeVerifiedAt, undefined);
  html = badgeSnippet(record.id);
  const second = await checkPendingBadges(redis, { ...opts, now: now + 15 * 60_000 });
  assert.equal(second.verified, 1);
  const saved = JSON.parse(store.get(`digivated:submission:${record.id}`));
  assert.equal(saved.status, 'pending');
  assert.equal(saved.launch.scheduledAt, record.launch.scheduledAt);
  assert.equal(saved.launch.scheduledTimestamp, Date.parse(record.launch.scheduledAt));
  assert.ok(saved.launch.badgeVerifiedAt);
  await checkPendingBadges(redis, { ...opts, now: now + 30 * 60_000 });
  assert.equal(reads, 2);
  assert.equal(store.get(`digivated:submission:${record.id}`), JSON.stringify(saved));
  assert.deepEqual(mails, ['finish', 'verified']);
});

test('owner badge recovery requires a session and CSRF, then validates the real website', async () => {
  const record = base('owner-check', { launch: { kind: 'free', scheduledAt: '2099-01-05T14:00:00.000Z' } });
  const { redis, store } = fakeRedis([record]);
  const env = { DIGIVATED_ADMIN_PASSWORD_HASH: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`, DIGIVATED_ADMIN_SESSION_SECRET: 'c'.repeat(64), DIGIVATED_ADMIN_ORIGIN: 'https://owner.test' };
  const session = await createSession(redis, adminConfig(env));
  let reads = 0;
  const handler = makeAdminHandler({ env, redis, readSite: async () => { reads++; return { html: badgeSnippet(record.id) }; } });
  const invoke = async headers => {
    const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await handler({ method: 'POST', url: '/api/admin', headers: { origin: env.DIGIVATED_ADMIN_ORIGIN, 'content-type': 'application/json', ...headers }, body: { action: 'check-badges' } }, res);
    return res;
  };
  assert.equal((await invoke({})).statusCode, 401);
  const cookie = `${ADMIN_COOKIE}=${session.token}`;
  assert.equal((await invoke({ cookie })).statusCode, 403);
  assert.equal(reads, 0);
  const response = await invoke({ cookie, 'x-admin-csrf': session.csrf });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.verified, 1);
  assert.equal(response.body.reminded, 0);
  assert.ok(JSON.parse(store.get(`digivated:submission:${record.id}`)).launch.badgeVerifiedAt);
});

test('reminders go out once per stage, and a failed send is retried next run', async () => {
  const { redis } = fakeRedis([base('a')]);
  const mails = [];
  const opts = { now, readSite: async () => ({ html: '' }) };
  await checkPendingBadges(redis, { ...opts, mail: async () => 'failed' });
  await checkPendingBadges(redis, { ...opts, mail: async (r, s) => { mails.push(s); return 'sent'; } });
  await checkPendingBadges(redis, { ...opts, mail: async (r, s) => { mails.push(s); return 'sent'; } });
  assert.deepEqual(mails, ['finish']);
  await checkPendingBadges(redis, { ...opts, now: now + 21 * 3600_000, mail: async (r, s) => { mails.push(s); return 'sent'; } });
  assert.deepEqual(mails, ['finish', 'nudge']);
  const late = base('b', { launch: { kind: 'free', scheduledAt: new Date(now + 2 * DAY).toISOString() } });
  assert.equal(reminderStage(late, now), 'last-call');
  assert.equal(reminderStage(base('c', { date: new Date(now - 3600_000).toISOString() }), now), null);
  assert.equal(reminderStage(base('d', { launch: { kind: 'free', scheduledAt: new Date(now - DAY).toISOString() } }), now), null);
});

test('an unreachable site is not verified and does not stop the run', async () => {
  const { redis } = fakeRedis([base('down'), base('ok')]);
  const result = await checkPendingBadges(redis, { now, readSite: async url => { if (url.includes('down')) throw Error('timeout'); return { html: badgeSnippet('ok') }; }, mail: async () => 'sent' });
  assert.equal(result.verified, 1); assert.equal(result.errors, 0);
});

test('badge matching tolerates builder rewrites but not hidden or other badges', () => {
  const id = 'abc-1', b = badgeSnippet(id);
  for (const html of [b.replace('https://digivated.com', 'http://www.digivated.com'), b.replace(`listing/${id}"`, `listing/${id}/?utm_source=x"`), b.replace(/ data-digivated-project="[^"]*"/, '')]) assert.equal(hasProjectBadge(html, id), true, html);
  assert.equal(hasProjectBadge(b.replace(`data-digivated-project="${id}"`, 'data-digivated-project="other"'), id), false);
  assert.match(badgeProblem('<body><div id="root"></div></body>', id), /index\.html/);
  assert.match(badgeProblem(badgeSnippet('zzz'), id), /different project/);
  assert.match(badgeProblem('', id), /^Badge not found/);
});

test('reminder emails name the launch day and link to the project', () => {
  const message = badgeEmail(base('mail', { launch: { kind: 'free', scheduledAt: '2026-11-23T14:00:00Z' } }), 'last-call');
  assert.match(message.subject, /Monday, Nov 23/);
  assert.match(message.html, /dashboard#project-mail/);
  assert.match(badgeEmail(base('mail', { launch: { kind: 'free', scheduledAt: '2026-11-23T14:00:00Z' } }), 'finish').html, /automatically every 15 minutes/);
  assert.equal(badgeEmail({ id: 'x' }, 'nudge'), null);
});

test('finish notes reach projects past the first batch before a same-day second note', async () => {
  const soon = base('soon', { launch: { kind: 'free', scheduledAt: new Date(now + 2 * DAY).toISOString() } });
  const later = base('later', { launch: { kind: 'free', scheduledAt: new Date(now + 6 * DAY).toISOString() } });
  const { redis } = fakeRedis([soon, later]);
  const mails = [];
  const opts = { now, maxChecks: 1, readSite: async () => ({ html: '' }), mail: async (r, s) => { mails.push([r.id, s]); return 'sent'; } };
  await checkPendingBadges(redis, opts);
  await checkPendingBadges(redis, opts);
  assert.deepEqual(mails, [['soon', 'finish'], ['later', 'finish']]);
});

test('badge check runs every 15 minutes, including before Monday publication', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const cron = config.crons.find(item => item.path === '/api/badge-check');
  assert.equal(cron.schedule, '*/15 * * * *');
});

test('a silent check queues a found badge and does not email', async () => {
  const found = base('found'), missing = base('missing');
  const { redis, store } = fakeRedis([found, missing]);
  const result = await checkPendingBadges(redis, { now, silent: true, readSite: async url => ({ html: url.includes('found') ? `<footer>${badgeSnippet('found')}</footer>` : '<p>Nothing</p>' }), mail: async () => { throw new Error('no mail'); } });
  assert.equal(result.verified, 1);
  assert.deepEqual(result.queued, ['found']);
  assert.deepEqual(result.missing, ['missing']);
  assert.equal(result.reminded, 0);
  assert.ok(JSON.parse(store.get('digivated:submission:found')).launch.badgeVerifiedAt);
  assert.equal(JSON.parse(store.get('digivated:submission:missing')).launch.badgeVerifiedAt, undefined);
});

test('badge check endpoint requires the cron secret', async () => {
  const handler = makeBadgeCheckHandler({ env: { CRON_SECRET: 's' }, redis: async () => [] });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
  await handler({ method: 'GET', headers: {} }, res); assert.equal(res.statusCode, 401);
  await handler({ method: 'GET', url: '/api/badge-check?silent=1', headers: {} }, res); assert.equal(res.statusCode, 401);
  await handler({ method: 'GET', url: '/api/badge-check?silent=1', headers: { authorization: 'Bearer s' } }, res); assert.equal(res.statusCode, 200);
  await handler({ method: 'GET', headers: { authorization: 'Bearer s' } }, res); assert.equal(res.statusCode, 200);
});
