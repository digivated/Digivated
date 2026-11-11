import { resourceArticlesVisible } from '../src/data/resource-publication.mjs';
import { contentPublic, projectPublic } from './admin-store.mjs';
import { NEWS } from './news-store.mjs';
import { redisClient } from './submissions.mjs';

export const SITE_ORIGIN = 'https://digivated.com';
const SITEMAP_LIMIT = 50000;

// Public HTML that is not a private account, an auth form, or a redirected alias.
export const staticPublicPages = [
  '/', '/discover', '/creators', '/news', '/resources', '/resources/guides',
  '/rankings', '/membership', '/submit-project', '/about', '/privacy', '/terms',
  '/ui-ux-prompt-packet', '/packet-example', '/start', '/library', '/fixes',
  '/builder', '/workflows', '/checklists', '/learn', '/toolkit', '/access',
];

const blockedPath = /^\/(?:admin|api|community|carousels|video-player|launch-template)(?:\/|$)|^\/(?:connect-x\.html|research\.html|account|login|inbox|saved|email-preferences)(?:\/|$)/;

const projectPath = /^\/projects\/(?:listing\/)?[a-z0-9][a-z0-9-]{0,149}$/;
const resourceSlug = /^[a-z0-9][a-z0-9-]{0,99}$/;
const creatorId = /^[a-f0-9-]{36}$/i;

export function sitemapLastmod(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > now + 86400000) return '';
  return new Date(time).toISOString().slice(0, 10);
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

export function absoluteLoc(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return '';
  let url;
  try { url = new URL(path, SITE_ORIGIN); } catch { return ''; }
  if (url.origin !== SITE_ORIGIN || url.username || url.password || url.hash) return '';
  if (blockedPath.test(url.pathname)) return '';
  return url.href;
}

function isProjectUrl(url) {
  return projectPath.test(url.pathname) && url.pathname !== '/projects/listing' && !url.search;
}

function isCreatorUrl(url) {
  return url.pathname === '/creator' && creatorId.test(url.searchParams.get('id') || '') && [...url.searchParams.keys()].length === 1;
}

function isLiveResourceUrl(url) {
  return url.pathname === '/resources/read' && resourceSlug.test(url.searchParams.get('slug') || '') && [...url.searchParams.keys()].every(key => key === 'slug');
}

function remember(pages, path, lastmod) {
  const href = absoluteLoc(path);
  if (!href) return;
  const next = sitemapLastmod(lastmod);
  const previous = pages.get(href);
  if (previous === undefined) pages.set(href, next);
  else if (!previous && next) pages.set(href, next);
}

// News stories and carousel lessons do not have their own public HTML URLs.
// Stories render inside /news. /carousels/:slug permanently redirects to /resources/guides.
// Member-only article bodies stay out while resource publication is paused.
export function buildSitemapEntries({
  resources = [],
  projects = [],
  creators = [],
  liveResources = [],
  newsUpdatedAt = '',
  articlesVisible = resourceArticlesVisible,
} = {}) {
  const pages = new Map();
  for (const path of staticPublicPages) remember(pages, path, path === '/news' ? newsUpdatedAt : '');
  for (const resource of resources) {
    if (resource?.status !== 'published' || !resourceSlug.test(resource.slug || '') || ['guides', 'read'].includes(resource.slug)) continue;
    remember(pages, `/resources/${encodeURIComponent(resource.slug)}`, resource.date || resource.publishedDate || '');
  }
  for (const project of projects) {
    const href = absoluteLoc(project?.pageUrl || '');
    if (!href || !isProjectUrl(new URL(href))) continue;
    remember(pages, project.pageUrl, project.publishedAt || project.date || '');
  }
  for (const creator of creators) {
    if (!creatorId.test(creator?.id || '')) continue;
    remember(pages, `/creator?id=${encodeURIComponent(creator.id)}`, creator.updatedAt || '');
  }
  if (articlesVisible) {
    for (const resource of liveResources) {
      const href = absoluteLoc(resource?.url || '');
      if (!href || !isLiveResourceUrl(new URL(href))) continue;
      remember(pages, resource.url, resource.date || resource.publishedDate || '');
    }
  }
  return [...pages].map(([loc, lastmod]) => ({ loc, lastmod }));
}

export function renderSitemap(entries) {
  if (entries.length > SITEMAP_LIMIT) throw new Error(`Sitemap has ${entries.length} URLs. Split it into a sitemap index before ${SITEMAP_LIMIT}.`);
  const body = entries.map(entry => {
    const loc = entry.loc.startsWith(`${SITE_ORIGIN}/`) || entry.loc === `${SITE_ORIGIN}/` ? entry.loc : absoluteLoc(entry.loc);
    if (!loc) return '';
    const lastmod = sitemapLastmod(entry.lastmod);
    return `<url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  }).filter(Boolean).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>\n`;
}

async function zsetMembers(redis, key, limit) {
  const total = Number(await redis(['ZCARD', key])) || 0;
  const cap = Math.min(Math.max(total, 0), limit);
  const ids = [];
  for (let offset = 0; offset < cap; offset += 100) {
    const stop = Math.min(offset + 99, cap - 1);
    const page = await redis(['ZREVRANGE', key, String(offset), String(stop)]);
    const list = Array.isArray(page) ? page : page == null ? [] : [page];
    ids.push(...list.map(item => String(item)));
    if (!list.length) break;
  }
  return ids;
}

async function mget(redis, keys) {
  const values = [];
  for (let index = 0; index < keys.length; index += 100) {
    const chunk = keys.slice(index, index + 100);
    const result = await redis(['MGET', ...chunk]);
    const list = Array.isArray(result) ? result : chunk.length === 1 ? [result] : null;
    if (!list || list.length !== chunk.length) throw new Error('Unexpected storage response while building the sitemap.');
    values.push(...list);
  }
  return values;
}

export async function loadDynamicSitemapSources(env, redisFactory = redisClient) {
  const empty = { projects: [], creators: [], liveResources: [], newsUpdatedAt: '' };
  if (!env?.SUBMISSIONS_REDIS_REST_URL || !env?.SUBMISSIONS_REDIS_REST_TOKEN) return empty;
  const redis = redisFactory(env);
  const projectIds = await zsetMembers(redis, 'digivated:public:submissions', SITEMAP_LIMIT);
  const projectRaws = projectIds.length ? await mget(redis, projectIds.map(id => `digivated:submission:${id}`)) : [];
  const projects = [];
  for (const raw of projectRaws) {
    if (typeof raw !== 'string') continue;
    try {
      const item = projectPublic(JSON.parse(raw));
      if (item?.pageUrl) projects.push({ pageUrl: item.pageUrl, publishedAt: item.publishedAt || '', date: item.date || '' });
    } catch { /* A malformed record stays out of the public sitemap. */ }
  }
  const creatorIds = await zsetMembers(redis, 'digivated:creator:public', SITEMAP_LIMIT);
  const creatorRaws = creatorIds.length ? await mget(redis, creatorIds.map(id => `digivated:creator:profile:${id}`)) : [];
  const creators = [];
  for (let index = 0; index < creatorIds.length; index += 1) {
    if (typeof creatorRaws[index] !== 'string') continue;
    try {
      const profile = JSON.parse(creatorRaws[index]);
      if (profile?.public === true) creators.push({ id: creatorIds[index], updatedAt: profile.updatedAt || '' });
    } catch { /* Skip unreadable profiles. */ }
  }
  let liveResources = [];
  if (resourceArticlesVisible) {
    const resourceIds = await zsetMembers(redis, 'digivated:public:resources', SITEMAP_LIMIT);
    const resourceRaws = resourceIds.length ? await mget(redis, resourceIds.map(id => `digivated:resource:${id}`)) : [];
    liveResources = resourceRaws.flatMap(raw => {
      if (typeof raw !== 'string') return [];
      try {
        const item = contentPublic('resource', JSON.parse(raw));
        return item?.url ? [{ url: item.url, date: item.date || '' }] : [];
      } catch { return []; }
    });
  }
  const storyIds = await zsetMembers(redis, `${NEWS}index:published`, 200);
  const storyRaws = storyIds.length ? await mget(redis, storyIds.map(id => `${NEWS}public:${id}`)) : [];
  let newsUpdatedAt = '';
  let newest = 0;
  for (const raw of storyRaws) {
    if (typeof raw !== 'string') continue;
    try {
      const record = JSON.parse(raw);
      for (const value of [record.updatedAt, record.publishedAt]) {
        const time = Date.parse(value);
        if (Number.isFinite(time) && time >= newest && time <= Date.now() + 86400000) {
          newest = time;
          newsUpdatedAt = value;
        }
      }
    } catch { /* Ignore a story that cannot contribute a date. */ }
  }
  return { projects, creators, liveResources, newsUpdatedAt };
}

async function readPublicJson(fetcher, url) {
  const response = await fetcher(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new Error('Public site data is unavailable.');
  return response.json();
}

// Preview deployments do not receive the production storage credentials.
// They read the same public project, creator, and news responses the live site already serves.
export async function loadPublishedSiteSources(fetcher, origin = SITE_ORIGIN) {
  const projects = [];
  let offset = 0;
  for (let page = 0; page < 500; page += 1) {
    const data = await readPublicJson(fetcher, `${origin}/api/projects?offset=${offset}`);
    for (const item of Array.isArray(data.items) ? data.items : []) {
      if (typeof item?.pageUrl === 'string') projects.push({ pageUrl: item.pageUrl, publishedAt: item.publishedAt || '', date: item.date || '' });
    }
    const next = Number(data.next);
    if (!Number.isInteger(next) || next <= offset) break;
    offset = next;
  }
  const discovered = await readPublicJson(fetcher, `${origin}/api/creator-profile?action=discover`);
  const creators = (Array.isArray(discovered.creators) ? discovered.creators : [])
    .filter(item => creatorId.test(item?.id || ''))
    .map(item => ({ id: item.id }));
  let newsUpdatedAt = '';
  try {
    const news = await readPublicJson(fetcher, `${origin}/api/news`);
    const dates = [news.featured, ...(Array.isArray(news.items) ? news.items : [])].flatMap(item => [item?.publishedAt, item?.correctedAt]);
    newsUpdatedAt = dates.filter(value => sitemapLastmod(value)).sort().at(-1) || '';
  } catch { /* The news page stays listed when the briefing feed is unavailable. */ }
  return { projects, creators, liveResources: [], newsUpdatedAt };
}

export async function collectSitemapEntries({ resources = [], env = process.env, redisFactory = redisClient, fetcher } = {}) {
  const dynamic = env?.SUBMISSIONS_REDIS_REST_URL && env?.SUBMISSIONS_REDIS_REST_TOKEN
    ? await loadDynamicSitemapSources(env, redisFactory)
    : fetcher ? await loadPublishedSiteSources(fetcher) : { projects: [], creators: [], liveResources: [], newsUpdatedAt: '' };
  return buildSitemapEntries({ resources, articlesVisible: resourceArticlesVisible, ...dynamic });
}
