// Editorial helpers for News. No storage and no network.
// Ingest stores the result. The public feed applies the same rules so older
// rows improve without a rewrite. Owner-edited and hand-written summaries stay put.
import { newsStoryPath } from './news-story.mjs';

const ACRONYMS = new Set('AI API CEO CFO CVE SEC FED FOMC GDP IPO NYSE NASDAQ OTC GPU CPU LLM GPT AWS EU UK EPS YOY IRS DOJ FTC IOS AMD IBM SAP CRM ETF ATH YTD ESG NVIDIA OPENAI PR'.split(' '));
const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const DATELINE = new RegExp(
  '^(?:\\[[^\\]]{0,40}\\]\\s*)?(?:[A-Z][A-Za-z .\'-]{1,40},\\s+){1,3}(?:' + MONTHS + ')[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}\\s*(?:\\(\\s*(?:GLOBE\\s*NEWSWIRE|PR\\s*NEWSWIRE|BUSINESS\\s*WIRE)[^)]*\\))?\\s*(?:\\/\\s*(?:PR\\s*Newswire|PRNewswire|GlobeNewswire|Business\\s*Wire)\\s*\\/)?\\s*[-–—:|]*\\s*',
  'i',
);
const WIRE_MARK = /\/\s*(?:PR\s*Newswire|PRNewswire|GlobeNewswire|Business\s*Wire)\s*\//i;
const FLUFF = /\b(?:changing the game|organization and fans|\bfans\b|golden state|\bnba\b|\bnfl\b|\bmlb\b|year in review|our favorite|behind the scenes|meet the (?:team|people)|a look at|what we learned|our journey|in conversation with)\b/i;
const MAJOR_ISSUER = /\$\s*\d[\d,.]*\s*(?:billion|trillion)\b|\b(?:AAPL|MSFT|GOOGL|GOOG|AMZN|META|NVDA|TSLA|AVGO|JPM|BRK|AMD|NFLX|ORCL|INTC|CSCO|ADBE|QCOM|IBM|CRM|UNH|XOM|LLY|COST)\b/;
const STOP = new Set('with from that this after their about into over under have been were will your just more than then also says said what when where which while they them some such'.split(' '));
const ACTIONS = ['launch', 'ship', 'review', 'releas', 'introduc', 'acquir', 'breach', 'hack', 'exploit', 'patch', 'outage', 'disclos', 'announc', 'updat', 'fix'];
const PRODUCTS = /^(claude|gemini|chatgpt|gpt|copilot|sora|llama|mistral|anthropic|openai|nvidia|deepseek)$/;

export const NEWS_SOURCE_RUN_CAP = 2;
export const NEWS_SOURCE_KEEP_IMPORTANCE = 80;
export const NEWS_FEED_SOURCE_CAP = 3;
export const NEWS_FEED_WINDOW = 20;

const WHY = {
  vendor_confirmed_active_exploitation: 'A widely used product is under active attack.',
  official_monetary_policy_decision: 'This is a Federal Reserve policy decision.',
  official_market_intervention: 'Regulators stepped into the market.',
  major_official_enforcement_action: 'This is a major enforcement action.',
  official_major_incident_confirmation: 'The company confirmed a major incident.',
  official_material_acquisition: 'This is a large acquisition.',
  official_major_model_generation_launch: 'This is a new flagship model.',
  verified_security_update: 'A confirmed security fix is out.',
  vendor_observed_significant_threat_campaign: 'A vendor reported a serious threat campaign.',
};

export function headlineLocked(record) {
  return record?.ownerEdited === true || record?.summaryMethod === 'owner-edited' || record?.summaryMethod === 'editorial-summary';
}

// Hook for a future summarizer. Today only a specific verified reason earns a line.
export function whyItMattersLine(reason) {
  return WHY[reason] || '';
}

export function truncateOnWord(value, max = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const limit = Math.max(1, max - 1);
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  const base = (space >= Math.min(40, Math.floor(limit * 0.5)) ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/g, '');
  return `${base}…`;
}

export function isShouting(value) {
  const letters = String(value || '').replace(/[^A-Za-z]/g, '');
  return letters.length >= 16 && letters.replace(/[^A-Z]/g, '').length / letters.length >= 0.75;
}

function sentenceCase(value) {
  const lower = String(value).toLowerCase();
  let text = lower.charAt(0).toUpperCase() + lower.slice(1);
  text = text.replace(/\b([a-z0-9&]{2,6})\b/g, word => {
    const upper = word.toUpperCase();
    if (ACRONYMS.has(upper) || /^Q[1-4]$/.test(upper)) return upper;
    return word;
  });
  text = text.replace(/\b(nasdaq|nyse|nyseamerican|nysearca|amex|otc)\s*:\s*([a-z][a-z0-9.-]{0,11})\b/gi, (match, exchange, symbol) => `${exchange.toUpperCase()}: ${symbol.toUpperCase()}`);
  return text.replace(/\b(inc|corp|ltd|co)\b/gi, word => word[0].toUpperCase() + word.slice(1));
}

function thirdPerson(value, sourceName) {
  const name = String(sourceName || '').trim();
  if (!name) return value;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^${escaped}\\b`, 'i').test(value)) return value;
  return value
    .replace(/^we(?:['’]re|\s+are)\s+/i, `${name} is `)
    .replace(/^we(?:['’]ve|\s+have)\s+/i, `${name} has `)
    .replace(/^we\s+/i, `${name} `)
    .replace(/^our\s+/i, `${name}'s `);
}

export function normalizeHeadline(value, sourceName = '') {
  const original = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!original) return '';
  let text = original.replace(DATELINE, '').replace(/\s*[—–]\s*/g, ' - ').replace(/…/g, '...');
  text = text.replace(/\s+/g, ' ').trim();
  if (isShouting(text)) text = sentenceCase(text);
  text = thirdPerson(text, sourceName);
  text = text.replace(/(?<!\b(?:Inc|Corp|Ltd|Co|Jr|Sr|U\.S|U\.K))\.$/, '');
  text = text.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  if (text.length < 8) return original.slice(0, 240);
  return text.slice(0, 240);
}

export function normalizeSummary(value) {
  return String(value ?? '')
    .replace(DATELINE, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/…/g, '...')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function presentHeadline(record) {
  if (!record || headlineLocked(record)) return String(record?.headline || '');
  return normalizeHeadline(record.headline, record.sourceName);
}

export function presentSummary(record) {
  if (!record || headlineLocked(record)) return String(record?.summary || '');
  return normalizeSummary(record.summary);
}

export function isCorporateFluff(candidate) {
  const headline = String(candidate?.headline || '');
  const text = `${headline} ${candidate?.summary || ''} ${candidate?.sourceText || ''}`.slice(0, 1200);
  if (!FLUFF.test(headline) && !FLUFF.test(text)) return false;
  if (/\b(?:CVE-\d{4}|actively exploited|data breach|ransomware|federal funds)\b/i.test(text)) return false;
  return true;
}

export function isSmallIssuerWire(candidate) {
  const issuer = candidate?.sourceType === 'issuer-release' || /pr newswire|globenewswire|business wire/i.test(candidate?.sourceName || '');
  if (!issuer) return false;
  const headline = String(candidate?.headline || '');
  const lead = `${headline} ${String(candidate?.summary || candidate?.sourceText || '').slice(0, 320)}`;
  const shouting = isShouting(headline);
  const wire = WIRE_MARK.test(lead) || (shouting && new RegExp(`\\b(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2},\\s+\\d{4}\\b`, 'i').test(lead));
  if (!wire && !shouting) return false;
  if (MAJOR_ISSUER.test(lead)) return false;
  return shouting || WIRE_MARK.test(lead);
}

export function suppressFromFeed(record) {
  if (!record || headlineLocked(record) || (record.importance || 0) >= NEWS_SOURCE_KEEP_IMPORTANCE) return false;
  return isCorporateFluff(record) || isSmallIssuerWire(record);
}

// Twice-daily cron is 08:00 and 20:00 UTC (3:00 AM and 3:00 PM ET while standard time is in effect).
export function nextNewsCheck(now = Date.now()) {
  const date = new Date(now);
  for (let day = 0; day < 3; day += 1) {
    for (const hour of [8, 20]) {
      const candidate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + day, hour, 0, 0, 0);
      if (candidate > now) return new Date(candidate).toISOString();
    }
  }
  return new Date(now + 12 * 3600000).toISOString();
}

function wordsOf(headline) {
  return String(headline || '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter(word => word.length > 3 && !STOP.has(word));
}

export function sameNewsEvent(a, b) {
  if (!a || !b) return false;
  if (a.sourceUrl && b.sourceUrl && a.sourceUrl === b.sourceUrl) return false;
  if (a.category && b.category && a.category !== b.category) return false;
  const left = Date.parse(a.sourcePublishedAt || '');
  const right = Date.parse(b.sourcePublishedAt || '');
  if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > 72 * 3600000) return false;
  const cves = text => [...String(text || '').toUpperCase().matchAll(/CVE-\d{4}-\d{4,7}/g)].map(match => match[0]);
  const leftCves = cves(`${a.headline} ${a.summary || ''}`);
  const rightCves = cves(`${b.headline} ${b.summary || ''}`);
  if (leftCves.some(id => rightCves.includes(id))) return true;
  const leftWords = wordsOf(a.headline);
  const rightWords = new Set(wordsOf(b.headline));
  const shared = leftWords.filter(word => rightWords.has(word));
  const sharedProduct = shared.some(word => PRODUCTS.test(word));
  const sharedAction = shared.some(word => ACTIONS.some(stem => word.startsWith(stem)));
  if (sharedProduct && sharedAction) return true;
  const union = new Set([...leftWords, ...rightWords]);
  return leftWords.length >= 4 && rightWords.size >= 4 && union.size > 0 && shared.length / union.size >= 0.55;
}

function coverageOf(item) {
  return { id: item.id, sourceName: item.sourceName, sourceUrl: item.sourceUrl };
}

function preferPrimary(group) {
  return group.slice().sort((a, b) => {
    const gap = (b.importance || 0) - (a.importance || 0);
    if (Math.abs(gap) >= 15) return gap;
    const type = item => (item.sourceType === 'independent-reporting' ? 2 : item.sourceType === 'official-publisher' ? 1 : 0);
    if (type(b) !== type(a) && Math.abs(gap) < 8) return type(b) - type(a);
    return Date.parse(b.sourcePublishedAt || 0) - Date.parse(a.sourcePublishedAt || 0);
  })[0];
}

export function clusterNewsItems(items) {
  const list = Array.isArray(items) ? items : [];
  const used = new Set();
  const clustered = [];
  for (let index = 0; index < list.length; index += 1) {
    if (used.has(index)) continue;
    const group = [list[index]];
    used.add(index);
    for (let other = index + 1; other < list.length; other += 1) {
      if (used.has(other)) continue;
      if (!sameNewsEvent(list[index], list[other])) continue;
      group.push(list[other]);
      used.add(other);
    }
    const primary = preferPrimary(group);
    const seen = new Set([primary.sourceUrl]);
    const also = [];
    for (const item of [...(primary.alsoCoveredBy || []), ...group.filter(item => item !== primary).map(coverageOf)]) {
      if (!item?.sourceUrl || seen.has(item.sourceUrl) || item.sourceUrl === primary.sourceUrl) continue;
      seen.add(item.sourceUrl);
      also.push({ sourceName: item.sourceName || '', sourceUrl: item.sourceUrl, ...(item.id ? { id: item.id } : {}) });
      if (also.length >= 4) break;
    }
    const newest = Math.max(...group.map(item => Date.parse(item.sourcePublishedAt || 0)));
    clustered.push({ ...primary, ...(also.length ? { alsoCoveredBy: also } : {}), clusterTime: Number.isFinite(newest) ? newest : Date.parse(primary.sourcePublishedAt || 0) });
  }
  clustered.sort((a, b) => (b.clusterTime || 0) - (a.clusterTime || 0));
  return clustered.map(item => {
    const { clusterTime, ...rest } = item;
    return rest;
  });
}

export function diversifyBySource(items, { windowSize = NEWS_FEED_WINDOW, cap = NEWS_FEED_SOURCE_CAP, keepImportance = NEWS_SOURCE_KEEP_IMPORTANCE } = {}) {
  let pending = [...(Array.isArray(items) ? items : [])];
  const out = [];
  while (pending.length) {
    const counts = new Map();
    const skipped = [];
    let placed = 0;
    for (const item of pending) {
      if (placed >= windowSize) { skipped.push(item); continue; }
      const key = item?.sourceName || item?.sourceId || '';
      const count = counts.get(key) || 0;
      if (key && count >= cap && (item.importance || 0) < keepImportance) { skipped.push(item); continue; }
      counts.set(key, count + 1);
      out.push(item);
      placed += 1;
    }
    if (!placed || skipped.length === pending.length) { out.push(...skipped); break; }
    pending = skipped;
  }
  return out;
}

export function pickFeatured(items, now = Date.now()) {
  const recent = (Array.isArray(items) ? items : []).filter(item => {
    const time = Date.parse(item?.sourcePublishedAt || '');
    return Number.isFinite(time) && now >= time && now - time <= 24 * 3600000;
  });
  const ranked = recent.filter(item => {
    if (item.sourceType === 'issuer-release' && (item.importance || 0) < 75) return false;
    if ((item.importance || 0) < 55 && /google/i.test(item.sourceName || '')) return false;
    return true;
  });
  ranked.sort((a, b) => (b.importance || 0) - (a.importance || 0) || Date.parse(b.sourcePublishedAt) - Date.parse(a.sourcePublishedAt));
  return ranked[0] || null;
}

export function sourceSlotOpen(publishedBySource, sourceId, importance, cap = NEWS_SOURCE_RUN_CAP) {
  const count = publishedBySource.get(sourceId) || 0;
  return count < cap || (importance || 0) >= NEWS_SOURCE_KEEP_IMPORTANCE;
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

function storyLink(origin, item) {
  return `${origin}${newsStoryPath(item)}`;
}

export function renderNewsFeed(items, { origin = 'https://digivated.com', format = 'rss', now = Date.now() } = {}) {
  const stories = (Array.isArray(items) ? items : []).filter(item => item?.id && item.headline).slice(0, 100);
  const updated = new Date(now).toISOString();
  const self = `${origin}/news/${format === 'atom' ? 'atom' : 'feed'}.xml`;
  if (format === 'atom') {
    const entries = stories.map(item => {
      const href = storyLink(origin, item);
      const when = Number.isFinite(Date.parse(item.sourcePublishedAt || '')) ? new Date(item.sourcePublishedAt).toISOString() : updated;
      return `<entry><title>${escapeXml(item.headline)}</title><link rel="alternate" href="${escapeXml(href)}"/><id>${escapeXml(href)}</id><updated>${when}</updated><summary>${escapeXml(item.summary || '')}</summary><author><name>${escapeXml(item.sourceName || 'Digivated News')}</name></author></entry>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Digivated News</title><subtitle>AI, tech, markets, and security.</subtitle><link rel="alternate" href="${origin}/news"/><link rel="self" href="${self}"/><id>${origin}/news</id><updated>${updated}</updated>${entries}</feed>\n`;
  }
  const rssItems = stories.map(item => {
    const href = storyLink(origin, item);
    const when = Number.isFinite(Date.parse(item.sourcePublishedAt || '')) ? new Date(item.sourcePublishedAt).toUTCString() : new Date(now).toUTCString();
    const source = item.sourceUrl ? `<source url="${escapeXml(item.sourceUrl)}">${escapeXml(item.sourceName || 'Source')}</source>` : '';
    return `<item><title>${escapeXml(item.headline)}</title><link>${escapeXml(href)}</link><guid isPermaLink="true">${escapeXml(href)}</guid><pubDate>${when}</pubDate><description>${escapeXml(item.summary || '')}</description>${source}</item>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Digivated News</title><link>${origin}/news</link><description>AI, tech, markets, and security.</description><atom:link href="${self}" rel="self" type="application/rss+xml"/><lastBuildDate>${new Date(now).toUTCString()}</lastBuildDate>${rssItems}</channel></rss>\n`;
}
