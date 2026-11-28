// Shared by the News feed, the story page script and the server-rendered story page,
// so a story looks and links the same everywhere.
import { cardIconMarkup } from './card-icons.mjs';

export const NEWS_CATEGORIES = { 'ai-tech': 'AI & Tech', markets: 'Markets', security: 'Security', 'indie-building': 'Indie Building' };
export const NEWS_CATEGORY_ICONS = { 'ai-tech': 'cpu', markets: 'chart', security: 'shield', 'indie-building': 'layers' };
const ID = /^[a-f0-9]{24}$/;

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function newsSlug(headline) {
  return String(headline || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '');
}

export function newsStoryPath(story) {
  if (!ID.test(story?.id || '')) return '/news';
  const slug = newsSlug(story.headline);
  return `/news/${slug ? slug + '-' : ''}${story.id}`;
}

// /news/<headline-words>-<24 hex id>, or the bare id.
export function newsIdFromPath(pathname) {
  const match = /^\/news\/(?:[a-z0-9-]{0,100}-)?([a-f0-9]{24})\/?$/.exec(String(pathname || ''));
  return match ? match[1] : '';
}

export const validNewsId = id => ID.test(String(id || ''));

export function safeSourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

const timeValue = value => { const n = Date.parse(value); return Number.isFinite(n) ? n : null; };

// A stable, timezone-free label for server HTML. The browser swaps in a local one.
export function absoluteTime(value) {
  const n = timeValue(value);
  return n === null ? '' : new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZone:'UTC', timeZoneName:'short' }).format(n);
}

export function relativeTime(value, now = Date.now()) {
  const n = timeValue(value);
  if (n === null) return '';
  const minutes = Math.max(0, Math.round((now - n) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'Yesterday' : `${days} days ago`;
  return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', timeZone:'UTC' }).format(n);
}

const timeTag = (value, text) => {
  const n = timeValue(value);
  return n === null ? '' : `<time datetime="${new Date(n).toISOString()}" data-news-time>${escapeHtml(text)}</time>`;
};

const tickers = story => (Array.isArray(story?.tickers) ? story.tickers : [])
  .filter(t => /^[A-Z][A-Z0-9.-]{0,11}$/.test(t?.symbol || '') && /^[A-Z]+$/.test(t?.exchange || '')).slice(0, 8);

const readMinutes = story => Math.max(1, Math.round(String(story?.summary || '').split(/\s+/).filter(Boolean).length / 200));

function storyCard(story) {
  const category = NEWS_CATEGORIES[story.category] || 'News';
  return `<a class="news-read-card" href="${escapeHtml(newsStoryPath(story))}">`
    + `<span class="news-read-card-icon" data-news-cat="${escapeHtml(story.category)}">${cardIconMarkup(NEWS_CATEGORY_ICONS[story.category] || 'layers')}</span>`
    + `<span class="news-read-card-text"><span class="news-read-card-meta">${escapeHtml(category)} · ${escapeHtml(story.sourceName || '')}</span>`
    + `<span class="news-read-card-title">${escapeHtml(story.headline)}</span></span></a>`;
}

// The full story page body. Every value is escaped, so the markup is safe as innerHTML.
export function newsArticleMarkup(story, related = []) {
  const category = NEWS_CATEGORIES[story.category] || 'News';
  const source = safeSourceUrl(story.sourceUrl);
  const sourceName = story.sourceName || (source ? new URL(source).hostname : 'the source');
  const chips = [];
  if (story.classification === 'breaking') chips.push('<span class="news-chip news-chip--breaking">Breaking</span>');
  if (story.sourceType === 'issuer-release') chips.push('<span class="news-chip">Company announcement</span>');
  for (const t of tickers(story)) chips.push(`<span class="news-chip news-chip--ticker">${escapeHtml(t.exchange)}: ${escapeHtml(t.symbol)}</span>`);
  const summary = String(story.summary || '').trim();
  const paragraphs = summary ? summary.split(/\n{2,}/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('') : '';
  const why = typeof story.whyItMatters === 'string' && story.whyItMatters.trim() ? `<p class="news-why">Why it matters: ${escapeHtml(story.whyItMatters.trim())}</p>` : '';
  const also = (Array.isArray(story.alsoCoveredBy) ? story.alsoCoveredBy : []).flatMap(item => {
    const href = safeSourceUrl(item?.sourceUrl);
    return href ? [`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.sourceName || 'Source')}</a>`] : [];
  });
  const alsoLine = also.length ? `<p class="news-also">Also covered by ${also.join(', ')}</p>` : '';
  const sourceButton = source
    ? `<a class="news-article-source" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer"><span>Read the full story on ${escapeHtml(sourceName)}</span>${cardIconMarkup('external')}</a>`
    : '';
  const discussHref = /^[a-f0-9]{24}$/.test(story?.id || '') ? `/threads/new?news=${story.id}` : '';
  const discussButton = discussHref
    ? `<a class="news-article-discuss" href="${escapeHtml(discussHref)}">${cardIconMarkup('comment')}<span>Discuss</span></a>`
    : '';
  const facts = [
    ['Source', escapeHtml(sourceName)],
    ['Published by source', timeTag(story.sourcePublishedAt, absoluteTime(story.sourcePublishedAt))],
    ['Added to Digivated', timeTag(story.publishedAt, absoluteTime(story.publishedAt))],
    ...(story.correctedAt ? [['Corrected', timeTag(story.correctedAt, absoluteTime(story.correctedAt))]] : []),
  ].filter(([, value]) => value);
  const more = related.filter(item => item && item.id !== story.id && validNewsId(item.id)).slice(0, 4);
  return `<p class="news-article-crumbs"><a href="/news">News</a><span aria-hidden="true">/</span><a href="/news?category=${escapeHtml(story.category)}">${escapeHtml(category)}</a></p>`
    + `<article class="news-article" data-news-cat="${escapeHtml(story.category)}">`
    + `<header class="news-article-head">`
    + `<div class="news-article-kicker"><span class="news-article-icon" data-news-cat="${escapeHtml(story.category)}">${cardIconMarkup(NEWS_CATEGORY_ICONS[story.category] || 'layers')}</span><span class="news-article-category">${escapeHtml(category)}</span>${chips.join('')}</div>`
    + `<h1 id="news-article-title">${escapeHtml(story.headline)}</h1>`
    + `<p class="news-article-byline"><span>${escapeHtml(sourceName)}</span><span aria-hidden="true">·</span>${timeTag(story.sourcePublishedAt, relativeTime(story.sourcePublishedAt)).replace('data-news-time', 'data-news-relative')}<span aria-hidden="true">·</span><span>${readMinutes(story)} min read</span></p>`
    + `</header>`
    + (paragraphs ? `<div class="news-article-body">${paragraphs}${why}</div>` : `<div class="news-article-body"><p>This one is short on our side. The full report is on ${escapeHtml(sourceName)}.</p>${why}</div>`)
    + alsoLine
    + `<div class="news-article-actions">${sourceButton}${discussButton}<button type="button" class="news-article-share" data-news-share>${cardIconMarkup('share')}<span>Copy link</span></button></div>`
    + `<dl class="news-article-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`
    + `<p class="news-article-note">We summarize and link to the original. The source has the full story and any updates.</p>`
    + `</article>`
    + (more.length ? `<section class="news-article-more" aria-labelledby="news-more-title"><div class="news-article-more-head"><h2 id="news-more-title">Keep reading</h2><a href="/news">All news</a></div><div class="news-read-grid">${more.map(storyCard).join('')}</div></section>` : '');
}

export function newsMissingMarkup(status = 404) {
  const title = status === 503 ? 'News is taking a breather' : 'This story is no longer here';
  const copy = status === 503 ? 'We could not load this story right now. Give it a minute and try again.' : 'It may have been removed or the link is wrong. The latest stories are one click away.';
  return `<div class="news-article-missing"><h1 id="news-article-title">${title}</h1><p>${copy}</p><a class="news-article-source" href="/news"><span>Go to News</span>${cardIconMarkup('arrow')}</a></div>`;
}
