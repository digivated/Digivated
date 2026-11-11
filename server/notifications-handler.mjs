import { redisClient } from './submissions.mjs';
import { verifiedAccount } from './project-account.mjs';
import {
  notificationSummary, listNotifications, saveNotificationPreferences,
  markNotificationRead, markAllNotificationsRead, clearNotifications,
} from './notifications.mjs';

export function makeNotificationsHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      const env = deps.env || process.env;
      if (!deps.redis && !env.SUBMISSIONS_REDIS_REST_TOKEN) return send(503, {error:'Notifications are temporarily unavailable.'});
      const account = await (deps.verifyAccount || verifiedAccount)(req, env, deps.fetcher || fetch);
      if (!account) return send(401, {error:'Sign in to view notifications.'});
      const redis = deps.redis || redisClient(env);
      const action = new URL(req.url, 'https://digivated.com').searchParams.get('action') || 'list';
      if (req.method === 'GET') {
        if (action === 'summary') return send(200, await notificationSummary(redis, account.id));
        if (action === 'list') return send(200, await listNotifications(redis, account.id));
        return send(400, {error:'Unknown notification action.'});
      }
      if (req.method !== 'POST') return send(405, {error:'Method not allowed.'});
      if (req.headers.origin !== (env.SUBMISSIONS_ORIGIN || 'https://digivated.com') || req.headers['sec-fetch-site'] === 'cross-site' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(403, {error:'Open Digivated to update notifications.'});
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 2048) return send(400, {error:'Invalid notification request.'});
      if (action === 'preferences') {
        try { return send(200, {preferences:await saveNotificationPreferences(redis, account.id, body.preferences)}); }
        catch { return send(400, {error:'Choose valid notification settings.'}); }
      }
      if (action === 'read') return await markNotificationRead(redis, account.id, body.id) ? send(200, {ok:true}) : send(404, {error:'Notification not found.'});
      if (action === 'read-all') { await markAllNotificationsRead(redis, account.id); return send(200, {ok:true}); }
      if (action === 'clear') { await clearNotifications(redis, account.id); return send(200, {ok:true}); }
      return send(400, {error:'Unknown notification action.'});
    } catch { return send(503, {error:'Notifications are temporarily unavailable. Try again shortly.'}); }
  };
}
