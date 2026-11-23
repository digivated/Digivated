import { sendActivityEmail } from './activity-email.mjs';
import { randomUUID } from 'node:crypto';
import { projectPublic, validId } from './admin-store.mjs';
import { freeLaunchSchedule, freeLaunchDay } from '../src/lib/launch-calendar.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TYPES = ['reply', 'follow', 'message', 'feedback', 'upvote', 'launch', 'award', 'approved', 'scheduled'];
const TITLES = {
  approved: 'Your project is live',
  scheduled: 'Badge verified. Your launch is scheduled',
  reply: 'Someone replied to your post',
  follow: 'A creator followed you',
  message: 'You have a new message',
  feedback: 'Your project received feedback',
  upvote: 'You received new upvotes',
  launch: 'A launch you follow is live',
  award: 'Your launch made the weekly podium',
};
const RETENTION_SECONDS = 90 * 86400;
export const notificationPreferencesKey = id => `digivated:notifications:preferences:${id}`;
const indexKey = id => `digivated:notifications:index:${id}`;
const unreadKey = id => `digivated:notifications:unread:${id}`;
const itemKey = id => `digivated:notifications:item:${id}`;

async function pruneExpired(redis, userId) {
  const expired = await redis(['ZRANGEBYSCORE', indexKey(userId), '-inf', Date.now() - RETENTION_SECONDS * 1000]);
  if (!expired.length) return;
  await redis(['ZREM', indexKey(userId), ...expired]);
  await redis(['SREM', unreadKey(userId), ...expired]);
  await redis(['DEL', ...expired.map(itemKey)]);
}

// Activity alerts are on unless a member has saved a different choice.
export const defaultNotificationPreferences = Object.freeze({ enabled: true, emailEnabled: false, reply: true, follow: true, message: true, feedback: true, upvote: true, launch: true, award: true });

export async function getNotificationPreferences(redis, userId) {
  if (!UUID.test(userId)) throw new Error('Invalid account');
  let saved; try { saved = JSON.parse(await redis(['GET', notificationPreferencesKey(userId)])); } catch {}
  return Object.fromEntries(Object.entries(defaultNotificationPreferences).map(([key, fallback]) => [key, typeof saved?.[key] === 'boolean' ? saved[key] : fallback]));
}

export async function saveNotificationPreferences(redis, userId, input) {
  if (!UUID.test(userId) || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid preferences');
  const keys = Object.keys(defaultNotificationPreferences);
  // Unknown keys are rejected; settings a client does not know yet keep their current value.
  if (Object.keys(input).some(key => !keys.includes(key)) || Object.values(input).some(value => typeof value !== 'boolean') || typeof input.enabled !== 'boolean') throw new Error('Invalid preferences');
  const current = await getNotificationPreferences(redis, userId);
  const preferences = Object.fromEntries(keys.map(key => [key, typeof input[key] === 'boolean' ? input[key] : current[key]]));
  await redis(['SET', notificationPreferencesKey(userId), JSON.stringify(preferences)]);
  return preferences;
}

// Links into a project or thread discussion, optionally to one comment.
export const SAFE_LINK = /^\/(?:projects\/(?:listing\/)?[a-z0-9][a-z0-9-]{0,99}|threads\/[a-z0-9][a-z0-9-]{0,99})(?:#comment-[a-f0-9-]{36})?$/;
const clip = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
function detail({ actorName, verb, subject, excerpt, count } = {}) {
  const text = { actor: clip(actorName, 60), verb: clip(verb, 60), subject: clip(subject, 120), excerpt: clip(excerpt, 160) };
  if (Number.isSafeInteger(count) && count > 0) text.count = count;
  return Object.fromEntries(Object.entries(text).filter(([, value]) => value !== ''));
}

export async function addNotification(redis, { recipientId, type, actorId, targetId, link, ...text } = {}) {
  if (!UUID.test(recipientId) || !TYPES.includes(type) || (actorId && !UUID.test(actorId)) || actorId === recipientId) return false;
  const preferences = await getNotificationPreferences(redis, recipientId);
  if (!preferences.enabled || !preferences[type]) return false;
  let href;
  if (['reply', 'feedback', 'launch'].includes(type) && typeof link === 'string' && SAFE_LINK.test(link)) href = link;
  else if (type === 'award' && link === '/#last-week') href = link;
  else if (type === 'follow' && UUID.test(actorId)) href = `/creator?id=${encodeURIComponent(actorId)}`;
  else if (type === 'feedback' && typeof targetId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(targetId)) href = `/discover#project-${encodeURIComponent(targetId)}`;
  else return false;
  // Repeated follow requests should never fill somebody else's activity feed.
  if (type === 'follow' && await redis(['SET', `digivated:notifications:follow:${recipientId}:${actorId}`, '1', 'EX', 86400, 'NX']) !== 'OK') return false;
  const id = randomUUID(), createdAt = new Date().toISOString();
  const item = { id, recipientId, type, title: TITLES[type], href, createdAt, ...detail(text) };
  await redis(['SET', itemKey(id), JSON.stringify(item), 'EX', RETENTION_SECONDS]);
  await redis(['ZADD', indexKey(recipientId), Date.now(), id]);
  await redis(['SADD', unreadKey(recipientId), id]);
  await trimFeed(redis, recipientId);
  if (preferences.emailEnabled) await deliverActivityEmail(redis, item);
  return true;
}

// Upvotes arrive as one daily digest per item ("Pocketlog got 3 upvotes today"),
// moved to the top and marked unread as more arrive. Never sent for your own votes.
export async function notifyUpvoteDigest(redis, { recipientId, actorId, subjectKey, subject, link, noun = 'project' } = {}) {
  if (!UUID.test(recipientId || '') || (actorId && actorId === recipientId) || typeof subjectKey !== 'string' || !/^[a-z0-9:-]{1,140}$/.test(subjectKey) || !SAFE_LINK.test(link || '')) return false;
  const preferences = await getNotificationPreferences(redis, recipientId);
  if (!preferences.enabled || !preferences.upvote) return false;
  const day = new Date().toISOString().slice(0, 10);
  const digestKey = `digivated:notifications:digest:${recipientId}:${subjectKey}:${day}`;
  const count = Number(await redis(['INCR', digestKey])) || 1;
  if (count === 1) await redis(['EXPIRE', digestKey, 2 * 86400]);
  const pointer = `${digestKey}:item`;
  let id = await redis(['GET', pointer]);
  let item = null;
  if (id) { try { item = JSON.parse(await redis(['GET', itemKey(id)])); } catch { item = null; } }
  if (!item || item.recipientId !== recipientId) { id = randomUUID(); item = { id, recipientId, type: 'upvote', title: TITLES.upvote, href: link, createdAt: new Date().toISOString() }; await redis(['SET', pointer, id, 'EX', 2 * 86400]); }
  Object.assign(item, detail({ verb: `${count === 1 ? 'upvote' : 'upvotes'} today on your ${noun}`, subject, count }), { createdAt: new Date().toISOString() });
  await redis(['SET', itemKey(id), JSON.stringify(item), 'EX', RETENTION_SECONDS]);
  await redis(['ZADD', indexKey(recipientId), Date.now(), id]);
  await redis(['SADD', unreadKey(recipientId), id]);
  await trimFeed(redis, recipientId);
  if (count === 1 && preferences.emailEnabled) await deliverActivityEmail(redis, item);
  return true;
}

async function deliverActivityEmail(redis, item) {
  const result = await sendActivityEmail(redis, item);
  if (result === 'failed' || result === 'unavailable') console.warn('Activity email delivery failed', { type: item.type, result });
}

async function trimFeed(redis, recipientId) {
  await Promise.all([redis(['EXPIRE', indexKey(recipientId), RETENTION_SECONDS]), redis(['EXPIRE', unreadKey(recipientId), RETENTION_SECONDS])]);
  const size = Number(await redis(['ZCARD', indexKey(recipientId)])) || 0;
  if (size > 100) {
    const removed = await redis(['ZRANGE', indexKey(recipientId), 0, size - 101]);
    if (removed.length) {
      await redis(['ZREMRANGEBYRANK', indexKey(recipientId), 0, size - 101]);
      await redis(['SREM', unreadKey(recipientId), ...removed]);
      await redis(['DEL', ...removed.map(itemKey)]);
    }
  }
  return true;
}

function readVisibleNotification(raw, userId) {
  try {
    const item = JSON.parse(raw);
    if (item?.recipientId !== userId || !UUID.test(item.id) || !TYPES.includes(item.type) || item.type === 'message') return null;
    if (typeof item.href !== 'string' || !/^\/(?![\/\\])/.test(item.href) || /^\/(?:inbox|creators)(?:[/?#]|$)/.test(item.href)) return null;
    return item;
  } catch { return null; }
}

export async function notificationSummary(redis, userId) {
  const preferences = await getNotificationPreferences(redis, userId);
  await pruneExpired(redis, userId);
  const ids = await redis(['SMEMBERS', unreadKey(userId)]);
  const rows = ids.length ? await redis(['MGET', ...ids.map(itemKey)]) : [];
  const unread = rows.filter(raw => readVisibleNotification(raw, userId)).length;
  return { enabled: preferences.enabled, unread };
}

export async function listNotifications(redis, userId) {
  const preferences = await getNotificationPreferences(redis, userId);
  await pruneExpired(redis, userId);
  const ids = await redis(['ZREVRANGE', indexKey(userId), 0, 99]);
  const raws = ids.length ? await redis(['MGET', ...ids.map(itemKey)]) : [];
  const unread = new Set(await redis(['SMEMBERS', unreadKey(userId)]));
  const retiredUnread = [];
  const items = raws.flatMap((raw, index) => {
    const item = readVisibleNotification(raw, userId);
    if (!item) {
      if (unread.delete(ids[index])) retiredUnread.push(ids[index]);
      return [];
    }
    return [{ id:item.id, type:item.type, title:TITLES[item.type], href:item.href, createdAt:item.createdAt, unread:unread.has(item.id), ...detail({ actorName:item.actor, verb:item.verb, subject:item.subject, excerpt:item.excerpt, count:item.count }) }];
  });
  if (retiredUnread.length) await redis(['SREM', unreadKey(userId), ...retiredUnread]);
  return { preferences, items, unread: items.filter(item => item.unread).length };
}

export async function markNotificationRead(redis, userId, id) {
  if (!UUID.test(userId) || !UUID.test(id)) return false;
  let item; try { item = JSON.parse(await redis(['GET', itemKey(id)])); } catch { return false; }
  if (item?.recipientId !== userId) return false;
  await redis(['SREM', unreadKey(userId), id]);
  return true;
}

export async function markAllNotificationsRead(redis, userId) {
  if (!UUID.test(userId)) return;
  await redis(['DEL', unreadKey(userId)]);
}

export async function clearNotifications(redis, userId) {
  if (!UUID.test(userId)) return;
  const ids = await redis(['ZRANGE', indexKey(userId), 0, -1]);
  if (ids.length) await redis(['DEL', ...ids.map(itemKey)]);
  await Promise.all([redis(['DEL', indexKey(userId)]), redis(['DEL', unreadKey(userId)])]);
}

// Approval is a service update, independent of optional social notifications.
// The marker and feed write commit together, so concurrent retries cannot duplicate it.
export const APPROVAL_NOTICE = `
if redis.call('EXISTS',KEYS[1]) == 1 then return 0 end
-- Respect notices already written by the previous revision-based implementation.
for revision=0,tonumber(ARGV[5]) do
 if redis.call('EXISTS',ARGV[6]..revision) == 1 then
  redis.call('SET',KEYS[1],'1')
  return 0
 end
end
redis.call('SET',KEYS[2],ARGV[1],'EX',ARGV[4])
redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3])
redis.call('SADD',KEYS[4],ARGV[3])
redis.call('EXPIRE',KEYS[3],ARGV[4])
redis.call('EXPIRE',KEYS[4],ARGV[4])
local excess=redis.call('ZCARD',KEYS[3])-100
if excess>0 then
 local removed=redis.call('ZRANGE',KEYS[3],0,excess-1)
 for _,old in ipairs(removed) do
  redis.call('ZREM',KEYS[3],old)
  redis.call('SREM',KEYS[4],old)
  redis.call('DEL','digivated:notifications:item:'..old)
 end
end
redis.call('SET',KEYS[1],'1')
return 1`;
function publicApproval(record) {
  if (!validId(record?.id)) return null;
  return projectPublic(record);
}

async function writeApproval(redis, userId, record, project, publishedAt) {
  if (!UUID.test(userId || '')) return false;
  const id = randomUUID();
  const item = { id, recipientId:userId, type:'approved', title:TITLES.approved,
    href:project.pageUrl, createdAt:new Date(publishedAt).toISOString(),
    ...detail({ actorName: project.name, verb: 'is live on Digivated' }) };
  const marker = `digivated:notifications:approval:${userId}:${record.id}`;
  return await redis(['EVAL',APPROVAL_NOTICE,4,marker,
    itemKey(id),indexKey(userId),unreadKey(userId),
    JSON.stringify(item),publishedAt,id,RETENTION_SECONDS,
    Math.min(Number.isSafeInteger(record.revision) ? record.revision : 0, 1000),`${marker}:`]) === 1;
}

export async function notifyProjectApproval(redis, previous, record) {
  const project = publicApproval(record);
  if (!project || publicApproval(previous)) return false;
  const written = await writeApproval(redis, record.accountId, record, project, Date.now());
  try { await notifyLaunchAudience(redis, record, project); } catch { /* The launch is live either way. */ }
  return written;
}

// "Notify me" on an upcoming launch, plus the maker's followers: one alert each
// when the project goes live, sent once per project.
export const launchWatchersKey = id => `digivated:launch:watchers:${id}`;
export const launchWatchingKey = account => `digivated:launch:watching:${account}`;
const AUDIENCE_LIMIT = 200;
async function notifyLaunchAudience(redis, record, project) {
  if (!SAFE_LINK.test(project.pageUrl || '')) return 0;
  if (await redis(['SET', `digivated:launch:announced:${record.id}`, '1', 'NX', 'EX', RETENTION_SECONDS]) !== 'OK') return 0;
  const watchers = await redis(['SMEMBERS', launchWatchersKey(record.id)]);
  const followers = UUID.test(record.accountId || '') ? await redis(['SRANDMEMBER', `digivated:creator:followers:${record.accountId}`, AUDIENCE_LIMIT]) : [];
  const recipients = [...new Set([...(watchers || []), ...(followers || [])])].filter(id => UUID.test(id) && id !== record.accountId).slice(0, AUDIENCE_LIMIT);
  for (let i = 0; i < recipients.length; i += 10) {
    await Promise.all(recipients.slice(i, i + 10).map(recipientId => addNotification(redis, { recipientId, type: 'launch', link: project.pageUrl, actorName: project.name, verb: 'is live on Digivated' }).catch(() => false)));
  }
  return recipients.length;
}

// Rebuild missed recent events from the same live projects the owner can see
// in Your Projects. Older approvals remain visible as status, without new alerts.
export async function reconcileProjectApprovals(redis, userId, submissions, now = Date.now()) {
  const approvals = [];
  for (const record of submissions) {
    const project = publicApproval(record);
    if (!project) continue;
    approvals.push({ name:project.name, href:project.pageUrl });
    const publishedAt = Date.parse(record.publishedAt || record.reviewedAt || record.date);
    if (publishedAt > now - RETENTION_SECONDS * 1000 && publishedAt <= now) {
      await writeApproval(redis, userId, record, project, publishedAt);
    }
  }
  return approvals;
}

// Badge verification is a service update, like approval: always delivered once per project.
export async function notifyLaunchScheduled(redis, record) {
  const userId = record?.accountId;
  if (!UUID.test(userId || '') || !validId(record?.id) || !record.launch?.badgeVerifiedAt) return false;
  const id = randomUUID(), now = Date.now();
  const { scheduledAt, scheduledTimestamp } = freeLaunchSchedule(record);
  const item = { id, recipientId:userId, type:'scheduled', title:TITLES.scheduled,
    href:`/dashboard#project-${record.id}`, createdAt:new Date(now).toISOString(),
    ...detail({ actorName: record.name, verb: scheduledTimestamp > now
      ? `is scheduled for ${freeLaunchDay(scheduledAt)} at 9 AM Eastern`
      : 'has a verified launch badge' }) };
  const marker = `digivated:notifications:scheduled:${userId}:${record.id}`;
  return await redis(['EVAL',APPROVAL_NOTICE,4,marker,
    itemKey(id),indexKey(userId),unreadKey(userId),
    JSON.stringify(item),now,id,RETENTION_SECONDS,0,`${marker}:`]) === 1;
}
