// /api/launches — upcoming launches with "Notify me", last week's podium and
// the winners archive.
import { redisClient } from './submissions.mjs';
import { projectPublic, storageKey, validId } from './admin-store.mjs';
import { verifiedAccount } from './project-account.mjs';
import { QUEUE } from './launch-queue.mjs';
import { launchWatchersKey, launchWatchingKey } from './notifications.mjs';
import { finalizeLastWeek, readWeek, PODIUM_WEEKS } from './launch-score.mjs';
import { launchBounds } from '../src/lib/launch-calendar.mjs';
import { guardPost, readJson, DiscussionError } from './discussions.mjs';

const UPCOMING_LIMIT = 60;
const WINNERS_PAGE = 6;

// A scheduled free launch, shown before it goes live. Only fields that will be
// public on launch day; no logo yet (images are served once a project is live).
async function upcomingRecord(redis, id) {
  let record;
  try { record = JSON.parse(await redis(['GET', storageKey('submission', id)])); } catch { return null; }
  if (!record || record.status !== 'pending' || record.launch?.kind !== 'free' || !record.launch.badgeVerifiedAt) return null;
  const preview = projectPublic({ ...record, status: 'approved' });
  if (!preview) return null;
  return { id: record.id, name: preview.name, description: preview.description || '', category: preview.category || '', pricing: preview.pricing || '', creator: preview.creator || '', launchAt: new Date(record.launch.scheduledTimestamp || Date.parse(record.launch.scheduledAt)).toISOString() };
}

// Current public projection for podium rows; removed projects drop out.
async function publicProjects(redis, ids) {
  if (!ids.length) return new Map();
  const raws = await redis(['MGET', ...ids.map(id => `digivated:public:submission:${id}`)]);
  return new Map(ids.flatMap((id, i) => { try { const p = JSON.parse(raws[i]); return p?.id ? [[id, p]] : []; } catch { return []; } }));
}
const card = p => ({ id: p.id, name: p.name, description: p.description || '', category: p.category || '', pricing: p.pricing || '', creator: p.creator || '', pageUrl: p.pageUrl, image: p.image || '', url: p.url || '' });

async function weekWithProjects(redis, week) {
  if (!week) return null;
  const projects = await publicProjects(redis, week.podium.map(place => place.id));
  return { start: week.start, end: week.end, podium: week.podium.filter(place => projects.has(place.id)).map(place => ({ rank: place.rank, score: place.score, upvotes: place.upvotes, ...card(projects.get(place.id)) })) };
}

export function makeLaunchesHandler(deps = {}) {
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
      if (url.pathname !== '/api/launches') return send(404, { error: 'Not found.' });
      if (!deps.redis && (!env.SUBMISSIONS_REDIS_REST_URL || !env.SUBMISSIONS_REDIS_REST_TOKEN)) return send(503, { error: 'Launches are temporarily unavailable.' });
      const redis = deps.redis || redisClient(env);
      const now = deps.now ? deps.now() : Date.now();
      const account = req.headers.authorization ? await (deps.verifyAccount || verifiedAccount)(req, env, deps.fetcher || fetch) : null;

      if (req.method === 'POST') {
        guardPost(req, env);
        const body = await readJson(req, 1024);
        if (!['watch', 'unwatch'].includes(body.action)) return send(400, { error: 'Unknown action.' });
        if (!account) return send(401, { error: 'Sign in to get notified when this launch goes live.' });
        if (!validId(body.id) || !await upcomingRecord(redis, body.id)) return send(404, { error: 'This launch is no longer upcoming.' });
        if (body.action === 'watch') { await redis(['SADD', launchWatchersKey(body.id), account.id]); await redis(['SADD', launchWatchingKey(account.id), body.id]); }
        else { await redis(['SREM', launchWatchersKey(body.id), account.id]); await redis(['SREM', launchWatchingKey(account.id), body.id]); }
        return send(200, { watching: body.action === 'watch', watchers: Number(await redis(['SCARD', launchWatchersKey(body.id)])) || 0 });
      }

      const view = url.searchParams.get('view');
      if (view === 'upcoming') {
        const ids = await redis(['ZRANGEBYSCORE', QUEUE, now, '+inf', 'LIMIT', 0, UPCOMING_LIMIT]);
        const items = (await Promise.all((ids || []).map(id => upcomingRecord(redis, id)))).filter(Boolean);
        const [counts, watching] = await Promise.all([
          Promise.all(items.map(item => redis(['SCARD', launchWatchersKey(item.id)]))),
          account ? redis(['SMEMBERS', launchWatchingKey(account.id)]) : [],
        ]);
        const mine = new Set(watching || []);
        return send(200, { items: items.map((item, i) => ({ ...item, watchers: Number(counts[i]) || 0, ...(account ? { watching: mine.has(item.id) } : {}) })), signedIn: !!account });
      }
      if (view === 'podium') {
        // Last week's results are frozen the first time they are asked for.
        const { start } = launchBounds('previous', now);
        const week = await readWeek(redis, start) || await finalizeLastWeek(redis, now);
        if (!week) return send(200, { week: null, order: [] });
        return send(200, { week: await weekWithProjects(redis, week), order: week.results.map(r => r.id), scores: Object.fromEntries(week.results.map(r => [r.id, r.score])) });
      }
      if (view === 'winners') {
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return send(400, { error: 'Invalid page.' });
        await finalizeLastWeek(redis, now).catch(() => null);
        const starts = await redis(['ZREVRANGE', PODIUM_WEEKS, offset, offset + WINNERS_PAGE - 1]);
        const weeks = (await Promise.all((starts || []).map(async start => weekWithProjects(redis, await readWeek(redis, Date.parse(start)))))).filter(week => week?.podium.length);
        const total = Number(await redis(['ZCARD', PODIUM_WEEKS])) || 0;
        return send(200, { weeks, next: offset + WINNERS_PAGE < total ? offset + WINNERS_PAGE : null });
      }
      return send(400, { error: 'Choose a view.' });
    } catch (error) {
      if (error instanceof DiscussionError) return send(error.status, { error: error.message });
      return send(503, { error: 'Launches are temporarily unavailable. Please try again shortly.' });
    }
  };
}
