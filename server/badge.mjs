import { redisClient } from './submissions.mjs';
import { renderBadge, renderAwardBadge, BADGE_THEMES as THEMES } from './badge-render.mjs';
import { bestPlace, isFresh } from './launch-score.mjs';
export { renderBadge, renderAwardBadge, compactCount } from './badge-render.mjs';

// GET /badge/<id>?theme=dark|light|terminal (rewritten to /api/badge?id=<id>).
// Read-only and cached briefly; the count is optional and never blocks the badge.
export function makeBadgeHandler(deps = {}) {
  return async (req, res) => {
    const url = new URL(req.url, 'https://digivated.invalid');
    // Vercel keeps the original /badge/<id> URL on rewritten requests.
    const id = url.searchParams.get('id') || /^\/badge\/([^/]+?)(?:\.svg)?\/?$/.exec(url.pathname)?.[1] || '';
    const theme = THEMES[url.searchParams.get('theme')] ? url.searchParams.get('theme') : 'dark';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/i.test(id)) { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end(); }
    let count = null, award = null;
    try {
      const redis = deps.redis || redisClient(deps.env || process.env);
      // An award is drawn only for a podium place the project really earned.
      if (url.searchParams.get('award') === 'week') award = await bestPlace(redis, id);
      if (!award) {
        // Fair start: this week's counts stay hidden until Tuesday 14:00 UTC.
        const [value, fresh] = await Promise.all([redis(['GET', `digivated:card:likes:project:${id}`]), isFresh(redis, id)]);
        count = fresh ? null : Number(value || 0);
      }
    } catch { count = null; award = null; }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Vercel-CDN-Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    res.end(req.method === 'HEAD' ? undefined : award ? renderAwardBadge(theme, award) : renderBadge(theme, count));
  };
}
