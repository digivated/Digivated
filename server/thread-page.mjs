import { readFile } from 'node:fs/promises';
import { redisClient } from './submissions.mjs';
import { threadKey } from './discussions.mjs';
import { forums } from '../src/data/forums.mjs';

const origin = 'https://digivated.com';
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const forumName = slug => forums.find(forum => forum.slug === slug)?.name || 'General';

// Thread pages are one static template filled in by the browser. Search engines
// and link previews get the thread's own title, description, canonical URL and
// structured data in the first response instead of the generic "Thread" page.
export function renderThreadPage(template, { slug, thread, status = 200 }) {
  const available = status === 200 && thread;
  const canonical = available ? `${origin}/threads/${thread.slug}` : `${origin}/threads/${slug || ''}`;
  const title = available ? `${thread.title} · Digivated Threads` : 'Thread · Digivated';
  const description = available
    ? String(thread.body || '').replace(/\s+/g, ' ').trim().slice(0, 160) || `A discussion in ${forumName(thread.forum)} on Digivated Threads.`
    : 'A discussion on Digivated Threads.';
  let html = template.replace(/<title>[^<]*<\/title>/, () => `<title>${escape(title)}</title>`)
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${escape(canonical)}">`)
    .replace(/<meta\b[^>]*(?:name|property)="(description|og:description|twitter:description|og:title|twitter:title|og:url)"[^>]*>/g,
      (tag, key) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escape(key === 'og:url' ? canonical : key.endsWith('title') ? title : description)}">`);
  html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (match, start, json, end) => {
    let data;
    try { data = JSON.parse(json); } catch { return match; }
    const graph = Array.isArray(data['@graph']) ? data['@graph'] : [];
    for (const node of graph) if (node['@type'] === 'WebPage') Object.assign(node, { '@id':`${canonical}#webpage`, url:canonical, name:title, description });
    if (available) graph.push({
      '@type':'DiscussionForumPosting', '@id':`${canonical}#thread`, mainEntityOfPage:{ '@id':`${canonical}#webpage` },
      headline:String(thread.title).slice(0, 110), text:String(thread.body || '').slice(0, 5000), url:canonical,
      ...(thread.createdAt ? { datePublished:thread.createdAt } : {}),
      author:{ '@type':'Person', name:String(thread.authorName || 'Digivated member'), ...(typeof thread.authorProfileUrl === 'string' && thread.authorProfileUrl.startsWith('/') ? { url:new URL(thread.authorProfileUrl, origin).href } : {}) },
      isPartOf:{ '@id':'https://digivated.com/#website' }
    });
    return start + JSON.stringify(data).replace(/</g, '\\u003c') + end;
  });
  if (!available) html = html.replace('</head>', '<meta name="robots" content="noindex,follow"></head>');
  return html;
}

export function threadSlugFromPath(pathname) {
  const slug = /^\/threads\/([a-z0-9][a-z0-9-]{0,99})\/?$/.exec(pathname)?.[1];
  return slug && slug !== 'new' && slug !== 'thread' ? slug : '';
}

export function makeThreadPageHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return;
    }
    const template = deps.template || await readFile(new URL('./generated/thread.html', import.meta.url), 'utf8');
    const url = new URL(req.url, origin);
    const slug = threadSlugFromPath(url.pathname) || (SLUG.test(url.searchParams.get('slug') || '') ? url.searchParams.get('slug') : '');
    const env = deps.env || process.env;
    // Without storage (local previews) the page still works; the browser loads the thread.
    if (!deps.redis && !env.SUBMISSIONS_REDIS_REST_TOKEN) { res.statusCode = 200; res.end(req.method === 'HEAD' ? '' : template); return; }
    let thread = null, status = 404;
    if (slug) {
      try {
        const redis = deps.redis || redisClient(env);
        const id = await redis(['GET', `digivated:thread:slug:${slug}`]);
        const raw = typeof id === 'string' ? await redis(['GET', threadKey(id)]) : null;
        const record = typeof raw === 'string' ? JSON.parse(raw) : null;
        if (record?.status === 'published' && record.slug === slug) { thread = record; status = 200; }
        else if (record) status = 410;
      } catch { status = 503; res.setHeader('Retry-After', '60'); }
    }
    res.statusCode = status;
    if (status !== 200) res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.end(req.method === 'HEAD' ? '' : renderThreadPage(template, { slug, thread, status }));
  };
}
