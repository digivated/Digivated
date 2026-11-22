// /api/launches — upcoming launches with "Notify me", last week's podium and
// the winners archive.
import { redisClient } from './submissions.mjs';
import { projectPublic, storageKey, validId } from './admin-store.mjs';
import { verifiedAccount } from './project-account.mjs';
import { QUEUE } from './launch-queue.mjs';
import { launchWatchersKey, launchWatchingKey } from './notifications.mjs';
import { finalizeLastWeek, readWeek, PODIUM_WEEKS } from './launch-score.mjs';
import { freeLaunchSchedule, launchBounds } from '../src/lib/launch-calendar.mjs';
import { guardPost, readJson, DiscussionError } from './discussions.mjs';

const UPCOMING_LIMIT = 60;
const UPCOMING_GRACE_MS = 2 * 86_400_000;
const WINNERS_PAGE = 6;

// Use the same public projection and badge requirement for schedule rows and logos.
async function upcomingRecord(redis, id) {
  let record;
  try { record = JSON.parse(await redis(['GET', storageKey('submission', id)])); } catch { return null; }
  if (!record || record.status !== 'pending' || record.launch?.kind !== 'free' || !record.launch.badgeVerifiedAt) return null;
  const preview = projectPublic({ ...record, status: 'approved' });
  const { scheduledAt } = freeLaunchSchedule(record);
  if (!preview || !scheduledAt) return null;
  const logo = typeof record.image === 'string' && record.image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  const { name, description = '', category = '', pricing = '', creator = '' } = preview;
  const image = logo ? `/api/launches?image=${encodeURIComponent(id)}` : '';
  return { item: { id: record.id, name, description, category, pricing, creator, launchAt: scheduledAt, image }, logo };
}

// Current public projection for podium rows; removed projects drop out.
// Same rule as the public directory: indexed as public and still public by its record.
async function publicProjects(redis, ids) {
  if (!ids.length) return new Map();
  const [indexed, records] = await Promise.all([redis(['MGET', ...ids.map(id => `digivated:public:submission:${id}`)]), redis(['MGET', ...ids.map(id => storageKey('submission', id))])]);
  return new Map(ids.flatMap((id, i) => { if (!indexed[i] || !records[i]) return []; try { const p = projectPublic(JSON.parse(records[i])); return p ? [[id, p]] : []; } catch { return []; } }));
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
      if (req.method === 'GET' && url.searchParams.has('image')) {
        const id = url.searchParams.get('image');
        if (!validId(id)) return send(404, { error: 'Logo not found.' });
        const [score, upcoming] = await Promise.all([
          redis(['ZSCORE', QUEUE, id]),
          upcomingRecord(redis, id),
        ]);
        if (score === null || !Number.isFinite(Number(score)) || Number(score) < now - UPCOMING_GRACE_MS || !upcoming?.logo) {
          return send(404, { error: 'Logo not found.' });
        }
        const [, type, bytes] = upcoming.logo;
        res.setHeader('Content-Type', type);
        res.setHeader('Content-Disposition', 'inline');
        res.statusCode = 200;
        return res.end(Buffer.from(bytes, 'base64'));
      }
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
        // Launch day starts at 00:00 UTC and the batch publishes later that morning; keep it listed until then.
        const ids = await redis(['ZRANGEBYSCORE', QUEUE, now - UPCOMING_GRACE_MS, '+inf', 'LIMIT', 0, UPCOMING_LIMIT]);
        const items = (await Promise.all((ids || []).map(id => upcomingRecord(redis, id)))).filter(Boolean).map(result => result.item);
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
