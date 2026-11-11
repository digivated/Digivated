import { projectCategory } from '../src/lib/project-taxonomy.mjs';
import { readFile } from 'node:fs/promises';
import { safeUrl } from '../src/data/community.mjs';
import { projectPublic, validId, storageKey } from './admin-store.mjs';
import { AdminError } from './admin-auth.mjs';
import { redisClient, validateSubmission } from './submissions.mjs';
export const ctaLabels = ['Visit project', 'Try the app', 'Join the waitlist'];
const clean = (value, max, required = false) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new AdminError(400, 'Check the launch page fields.');
  return value.trim();
};
export function launchFields(input, previous) {
  const page = input.page;
  if (page === undefined) return { page: previous.page, pagePublished: previous.pagePublished === true };
  if (!page || typeof page !== 'object' || Array.isArray(page)) throw new AdminError(400, 'Invalid page.');
  const bio = clean(page.bio || '', 600), alt = clean(page.alt || '', 240);
  const ctaLabel = page.ctaLabel || 'Visit project';
  const ctaUrl = safeUrl(clean(page.ctaUrl || input.url, 500, true));
  if (!ctaLabels.includes(ctaLabel) || !ctaUrl) throw new AdminError(400, 'Choose a CTA label and a valid HTTP or HTTPS destination.');
  const gallery = page.gallery ?? previous.page?.gallery ?? [];
  if (!Array.isArray(gallery) || gallery.length > 3) throw new AdminError(400, 'Use up to three gallery screenshots.');
  const images = gallery.map(item => ({ image: validateSubmission({ creator:'Image', email:'image@example.com', name:'Image', url:'https://example.com', description:'A screenshot for validation.', category:'Other', consent:true, image:item.image }).image, alt:clean(item.alt || '',240,true) }));
  if (images.some(item => !item.image)) throw new AdminError(400,'Choose a screenshot for each gallery entry.');
  const publish = input.pageAction === 'publish';
  const consent = page.consent === true;
  if (publish && (!consent || !['approved','featured'].includes(input.status) || ((input.image || previous.image) && !input.removeImage && !alt))) throw new AdminError(400, 'Approve the submission, confirm permission for all public page fields, and describe the screenshot before publishing.');
  return { launchVersion:1, page: { bio, alt, ctaLabel, ctaUrl, consent, gallery:images }, pagePublished:publish };
}
export function pageSlug(record) {
  // Full immutable submission ID prevents name collisions without a title-based URL change.
  const base = record.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45).replace(/-$/,'') || 'project';
  return `${base}-${record.id}`;
}
export function launchPublic(record, draft = false) {
  if (!record || (!draft && ((record.promotion?.requested && !record.promotion.verified) || !record.pagePublished || !record.page?.consent || !record.consent || !['approved','featured'].includes(record.status)))) return null;
  const page = record.page || {};
  return { sponsored:record.promotion?.verified === true, featured:record.status === 'featured', id:record.id, slug:record.slug || pageSlug(record), name:record.name, description:record.description, creator:record.creator, category:projectCategory(record), bio:page.bio || '', ctaLabel:page.ctaLabel || 'Visit project', ctaUrl:safeUrl(page.ctaUrl || record.url), socialUrl:safeUrl(record.socialUrl), image:record.image ? (draft ? record.image : `/api/project-page?slug=${record.slug}&asset=primary`) : '', alt:page.alt || `${record.name} screenshot`, gallery:(page.gallery || []).map((item,index)=>({alt:item.alt,image:draft?item.image:`/api/project-page?slug=${record.slug}&asset=${index}`})) };
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderLaunch(item, { draft = false, origin = 'https://digivated.com', template } = {}) {
  const e = escape, canonical = new URL(item.path || `/projects/${item.slug}`, origin).href;
  const screenshot = (src,alt,primary=false) => `<figure class="launch-shot"><img src="${e(src)}" alt="${e(alt)}" width="1200" height="750" decoding="async" ${primary?'fetchpriority="high"':'loading="lazy"'}><figcaption>${e(alt)}</figcaption></figure>`;
  const body = `${draft?'<p class="launch-draft" role="status">Private draft preview · Only an explicit Publish launch page action makes this public.</p>':''}<article class="launch-page"><header class="launch-intro"><a class="launch-back" href="/discover">← Explore projects</a>
<div class="launch-hero">${item.logo ? `<div class="launch-identity"><span aria-hidden="true">${e(item.name.slice(0,2).toUpperCase())}</span><img src="${e(item.logo)}" alt="" width="96" height="96"></div>` : ''}
<div class="launch-hero-copy"><p class="launch-labels"><span>${e(item.category)}</span>${item.featured ? '<span class="launch-spotlight">Spotlight</span>' : ''}${item.sponsored ? '<span>Sponsored</span>' : ''}</p>
<h1>${e(item.name)}</h1><p class="launch-byline">By ${e(item.creator)}</p><div class="actions">${item.ctaUrl?`<a class="button primary" href="${e(item.ctaUrl)}" target="_blank" rel="noopener noreferrer">${e(item.ctaLabel)} <span aria-hidden="true">↗</span></a>`:'<p>Project link currently unavailable.</p>'}${draft?'':`<a class="button" data-comment-type="project" data-comment-id="${e(item.id)}" href="/discover?feedback=${encodeURIComponent(item.id)}">Give feedback</a><button class="button" type="button" data-save-type="project" data-save-id="${e(item.id)}">Save</button><button class="button" type="button" data-copy-link>Copy link</button><button class="button" type="button" data-native-share hidden>Share</button>`}</div><p role="status" data-share-status></p></div></div></header>
${item.image || item.gallery.length ? `<section class="launch-media" aria-label="Project screenshots">${item.image ? screenshot(item.image,item.alt,true) : ''}${item.gallery.map(s=>screenshot(s.image,s.alt)).join('')}</section>` : ''}
<div class="launch-layout"><section class="launch-overview" aria-labelledby="launch-about"><h2 id="launch-about">About the project</h2><p>${e(item.description)}</p>${!item.logo && !item.image && !item.gallery.length ? '<p class="launch-no-media">For a closer look, visit the project website.</p>' : ''}</section><div class="launch-maker-column"><aside class="launch-creator"><h2>Meet the creator</h2><p class="creator-name">${e(item.creator)}</p>${item.bio?`<p>${e(item.bio)}</p>`:''}${item.socialUrl?`<a href="${e(item.socialUrl)}" target="_blank" rel="noopener noreferrer">Creator profile ↗</a>`:''}</aside>${draft ? '' : `<section class="launch-featured-panel" data-launch-featured="${e(item.id)}" aria-labelledby="launch-featured-title" hidden>
  <h2 id="launch-featured-title">Featured projects</h2>
  <ul class="launch-featured-list"></ul>
  <a class="launch-featured-all" href="/discover?view=featured">View all featured <span aria-hidden="true">→</span></a>
</section>`}</div></div><nav class="launch-next" aria-label="Keep exploring"><a href="/discover">Explore more projects <span aria-hidden="true">→</span></a><a href="/creators">Meet the builders <span aria-hidden="true">→</span></a></nav></article>`;
  let shell = template || await readFile(new URL('./generated/project.html', import.meta.url),'utf8');
  if(draft) shell=shell.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const substitutions = {
    LAUNCH_TITLE:e(item.name), LAUNCH_DESCRIPTION:e(item.description),
    'launch-template':e(canonical),
    'digivated-tech-markets-banner.png':e((item.image || item.logo) && !draft ? new URL(item.image || item.logo,origin).href : `${origin}/digivated-tech-markets-banner.png`)
  };
  return shell.replace(/LAUNCH_TITLE|LAUNCH_DESCRIPTION|https:\/\/digivated(?:\.vercel\.app|\.com)\/(launch-template|digivated-tech-markets-banner\.png)(?:\/)?/g,(match, asset)=>substitutions[asset || match])
    .replace('</head>',()=>`<meta property="og:url" content="${e(canonical)}"><meta name="twitter:card" content="summary_large_image">${draft?'<meta name="robots" content="noindex,nofollow">':''}</head>`)
    .replace('<!--LAUNCH_BODY-->',()=>body);
}
export function makeLaunchHandler(deps = {}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','private, no-store'); res.setHeader('Vercel-CDN-Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    const fail = (status,message) => {res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Project unavailable · Digivated</title><main><h1>${message}</h1><p><a href="/discover">Explore published projects</a></p></main></html>`);};
    try {
      if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(405,'Method not allowed.');}
      const url=new URL(req.url,'https://digivated.invalid');
      const listingId = url.searchParams.get('listing') ?? /^\/projects\/listing\/([^/]+)\/?$/.exec(url.pathname)?.[1];
      const slug = url.searchParams.get('slug') || url.pathname.split('/')[2];
      const listing = listingId !== undefined;
      if (listing ? !validId(listingId) : !/^[a-z0-9][a-z0-9-]{0,149}$/.test(slug || '')) return fail(404,'This project is not available.');
      const env=deps.env||process.env;
      if(!deps.redis && !env.SUBMISSIONS_REDIS_REST_URL)return fail(404,'This project is not available.');
      const redis=deps.redis||redisClient(env);
      const id = listing ? listingId : await redis(['GET',`digivated:launch-slug:${slug}`]);
      const raw = id ? await redis(['GET', storageKey('submission', id)]) : null;
      const record = raw ? JSON.parse(raw) : null;
      const project = listing && record?.id === id ? projectPublic(record) : null;
      if (project && project.pageUrl !== `/projects/listing/${id}`) {
        res.setHeader('Location', project.pageUrl); res.statusCode = 302; return res.end();
      }
      const item = listing ? project && {
        id: project.id, path: project.pageUrl, name: project.name, creator: project.creator,
        description: project.description, category: project.category, ctaLabel: 'Visit project',
        ctaUrl: project.url, socialUrl: project.socialUrl, logo: project.image,
        sponsored: project.sponsored, featured: project.status === 'featured', gallery: []
      } : launchPublic(record);
      if (!item || (!listing && item.slug !== slug)) return fail(404,'This project is not available.');
      if (listing && url.searchParams.has('asset')) return fail(404,'Screenshot unavailable.');
      if(url.searchParams.has('asset')){
        const asset=url.searchParams.get('asset');const image=asset==='primary'?record.image:/^[0-2]$/.test(asset)?record.page?.gallery?.[Number(asset)]?.image:null;
        const match=image?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
        if(!match)return fail(404,'Screenshot unavailable.');
        res.setHeader('Content-Type',match[1]);res.statusCode=200;return res.end(Buffer.from(match[2],'base64'));
      }
      res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=200;
      const origin=env.VERCEL_ENV==='preview' && env.VERCEL_URL?`https://${env.VERCEL_URL}`:'https://digivated.com';
      res.end(await renderLaunch(item,{origin,template:deps.template}));
    }catch {return fail(503,'This project is temporarily unavailable. Please try again.');}
  };
}

