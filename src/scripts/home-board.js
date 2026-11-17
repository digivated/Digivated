import { requestCardInteraction } from './card-actions.js';
import { observeProjectViews } from './project-views.js';
import { homeLaunchGroups } from '../lib/home-launches.mjs';
import { launchBounds, launchTimestamp } from '../lib/launch-calendar.mjs';
import { boostVotes } from '../lib/feedback-score.mjs';
import { safeSearchHref } from '../lib/discovery-search.mjs';
import { cardIconMarkup } from '../lib/card-icons.mjs';

// Homepage: spot cards (side rails on wide screens, a grid elsewhere) and three
// stacked launch lists. One catalogue request feeds everything.
const board = document.querySelector('[data-board]');
const home = document.querySelector('[data-spots]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const WEEK = 7 * 86_400_000;
const SPOTS = 8;
const PAGE = 10;

const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const icon = name => { const t = document.createElement('template'); t.innerHTML = cardIconMarkup(name); return t.content.firstElementChild; };
const local = value => { const href = safeSearchHref(value); return href && href.startsWith('/') ? href : ''; };
const outbound = value => { try { const url = new URL(safeSearchHref(value)); if (!/^https?:$/.test(url.protocol)) return ''; if (!url.searchParams.has('ref')) url.searchParams.set('ref', 'digivated'); return url.href; } catch { return ''; } };
const liked = p => { if (p.liked !== undefined) return p.liked; try { return localStorage.getItem('digivated:liked:project:' + p.id) === '1'; } catch { return false; } };
const shortDate = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const number = new Intl.NumberFormat('en-US');

function logo(p, className) {
  const wrap = el('span', null, className);
  wrap.append(el('span', (p.name || '?').slice(0, 2).toUpperCase(), 'dg-monogram'));
  const src = local(p.image);
  if (src) {
    const img = el('img'); img.src = src; img.alt = ''; img.width = 44; img.height = 44; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    wrap.append(img);
  }
  return wrap;
}

function visitAttrs(link, p) {
  link.href = outbound(p.url); link.target = '_blank'; link.rel = 'noopener';
  link.dataset.visitProject = p.id; link.dataset.visitName = p.name;
  if (local(p.image)) link.dataset.visitImage = local(p.image);
  return link;
}

/* ---------- Spots ---------- */
function spotCard(item, price) {
  const card = el('a', null, 'dg-spot' + (item ? '' : ' is-open'));
  if (!item) {
    card.href = price ? '/submit-project?spot=1#project-form' : '/submit-project#project-form';
    card.append(el('span', '+', 'dg-spot-plus'), el('strong', 'Your product here'), el('small', price ? `Claim this spot · ${price}` : 'Launch to claim a spot'));
    card.setAttribute('aria-label', price ? `Claim an open homepage spot for ${price}, live for 7 days` : 'Submit a project to claim a spot');
    return card;
  }
  if (outbound(item.url)) visitAttrs(card, item); else card.href = local(item.pageUrl) || '/discover';
  card.dataset.projectId = item.id;
  const top = el('span', null, 'dg-spot-top');
  top.append(logo(item, 'dg-spot-logo'), el('strong', item.name), el('em', item.spot, 'dg-spot-tag'));
  card.append(top, el('span', item.description || item.category || 'Independent project', 'dg-spot-copy'));
  card.setAttribute('aria-label', `${item.name}, ${item.spot.toLowerCase()} spot. Opens in a new tab.`);
  return card;
}

function renderSpots(featured, sponsored, instant) {
  if (!home) return;
  const seen = new Set();
  const filled = [...featured.map(p => ({ ...p, spot: 'Featured' })), ...sponsored.map(p => ({ ...p, spot: 'Spot' }))]
    .filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, SPOTS - 2);
  const price = instant ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', trailingZeroDisplay: 'stripIfInteger' }).format(instant.price / 100) : '';
  const half = Math.ceil(filled.length / 2);
  const rails = [[...filled.slice(0, half)], [...filled.slice(half)]];
  // Fill both rails to four cards, ending with open spots.
  for (const rail of rails) while (rail.length < SPOTS / 2) rail.push(null);
  home.querySelectorAll('[data-spot-rail]').forEach((rail, index) => rail.replaceChildren(...rails[index].map(item => spotCard(item, price))));
  const grid = home.querySelector('[data-spot-grid]');
  // Grid: always full rows of four (two on phones), with at least one open spot.
  const total = Math.ceil((filled.length + 1) / 4) * 4;
  grid?.replaceChildren(...[...filled, ...Array(total - filled.length).fill(null)].map(item => spotCard(item, price)));
  home.dataset.ready = 'true';
  observeProjectViews();
}

/* ---------- Launch lists ---------- */
const state = { projects: [], limits: { current: PAGE, previous: PAGE, archive: PAGE }, animate: true };
const pendingVotes = new Set();

function groups() {
  const g = homeLaunchGroups(state.projects);
  // This week: feedback points lift the reviewer's own launch (10 points = 1 upvote).
  const score = p => (Number(p.votes?.weekly) || 0) + boostVotes(p.boost);
  g.current = g.current.map((p, i) => [p, i]).sort((a, b) => score(b[0]) - score(a[0]) || a[1] - b[1]).map(([p]) => p);
  return g;
}

function row(p, key, index) {
  const period = key === 'current' ? 'weekly' : 'all';
  const li = el('li', null, 'dg-row');
  li.dataset.launchId = p.id; li.dataset.project = ''; li.dataset.projectName = p.name;
  li.style.setProperty('--i', String(Math.min(index, 12)));
  const page = local(p.pageUrl) || '/discover';
  const art = el('a', null, 'dg-logo-link'); art.href = page; art.tabIndex = -1; art.setAttribute('aria-hidden', 'true'); art.append(logo(p, 'dg-logo'));
  const main = el('div', null, 'dg-main');
  const title = el('h3'); const name = el('a', p.name); name.href = page; title.append(name);
  const votes = Number(p.votes?.[period]) || 0;
  if (key === 'previous' && index === 0 && votes > 0) title.append(el('span', '★ Top launch', 'dg-badge dg-badge-top'));
  if (p.status === 'featured') title.append(el('span', 'Featured', 'dg-badge'));
  else if (p.sponsored) title.append(el('span', 'Spot', 'dg-badge'));
  const lift = period === 'weekly' ? boostVotes(p.boost) : 0;
  if (lift) { const b = el('span', '⚡ Boosted', 'dg-badge dg-badge-boost'); b.title = `+${lift} from ${p.boost} feedback points this week`; title.append(b); }
  main.append(title, el('p', p.description || 'Explore this project and meet its maker.', 'dg-tagline'));
  const meta = el('p', null, 'dg-meta');
  if (p.pricing) meta.append(el('span', p.pricing));
  meta.append(el('span', p.category || 'Project'));
  if (p.creator) meta.append(el('span', 'by ' + p.creator));
  if (key === 'archive' && Number.isFinite(launchTimestamp(p))) meta.append(el('span', shortDate(launchTimestamp(p))));
  main.append(meta);
  const actions = el('div', null, 'dg-actions');
  if (outbound(p.url)) {
    const visit = visitAttrs(el('a', null, 'dg-visit'), p);
    visit.append(el('span', 'Visit'), el('span', '↗', 'dg-visit-arrow'));
    visit.setAttribute('aria-label', `Visit ${p.name} (opens in a new tab)`);
    actions.append(visit);
  }
  const comments = el('button', null, 'dg-comments'); comments.type = 'button';
  comments.dataset.commentType = 'project'; comments.dataset.commentId = p.id;
  const count = Number(p.comments) || 0;
  comments.setAttribute('aria-label', `Feedback for ${p.name}, ${count} comment${count === 1 ? '' : 's'}`);
  comments.append(icon('comment'), el('span', String(count), 'card-feedback-count'));
  actions.append(comments);
  const vote = el('button', null, 'dg-vote'); vote.type = 'button';
  vote.setAttribute('aria-pressed', String(liked(p)));
  vote.setAttribute('aria-label', `${liked(p) ? 'Remove upvote for' : 'Upvote'} ${p.name}, ${votes} upvote${votes === 1 ? '' : 's'}${period === 'weekly' ? ' this week' : ''}`);
  if (pendingVotes.has(p.id)) vote.setAttribute('aria-busy', 'true');
  vote.append(el('span', '▲', 'dg-vote-caret'), el('strong', String(votes)));
  vote.addEventListener('click', () => toggleVote(p, vote, li));
  actions.append(vote);
  li.append(art, main, actions);
  return li;
}

async function toggleVote(p, button, li) {
  if (pendingVotes.has(p.id)) return;
  pendingVotes.add(p.id); button.setAttribute('aria-busy', 'true');
  const section = li.closest('[data-board-section]');
  let failure = '';
  try {
    const result = await requestCardInteraction('project', p.id, { action: liked(p) ? 'remove-upvote' : 'upvote', includePeriods: true });
    p.liked = result.liked; p.votes = result.votes;
    try { localStorage.setItem('digivated:liked:project:' + p.id, result.liked ? '1' : '0'); } catch { /* optional */ }
  } catch (error) {
    failure = error.message || 'Unable to save your upvote. Try again.';
  } finally {
    pendingVotes.delete(p.id);
    const focused = document.activeElement === button;
    state.animate = false; render();
    if (failure) section.querySelector('[data-section-note]').textContent = failure;
    const next = section.querySelector(`[data-launch-id="${CSS.escape(p.id)}"] .dg-vote`);
    if (focused) next?.focus({ preventScroll: true });
    if (!failure && p.liked && next && !reduced.matches) next.animate([{ transform: 'none' }, { transform: 'translateY(-4px) scale(1.06)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
  }
}

function render() {
  const g = groups();
  for (const section of board.querySelectorAll('[data-board-section]')) {
    const key = section.dataset.boardSection, items = g[key] || [], limit = state.limits[key];
    const count = section.querySelector('[data-section-count]');
    const note = section.querySelector('[data-section-note]');
    if (key === 'archive') { count.textContent = `${items.length} ${items.length === 1 ? 'project' : 'projects'}`; note.textContent = 'Sorted by all-time upvotes.'; }
    else {
      const bounds = launchBounds(key);
      count.textContent = `${items.length} ${items.length === 1 ? 'launch' : 'launches'}`;
      note.textContent = `${shortDate(bounds.start)} – ${shortDate(bounds.end - 86_400_000)} · sorted by ${key === 'current' ? 'upvotes this week' : 'upvotes'}`;
    }
    const list = section.querySelector('[data-section-list]');
    list.classList.toggle('is-entering', state.animate && !reduced.matches);
    list.replaceChildren(...items.slice(0, limit).map((p, i) => row(p, key, i)));
    if (!items.length) {
      const empty = el('li', null, 'dg-row dg-row-empty');
      if (key === 'current') { const cta = el('a', 'Be the first launch this week →'); cta.href = '/submit-project'; empty.append(cta); }
      else empty.textContent = 'No launches here yet.';
      list.append(empty);
    }
    const more = section.querySelector('[data-section-more]');
    more.hidden = items.length <= limit;
    more.onclick = () => { state.limits[key] += PAGE; state.animate = false; render(); };
  }
  const upvotes = state.projects.reduce((sum, p) => sum + (Number(p.votes?.all) || 0), 0);
  document.querySelectorAll('[data-stat-upvotes]').forEach(node => { node.textContent = number.format(upvotes); });
  document.querySelectorAll('[data-stat-products]').forEach(node => { node.textContent = number.format(state.projects.length); });
  state.animate = true;
}

async function loadCatalogue() {
  const items = [], offsets = new Set(); let offset = 0;
  do {
    if (offsets.has(offset)) throw Error('Could not load the launch feed. Please refresh.');
    offsets.add(offset);
    const response = await fetch('/api/projects?ranking=1&offset=' + offset, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error('Launches are temporarily unavailable. Please try again.');
    const page = await response.json();
    items.push(...(page.items || []));
    offset = page.next;
  } while (offset != null);
  return [...new Map(items.filter(p => p?.id && p.name).map(p => [p.id, p])).values()];
}
async function loadFeatured() {
  try {
    const response = await fetch('/api/projects?view=featured&offset=0', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const page = await response.json();
    return (page.items || []).filter(p => p?.id && p.name && p.status === 'featured').sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
  } catch { return []; }
}
async function loadInstant() {
  try {
    const response = await fetch('/api/submissions?action=launch-options', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    return response.ok ? (await response.json()).instant || null : null;
  } catch { return null; }
}

function pointsChip() {
  const chip = board?.querySelector('[data-points-chip]');
  if (!chip) return;
  const show = total => { if (!Number.isFinite(total)) return; chip.querySelector('[data-points-total]').textContent = String(total); chip.hidden = false; };
  document.addEventListener('digivated:points', event => show(event.detail?.total));
  document.addEventListener('digivated:points-awarded', event => {
    show(event.detail?.total);
    if (!reduced.matches) chip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
  });
}

if (board) {
  pointsChip();
  const catalogue = loadCatalogue();
  catalogue.then(projects => { state.projects = projects; render(); }).catch(error => {
    board.querySelectorAll('[data-board-section]').forEach(section => {
      section.querySelector('[data-section-list]').replaceChildren();
      section.querySelector('[data-section-note]').replaceChildren(error.message + ' ', Object.assign(el('a', 'Browse the directory →'), { href: '/discover' }));
    });
  });
  if (home) {
    Promise.all([loadFeatured(), catalogue.catch(() => []), loadInstant()]).then(([featured, projects, instant]) => {
      const now = Date.now();
      const sponsored = projects.filter(p => p.sponsored && p.status !== 'featured' && now - launchTimestamp(p) < WEEK).sort((a, b) => launchTimestamp(b) - launchTimestamp(a));
      renderSpots(featured, sponsored, instant);
    });
  }
}
