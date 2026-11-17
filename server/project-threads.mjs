import { createHmac, randomUUID } from 'node:crypto';
import { redisClient } from './submissions.mjs';
import { validId, storageKey } from './admin-store.mjs';
import { commentIndex, commentKey, isPublicItem } from './card-interactions.mjs';
import { addNotification } from './notifications.mjs';
import { verifiedAccount } from './project-account.mjs';

// Product discussions: top-level comments and one level of replies, comment upvotes
// and a Maker badge. Entries reuse the existing comment records and public index, so
// counts, admin moderation and owner notifications keep working unchanged.
const MAX_THREAD = 300;
const DAILY_POSTS = 10;
const likesKey = id => `digivated:thread:likes:${id}`;
const likedKey = (visitor, id) => `digivated:thread:liked:${visitor}:${id}`;

// KEYS: daily limit, entry, all-comments index, project index. ARGV: entry, score, id, limit.
export const POST = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],86400) end
if n>tonumber(ARGV[4]) then return 0 end
redis.call('SET',KEYS[2],ARGV[1]); redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3]); redis.call('ZADD',KEYS[4],ARGV[2],ARGV[3]); return 1`;
// KEYS: liked marker, like count. Returns {liked, count}.
export const LIKE = `if redis.call('EXISTS',KEYS[1])==1 then redis.call('DEL',KEYS[1]); local c=redis.call('DECR',KEYS[2]); if c<0 then redis.call('SET',KEYS[2],0); c=0 end; return {0,c} end
redis.call('SET',KEYS[1],'1'); return {1,redis.call('INCR',KEYS[2])}`;

const visitorFor = (env, id, ip) => createHmac('sha256', env.SUBMISSIONS_REDIS_REST_TOKEN || 'test-only').update(`thread:${id}:${ip || 'fixture'}`).digest('hex');

export async function readThread(redis, projectId, visitor) {
  const ids = await redis(['ZREVRANGE', commentIndex('project', projectId), 0, MAX_THREAD - 1]);
  if (!ids.length) return [];
  const [raws, likes, liked] = await Promise.all([
    redis(['MGET', ...ids.map(commentKey)]),
    redis(['MGET', ...ids.map(likesKey)]),
    visitor ? redis(['MGET', ...ids.map(id => likedKey(visitor, id))]) : Promise.resolve([]),
  ]);
  const entries = raws.map((raw, index) => {
    let entry; try { entry = JSON.parse(raw); } catch { return null; }
    if (!entry || entry.status !== 'approved' || entry.itemId !== projectId) return null;
    return { id: entry.id, ...(entry.parentId ? { parentId: entry.parentId } : {}), ...(entry.replyTo ? { replyTo: entry.replyTo } : {}), name: entry.name, body: entry.body, date: entry.date, ...(entry.maker ? { maker: true } : {}), ...(entry.impression ? { impression: entry.impression } : {}), likes: Math.max(0, Number(likes[index]) || 0), ...(liked[index] ? { liked: true } : {}) };
  }).filter(Boolean);
  // Hide replies whose parent was removed by moderation.
  const roots = new Set(entries.filter(entry => !entry.parentId).map(entry => entry.id));
  return entries.filter(entry => !entry.parentId || roots.has(entry.parentId));
}

export function makeProjectThreadHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Method not allowed.' }); }
      const env = deps.env || process.env;
      const url = new URL(req.url, 'https://digivated.invalid');
      if (url.pathname !== '/api/project-threads') return send(404, { error: 'Not found.' });
      if (!deps.redis && (!env.SUBMISSIONS_REDIS_REST_URL || !env.SUBMISSIONS_REDIS_REST_TOKEN)) return send(503, { error: 'Discussions are temporarily unavailable.' });
      const redis = deps.redis || redisClient(env);
      const ip = req.headers['x-real-ip'];
      let body = {};
      if (req.method === 'POST') {
        const origin = env.SUBMISSIONS_ORIGIN || 'https://digivated.com';
        if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Open this on Digivated to continue.' });
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'Use the form on Digivated.' });
        body = req.body;
        if (body === undefined) { const chunks = []; let size = 0; for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4096) return send(413, { error: 'This comment is too long.' }); chunks.push(Buffer.from(chunk)); } body = Buffer.concat(chunks).toString('utf8'); }
        if (Buffer.isBuffer(body)) body = body.toString('utf8');
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return send(400, { error: 'Check the form and try again.' }); } }
        if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 4096) return send(400, { error: 'Check the form and try again.' });
        if (!deps.redis && (env.VERCEL !== '1' || typeof ip !== 'string' || !ip)) return send(503, { error: 'This action is temporarily unavailable.' });
        if (/bot|crawler|spider|headless|preview/i.test(req.headers['user-agent'] || '')) return send(403, { error: 'This action is unavailable.' });
      }
      const id = req.method === 'GET' ? url.searchParams.get('id') : body.id;
      if (!validId(id) || !await isPublicItem(redis, 'project', id)) return send(404, { error: 'This project is not available.' });
      const visitor = visitorFor(env, id, typeof ip === 'string' ? ip : '');

      if (req.method === 'GET') {
        const comments = await readThread(redis, id, visitor);
        return send(200, { comments, count: comments.length });
      }

      if (body.action === 'like') {
        const commentId = body.commentId;
        if (!validId(commentId)) return send(404, { error: 'This comment is not available.' });
        const raw = await redis(['GET', commentKey(commentId)]);
        const entry = raw ? JSON.parse(raw) : null;
        if (!entry || entry.status !== 'approved' || entry.itemId !== id) return send(404, { error: 'This comment is not available.' });
        const [liked, likes] = await redis(['EVAL', LIKE, 2, likedKey(visitor, commentId), likesKey(commentId)]);
        return send(200, { liked: Boolean(Number(liked)), likes: Math.max(0, Number(likes) || 0) });
      }

      if (body.action !== 'post') return send(400, { error: 'Unknown action.' });
      if (body.company) return send(400, { error: 'Check the form and try again.' });
      const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
      let name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
      if (text.length < 2 || text.length > 800) return send(400, { error: 'Write between 2 and 800 characters.' });
      if (name.length > 40) return send(400, { error: 'Use up to 40 characters for your name.' });

      let parentId = null, replyTo = '';
      if (body.parentId !== undefined && body.parentId !== null) {
        if (!validId(body.parentId)) return send(404, { error: 'That comment is no longer available.' });
        const raw = await redis(['GET', commentKey(body.parentId)]);
        const parent = raw ? JSON.parse(raw) : null;
        if (!parent || parent.status !== 'approved' || parent.itemId !== id) return send(404, { error: 'That comment is no longer available.' });
        parentId = parent.parentId || parent.id; // Product Hunt style: one visual level of replies.
        replyTo = parent.name || '';
      }

      const project = JSON.parse(await redis(['GET', storageKey('submission', id)]) || 'null');
      const account = req.headers.authorization ? await (deps.verifyAccount || verifiedAccount)(req, env, deps.fetcher || fetch) : null;
      const maker = Boolean(account && project?.accountId && account.id === project.accountId);
      if (!name) name = maker ? (project.creator || 'Maker') : 'Guest';
      const now = deps.now ? deps.now() : Date.now();
      const entry = { id: randomUUID(), type: 'project', itemId: id, name, body: text, date: new Date(now).toISOString(), status: 'approved', purpose: 'project-feedback', ...(parentId ? { parentId, replyTo } : {}), ...(maker ? { maker: true } : {}), ...(account ? { accountId: account.id } : {}) };
      const saved = await redis(['EVAL', POST, 4, `digivated:thread:limit:${visitor}`, commentKey(entry.id), 'digivated:card:comments:all', commentIndex('project', id), JSON.stringify(entry), now, entry.id, DAILY_POSTS]);
      if (saved !== 1) { res.setHeader('Retry-After', '86400'); return send(429, { error: 'You’ve reached today’s limit for this discussion. Please come back tomorrow.' }); }
      if (project?.accountId && !maker) { try { await addNotification(redis, { recipientId: project.accountId, type: 'feedback', targetId: id }); } catch { /* The comment is saved. */ } }
      const { accountId, type, itemId, status, purpose, ...visible } = entry;
      return send(201, { comment: { ...visible, likes: 0 } });
    } catch { return send(503, { error: 'This action is temporarily unavailable. Please try again later.' }); }
  };
}
