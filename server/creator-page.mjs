import { readFile } from 'node:fs/promises';
import { redisClient } from './submissions.mjs';

const origin = 'https://digivated.com';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Render the existing built page so CSS, script hooks, and interactions stay identical.
export function renderCreatorPage(template, { id, profile, status = 200 }) {
  const available = status === 200 && profile;
  const canonical = available ? `${origin}/creator?id=${encodeURIComponent(id)}` : `${origin}/creator`;
  const name = available ? String(profile.name || 'Creator') : 'Creator profile';
  const title = `${name} · Digivated`;
  const bio = available ? String(profile.bio || 'Building and sharing on Digivated.') : '';
  const description = available ? (bio || `Projects and posts by ${name} on Digivated.`).replace(/\s+/g, ' ').slice(0, 180) : 'Explore the builders on Digivated.';
  let html = template.replace(/<title>[^<]*<\/title>/, () => `<title>${escape(title)}</title>`)
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${escape(canonical)}">`)
    .replace(/<meta\b[^>]*(?:name|property)="(description|og:description|twitter:description|og:title|twitter:title|og:url)"[^>]*>/g,
      (tag, key) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escape(key === 'og:url' ? canonical : key.endsWith('title') ? title : description)}">`)
    .replace(/<h1 id="creator-title">[^<]*<\/h1>/, () => `<h1 id="creator-title">${escape(name)}</h1>`)
    .replace(/<p id="creator-bio"><\/p>/, () => `<p id="creator-bio">${escape(bio)}</p>`);
  html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (match, start, json, end) => {
    const data = JSON.parse(json);
    for (const node of data['@graph'] || []) if (node['@type'] === 'WebPage') Object.assign(node, { '@id':`${canonical}#webpage`, url:canonical, name, description });
    return start + JSON.stringify(data).replace(/</g, '\\u003c') + end;
  });
  if (!available) html = html.replace('</head>', '<meta name="robots" content="noindex,follow"></head>');
  return html;
}

export function makeCreatorPageHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 405;res.setHeader('Allow', 'GET, HEAD');res.end();return;
    }
    const template = deps.template || await readFile(new URL('./generated/creator.html', import.meta.url), 'utf8');
    const id = new URL(req.url, origin).searchParams.get('id') || '';
    let profile = null, status = 404;
    if (uuid.test(id)) {
      try {
        const env = deps.env || process.env;
        let record;
        if (!deps.redis && env.VERCEL_ENV === 'preview' && !env.SUBMISSIONS_REDIS_REST_TOKEN) {
          const response = await (deps.fetcher || fetch)(`${origin}/api/creator-profile?id=${encodeURIComponent(id)}`, { signal:AbortSignal.timeout(8000), redirect:'error' });
          if (!response.ok && response.status !== 404) throw new Error('Public profiles unavailable.');
          const data = await response.json();
          record = response.ok && data.profile?.id === id ? { public:true, name:data.profile.name, bio:data.profile.bio } : null;
        } else {
          const redis = deps.redis || redisClient(env);
          const raw = await redis(['GET', `digivated:creator:profile:${id}`]);
          record = typeof raw === 'string' ? JSON.parse(raw) : null;
        }
        if (record?.public === true) { profile = { name:record.name, bio:record.bio };status = 200; }
      } catch { status = 503;res.setHeader('Retry-After', '60'); }
    }
    res.statusCode = status;
    if (status !== 200) res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.end(req.method === 'HEAD' ? '' : renderCreatorPage(template, { id, profile, status }));
  };
}
