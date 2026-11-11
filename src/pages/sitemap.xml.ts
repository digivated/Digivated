// Local preview and CI serve this static copy. On Vercel the file is removed
// and /sitemap.xml is rewritten to the runtime function, which adds live URLs.
import resources from '../data/resources.json';
import { collectSitemapEntries, renderSitemap } from '../../server/sitemap.mjs';

export async function GET() {
  const entries = await collectSitemapEntries({ resources, env: process.env });
  console.info(`sitemap: ${entries.length} urls`);
  return new Response(renderSitemap(entries), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
