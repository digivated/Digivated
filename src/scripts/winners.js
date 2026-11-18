// /winners: every frozen weekly podium, newest first.
import { safeSearchHref } from '../lib/discovery-search.mjs';

const root = document.querySelector('[data-weeks]');
const status = document.querySelector('[data-winners-status]');
const more = document.querySelector('[data-winners-more]');
const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' };
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const local = value => { const href = safeSearchHref(value); return href && href.startsWith('/') && !href.startsWith('//') ? href : ''; };
const day = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function logo(p) {
  const wrap = el('span', null, 'dg-logo');
  wrap.append(el('span', (p.name || '?').slice(0, 2).toUpperCase(), 'dg-monogram'));
  const src = local(p.image);
  if (src) { const img = el('img'); img.src = src; img.alt = ''; img.width = 44; img.height = 44; img.loading = 'lazy'; img.addEventListener('error', () => img.remove(), { once: true }); wrap.append(img); }
  return wrap;
}

function week(data) {
  const li = el('li', null, 'dg-week');
  const head = el('h2', null, 'dg-week-head');
  head.append(el('span', `Week of ${day(data.start)}`), el('small', `${day(data.start)} – ${day(Date.parse(data.end) - 86_400_000)}`));
  const list = el('ol', null, 'dg-list-rows dg-podium');
  for (const place of data.podium) {
    const row = el('li', null, `dg-row dg-podium-row is-${MEDAL[place.rank]}`);
    const page = local(place.pageUrl) || '/discover';
    const art = el('a', null, 'dg-logo-link'); art.href = page; art.tabIndex = -1; art.setAttribute('aria-hidden', 'true'); art.append(logo(place));
    const main = el('div', null, 'dg-main');
    const title = el('h3'); const name = el('a', place.name); name.href = page;
    title.append(name, el('span', `★ #${place.rank} of the week`, `dg-badge dg-badge-medal is-${MEDAL[place.rank]}`));
    const meta = el('p', null, 'dg-meta');
    meta.append(el('span', place.category || 'Project'));
    if (place.creator) meta.append(el('span', 'by ' + place.creator));
    main.append(title, el('p', place.description || '', 'dg-tagline'), meta);
    const score = el('span', null, 'dg-podium-score');
    score.append(el('strong', String(place.score)), el('small', 'score'));
    score.setAttribute('aria-label', `Launch score ${place.score}, ${place.upvotes} upvote${place.upvotes === 1 ? '' : 's'}`);
    row.append(art, main, score);
    list.append(row);
  }
  li.append(head, list);
  return li;
}

let next = 0;
async function load() {
  more.hidden = true;
  try {
    const response = await fetch('/api/launches?view=winners&offset=' + next, { cache: 'no-store', credentials:'same-origin', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('unavailable');
    const data = await response.json();
    root.append(...(data.weeks || []).map(week));
    next = data.next;
    status.hidden = root.childElementCount > 0;
    if (!root.childElementCount) status.textContent = 'The first podium appears on Monday, when this week’s launches are final.';
    more.hidden = next == null;
  } catch {
    status.hidden = false;
    status.textContent = 'Winners are temporarily unavailable. Please try again shortly.';
  }
}
if (root) { more.addEventListener('click', load); load(); }
