// /api/maker-stats?id=<project> — the owner's launch numbers: daily views,
// visits, upvotes and comments for 14 days, this week's launch score and rank,
// and any podium places (with the award badge code).
import { redisClient } from './submissions.mjs';
import { projectPublic, validId } from './admin-store.mjs';
import { ownedSubmissions, verifiedAccount } from './project-account.mjs';
import { batchProjects, bestPlace, launchScores, readStats, podiumProjectKey } from './launch-score.mjs';
import { fairStart, inLaunchBatch, launchBounds } from '../src/lib/launch-calendar.mjs';
import { awardBadgeSnippet } from './badge-snippets.mjs';

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
      const days = await readStats(redis, id, now);
      const totals = days.reduce((sum, day) => ({ views: sum.views + day.views, visits: sum.visits + day.visits, upvotes: sum.upvotes + day.upvotes, comments: sum.comments + day.comments }), { views: 0, visits: 0, upvotes: 0, comments: 0 });

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
      return send(200, { days, totals, week, places, ...(best ? { award: { ...best, snippets: { dark: awardBadgeSnippet(id, 'dark'), light: awardBadgeSnippet(id, 'light'), terminal: awardBadgeSnippet(id, 'terminal') } } } : {}) });
    } catch { return send(503, { error: 'Stats are temporarily unavailable. Please try again shortly.' }); }
  };
}
