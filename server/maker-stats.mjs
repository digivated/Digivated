// /api/maker-stats?id=<project> — the owner's launch numbers: daily views,
// visits, upvotes and comments for 14 days, this week's launch score and rank,
// and any podium places (with the award badge code).
import { redisClient } from './submissions.mjs';
import { projectPublic, validId } from './admin-store.mjs';
import { ownedSubmissions, verifiedAccount } from './project-account.mjs';
import { allTimeStats, batchProjects, bestPlace, launchScores, readStats, podiumProjectKey } from './launch-score.mjs';
import { fairStart, inLaunchBatch, launchBounds } from '../src/lib/launch-calendar.mjs';
import { awardBadgeSnippet } from './badge-snippets.mjs';
import { commentKey } from './card-interactions.mjs';

// The three newest published comments, so the maker can see what to reply to.
async function latestComments(redis, id) {
  const ids = await redis(['ZREVRANGE', `digivated:card:comments:project:${id}`, 0, 2]);
  if (!Array.isArray(ids) || !ids.length) return [];
  const rows = await redis(['MGET', ...ids.map(commentKey)]);
  return (Array.isArray(rows) ? rows : []).flatMap(raw => {
    try {
      const row = JSON.parse(raw);
      return row && row.status === 'approved' ? [{ name: String(row.name || 'Guest').slice(0, 80), body: String(row.body || '').slice(0, 280), date: row.date || '' }] : [];
    } catch { return []; }
  });
}

export function makeMakerStatsHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, { error: 'Method not allowed.' }); }
      const env = deps.env || process.env;
      const url = new URL(req.url, 'https://digivated.invalid');
      if (url.pathname !== '/api/maker-stats') return send(404, { error: 'Not found.' });
      const id = url.searchParams.get('id');
      if (!validId(id)) return send(404, { error: 'Project not found.' });
      if (!deps.redis && (!env.SUBMISSIONS_REDIS_REST_URL || !env.SUBMISSIONS_REDIS_REST_TOKEN)) return send(503, { error: 'Stats are temporarily unavailable.' });
      const account = req.headers.authorization ? await (deps.verifyAccount || verifiedAccount)(req, env, deps.fetcher || fetch) : null;
      if (!account) return send(401, { error: 'Sign in to see your launch stats.' });
      const redis = deps.redis || redisClient(env);
      const owned = (await ownedSubmissions(redis, account, env.SUBMISSIONS_REDIS_REST_TOKEN || 'test-only')).find(row => row.id === id);
      if (!owned) return send(404, { error: 'Project not found.' });
      const project = projectPublic(owned);
      const now = deps.now ? deps.now() : Date.now();
      // ?range=7|14|30 returns that many days plus the period before it, so the panel can
      // switch periods and show trends from one request. Without it the response is unchanged.
      const range = [7, 14, 30].includes(Number(url.searchParams.get('range'))) ? Number(url.searchParams.get('range')) : null;
      const [history, allTime, comments] = await Promise.all([readStats(redis, id, now, range ? range * 2 : undefined), allTimeStats(redis, id), latestComments(redis, id)]);
      const days = range ? history.slice(range) : history;
      const sum = list => list.reduce((total, day) => ({ views: total.views + day.views, visits: total.visits + day.visits, upvotes: total.upvotes + day.upvotes, comments: total.comments + day.comments }), { views: 0, visits: 0, upvotes: 0, comments: 0 });
      const totals = sum(days);

      let week = null;
      if (project && inLaunchBatch(project, 'current', now)) {
        const fair = fairStart(now);
        if (fair.active) week = { fresh: true, endsAt: new Date(fair.endsAt).toISOString() };
        else {
          const batch = await batchProjects(redis, 'current', now);
          const scores = await launchScores(redis, batch.map(p => p.id), { start: launchBounds('current', now).start, end: now + 1, now });
          const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || b[1].weighted - a[1].weighted || a[0].localeCompare(b[0]));
          const mine = scores.get(id);
          if (mine) week = { score: mine.score, upvotes: mine.upvotes, commenters: mine.commenters, points: mine.points, rank: ranked.findIndex(([key]) => key === id) + 1, of: ranked.length };
        }
      }
      const places = [];
      const rows = await redis(['ZRANGE', podiumProjectKey(id), 0, -1, 'WITHSCORES']);
      for (let i = 0; i < (rows?.length || 0); i += 2) places.push({ week: rows[i], rank: Number(rows[i + 1]) });
      places.sort((a, b) => b.week.localeCompare(a.week));
      const best = places.length ? await bestPlace(redis, id) : null;
      return send(200, { days, totals, allTime, week, places, comments, ...(range ? { range, history, previous: sum(history.slice(0, range)) } : {}), ...(best ? { award: { ...best, snippets: { dark: awardBadgeSnippet(id, 'dark'), light: awardBadgeSnippet(id, 'light'), terminal: awardBadgeSnippet(id, 'terminal') } } } : {}) });
    } catch { return send(503, { error: 'Stats are temporarily unavailable. Please try again shortly.' }); }
  };
}
