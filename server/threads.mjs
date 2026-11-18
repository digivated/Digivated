import { randomUUID } from 'node:crypto';
import { redisClient } from './submissions.mjs';
import { verifiedAccount } from './project-account.mjs';
import { commentIndex, commentKey } from './card-interactions.mjs';
import { notifyUpvoteDigest } from './notifications.mjs';
import { storageKey, projectPublic } from './admin-store.mjs';
import { DiscussionError, ensureIdentity, guardPost, memberIdentity, readJson, threadKey } from './discussions.mjs';
import { forumBySlug, threadSlug, THREAD_BODY_MAX, THREAD_TITLE_MAX, THREAD_TITLE_MIN } from '../src/data/forums.mjs';
import { notePost } from './launch-score.mjs';

// Product Hunt-style forums: topic forums, threads with a title and body,
// upvotes, comments (via /api/discussions), trending and newest sorting.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ALL = 'digivated:threads:all';
const forumIndex = slug => `digivated:threads:forum:${slug}`;
const slugKey = slug => `digivated:thread:slug:${slug}`;
const votersKey = id => `digivated:thread:voters:${id}`;
const PAGE = 20;
const SCAN = 400;
const DAILY_THREADS = 5;

// KEYS: daily limit, record, slug, all index, forum index. ARGV: record, score, id, limit.
export const CREATE = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],86400) end
if n>tonumber(ARGV[4]) then return 0 end
if redis.call('SET',KEYS[3],ARGV[3],'NX')==false then return -1 end
redis.call('SET',KEYS[2],ARGV[1]); redis.call('ZADD',KEYS[4],ARGV[2],ARGV[3]); redis.call('ZADD',KEYS[5],ARGV[2],ARGV[3]); return 1`;
// KEYS: voters set. ARGV: account. Returns {voted, count}.
export const VOTE = `if redis.call('SISMEMBER',KEYS[1],ARGV[1])==1 then redis.call('SREM',KEYS[1],ARGV[1]); return {0,redis.call('SCARD',KEYS[1])} end
redis.call('SADD',KEYS[1],ARGV[1]); return {1,redis.call('SCARD',KEYS[1])}`;

const parse = raw => { try { return JSON.parse(raw); } catch { return null; } };
const clean = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
const excerpt = text => { const flat = String(text).replace(/\s+/g, ' ').trim(); return flat.length > 220 ? flat.slice(0, 219).trimEnd() + '…' : flat; };

function card(thread, votes, comments, viewerVoted, viewerId) {
  return {
    id: thread.id, slug: thread.slug, forum: thread.forum, title: thread.title, excerpt: excerpt(thread.body),
    author: { name: thread.authorName, avatar: thread.authorAvatar || '', profileUrl: thread.authorProfileUrl || '' },
    createdAt: thread.createdAt, pinned: Boolean(thread.pinned), votes, comments,
    ...(viewerVoted ? { voted: true } : {}), ...(viewerId && viewerId === thread.authorId ? { mine: true } : {}),
  };
}

async function enrich(redis, threads, viewerId) {
  if (!threads.length) return [];
  const [votes, comments, voted] = await Promise.all([
    Promise.all(threads.map(t => redis(['SCARD', votersKey(t.id)]))),
    Promise.all(threads.map(t => redis(['ZCARD', commentIndex('thread', t.id)]))),
    viewerId ? Promise.all(threads.map(t => redis(['SISMEMBER', votersKey(t.id), viewerId]))) : Promise.resolve([]),
  ]);
  return threads.map((t, i) => card(t, Number(votes[i]) || 0, Number(comments[i]) || 0, Number(voted[i]) === 1, viewerId));
}

async function loadThreads(redis, index, count = SCAN) {
  const ids = await redis(['ZREVRANGE', index, 0, count - 1]);
  if (!ids.length) return [];
  const raws = await redis(['MGET', ...ids.map(threadKey)]);
  return raws.map(parse).filter(t => t?.status === 'published');
}

export function trendingScore(item, now = Date.now()) {
  const hours = Math.max(0, (now - Date.parse(item.createdAt)) / 3_600_000);
  return (item.votes + item.comments * 2 + 1) / Math.pow(hours + 2, 1.4);
}

export async function listThreads(redis, { forum, sort = 'trending', offset = 0, query = '', viewerId, now = Date.now() } = {}) {
  const threads = await loadThreads(redis, forum ? forumIndex(forum) : ALL);
  const words = clean(query).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const matched = words.length ? threads.filter(t => { const hay = `${t.title} ${t.body}`.toLowerCase(); return words.every(w => hay.includes(w)); }) : threads;
  let items = await enrich(redis, matched, viewerId);
  if (sort === 'trending' && !words.length) items.sort((a, b) => trendingScore(b, now) - trendingScore(a, now));
  if (sort === 'top') items.sort((a, b) => b.votes - a.votes || b.comments - a.comments);
  if (!words.length) items = [...items.filter(t => t.pinned), ...items.filter(t => !t.pinned)];
  return { threads: items.slice(offset, offset + PAGE), next: offset + PAGE < items.length ? offset + PAGE : null, total: items.length };
}

// Latest comments across project and thread discussions ("Recent comments").
export async function recentComments(redis, limit = 30) {
  const ids = await redis(['ZREVRANGE', 'digivated:card:comments:all', 0, 199]);
  if (!ids.length) return [];
  const entries = (await redis(['MGET', ...ids.map(commentKey)])).map(parse)
    .filter(e => e?.status === 'approved' && e.purpose === 'project-feedback' && ['project', 'thread'].includes(e.type) && e.accountId).slice(0, limit * 2);
  const subjects = new Map();
  for (const e of entries) {
    const key = `${e.type}:${e.itemId}`;
    if (subjects.has(key)) continue;
    if (e.type === 'thread') { const t = parse(await redis(['GET', threadKey(e.itemId)])); subjects.set(key, t?.status === 'published' ? { title: t.title, href: `/threads/${t.slug}` } : null); }
    else { const r = parse(await redis(['GET', storageKey('submission', e.itemId)])); const p = r && projectPublic(r); subjects.set(key, p ? { title: p.name, href: p.pageUrl } : null); }
  }
  return entries.flatMap(e => { const s = subjects.get(`${e.type}:${e.itemId}`); return s ? [{ id: e.id, author: { name: e.name, avatar: e.avatar || '', profileUrl: e.profileUrl || '' }, body: excerpt(e.body), date: e.date, subject: { type: e.type, title: s.title, href: `${s.href}#comment-${e.id}` } }] : []; }).slice(0, limit);
}

export async function moderateThread(redis, id, { status, pinned } = {}) {
  if (!UUID.test(id || '')) return null;
  const thread = parse(await redis(['GET', threadKey(id)]));
  if (!thread) return null;
  if (status !== undefined) { if (!['published', 'removed'].includes(status)) return null; thread.status = status; }
  if (pinned !== undefined) thread.pinned = pinned === true;
  await redis(['SET', threadKey(id), JSON.stringify(thread)]);
  if (thread.status === 'removed') { await redis(['ZREM', ALL, id]); await redis(['ZREM', forumIndex(thread.forum), id]); }
  else { const score = Date.parse(thread.createdAt); await redis(['ZADD', ALL, score, id]); await redis(['ZADD', forumIndex(thread.forum), score, id]); }
  return thread;
}

export async function listThreadsForAdmin(redis, offset = 0) {
  const ids = await redis(['ZREVRANGE', 'digivated:threads:log', offset, offset + 49]);
  const raws = ids.length ? await redis(['MGET', ...ids.map(threadKey)]) : [];
  return { items: raws.map(parse).filter(Boolean).map(t => ({ id: t.id, slug: t.slug, forum: t.forum, title: t.title, body: excerpt(t.body), authorName: t.authorName, createdAt: t.createdAt, status: t.status, pinned: Boolean(t.pinned) })), next: ids.length === 50 ? offset + 50 : null };
}

export function makeThreadsHandler(deps = {}) {
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
      if (url.pathname !== '/api/threads') return send(404, { error: 'Not found.' });
      if (!deps.redis && (!env.SUBMISSIONS_REDIS_REST_URL || !env.SUBMISSIONS_REDIS_REST_TOKEN)) {
        return req.method === 'GET' && !url.searchParams.has('slug') ? send(200, { threads: [], comments: [], next: null, total: 0 }) : send(503, { error: 'Threads are temporarily unavailable.' });
      }
      const redis = deps.redis || redisClient(env);
      const account = req.headers.authorization ? await (deps.verifyAccount || verifiedAccount)(req, env, deps.fetcher || fetch) : null;
      const now = deps.now ? deps.now() : Date.now();

      if (req.method === 'GET') {
        const p = url.searchParams;
        if (p.get('view') === 'recent') return send(200, { comments: await recentComments(redis) });
        if (p.has('slug')) {
          const slug = p.get('slug');
          const id = /^[a-z0-9-]{1,100}$/.test(slug) ? await redis(['GET', slugKey(slug)]) : null;
          const thread = id ? parse(await redis(['GET', threadKey(id)])) : null;
          if (!thread) return send(404, { error: 'This thread could not be found.' });
          if (thread.status !== 'published') return send(410, { error: 'This thread was removed.' });
          const [item] = await enrich(redis, [thread], account?.id);
          return send(200, { thread: { ...item, body: thread.body, forumName: forumBySlug[thread.forum]?.name || 'General' } });
        }
        const forum = p.get('forum') || '';
        if (forum && !forumBySlug[forum]) return send(404, { error: 'This forum does not exist.' });
        const sort = ['trending', 'new', 'top'].includes(p.get('sort')) ? p.get('sort') : 'trending';
        const offset = Number(p.get('offset') || 0);
        if (!Number.isInteger(offset) || offset < 0 || offset > SCAN) return send(400, { error: 'Invalid page.' });
        const query = (p.get('q') || '').slice(0, 80);
        return send(200, await listThreads(redis, { forum, sort, offset, query, viewerId: account?.id, now }));
      }

      guardPost(req, env);
      const body = await readJson(req, 12000);
      if (!account) return send(401, { error: 'Sign in to post and vote in Threads.' });

      if (body.action === 'create') {
        if (body.company) return send(400, { error: 'Check the form and try again.' });
        const forum = forumBySlug[body.forum] ? body.forum : null;
        const title = clean(body.title).replace(/\s+/g, ' ');
        const text = clean(body.body);
        if (!forum) return send(400, { error: 'Choose a forum.' });
        if (title.length < THREAD_TITLE_MIN || title.length > THREAD_TITLE_MAX) return send(400, { error: `Write a title between ${THREAD_TITLE_MIN} and ${THREAD_TITLE_MAX} characters.` });
        if (text.length < 10 || text.length > THREAD_BODY_MAX) return send(400, { error: `Write between 10 and ${THREAD_BODY_MAX} characters.` });
        const identity = await ensureIdentity(redis, account, body.displayName);
        const id = randomUUID();
        const thread = { id, slug: threadSlug(title, id), forum, title, body: text, authorId: account.id, authorName: identity.name, authorAvatar: identity.avatar, authorProfileUrl: identity.profileUrl, createdAt: new Date(now).toISOString(), status: 'published', pinned: false };
        const saved = await redis(['EVAL', CREATE, 5, `digivated:threads:limit:${account.id}`, threadKey(id), slugKey(thread.slug), ALL, forumIndex(forum), JSON.stringify(thread), now, id, DAILY_THREADS]);
        if (saved === 0) { res.setHeader('Retry-After', '86400'); return send(429, { error: 'You can start up to 5 threads a day. Please come back tomorrow.' }); }
        if (saved !== 1) return send(409, { error: 'Please try again.' });
        await redis(['ZADD', 'digivated:threads:log', now, id]);
        await notePost(redis, account.id, now).catch(() => {});
        return send(201, { thread: card(thread, 0, 0, false, account.id) });
      }

      const id = body.id;
      const thread = UUID.test(id || '') ? parse(await redis(['GET', threadKey(id)])) : null;
      if (!thread || thread.status !== 'published') return send(404, { error: 'This thread is not available.' });

      if (body.action === 'vote') {
        const [voted, votes] = await redis(['EVAL', VOTE, 1, votersKey(id), account.id]);
        if (Number(voted) === 1) await notifyUpvoteDigest(redis, { recipientId: thread.authorId, actorId: account.id, subjectKey: `thread:${id}`, subject: thread.title, link: `/threads/${thread.slug}`, noun: 'thread' }).catch(() => {});
        return send(200, { voted: Number(voted) === 1, votes: Number(votes) || 0 });
      }
      if (body.action === 'delete') {
        if (thread.authorId !== account.id) return send(403, { error: 'You can only delete your own threads.' });
        await moderateThread(redis, id, { status: 'removed' });
        return send(200, { ok: true });
      }
      return send(400, { error: 'Unknown action.' });
    } catch (error) {
      if (error instanceof DiscussionError) return send(error.status, { error: error.message, ...error.extra });
      return send(503, { error: 'Threads are temporarily unavailable. Please try again later.' });
    }
  };
}

export { memberIdentity };
