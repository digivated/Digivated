import { readFile } from 'node:fs/promises';
import { makeNewsHandler } from './news-handler.mjs';
import { NEWS_CATEGORIES, escapeHtml, newsStoryPath } from '../src/lib/news-story.mjs';
import { renderNewsFeed } from '../src/lib/news-editorial.mjs';

const ORIGIN = 'https://digivated.com';
const CATEGORY_COPY = {
  'ai-tech': 'AI and technology news, with the original source and publication time.',
  markets: 'Markets news, with the original source and publication time.',
  security: 'Security news, with the original source and publication time.',
  'indie-building': 'Indie building, product launches and discovery news for independent makers, with original sources and publication times.',
};

async function readJson(handler, url) {
  let body = '';
  const response = { statusCode: 200, setHeader() {}, end(value) { body = value || ''; } };
  await handler({ method: 'GET', url, headers: {} }, response);
  if (response.statusCode !== 200 || !body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

function storyHtml(story) {
  const category = NEWS_CATEGORIES[story.category] || 'News';
  const summary = String(story.summary || '').trim();
  return `<article class="news-story" data-news-cat="${escapeHtml(story.category)}"><div class="news-story-main"><div class="news-story-head"><span class="news-story-category">${escapeHtml(category)}</span></div><h3><a class="news-story-link" href="${escapeHtml(newsStoryPath(story))}">${escapeHtml(story.headline)}</a></h3>${summary ? `<p class="news-summary">${escapeHtml(summary)}</p>` : ''}<p class="news-story-meta">${escapeHtml(story.sourceName || '')}</p></div></article>`;
}

export function renderNewsIndex(template, { items = [], featured = null, indie = [], category = 'all', boot = null } = {}) {
  const showIndie=category==='all'&&!boot?.q&&!boot?.stock&&indie.length>0;
  const indieIds=new Set(showIndie?indie.map(item=>item.id):[]);
  const list = (featured ? [featured, ...items.filter(item => item?.id !== featured.id)] : items).filter(item => item?.headline && item.id&&!indieIds.has(item.id));
  const feed = list.map(storyHtml).join('');
  let html = template;
  if (list.length||showIndie) {
    html = html.replace(/(<p\b[^>]*data-news-access-status[^>]*)>/, '$1 hidden>');
    html = html.replace(/(<p\b[^>]*data-news-access-status[^>]*>)[\s\S]*?(<\/p>)/, '$1$2');
    html = html.replace(/(<p\b[^>]*data-news-status[^>]*)>/, '$1 hidden>');
    html = html.replace(/(<p\b[^>]*data-news-status[^>]*>)[\s\S]*?(<\/p>)/, '$1$2');
    html = html.replace(/(<nav\b[^>]*class="news-toolbar"[^>]*)\shidden\b/, '$1');
    html = html.replace(/(<div\b[^>]*class="news-layout"[^>]*)\shidden\b/, '$1');
    html = html.replace(/(<div\b[^>]*data-news-feed\b[^>]*?)\saria-busy="true"/, '$1 aria-busy="false"');
    html = html.replace(/(<div\b[^>]*data-news-feed\b[^>]*>)[\s\S]*?(<\/div>)/, `$1${feed}$2`);
  }
  if (category !== 'all' && CATEGORY_COPY[category]) {
    const label = NEWS_CATEGORIES[category];
    const canonical = `${ORIGIN}/news?category=${category}`;
    const title = `${label} news · Digivated`;
    const description = CATEGORY_COPY[category];
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    html = html.replace(/<link\b[^>]*rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeHtml(canonical)}">`);
    html = html.replace(/<meta\b[^>]*(?:name|property)="(description|og:description|twitter:description|og:title|twitter:title|og:url)"[^>]*>/g, (tag, key) => {
      const property = key.startsWith('og:');
      const content = key === 'og:url' ? canonical : key.endsWith('title') ? title : description;
      return `<meta ${property ? 'property' : 'name'}="${key}" content="${escapeHtml(content)}">`;
    });
    html = html.replace(/data-news-category="([^"]+)" aria-pressed="(?:true|false)"/g, (match, value) => `data-news-category="${value}" aria-pressed="${value === category ? 'true' : 'false'}"`);
    html = html.replace(/(<h2\b[^>]*data-news-latest-title[^>]*>)[^<]*/, `$1${label}`);
  }
  if (boot) {
    const json = JSON.stringify(boot).replace(/</g, '\\u003c');
    if (html.includes('id="news-boot"')) html = html.replace(/(<script\b[^>]*id="news-boot"[^>]*>)[\s\S]*?(<\/script>)/, `$1${json}$2`);
    else html = html.replace('</head>', `<script type="application/json" id="news-boot">${json}</script></head>`);
  }
  if(showIndie){
    html=html.replace(/(<section\b[^>]*data-news-indie\b[^>]*)\shidden\b/,'$1');
    html=html.replace(/(<div\b[^>]*data-news-indie-feed[^>]*>)[\s\S]*?(<\/div>)/,`$1${indie.map(storyHtml).join('')}$2`);
  }
  return html;
}

export function makeNewsPageHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
    if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return; }
    const template = deps.template || await readFile(new URL('./generated/news.html', import.meta.url), 'utf8').catch(() => '');
    const url = new URL(req.url, ORIGIN);
    const requested = url.searchParams.get('category') || 'all';
    const category = Object.hasOwn(NEWS_CATEGORIES, requested) ? requested : 'all';
    const finish = html => { res.statusCode = 200; res.end(req.method === 'HEAD' ? '' : html); };
    if (!template) { res.statusCode = 503; res.setHeader('Cache-Control', 'no-store'); res.end('News is temporarily unavailable.'); return; }
    try {
      const env = deps.env || process.env;
      if (!deps.news && !deps.redis && !env.SUBMISSIONS_REDIS_REST_TOKEN) return finish(template);
      const handler = deps.news || makeNewsHandler(deps);
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      const q = (url.searchParams.get('q') || '').slice(0, 120);
      const stock = (url.searchParams.get('stock') || '').slice(0, 12);
      if (q) params.set('q', q);
      if (stock) params.set('stock', stock);
      const payload = await readJson(handler, `/api/news${params.size ? `?${params}` : ''}`);
      if (!payload?.items) return finish(template);
      const boot = { items: payload.items, indie: payload.indie || [], featured: payload.featured || null, stocks: payload.stocks || [], next: payload.next || null, pipeline: payload.pipeline || null, updatedAt: payload.updatedAt || null, category, q, stock };
      return finish(renderNewsIndex(template, { items: payload.items, indie: payload.indie || [], featured: payload.featured, category, boot }));
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return finish(template);
    }
  };
}

export function makeNewsFeedHandler(deps = {}) {
  return async (req, res) => {
    const format = /atom\.xml(?:\?|$)/.test(req.url || '') ? 'atom' : 'rss';
    res.setHeader('Content-Type', `${format === 'atom' ? 'application/atom+xml' : 'application/rss+xml'}; charset=utf-8`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=900');
    if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return; }
    try {
      const handler = deps.news || makeNewsHandler(deps);
      const payload = await readJson(handler, '/api/news?view=feed');
      const xml = renderNewsFeed(payload?.items || [], { format, now: deps.now?.() || Date.now() });
      res.statusCode = 200;
      res.end(req.method === 'HEAD' ? '' : xml);
    } catch {
      res.statusCode = 503;
      res.setHeader('Cache-Control', 'no-store');
      res.end('');
    }
  };
}
