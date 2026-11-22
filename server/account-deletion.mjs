// Self-service account deletion.
//
// Order matters: site data is cleared first and the sign-in account is removed last.
// Every step is safe to repeat, so if anything fails partway the person can simply
// try again while still signed in. Payment records stay, as tax law requires.
import { accountIndex, ownedSubmissions } from './project-account.mjs';
import { clearNotifications, launchWatchersKey, launchWatchingKey } from './notifications.mjs';
import { pointsLedgerKey, pointsTotalKey } from './feedback-points.mjs';
import { commentKey } from './card-interactions.mjs';

export const DELETED_NAME = 'Deleted account';
const LIVE_OR_WAITING = new Set(['pending', 'approved', 'featured']);
const parse = raw => { try { return JSON.parse(raw); } catch { return null; } };

async function scan(redis, indexKey, recordKey, visit) {
  const ids = await redis(['ZRANGE', indexKey, 0, -1]);
  if (!Array.isArray(ids)) return;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const page = ids.slice(offset, offset + 100);
    const rows = await redis(['MGET', ...page.map(recordKey)]);
    if (!Array.isArray(rows)) continue;
    for (let i = 0; i < page.length; i++) {
      const row = parse(rows[i]);
      if (row) await visit(page[i], row);
    }
  }
}

// Takes the person's launches off the site. This mirrors what the owner dashboard's save
// does for an archived listing (public copy and index removed, free-launch queue entry
// removed, page unpublished) but only changes the status, so older records that would
// fail today's edit checks can still be archived. The revision check makes it safe
// against a concurrent edit.
export const ARCHIVE_LAUNCH = `
local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end
if (cjson.decode(raw).revision or 0)~=tonumber(ARGV[1]) then return -1 end
redis.call('SET',KEYS[1],ARGV[2])
redis.call('DEL',KEYS[2]); redis.call('ZREM',KEYS[3],ARGV[3]); redis.call('ZREM',KEYS[4],ARGV[3])
return 1`;

async function archiveLaunches(redis, account, secret) {
  let archived = 0;
  for (const row of await ownedSubmissions(redis, account, secret)) {
    if (!LIVE_OR_WAITING.has(row.status)) continue;
    const revision = Number.isInteger(row.revision) ? row.revision : 0;
    // The record is built here, not in Lua, so its JSON shape is kept exactly.
    const record = { ...row, status: 'archived', pagePublished: false, revision: revision + 1, reviewedAt: new Date().toISOString() };
    const result = await redis(['EVAL', ARCHIVE_LAUNCH, 4, `digivated:submission:${row.id}`, `digivated:public:submission:${row.id}`, 'digivated:public:submissions', 'digivated:launch:free', revision, JSON.stringify(record), row.id]);
    if (result === -1) throw new Error('One of your launches changed while deleting. Please try again.');
    if (result === 1) archived++;
  }
  return archived;
}

// Comments keep their place in conversations but lose the name, photo and profile link.
async function anonymizeComments(redis, accountId) {
  let changed = 0;
  await scan(redis, 'digivated:card:comments:all', commentKey, async (id, comment) => {
    if (comment.accountId !== accountId) return;
    const { accountId: _removed, ...rest } = comment;
    await redis(['SET', commentKey(id), JSON.stringify({ ...rest, name: DELETED_NAME, avatar: '', profileUrl: '', maker: false })]);
    changed++;
  });
  await scan(redis, 'digivated:threads:all', id => `digivated:thread:${id}`, async (id, thread) => {
    if (thread.authorId !== accountId) return;
    await redis(['SET', `digivated:thread:${id}`, JSON.stringify({ ...thread, authorId: '', authorName: DELETED_NAME, authorAvatar: '', authorProfileUrl: '' })]);
    changed++;
  });
  return changed;
}

async function clearPersonalData(redis, account, secret) {
  const id = account.id;
  // Maker profile and photo.
  await redis(['DEL', `digivated:creator:profile:${id}`, `digivated:creator:logo:${id}`]);
  await redis(['ZREM', 'digivated:creator:public', id]);
  // Follows, both directions.
  const following = await redis(['SMEMBERS', `digivated:creator:following:${id}`]);
  for (const other of Array.isArray(following) ? following : []) await redis(['SREM', `digivated:creator:followers:${other}`, id]);
  const followers = await redis(['SMEMBERS', `digivated:creator:followers:${id}`]);
  for (const other of Array.isArray(followers) ? followers : []) await redis(['SREM', `digivated:creator:following:${other}`, id]);
  await redis(['DEL', `digivated:creator:following:${id}`, `digivated:creator:followers:${id}`]);
  // "Notify me" sign-ups for upcoming launches.
  const watching = await redis(['SMEMBERS', launchWatchingKey(id)]);
  for (const launch of Array.isArray(watching) ? watching : []) await redis(['SREM', launchWatchersKey(launch), id]);
  await redis(['DEL', launchWatchingKey(id)]);
  // Notifications, alert settings, the weekly email and feedback points.
  await clearNotifications(redis, id);
  await redis(['DEL', `digivated:notifications:preferences:${id}`, `digivated:weekly:preference:${id}`, `digivated:weekly:request:${id}`, pointsTotalKey(id), pointsLedgerKey(id)]);
  await redis(['ZREM', 'digivated:weekly:members', id]);
  // The private list that links this email address to its submissions.
  await redis(['DEL', accountIndex(account.email, secret), `${accountIndex(account.email, secret)}:legacy-scanned`]);
}

export async function deleteAccount({ redis, account, secret, deleteUser }) {
  const archived = await archiveLaunches(redis, account, secret);
  const anonymized = await anonymizeComments(redis, account.id);
  await clearPersonalData(redis, account, secret);
  // Last: remove the sign-in itself. Google links and sessions go with it.
  const { error } = await deleteUser(account.id);
  if (error && !/not.?found/i.test(error.message || '')) throw new Error('Your account could not be deleted. Please try again.');
  return { archived, anonymized };
}
