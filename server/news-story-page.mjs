import { readFile } from 'node:fs/promises';
import { redisClient } from './submissions.mjs';
import { loadNewsStory } from './news-handler.mjs';
import { NEWS_CATEGORIES, escapeHtml, newsArticleMarkup, newsIdFromPath, newsMissingMarkup, newsStoryPath, safeSourceUrl, validNewsId } from '../src/lib/news-story.mjs';
import { truncateOnWord } from '../src/lib/news-editorial.mjs';

const origin = 'https://digivated.com';

// Story pages are one static template. The server fills in the story itself, so the
// page arrives complete: no loading flash, and link previews get the real headline.
export function renderNewsStoryPage(template, { id = '', story = null, related = [], status = 200 }) {
  const available = status === 200 && story;
  const canonical = available ? `${origin}${newsStoryPath(story)}` : `${origin}/news/${id}`;
  const title = available ? `${story.headline} · Digivated News` : 'News · Digivated';
  const description = available
    ? (truncateOnWord(story.summary, 160) || `${NEWS_CATEGORIES[story.category] || 'News'} from ${story.sourceName || 'the source'}, on Digivated News.`)
    : 'Source-linked news on AI and technology, markets, and security.';
  let html = template.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${escapeHtml(canonical)}">`)
    .replace(/<meta\b[^>]*(?:name|property)="(description|og:description|twitter:description|og:title|twitter:title|og:url|og:type)"[^>]*>/g,
      (tag, key) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escapeHtml(key === 'og:type' ? (available ? 'article' : 'website') : key === 'og:url' ? canonical : key.endsWith('title') ? title : description)}">`);
  html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (match, start, json, end) => {
    let data;
    try { data = JSON.parse(json); } catch { return match; }
    const graph = Array.isArray(data['@graph']) ? data['@graph'] : [];
    for (const node of graph) if (node['@type'] === 'WebPage') Object.assign(node, { '@id':`${canonical}#webpage`, url:canonical, name:title, description });
    if (available) graph.push({
      '@type':'NewsArticle', '@id':`${canonical}#article`, mainEntityOfPage:{ '@id':`${canonical}#webpage` },
      headline:truncateOnWord(story.headline, 110), description, url:canonical,
      articleSection:NEWS_CATEGORIES[story.category] || 'News',
      ...(story.sourcePublishedAt || story.publishedAt ? { datePublished:story.sourcePublishedAt || story.publishedAt } : {}),
      ...(story.correctedAt || story.publishedAt ? { dateModified:story.correctedAt || story.publishedAt } : {}),
      ...(safeSourceUrl(story.sourceUrl) ? { isBasedOn:safeSourceUrl(story.sourceUrl) } : {}),
      publisher:{ '@id':'https://digivated.com/#organization' },
      isPartOf:{ '@id':'https://digivated.com/#website' }
    });
    return start + JSON.stringify(data).replace(/</g, '\\u003c') + end;
  });
  const body = available ? newsArticleMarkup(story, related) : newsMissingMarkup(status);
  html = html.replace(/(<div\b[^>]*data-news-story-root[^>]*>)\s*<p\b[^>]*data-news-story-status[^>]*>[^<]*<\/p>/, (match, open) => open.replace('data-news-story-root', 'data-news-story-root data-news-story-ready') + body);
  if (!available) html = html.replace('</head>', '<meta name="robots" content="noindex,follow"></head>');
  return html;
}

export function makeNewsStoryPageHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return;
    }
    const template = deps.template || await readFile(new URL('./generated/news-story.html', import.meta.url), 'utf8');
    const url = new URL(req.url, origin);
    const fromQuery = /([a-f0-9]{24})\/?$/.exec(url.searchParams.get('id') || '')?.[1] || '';
    const id = newsIdFromPath(url.pathname) || (validNewsId(fromQuery) ? fromQuery : '');
    const env = deps.env || process.env;
    // Without storage (local previews) the browser loads the story itself.
    if (!deps.redis && !env.SUBMISSIONS_REDIS_REST_TOKEN) { res.statusCode = 200; res.end(req.method === 'HEAD' ? '' : template); return; }
    let result = null, status = 404;
    if (id) {
      try {
        result = await loadNewsStory(deps.redis || redisClient(env), id, deps.now?.() || Date.now());
        if (result) status = 200;
      } catch { status = 503; res.setHeader('Retry-After', '60'); }
    }
    // Old or bare links settle on one address.
    if (status === 200 && url.pathname !== newsStoryPath(result.story) && newsIdFromPath(url.pathname)) {
      res.statusCode = 308; res.setHeader('Location', newsStoryPath(result.story)); res.end(); return;
    }
    res.statusCode = status;
    if (status !== 200) res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.end(req.method === 'HEAD' ? '' : renderNewsStoryPage(template, { id, story:result?.story, related:result?.related, status }));
  };
}
