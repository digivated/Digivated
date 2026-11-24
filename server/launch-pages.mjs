import { cardIconMarkup } from '../src/lib/card-icons.mjs';
import { projectDisplayLogo } from './project-display-logo.mjs';
import { projectPricingOptions } from '../src/lib/project-pricing.mjs';
import { projectMarks, PROJECT_MARK_LABEL } from '../src/lib/project-marks.mjs';
import { projectCategory } from '../src/lib/project-taxonomy.mjs';
import { readFile } from 'node:fs/promises';
import { safeUrl } from '../src/data/community.mjs';
import { projectPublic, validId, storageKey } from './admin-store.mjs';
import { AdminError } from './admin-auth.mjs';
import { redisClient, validateSubmission } from './submissions.mjs';
import { launchSchemaScript } from './launch-schema.mjs';
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
  return { sponsored:record.promotion?.verified === true, featured:record.status === 'featured', id:record.id, slug:record.slug || pageSlug(record), name:record.name, description:record.description, creator:record.creator, category:projectCategory(record), website:safeUrl(record.url), pricing:record.pricing, date:record.date, publishedAt:record.publishedAt, bio:page.bio || '', logo:draft ? '' : projectDisplayLogo(record), ctaLabel:page.ctaLabel || 'Visit project', ctaUrl:safeUrl(page.ctaUrl || record.url), socialUrl:safeUrl(record.socialUrl), image:record.image ? (draft ? record.image : `/api/project-page?slug=${record.slug}&asset=primary`) : '', alt:page.alt || `${record.name} screenshot`, hasPrimaryScreenshot: Boolean(record.image && page.alt), gallery:(page.gallery || []).map((item,index)=>({alt:item.alt,image:draft?item.image:`/api/project-page?slug=${record.slug}&asset=${index}`})) };
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderLaunch(item, { draft = false, origin = 'https://digivated.com', template } = {}) {
  const e = escape, canonical = new URL(item.path || `/projects/${item.slug}`, origin).href;
  const screenshots = [
    ...(item.image ? [{ image: item.image, alt: item.alt }] : []),
    ...item.gallery,
  ];
  // A primary upload can be a logo. The page editor can identify it as a screenshot.
  const cover = item.hasPrimaryScreenshot ? screenshots[0] : item.gallery[0];
  const website = safeUrl(item.website || item.ctaUrl);
  const destination = safeUrl(item.ctaUrl) || website;
  // Outbound clicks from a published page count as a visit for feedback points (visit-feedback.js).
  const visitAttrs = draft || !item.id ? '' : ` data-visit-project="${e(item.id)}" data-visit-name="${e(item.name)}"${/^\/[^/]/.test(item.logo || '') ? ` data-visit-image="${e(item.logo)}"` : ''}`;
  const date = item.publishedAt || item.date;
  const listedDate = date && Number.isFinite(Date.parse(date)) ? new Date(date) : null;
  const categoryHref = `/discover?category=${encodeURIComponent(item.category)}`;
  const sections = [
    ['overview', 'Overview'],
    ...(screenshots.length ? [['gallery', 'Gallery']] : []),
    ['details', 'Details'],
    ...(draft ? [] : [['feedback', 'Discussion'], ['similar', 'Similar']]),
  ];
  const marks = projectMarks(item).map(key => key === 'member'
    ? '<span class="launch-mark"><span class="dg-member-mark" aria-hidden="true"></span>Pro</span>'
    : `<span class="launch-mark">${e(PROJECT_MARK_LABEL[key])}</span>`).join('');
  const draftNotice = draft
    ? '<p class="launch-draft" role="status">Private draft preview · Only an explicit Publish launch page action makes this public.</p>'
    : '';
  const vote = draft ? '' : `<button type="button" class="launch-vote" data-like-type="project" data-like-id="${e(item.id)}" data-show-zero aria-pressed="false" aria-label="Upvote this project"><span aria-hidden="true">↑</span><span data-like-count>–</span></button>`;
  const shareControls = draft ? '' : `<div class="launch-share">
    <button type="button" data-save-type="project" data-save-id="${e(item.id)}">Save</button>
    <button type="button" data-copy-link>Copy link</button>
    <button type="button" data-native-share hidden>Share</button>
    <p role="status" data-share-status></p>
  </div>`;
  const gallery = screenshots.length ? `<section id="gallery" class="launch-panel launch-media" aria-labelledby="launch-gallery-title">
    <h2 id="launch-gallery-title">Gallery</h2>
    ${screenshots.map(({ image, alt }) => `<figure class="launch-shot"><img src="${e(image)}" alt="${e(alt)}" width="1200" height="750" decoding="async" loading="lazy"><figcaption>${e(alt)}</figcaption></figure>`).join('')}
  </section>` : '';
  const details = `<section id="details" class="launch-panel" aria-labelledby="launch-details-title">
    <h2 id="launch-details-title">Project details</h2>
    <dl class="launch-facts">
      <div><dt>Category</dt><dd><a href="${e(categoryHref)}">${e(item.category)}</a></dd></div>
      ${website && website !== destination ? `<div><dt>Website</dt><dd><a href="${e(website)}" target="_blank" rel="noopener noreferrer"${visitAttrs}>${e(new URL(website).hostname)} ${cardIconMarkup('external')}</a></dd></div>` : ''}
      ${projectPricingOptions.includes(item.pricing) ? `<div><dt>Pricing</dt><dd>${e(item.pricing)}</dd></div>` : ''}
      ${listedDate ? `<div><dt>${item.publishedAt ? 'Published' : 'Submitted'}</dt><dd><time datetime="${listedDate.toISOString().slice(0,10)}">${e(listedDate.toLocaleDateString('en-US',{dateStyle:'medium',timeZone:'UTC'}))}</time></dd></div>` : ''}
    </dl>
    <div class="launch-creator">
      <h3>Meet the creator</h3><p class="creator-name">${e(item.creator)}</p>
      ${item.bio ? `<p>${e(item.bio)}</p>` : ''}
      ${item.socialUrl ? `<a href="${e(item.socialUrl)}" target="_blank" rel="noopener noreferrer">Creator profile ${cardIconMarkup('external')}</a>` : ''}
    </div>
  </section>`;
  const community = draft ? '' : `<section id="feedback" class="launch-panel launch-comments" data-project-comments="${e(item.id)}" aria-labelledby="launch-comments-title" tabindex="-1">
    <h2 id="launch-comments-title">Discussion</h2>
    <p data-project-comments-message role="status">Loading discussion…</p>
    <noscript><p>Turn on JavaScript to read and join the discussion.</p></noscript>
  </section>
  <section id="similar" class="launch-panel" data-launch-related="${e(item.id)}" data-category="${e(item.category)}" aria-labelledby="launch-related-title">
    <h2 id="launch-related-title">More in ${e(item.category)}</h2>
    <ul class="launch-related-list" hidden></ul>
    <a class="launch-category-link" href="${e(categoryHref)}">Browse category <span aria-hidden="true">→</span></a>
  </section>`;
  const body = `${draftNotice}<article class="launch-page">
    <nav class="launch-breadcrumb" aria-label="Breadcrumb"><a href="/discover">Projects</a><span aria-hidden="true">/</span><a href="${e(categoryHref)}">${e(item.category)}</a></nav>
    <header class="launch-panel launch-intro">
      ${cover ? `<div class="launch-cover" aria-hidden="true"><img src="${e(cover.image)}" alt="" width="1200" height="750" fetchpriority="high" decoding="async"></div>` : ''}
      <div class="launch-hero">
        <div class="launch-identity dg-project-art" aria-hidden="true"><span class="dg-monogram"${item.logo ? ' hidden' : ''}>${e(item.name.slice(0,2).toUpperCase())}</span>${item.logo ? `<img src="${e(item.logo)}" alt="" width="96" height="96" decoding="async">` : ''}</div>
        <div class="launch-hero-copy">
          <h1>${e(item.name)}</h1>
          <p class="launch-byline">By ${e(item.creator)}</p>
          ${marks ? `<p class="launch-labels">${marks}</p>` : ''}
        </div>
        <div class="launch-actions">
          ${destination ? `<a class="button primary" href="${e(destination)}" target="_blank" rel="noopener noreferrer"${visitAttrs}>${e(item.ctaLabel)} ${cardIconMarkup('external')}</a>` : '<p>Project link currently unavailable.</p>'}
          ${vote}
        </div>
        ${shareControls}
      </div>
    </header>
    <nav class="launch-section-nav" aria-label="On this page">${sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>
    <section id="overview" class="launch-panel launch-overview" aria-labelledby="launch-about">
      <h2 id="launch-about">Overview</h2><p>${e(item.description)}</p>
    </section>
    ${gallery}
    ${details}
    ${community}
  </article>`;
  let shell = template || await readFile(new URL('./generated/project.html', import.meta.url),'utf8');
  if(draft) shell=shell.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const templateSchema=shell.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)?.[1]||'';
  shell=shell.replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/i,'');
  const schema=draft?'':launchSchemaScript({ item, canonical, description:metaDescription(item.description), templateSchema });
  const substitutions = {
    LAUNCH_TITLE:e(item.name), LAUNCH_DESCRIPTION:e(metaDescription(item.description)),
    'launch-template':e(canonical),
    'digivated-tech-markets-banner.png':e((item.image || item.logo) && !draft ? new URL(item.image || item.logo,origin).href : `${origin}/digivated-tech-markets-banner.png`)
  };
  const hasOgUrl = /<meta\b[^>]*property="og:url"/.test(shell);
  return shell.replace(/LAUNCH_TITLE|LAUNCH_DESCRIPTION|https:\/\/digivated(?:\.vercel\.app|\.com)\/(launch-template|digivated-tech-markets-banner\.png)(?:\/)?/g,(match, asset)=>substitutions[asset || match])
    .replace('</head>',()=>`${schema}${hasOgUrl?'':`<meta property="og:url" content="${e(canonical)}">`}${draft?'<meta name="robots" content="noindex,nofollow">':''}</head>`)
    .replace('<!--LAUNCH_BODY-->',()=>body);
}
// Search results show about 155 characters, so a long project description is cut at a word boundary for the meta tags only.
export function metaDescription(text, max = 155) {
  const plain = String(text || '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 80)).replace(/[\s,;:.\-–—]+$/, '') + '…';
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
        website: project.url, pricing: project.pricing, date: project.date, publishedAt: project.publishedAt,
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

