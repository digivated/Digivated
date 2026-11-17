import { requestCardInteraction } from './card-actions.js';
import { observeProjectViews } from './project-views.js';
import { homeLaunchGroups } from '../lib/home-launches.mjs';
import { launchBounds, launchTimestamp } from '../lib/launch-calendar.mjs';
import { boostVotes } from '../lib/feedback-score.mjs';
import { safeSearchHref } from '../lib/discovery-search.mjs';

// Homepage launch board and spot strip. One catalogue request feeds both.
const board = document.querySelector('[data-board]');
const spots = document.querySelector('[data-spots]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const WEEK = 7 * 86_400_000;
const MIN_SPOTS = 8;

const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const local = value => { const href = safeSearchHref(value); return href && href.startsWith('/') ? href : ''; };
const outbound = value => { try { const url = new URL(safeSearchHref(value)); if (!/^https?:$/.test(url.protocol)) return ''; if (!url.searchParams.has('ref')) url.searchParams.set('ref', 'digivated'); return url.href; } catch { return ''; } };
const liked = p => { if (p.liked !== undefined) return p.liked; try { return localStorage.getItem('digivated:liked:project:' + p.id) === '1'; } catch { return false; } };
const shortDate = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function logo(p, className) {
  const wrap = el('span', null, className);
  wrap.append(el('span', (p.name || '?').slice(0, 2).toUpperCase(), 'dg-monogram'));
  const src = local(p.image);
  if (src) {
    const img = el('img'); img.src = src; img.alt = ''; img.width = 44; img.height = 44; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    img.addEventListener('load', () => wrap.classList.add('has-image'), { once: true });
    wrap.append(img);
  }
  return wrap;
}

function visitLink(p, label, className) {
  const href = outbound(p.url);
  if (!href) return null;
  const link = el('a', null, className);
  link.href = href; link.target = '_blank'; link.rel = 'noopener';
  link.dataset.visitProject = p.id; link.dataset.visitName = p.name;
  if (local(p.image)) link.dataset.visitImage = local(p.image);
  link.append(el('span', label), el('span', '↗', 'dg-visit-arrow'));
  link.setAttribute('aria-label', `Visit ${p.name} (opens in a new tab). You can leave feedback when you return.`);
  return link;
}

/* ---------- Spot strip ---------- */
function renderSpots(featured, sponsored, instant) {
  if (!spots) return;
  const track = spots.querySelector('[data-spots-track]');
  const viewport = spots.querySelector('[data-spots-viewport]');
  const seen = new Set();
  const filled = [...featured.map(p => ({ ...p, spot: 'Featured' })), ...sponsored.map(p => ({ ...p, spot: 'Spot' }))].filter(p => !seen.has(p.id) && seen.add(p.id));
  const open = Math.max(2, MIN_SPOTS - filled.length);
  const price = instant ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', trailingZeroDisplay: 'stripIfInteger' }).format(instant.price / 100) : '';
  const tile = (item, duplicate) => {
    const li = el('li', null, 'dg-spot' + (item ? '' : ' is-open'));
    let link;
    if (item) {
      link = visitLink(item, '', 'dg-spot-link') || Object.assign(el('a', null, 'dg-spot-link'), { href: local(item.pageUrl) || '/discover' });
      link.replaceChildren();
      if (!duplicate) li.dataset.projectId = item.id;
      const copy = el('span', null, 'dg-spot-copy');
      copy.append(el('strong', item.name), el('small', item.description || item.category || 'Independent project'));
      link.append(logo(item, 'dg-spot-logo'), copy, el('em', item.spot, 'dg-spot-tag'));
    } else {
      link = el('a', null, 'dg-spot-link');
      link.href = instant ? '/submit-project?spot=1#project-form' : '/submit-project#project-form';
      const copy = el('span', null, 'dg-spot-copy');
      copy.append(el('strong', 'Your product here'), el('small', instant ? `${price} · instant · 7 days` : 'Launch to claim a spot'));
      const plus = el('span', null, 'dg-spot-logo dg-spot-plus'); plus.append(el('span', '+'));
      link.append(plus, copy, el('em', instant ? 'Claim' : 'Launch', 'dg-spot-tag'));
      link.setAttribute('aria-label', instant ? `Claim an open homepage spot for ${price}` : 'Submit a project to claim a spot');
    }
    if (duplicate) { link.tabIndex = -1; li.setAttribute('aria-hidden', 'true'); }
    li.append(link);
    return li;
  };
  const items = [...filled, ...Array(open).fill(null)];
  // Interleave open spots so they are seen as the strip moves.
  const ordered = [];
  const people = items.filter(Boolean), blanks = items.filter(item => !item);
  const gap = Math.max(1, Math.floor(people.length / Math.max(1, blanks.length)));
  people.forEach((p, i) => { ordered.push(p); if ((i + 1) % gap === 0 && blanks.length) ordered.push(blanks.pop()); });
  ordered.push(...blanks);
  track.replaceChildren(...ordered.map(item => tile(item, false)));
  track.setAttribute('aria-busy', 'false');
  // Duplicate once for a seamless loop; the copy is hidden from assistive tech and focus order.
  track.append(...ordered.map(item => tile(item, true)));
  track.style.setProperty('--dg-spot-duration', `${Math.max(28, ordered.length * 5)}s`);
  spots.dataset.ready = 'true';
  const toggle = spots.querySelector('[data-spots-toggle]');
  const setPaused = paused => { spots.classList.toggle('is-paused', paused); toggle.setAttribute('aria-pressed', String(paused)); toggle.setAttribute('aria-label', paused ? 'Play moving spots' : 'Pause moving spots'); toggle.firstElementChild.textContent = paused ? '▶' : '❚❚'; };
  toggle.onclick = () => setPaused(!spots.classList.contains('is-paused'));
  viewport.addEventListener('focusin', () => spots.classList.add('is-holding'));
  viewport.addEventListener('focusout', event => { if (!viewport.contains(event.relatedTarget)) spots.classList.remove('is-holding'); });
  observeProjectViews();
}

/* ---------- Board ---------- */
const state = { projects: [], tab: 'current', limit: 10, animate: true };
const pendingVotes = new Set();

function groupsFor(projects) {
  const groups = homeLaunchGroups(projects);
  // This week: feedback points lift the reviewer's own launch (10 points = 1 vote).
  const score = p => (Number(p.votes?.weekly) || 0) + boostVotes(p.boost);
  groups.current = groups.current.map((p, i) => [p, i]).sort((a, b) => score(b[0]) - score(a[0]) || a[1] - b[1]).map(([p]) => p);
  return groups;
}

function row(p, index, period) {
  const li = el('li', null, 'dg-row');
  li.dataset.launchId = p.id;
  li.style.setProperty('--i', String(Math.min(index, 12)));
  if (index < 3) li.dataset.podium = String(index + 1);
  li.append(el('span', String(index + 1).padStart(2, '0'), 'dg-rank'));
  const page = local(p.pageUrl) || '/discover';
  const art = el('a', null, 'dg-logo-link'); art.href = page; art.tabIndex = -1; art.setAttribute('aria-hidden', 'true'); art.append(logo(p, 'dg-logo'));
  li.append(art);
  const main = el('div', null, 'dg-main');
  const title = el('h3'); const name = el('a', p.name); name.href = page; title.append(name);
  if (p.status === 'featured') title.append(el('span', 'Featured', 'dg-badge'));
  else if (p.sponsored) title.append(el('span', 'Spot', 'dg-badge'));
  const lift = period === 'weekly' ? boostVotes(p.boost) : 0;
  if (lift) { const b = el('span', `⚡ +${lift}`, 'dg-badge dg-badge-boost'); b.title = `Boosted by ${p.boost} feedback points this week`; title.append(b); }
  main.append(title, el('p', p.description || 'Explore this project and meet its maker.', 'dg-tagline'));
  const meta = el('p', null, 'dg-meta');
  meta.append(el('span', p.category || 'Project'));
  if (p.pricing) meta.append(el('span', p.pricing));
  if (p.creator) meta.append(el('span', 'by ' + p.creator));
  if (Number.isFinite(launchTimestamp(p)) && period !== 'weekly') meta.append(el('span', shortDate(launchTimestamp(p))));
  main.append(meta);
  li.append(main);
  const actions = el('div', null, 'dg-actions');
  const visit = visitLink(p, 'Visit', 'dg-visit');
  if (visit) actions.append(visit);
  const vote = el('button', null, 'dg-vote'); vote.type = 'button';
  const count = Number(p.votes?.[period]) || 0;
  vote.setAttribute('aria-pressed', String(liked(p)));
  vote.setAttribute('aria-label', `${liked(p) ? 'Remove upvote for' : 'Upvote'} ${p.name}, ${count} ${period === 'weekly' ? 'this week' : 'total'}`);
  if (pendingVotes.has(p.id)) vote.setAttribute('aria-busy', 'true');
  vote.append(el('span', '▲', 'dg-vote-caret'), el('strong', String(count)));
  vote.addEventListener('click', () => toggleVote(p, vote));
  actions.append(vote);
  li.append(actions);
  return li;
}

async function toggleVote(p, button) {
  if (pendingVotes.has(p.id)) return;
  pendingVotes.add(p.id); button.setAttribute('aria-busy', 'true');
  const status = board.querySelector('[data-board-summary]');
  try {
    const result = await requestCardInteraction('project', p.id, { action: liked(p) ? 'remove-upvote' : 'upvote', includePeriods: true });
    p.liked = result.liked; p.votes = result.votes;
    try { localStorage.setItem('digivated:liked:project:' + p.id, result.liked ? '1' : '0'); } catch { /* optional */ }
    if (result.liked && !reduced.matches) button.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-4px) scale(1.06)' }, { transform: 'translateY(0)' }], { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
  } catch (error) {
    status.textContent = error.message || 'Unable to save your upvote. Try again.';
  } finally {
    pendingVotes.delete(p.id);
    const focused = document.activeElement === button;
    state.animate = false; render();
    if (focused) board.querySelector(`[data-launch-id="${CSS.escape(p.id)}"] .dg-vote`)?.focus({ preventScroll: true });
  }
}

function render() {
  const groups = groupsFor(state.projects);
  const items = groups[state.tab] || [];
  const period = state.tab === 'current' ? 'weekly' : 'all';
  board.querySelectorAll('[data-board-tab]').forEach(tab => {
    const selected = tab.dataset.boardTab === state.tab;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    tab.querySelector('[data-tab-count]').textContent = String(groups[tab.dataset.boardTab]?.length || 0);
  });
  moveInk();
  const range = board.querySelector('[data-board-range]');
  if (state.tab === 'archive') range.textContent = 'All-time collection';
  else { const bounds = launchBounds(state.tab); range.textContent = `${shortDate(bounds.start)} – ${shortDate(bounds.end - 86_400_000)} · UTC`; }
  const summary = board.querySelector('[data-board-summary]');
  summary.textContent = items.length
    ? `${items.length} ${items.length === 1 ? 'launch' : 'launches'} · ranked by ${period === 'weekly' ? 'this week’s upvotes plus feedback boosts' : 'all-time upvotes'}`
    : state.tab === 'current' ? 'A fresh week starts here. Be the first to launch.' : 'No launches in this period yet.';
  const list = board.querySelector('[data-board-list]');
  list.setAttribute('aria-labelledby', `dg-tab-${state.tab}`);
  list.classList.toggle('is-entering', state.animate && !reduced.matches);
  list.replaceChildren(...items.slice(0, state.limit).map((p, i) => row(p, i, period)));
  if (!items.length && state.tab === 'current') {
    const empty = el('li', null, 'dg-row dg-row-empty');
    const cta = el('a', 'Launch the first project of the week →'); cta.href = '/submit-project';
    empty.append(cta); list.append(empty);
  }
  const more = board.querySelector('[data-board-more]');
  more.hidden = items.length <= state.limit;
  more.textContent = `Show ${Math.min(10, items.length - state.limit)} more`;
  state.animate = true;
}

function moveInk() {
  const tabs = board.querySelector('.dg-tabs'), active = board.querySelector('[data-board-tab][aria-selected=true]'), ink = board.querySelector('.dg-tab-ink');
  if (!tabs || !active || !ink) return;
  ink.style.transform = `translateX(${active.offsetLeft}px)`; ink.style.width = `${active.offsetWidth}px`;
}

function wireTabs() {
  const tabs = [...board.querySelectorAll('[data-board-tab]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { if (state.tab === tab.dataset.boardTab) return; state.tab = tab.dataset.boardTab; state.limit = 10; render(); });
    tab.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = tabs[(index + step + tabs.length) % tabs.length];
      next.focus(); next.click();
    });
  });
  board.querySelector('[data-board-more]').addEventListener('click', () => { state.limit += 10; state.animate = false; render(); });
  addEventListener('resize', moveInk, { passive: true });
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
  wireTabs(); pointsChip();
  const catalogue = loadCatalogue();
  catalogue.then(projects => { state.projects = projects; render(); }).catch(error => {
    const summary = board.querySelector('[data-board-summary]');
    summary.replaceChildren(error.message + ' ', Object.assign(el('a', 'Browse the directory →'), { href: '/discover' }));
    board.querySelector('[data-board-list]').replaceChildren();
  });
  if (spots) {
    Promise.all([loadFeatured(), catalogue.catch(() => []), loadInstant()]).then(([featured, projects, instant]) => {
      const now = Date.now();
      const sponsored = projects.filter(p => p.sponsored && p.status !== 'featured' && now - launchTimestamp(p) < WEEK).sort((a, b) => launchTimestamp(b) - launchTimestamp(a));
      renderSpots(featured, sponsored, instant);
    });
  }
}
