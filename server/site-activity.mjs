import { createHmac } from 'node:crypto';
import { redisClient } from './submissions.mjs';

// Existing Vercel production Web Analytics, queried 2026-11-08 before rollout.
// Visits means recorded page visits, not lifetime unique people.
export const HISTORICAL_VISITS = 3317;
export const SITE_ACTIVITY = `
local now = tonumber(redis.call('TIME')[1])
redis.call('SET',KEYS[1],ARGV[1],'NX')
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',now-90)
if ARGV[2] ~= '' then
 local rate = redis.call('INCR',KEYS[4])
 if rate == 1 then redis.call('EXPIRE',KEYS[4],60) end
 if rate <= 120 then
  redis.call('ZADD',KEYS[2],now,ARGV[2])
  redis.call('EXPIRE',KEYS[2],180)
  if ARGV[3] ~= '' and redis.call('SET',KEYS[3],'1','NX','EX',86400) then
   redis.call('INCR',KEYS[1])
  end
 end
end
return {tonumber(redis.call('GET',KEYS[1])),redis.call('ZCARD',KEYS[2])}`;

export function makeSiteActivityHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return send(405, { error: 'Method not allowed.' });
      }
      const env = deps.env || process.env;
      const origin = env.SUBMISSIONS_ORIGIN || 'https://digivated.com';
      if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site')) return send(403, { error: 'Use the Digivated website.' });
      if (!deps.redis && (env.VERCEL_ENV !== 'production' || env.VERCEL !== '1')) return send(503, { error: 'Activity unavailable.' });
      const view = new URL(req.url, origin).searchParams.get('view') || '';
      if (view && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(view)) return send(400, { error: 'Invalid visit.' });
      const ua = req.headers['user-agent'] || '';
      const ip = req.headers['x-real-ip'];
      const record = req.method === 'POST' && !/bot|crawler|spider|headless|preview/i.test(ua);
      if (record && ((!deps.redis && !env.SUBMISSIONS_REDIS_REST_TOKEN) || typeof ip !== 'string' || !ip)) return send(503, { error: 'Activity unavailable.' });
      // Daily rotating, keyed identity. Never retain IP addresses or user agents.
      const visitor = record ? createHmac('sha256', env.SUBMISSIONS_REDIS_REST_TOKEN || 'test-only').update(`${new Date().toISOString().slice(0, 10)}:${ip}:${ua.slice(0, 500)}`).digest('hex') : '';
      const redis = deps.redis || redisClient(env);
      const [visits, online] = await redis(['EVAL', SITE_ACTIVITY, 4,
        'digivated:site:visits', 'digivated:site:online', `digivated:site:view:${visitor}:${view}`, `digivated:site:rate:${visitor}`,
        HISTORICAL_VISITS, visitor, record ? view : '']);
      if (![visits, online].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid counts');
      return send(200, { visits, online, activeWindowSeconds: 90 });
    } catch { return send(503, { error: 'Activity temporarily unavailable.' }); }
  };
}
