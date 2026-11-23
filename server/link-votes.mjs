import { createHmac } from 'node:crypto';
import { resourceGroups } from '../src/data/link-resources.mjs';
import { redisClient } from './submissions.mjs';

// Upvotes for the outbound links on /tools. One vote per visitor per link,
// counted in a single hash so the page can load every count in one call.
export const LINK_VOTES = 'digivated:link-votes';
const knownLinks = new Set(resourceGroups.flatMap(group => group.links.map(link => link.id)));
const HOURLY_LIMIT = 120;

// KEYS: visitor marker, counts hash, hourly limiter. ARGV: action, link id, limit.
// Returns {count, voted} or {-1, 0} when the visitor is over the hourly limit.
export const LINK_VOTE = `
local n=redis.call('INCR',KEYS[3])
if n==1 then redis.call('EXPIRE',KEYS[3],3600) end
if n>tonumber(ARGV[3]) then return {-1,0} end
local had=redis.call('EXISTS',KEYS[1])
if ARGV[1]=='up' and had==0 then
 redis.call('SET',KEYS[1],'1')
 redis.call('HINCRBY',KEYS[2],ARGV[2],1)
elseif ARGV[1]=='down' and had==1 then
 redis.call('DEL',KEYS[1])
 if tonumber(redis.call('HGET',KEYS[2],ARGV[2]) or '0')>0 then redis.call('HINCRBY',KEYS[2],ARGV[2],-1) end
end
return {tonumber(redis.call('HGET',KEYS[2],ARGV[2]) or '0'),redis.call('EXISTS',KEYS[1])}`;

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 512) throw new Error('too large'); }
  return JSON.parse(raw || '{}');
}

export function makeLinkVoteHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    const env = deps.env || process.env;
    try {
      if (req.method === 'GET') {
        const redis = deps.redis || redisClient(env);
        const flat = await redis(['HGETALL', LINK_VOTES]) || [];
        const counts = {};
        for (let i = 0; i + 1 < flat.length; i += 2) {
          const count = Number(flat[i + 1]);
          if (knownLinks.has(flat[i]) && count > 0) counts[flat[i]] = count;
        }
        return send(200, { counts });
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Method not allowed.' }); }
      if (req.headers.origin !== (env.SUBMISSIONS_ORIGIN || 'https://digivated.com') || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Use the Digivated website.' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'Use the Digivated website.' });
      let body;
      try { body = await readBody(req); } catch { return send(400, { error: 'Check the request and try again.' }); }
      const id = body?.id, action = body?.action;
      if (typeof id !== 'string' || !knownLinks.has(id)) return send(404, { error: 'This resource is not available.' });
      if (action !== 'up' && action !== 'down') return send(400, { error: 'Check the request and try again.' });
      if (/bot|crawler|spider|headless|preview/i.test(req.headers['user-agent'] || '')) return send(403, { error: 'Voting needs a browser.' });
      const ip = req.headers['x-real-ip'];
      if (!deps.redis && (env.VERCEL !== '1' || typeof ip !== 'string' || !ip || !env.SUBMISSIONS_REDIS_REST_TOKEN)) return send(503, { error: 'Voting is temporarily unavailable.' });
      const secret = env.SUBMISSIONS_REDIS_REST_TOKEN || 'test-only';
      const visitor = createHmac('sha256', secret).update(`link:${id}:${ip || 'fixture'}`).digest('hex');
      const limiter = createHmac('sha256', secret).update(`link-limit:${ip || 'fixture'}`).digest('hex');
      const redis = deps.redis || redisClient(env);
      const [count, voted] = await redis(['EVAL', LINK_VOTE, 3, `digivated:link-voted:${visitor}`, LINK_VOTES, `digivated:link-vote-limit:${limiter}`, action, id, HOURLY_LIMIT]);
      if (Number(count) === -1) return send(429, { error: 'Too many votes right now. Try again in a bit.' });
      return send(200, { count: Number(count), voted: Number(voted) === 1 });
    } catch { return send(503, { error: 'Voting is temporarily unavailable.' }); }
  };
}
