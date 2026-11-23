import { readFile } from 'node:fs/promises';
import { renderProjectIndex } from './project-index-render.mjs';

const KEY = 'digivated:public:submissions';

// Same public projection the sitemap and /api/projects use; private and unpublished records stay out.
async function loadPublicProjects(env) {
  const [{ projectPublic }, { redisClient }] = await Promise.all([import('./admin-store.mjs'), import('./submissions.mjs')]);
  const redis = redisClient(env);
  const total = Number(await redis(['ZCARD', KEY])) || 0;
  const ids = [];
  for (let offset = 0; offset < Math.min(total, 2000); offset += 100) {
    const page = await redis(['ZREVRANGE', KEY, String(offset), String(Math.min(offset + 99, total - 1))]);
    const list = Array.isArray(page) ? page : [];
    ids.push(...list.map(String));
    if (!list.length) break;
  }
  const projects = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const raws = await redis(['MGET', ...chunk.map(id => `digivated:submission:${id}`)]);
    for (const raw of Array.isArray(raws) ? raws : []) {
      if (typeof raw !== 'string') continue;
      try { const item = projectPublic(JSON.parse(raw)); if (item) projects.push({ pageUrl: item.pageUrl, name: item.name, creator: item.creator, description: item.description, category: item.category, publishedAt: item.publishedAt, date: item.date }); } catch { /* A malformed record stays out. */ }
    }
  }
  return projects;
}

export function makeProjectIndexHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return; }
    try {
      const env = deps.env || process.env;
      const template = deps.template || await readFile(new URL('./generated/projects.html', import.meta.url), 'utf8');
      if (!deps.loadProjects && !env.SUBMISSIONS_REDIS_REST_URL) throw new Error('Storage is not configured.');
      const projects = await (deps.loadProjects || loadPublicProjects)(env);
      res.statusCode = 200;
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
      res.end(req.method === 'HEAD' ? '' : renderProjectIndex(template, projects));
    } catch {
      res.statusCode = 503;
      res.setHeader('Retry-After', '60');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, follow');
      res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Projects unavailable · Digivated</title><main><h1>Projects are temporarily unavailable.</h1><p><a href="/discover">Open the directory</a></p></main></html>');
    }
  };
}
