import { randomUUID } from 'node:crypto';
import { redisClient } from './submissions.mjs';
import { validId, storageKey, projectPublic } from './admin-store.mjs';
import { commentIndex, commentKey } from './card-interactions.mjs';
import { addNotification, notifyUpvoteDigest } from './notifications.mjs';
import { verifiedAccount } from './project-account.mjs';
import { bumpStat, notePost } from './launch-score.mjs';
import { COMMENT_MAX } from '../src/data/forums.mjs';

// Product Hunt-style discussions shared by project pages and forum threads.
// Comments reuse the existing comment records and per-item index, so admin
// moderation, comment counts and the all-comments feed keep working.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_COMMENTS = 300;
const DAILY_COMMENTS = 20;
export const threadKey = id => `digivated:thread:${id}`;
const profileKey = id => `digivated:creator:profile:${id}`;
const likesKey = id => `digivated:discussion:likes:${id}`;
const likedKey = (accountId, id) => `digivated:discussion:liked:${accountId}:${id}`;

export class DiscussionError extends Error { constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; } }

// KEYS: daily limit, entry, all-comments index, subject index. ARGV: entry, score, id, limit.
export const POST = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],86400) end
if n>tonumber(ARGV[4]) then return 0 end
redis.call('SET',KEYS[2],ARGV[1]); redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3]); redis.call('ZADD',KEYS[4],ARGV[2],ARGV[3]); return 1`;
// KEYS: liked marker, like counter. Returns {liked, count}.
export const LIKE = `if redis.call('EXISTS',KEYS[1])==1 then redis.call('DEL',KEYS[1]); local c=redis.call('DECR',KEYS[2]); if c<0 then redis.call('SET',KEYS[2],0); c=0 end; return {0,c} end
redis.call('SET',KEYS[1],'1'); return {1,redis.call('INCR',KEYS[2])}`;

const parse = raw => { try { return JSON.parse(raw); } catch { return null; } };
const clean = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';

export async function memberIdentity(redis, accountId) {
  if (!UUID.test(accountId || '')) return null;
  const profile = parse(await redis(['GET', profileKey(accountId)]));
  if (!profile?.name) return null;
  return { name: String(profile.name).slice(0, 60), avatar: profile.public && profile.hasLogo ? `/api/creator-profile?logo=${accountId}` : '', profileUrl: profile.public ? `/creator?id=${accountId}` : '' };
}

// First post: members without a profile pick a display name, saved as a private profile.
export async function ensureIdentity(redis, account, displayName) {
  const existing = await memberIdentity(redis, account.id);
  if (existing) return existing;
  const name = typeof displayName === 'string' ? displayName.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > 40) throw new DiscussionError(409, 'Choose a display name (2–40 characters) to post.', { needsName: true });
  await redis(['SET', profileKey(account.id), JSON.stringify({ name, bio: '', website: '', social: '', public: false, hasLogo: false, updatedAt: new Date().toISOString() }), 'NX']);
  return await memberIdentity(redis, account.id) || { name, avatar: '', profileUrl: '' };
}

export async function resolveSubject(redis, type, id) {
  if (!validId(id)) return null;
  if (type === 'project') {
    const record = parse(await redis(['GET', storageKey('submission', id)]));
    const project = record && projectPublic(record);
    return project ? { type, id, title: project.name, href: project.pageUrl, ownerId: UUID.test(record.accountId || '') ? record.accountId : null, ownerLabel: 'Maker' } : null;
  }
  if (type === 'thread') {
    const thread = parse(await redis(['GET', threadKey(id)]));
    return thread?.status === 'published' ? { type, id, title: thread.title, href: `/threads/${thread.slug}`, ownerId: thread.authorId, ownerLabel: 'Author' } : null;
  }
  return null;
}

export async function readComments(redis, subject, viewerId) {
  const ids = await redis(['ZREVRANGE', commentIndex(subject.type, subject.id), 0, MAX_COMMENTS - 1]);
  if (!ids.length) return [];
  const [raws, likes, liked] = await Promise.all([
    redis(['MGET', ...ids.map(commentKey)]),
    redis(['MGET', ...ids.map(likesKey)]),
    viewerId ? redis(['MGET', ...ids.map(id => likedKey(viewerId, id))]) : Promise.resolve([]),
  ]);
  const entries = raws.map((raw, index) => {
    const entry = parse(raw);
    if (!entry || entry.status !== 'approved' || entry.itemId !== subject.id || entry.type !== subject.type) return null;
    const owner = entry.maker || (entry.accountId && entry.accountId === subject.ownerId);
    return {
      id: entry.id, ...(entry.parentId ? { parentId: entry.parentId } : {}), ...(entry.replyTo ? { replyTo: entry.replyTo } : {}),
      author: { name: entry.name || 'Member', avatar: entry.avatar || '', profileUrl: entry.profileUrl || '' },
      ...(owner ? { badge: subject.ownerLabel } : {}), body: entry.body, date: entry.date,
      likes: Math.max(0, Number(likes[index]) || 0), ...(liked[index] ? { liked: true } : {}),
      ...(viewerId && entry.accountId === viewerId ? { mine: true } : {}),
    };
  }).filter(Boolean);
  // Replies to a removed comment are hidden with it.
  const roots = new Set(entries.filter(entry => !entry.parentId).map(entry => entry.id));
  return entries.filter(entry => !entry.parentId || roots.has(entry.parentId));
}

export async function postComment(redis, { subject, account, identity, body, parentId, now = Date.now(), purpose = 'project-feedback', extra = {} }) {
  const text = clean(body);
  if (text.length < 2 || text.length > COMMENT_MAX) throw new DiscussionError(400, `Write between 2 and ${COMMENT_MAX} characters.`);
  let parent = null, rootId = null;
  if (parentId !== undefined && parentId !== null && parentId !== '') {
    parent = UUID.test(parentId) ? parse(await redis(['GET', commentKey(parentId)])) : null;
    if (!parent || parent.status !== 'approved' || parent.itemId !== subject.id || parent.type !== subject.type) throw new DiscussionError(404, 'That comment is no longer available.');
    rootId = parent.parentId || parent.id; // One visual level of replies, like Product Hunt.
  }
  const entry = {
    id: randomUUID(), type: subject.type, itemId: subject.id, name: identity.name, avatar: identity.avatar || '', profileUrl: identity.profileUrl || '',
    accountId: account.id, body: text, date: new Date(now).toISOString(), status: 'approved', purpose,
    ...(rootId ? { parentId: rootId, replyTo: parent.name || 'Member', replyToId: parent.id } : {}),
    ...(account.id === subject.ownerId && subject.type === 'project' ? { maker: true } : {}), ...extra,
  };
  const saved = await redis(['EVAL', POST, 4, `digivated:discussion:limit:${account.id}:${subject.type}:${subject.id}`, commentKey(entry.id), 'digivated:card:comments:all', commentIndex(subject.type, subject.id), JSON.stringify(entry), now, entry.id, DAILY_COMMENTS]);
  if (saved !== 1) throw new DiscussionError(429, 'You’ve reached today’s limit for this discussion. Please come back tomorrow.');
  await notifyComment(redis, subject, entry, parent).catch(() => {});
  await notePost(redis, account.id, now).catch(() => {});
  if (subject.type === 'project') await bumpStat(redis, subject.id, 'comments', now).catch(() => {});
  return entry;
}

// One notification per person: the person replied to, then the maker or thread author.
async function notifyComment(redis, subject, entry, parent) {
  const link = `${subject.href}#comment-${entry.id}`;
  const excerpt = entry.body.slice(0, 160);
  const notified = new Set([entry.accountId]);
  if (parent?.accountId && !notified.has(parent.accountId)) {
    notified.add(parent.accountId);
    await addNotification(redis, { recipientId: parent.accountId, type: 'reply', actorId: entry.accountId, link, actorName: entry.name, verb: 'replied to your comment on', subject: subject.title, excerpt });
  }
  if (subject.ownerId && !notified.has(subject.ownerId)) {
    notified.add(subject.ownerId);
    if (subject.type === 'project') await addNotification(redis, { recipientId: subject.ownerId, type: 'feedback', actorId: entry.accountId, link, actorName: entry.name, verb: parent ? 'replied in the discussion on' : 'commented on', subject: subject.title, excerpt });
    else await addNotification(redis, { recipientId: subject.ownerId, type: 'reply', actorId: entry.accountId, link, actorName: entry.name, verb: 'replied to your thread', subject: subject.title, excerpt });
  }
}

export async function toggleCommentLike(redis, subject, commentId, account) {
  const entry = UUID.test(commentId || '') ? parse(await redis(['GET', commentKey(commentId)])) : null;
  if (!entry || entry.status !== 'approved' || entry.itemId !== subject.id || entry.type !== subject.type) throw new DiscussionError(404, 'This comment is not available.');
  const [liked, likes] = await redis(['EVAL', LIKE, 2, likedKey(account.id, commentId), likesKey(commentId)]);
  if (Number(liked) === 1 && entry.accountId) {
    await notifyUpvoteDigest(redis, { recipientId: entry.accountId, actorId: account.id, subjectKey: `comment:${commentId}`, subject: subject.title, link: `${subject.href}#comment-${commentId}`, noun: 'comment on' }).catch(() => {});
  }
  return { liked: Number(liked) === 1, likes: Math.max(0, Number(likes) || 0) };
}

export async function deleteComment(redis, subject, commentId, account) {
  const entry = UUID.test(commentId || '') ? parse(await redis(['GET', commentKey(commentId)])) : null;
  if (!entry || entry.itemId !== subject.id || entry.type !== subject.type || entry.status !== 'approved') throw new DiscussionError(404, 'This comment is not available.');
  if (entry.accountId !== account.id) throw new DiscussionError(403, 'You can only delete your own comments.');
  entry.status = 'removed'; entry.removedAt = new Date().toISOString();
  await redis(['SET', commentKey(commentId), JSON.stringify(entry)]);
  await redis(['ZREM', commentIndex(subject.type, subject.id), commentId]);
  return true;
}

export async function readJson(req, max = 8192) {
  let body = req.body;
  if (body === undefined) { const chunks = []; let size = 0; for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > max) throw new DiscussionError(413, 'This is too long.'); chunks.push(Buffer.from(chunk)); } body = Buffer.concat(chunks).toString('utf8'); }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw new DiscussionError(400, 'Check the form and try again.'); } }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > max) throw new DiscussionError(400, 'Check the form and try again.');
  return body;
}
export function guardPost(req, env) {
  const origin = env.SUBMISSIONS_ORIGIN || 'https://digivated.com';
  if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') throw new DiscussionError(403, 'Open this on Digivated to continue.');
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new DiscussionError(415, 'Use the form on Digivated.');
  if (/bot|crawler|spider|headless|preview/i.test(req.headers['user-agent'] || '')) throw new DiscussionError(403, 'This action is unavailable.');
}

// /api/discussions?type=project|thread&id=… — read, comment, reply, upvote, delete.
export function makeDiscussionHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Method not allowed.' }); }
      const env = deps.env || process.env;
      const url = new URL(req.url, 'https://digivated.invalid');
      if (url.pathname !== '/api/discussions') return send(404, { error: 'Not found.' });
      if (!deps.redis && (!env.SUBMISSIONS_REDIS_REST_URL || !env.SUBMISSIONS_REDIS_REST_TOKEN)) return send(503, { error: 'Discussions are temporarily unavailable.' });
      const redis = deps.redis || redisClient(env);
      const verify = deps.verifyAccount || verifiedAccount;
      const account = req.headers.authorization ? await verify(req, env, deps.fetcher || fetch) : null;
      let body = {};
      if (req.method === 'POST') { guardPost(req, env); body = await readJson(req); }
      const type = req.method === 'GET' ? url.searchParams.get('type') || 'project' : body.type || 'project';
      const id = req.method === 'GET' ? url.searchParams.get('id') : body.id;
      const subject = ['project', 'thread'].includes(type) ? await resolveSubject(redis, type, id) : null;
      if (!subject) return send(404, { error: 'This discussion is not available.' });
      if (req.method === 'GET') {
        const comments = await readComments(redis, subject, account?.id);
        const identity = account ? await memberIdentity(redis, account.id) : null;
        return send(200, { comments, count: comments.length, viewer: account ? { signedIn: true, name: identity?.name || '', avatar: identity?.avatar || '', needsName: !identity } : { signedIn: false } });
      }
      if (!account) return send(401, { error: 'Sign in to join the discussion.' });
      const now = deps.now ? deps.now() : Date.now();
      if (body.action === 'post') {
        const identity = await ensureIdentity(redis, account, body.displayName);
        const entry = await postComment(redis, { subject, account, identity, body: body.body, parentId: body.parentId, now });
        const [comment] = (await readComments(redis, subject, account.id)).filter(item => item.id === entry.id);
        return send(201, { comment: comment || null });
      }
      if (body.action === 'like') return send(200, await toggleCommentLike(redis, subject, body.commentId, account));
      if (body.action === 'delete') { await deleteComment(redis, subject, body.commentId, account); return send(200, { ok: true }); }
      return send(400, { error: 'Unknown action.' });
    } catch (error) {
      if (error instanceof DiscussionError) return send(error.status, { error: error.message, ...error.extra });
      return send(503, { error: 'This action is temporarily unavailable. Please try again later.' });
    }
  };
}
