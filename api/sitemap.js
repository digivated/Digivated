import resources from '../src/data/resources.json' with { type: 'json' };
import { collectSitemapEntries, renderSitemap } from '../server/sitemap.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Method not allowed.');
    return;
  }
  try {
    const entries = await collectSitemapEntries({
      resources,
      env: process.env,
      fetcher: process.env.VERCEL_ENV === 'preview' ? fetch : undefined,
    });
    const xml = renderSitemap(entries);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(req.method === 'HEAD' ? '' : xml);
  } catch (error) {
    console.error(JSON.stringify({ event: 'sitemap_failed', message: error instanceof Error ? error.message : 'Sitemap failed.' }));
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('Sitemap temporarily unavailable.');
  }
}
