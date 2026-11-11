import resources from '../data/resources.json';

const publicPages = [
  '/', '/discover', '/creators', '/news', '/resources', '/resources/guides',
  '/rankings', '/membership', '/submit-project', '/about', '/privacy', '/terms',
  '/ui-ux-prompt-packet', '/packet-example', '/start', '/library', '/fixes',
  '/builder', '/workflows', '/checklists', '/learn',
];

export function GET() {
  const resourcePages = resources
    .filter(resource => resource.status === 'published')
    .map(resource => `/resources/${encodeURIComponent(resource.slug)}`);
  const urls = [...publicPages, ...resourcePages]
    .map(path => `<url><loc>${new URL(path, 'https://digivated.com').href}</loc></url>`)
    .join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
