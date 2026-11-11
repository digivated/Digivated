import { randomUUID } from 'node:crypto';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TYPES = ['reply', 'follow', 'message', 'feedback'];
const TITLES = {
  reply: 'Someone replied to your post',
  follow: 'A creator followed you',
  message: 'You have a new message',
  feedback: 'Your project received feedback',
};
const RETENTION_SECONDS = 90 * 86400;
const preferencesKey = id => `digivated:notifications:preferences:${id}`;
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

export const defaultNotificationPreferences = Object.freeze({ enabled: false, reply: true, follow: true, message: true, feedback: true });

export async function getNotificationPreferences(redis, userId) {
  if (!UUID.test(userId)) throw new Error('Invalid account');
  let saved; try { saved = JSON.parse(await redis(['GET', preferencesKey(userId)])); } catch {}
  return Object.fromEntries(Object.entries(defaultNotificationPreferences).map(([key, fallback]) => [key, typeof saved?.[key] === 'boolean' ? saved[key] : fallback]));
}

export async function saveNotificationPreferences(redis, userId, input) {
  if (!UUID.test(userId) || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid preferences');
  const keys = Object.keys(defaultNotificationPreferences);
  if (Object.keys(input).some(key => !keys.includes(key)) || keys.some(key => typeof input[key] !== 'boolean')) throw new Error('Invalid preferences');
  const preferences = Object.fromEntries(keys.map(key => [key, input[key]]));
  await redis(['SET', preferencesKey(userId), JSON.stringify(preferences)]);
  return preferences;
}

export async function addNotification(redis, { recipientId, type, actorId, targetId } = {}) {
  if (!UUID.test(recipientId) || !TYPES.includes(type) || (actorId && !UUID.test(actorId)) || actorId === recipientId) return false;
  const preferences = await getNotificationPreferences(redis, recipientId);
  if (!preferences.enabled || !preferences[type]) return false;
  let href;
  if (type === 'reply' && UUID.test(targetId)) href = `/creators?post=${encodeURIComponent(targetId)}`;
  else if (type === 'follow' && UUID.test(actorId)) href = `/creator?id=${encodeURIComponent(actorId)}`;
  else if (type === 'message' && UUID.test(actorId)) href = `/inbox?id=${encodeURIComponent(actorId)}`;
  else if (type === 'feedback' && typeof targetId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(targetId)) href = `/discover#project-${encodeURIComponent(targetId)}`;
  else return false;
  // Repeated follow requests should never fill somebody else's activity feed.
  if (type === 'follow' && await redis(['SET', `digivated:notifications:follow:${recipientId}:${actorId}`, '1', 'EX', 86400, 'NX']) !== 'OK') return false;
  const id = randomUUID(), createdAt = new Date().toISOString();
  const item = { id, recipientId, type, title: TITLES[type], href, createdAt };
  await redis(['SET', itemKey(id), JSON.stringify(item), 'EX', RETENTION_SECONDS]);
  await redis(['ZADD', indexKey(recipientId), Date.now(), id]);
  await redis(['SADD', unreadKey(recipientId), id]);
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

export async function notificationSummary(redis, userId) {
  const preferences = await getNotificationPreferences(redis, userId);
  await pruneExpired(redis, userId);
  return { enabled: preferences.enabled, unread: Number(await redis(['SCARD', unreadKey(userId)])) || 0 };
}

export async function listNotifications(redis, userId) {
  const preferences = await getNotificationPreferences(redis, userId);
  await pruneExpired(redis, userId);
  const ids = await redis(['ZREVRANGE', indexKey(userId), 0, 99]);
  const raws = ids.length ? await redis(['MGET', ...ids.map(itemKey)]) : [];
  const unread = new Set(await redis(['SMEMBERS', unreadKey(userId)]));
  const items = raws.flatMap(raw => {
    try { const item = JSON.parse(raw); return item.recipientId === userId && UUID.test(item.id) && TYPES.includes(item.type) ? [{ id:item.id, type:item.type, title:TITLES[item.type], href:item.href, createdAt:item.createdAt, unread:unread.has(item.id) }] : []; }
    catch { return []; }
  });
  return { preferences, items, unread: Number(await redis(['SCARD', unreadKey(userId)])) || 0 };
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
