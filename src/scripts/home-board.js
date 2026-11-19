import { requestCardInteraction } from './card-actions.js';
import { observeProjectViews } from './project-views.js';
import { homeLaunchGroups } from '../lib/home-launches.mjs';
import { fairOrder, launchBounds, launchTimestamp } from '../lib/launch-calendar.mjs';
import { api, session } from './discussion.js';
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

// Membership projects show the Digivated member mark (not a generic "featured").
const memberBadge = () => { const badge = el('span', null, 'dg-badge dg-badge-member'); badge.title = 'Digivated member'; badge.append(el('span', null, 'dg-member-mark'), 'Member'); return badge; };
const memberTag = () => { const tag = el('em', null, 'dg-spot-tag dg-spot-member'); tag.append(el('span', null, 'dg-member-mark'), 'Member'); return tag; };
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
// Open spots sit on a faint field of ASCII characters that slowly flickers.
const FIELD_CHARS = '      ....::-+=*#';
const FIELD_COLS = 44, FIELD_ROWS = 16;
const fieldChar = () => FIELD_CHARS[Math.floor(Math.random() * FIELD_CHARS.length)];
function asciiField() {
  const field = el('span', null, 'dg-spot-field');
  field.setAttribute('aria-hidden', 'true');
  field.textContent = Array.from({ length: FIELD_ROWS }, () => Array.from({ length: FIELD_COLS }, fieldChar).join('')).join('\n');
  return field;
}
let fieldTimer = 0;
function animateFields() {
  if (fieldTimer || reduced.matches) return;
  fieldTimer = setInterval(() => {
    if (document.hidden) return;
    for (const field of document.querySelectorAll('.dg-spot-field')) {
      const chars = [...field.textContent];
      for (let i = 0; i < 18; i++) {
        const at = Math.floor(Math.random() * chars.length);
        if (chars[at] !== '\n') chars[at] = fieldChar();
      }
      field.textContent = chars.join('');
    }
  }, 650);
}

function spotCard(item, price) {
  const card = el('a', null, 'dg-spot' + (item ? '' : ' is-open'));
  if (!item) {
    // Open cards are paid spots only: they always lead to $3 Instant Publishing.
    card.href = '/submit-project?spot=1#project-form';
    card.append(asciiField(), el('span', '[ + ]', 'dg-spot-plus'), el('strong', 'Your product here'), el('small', 'Claim this spot now!'), el('em', '⚡ Instant', 'dg-spot-instant'));
    card.setAttribute('aria-label', `Claim this spot now: instant publishing${price ? ` for ${price}` : ''}, your project goes live right away for 7 days`);
    return card;
  }
  if (outbound(item.url)) visitAttrs(card, item); else card.href = local(item.pageUrl) || '/discover';
  card.dataset.projectId = item.id;
  const top = el('span', null, 'dg-spot-top');
  top.append(logo(item, 'dg-spot-logo'), el('strong', item.name, 'dg-decode'));
  card.append(top, el('span', item.description || item.category || 'Independent project', 'dg-spot-copy'), item.spot === 'Member' ? memberTag() : el('em', item.spot, 'dg-spot-tag'));
  card.setAttribute('aria-label', `${item.name}, ${item.spot.toLowerCase()} spot. Opens in a new tab.`);
  return card;
}

let spotsSignature = '';
function renderSpots(featured, sponsored, instant) {
  if (!home) return;
  const seen = new Set();
  // Every member project always appears, then paid spots from the last 7 days.
  const filled = [...featured.map(p => ({ ...p, spot: 'Member' })), ...sponsored.map(p => ({ ...p, spot: 'Paid spot' }))]
    .filter(p => !seen.has(p.id) && seen.add(p.id));
  const price = instant ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', trailingZeroDisplay: 'stripIfInteger' }).format(instant.price / 100) : '';
  // Cached spots are painted first; skip the rebuild when the fresh data matches.
  const signature = JSON.stringify([price, filled.map(p => [p.id, p.spot, p.name, p.description, p.category, p.image, p.url, p.pageUrl])]);
  if (signature === spotsSignature) return;
  const repaint = !!spotsSignature;
  spotsSignature = signature;
  // Rails: split evenly, each at least four cards and always ending with a paid open spot.
  const half = Math.ceil(filled.length / 2);
  const perRail = Math.max(SPOTS / 2, half + 1);
  const rails = [filled.slice(0, half), filled.slice(half)].map(items => [...items, ...Array(perRail - items.length).fill(null)]);
  home.querySelectorAll('[data-spot-rail]').forEach((rail, index) => rail.replaceChildren(...rails[index].map(item => spotCard(item, price))));
  // Grid (narrow screens): full rows of four (two on phones) with at least one paid open spot.
  const total = Math.ceil((filled.length + 1) / 4) * 4;
  home.querySelector('[data-spot-grid]')?.replaceChildren(...[...filled, ...Array(total - filled.length).fill(null)].map(item => spotCard(item, price)));
  home.dataset.ready = 'true';
  animateFields();
  observeProjectViews();
  decodeIn(home, !repaint);
}

/* ---------- ASCII decode: text resolves from glyph noise as it enters view ---------- */
const GLYPHS = '#%&*+=-:./\\|<>[]{}01';
function decode(node) {
  const final = node.textContent;
  if (!final || reduced.matches) return;
  node.setAttribute('aria-label', final);
  const start = performance.now(), duration = Math.min(700, 260 + final.length * 22);
  const tick = now => {
    const progress = Math.min(1, (now - start) / duration);
    const shown = Math.floor(progress * final.length);
    node.textContent = final.slice(0, shown) + [...final.slice(shown)].map(ch => ch === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('');
    if (progress < 1) requestAnimationFrame(tick); else { node.textContent = final; node.removeAttribute('aria-label'); }
  };
  requestAnimationFrame(tick);
}
const decoder = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(entry => { if (!entry.isIntersecting) return; decoder.unobserve(entry.target); decode(entry.target); }), { rootMargin: '-40px' }) : null;
// A background refresh rebuilds rows; those names appear as-is instead of decoding twice.
function decodeIn(root, animate = true) { if (!decoder || reduced.matches) return; root.querySelectorAll('.dg-decode:not([data-decoded])').forEach(node => { node.dataset.decoded = ''; if (animate) decoder.observe(node); }); }

/* ---------- Launch lists ---------- */
// This week: ranked by launch score (trust-weighted upvotes, comments from other
// members, feedback points). During fair start the order shuffles hourly and
// counts stay hidden. Last week: frozen final results with the podium.
const state = {
  projects: [], fair: { active: false, endsAt: 0 }, podium: null, upcoming: null,
  limits: { current: PAGE, upcoming: 5, previous: 5, archive: 5 }, animate: true,
};
const pendingVotes = new Set();
const pendingWatch = new Set();
const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' };
const localTime = value => new Date(value).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const launchDay = value => new Date(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const scoreOf = p => Number.isFinite(Number(p.score)) && p.score !== null ? Number(p.score) : (Number(p.votes?.weekly) || 0) + boostVotes(p.boost);

function groups() {
  const g = homeLaunchGroups(state.projects);
  const now = Date.now();
  if (state.fair.active) g.current = g.current.slice().sort((a, b) => fairOrder(a.id, now) - fairOrder(b.id, now));
  else g.current = g.current.map((p, i) => [p, i]).sort((a, b) => scoreOf(b[0]) - scoreOf(a[0]) || a[1] - b[1]).map(([p]) => p);
  const order = state.podium?.order || [];
  if (order.length) {
    const at = new Map(order.map((id, i) => [id, i]));
    g.previous = g.previous.map((p, i) => [p, i]).sort((a, b) => (at.get(a[0].id) ?? 1e6 + a[1]) - (at.get(b[0].id) ?? 1e6 + b[1])).map(([p]) => p);
  }
  g.upcoming = (state.upcoming?.items || []).slice().sort((a, b) => Date.parse(a.launchAt) - Date.parse(b.launchAt) || b.watchers - a.watchers || a.name.localeCompare(b.name));
  return g;
}

function placeOf(id) { return state.podium?.week?.podium?.find(place => place.id === id)?.rank || 0; }

function row(p, key, index) {
  const period = key === 'current' ? 'weekly' : 'all';
  const fresh = key === 'current' && (p.fresh || state.fair.active);
  const li = el('li', null, 'dg-row');
  li.dataset.launchId = p.id; li.dataset.project = ''; li.dataset.projectName = p.name;
  li.style.setProperty('--i', String(Math.min(index, 12)));
  const page = local(p.pageUrl) || '/discover';
  const art = el('a', null, 'dg-logo-link'); art.href = page; art.tabIndex = -1; art.setAttribute('aria-hidden', 'true'); art.append(logo(p, 'dg-logo'));
  const main = el('div', null, 'dg-main');
  const title = el('h3'); const name = el('a', p.name); name.href = page; title.append(name);
  const votes = Number(p.votes?.[period]) || 0;
  const place = key === 'previous' ? placeOf(p.id) : 0;
  if (place) { const medal = el('span', `★ #${place} of the week`, `dg-badge dg-badge-medal is-${MEDAL[place]}`); title.append(medal); }
  if (p.status === 'featured') title.append(memberBadge());
  else if (p.sponsored) title.append(el('span', 'Spot', 'dg-badge'));
  const lift = key === 'current' && !fresh ? boostVotes(p.boost) : 0;
  if (lift) { const b = el('span', '⚡ Boosted', 'dg-badge dg-badge-boost'); b.title = `+${lift} from ${p.boost} feedback points this week`; title.append(b); }
  main.append(title, el('p', p.description || 'Explore this project and meet its maker.', 'dg-tagline'));
  const meta = el('p', null, 'dg-meta');
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
  // Comments open the project's discussion, like Product Hunt.
  const comments = el('a', null, 'dg-comments'); comments.href = `${page}#feedback`;
  const count = Number(p.comments) || 0;
  comments.setAttribute('aria-label', `Discussion for ${p.name}, ${count} comment${count === 1 ? '' : 's'}`);
  comments.append(icon('comment'), el('span', String(count)));
  actions.append(comments);
  const vote = el('button', null, 'dg-vote' + (fresh ? ' is-hidden-count' : '')); vote.type = 'button';
  vote.setAttribute('aria-pressed', String(liked(p)));
  vote.setAttribute('aria-label', fresh
    ? `${liked(p) ? 'Remove upvote for' : 'Upvote'} ${p.name}. Counts are hidden until ${localTime(state.fair.endsAt)}`
    : `${liked(p) ? 'Remove upvote for' : 'Upvote'} ${p.name}, ${votes} upvote${votes === 1 ? '' : 's'}${period === 'weekly' ? ' this week' : ''}`);
  if (pendingVotes.has(p.id)) vote.setAttribute('aria-busy', 'true');
  vote.append(el('span', '▲', 'dg-vote-caret'), el('strong', fresh ? '·' : String(votes)));
  vote.addEventListener('click', () => toggleVote(p, vote, li));
  actions.append(vote);
  li.append(art, main, actions);
  return li;
}

// A scheduled free launch: no page or logo yet, and a "Notify me" button.
function upcomingRow(item, index) {
  const li = el('li', null, 'dg-row dg-row-upcoming');
  li.dataset.upcomingId = item.id;
  li.style.setProperty('--i', String(Math.min(index, 12)));
  const art = el('span', null, 'dg-logo-link'); art.setAttribute('aria-hidden', 'true'); art.append(logo({ name: item.name }, 'dg-logo'));
  const main = el('div', null, 'dg-main');
  const title = el('h3'); title.append(el('span', item.name, 'dg-upcoming-name'), el('span', launchDay(item.launchAt), 'dg-badge dg-badge-date'));
  main.append(title, el('p', item.description || 'Launching soon on Digivated.', 'dg-tagline'));
  const meta = el('p', null, 'dg-meta');
  meta.append(el('span', item.category || 'Project'));
  if (item.creator) meta.append(el('span', 'by ' + item.creator));
  main.append(meta);
  const actions = el('div', null, 'dg-actions');
  const watch = el('button', null, 'dg-watch'); watch.type = 'button';
  watch.setAttribute('aria-pressed', String(!!item.watching));
  watch.setAttribute('aria-label', item.watching ? `Stop notifications for ${item.name}` : `Notify me when ${item.name} launches`);
  if (pendingWatch.has(item.id)) watch.setAttribute('aria-busy', 'true');
  watch.append(el('span', item.watching ? '✓' : '◷', 'dg-watch-icon'), el('span', item.watching ? 'Notifying' : 'Notify me'), el('small', String(item.watchers || 0)));
  watch.addEventListener('click', () => toggleWatch(item, watch));
  actions.append(watch);
  li.append(art, main, actions);
  return li;
}

async function toggleWatch(item, button) {
  if (pendingWatch.has(item.id)) return;
  const section = button.closest('[data-board-section]');
  const token = await session();
  if (!token) { location.href = '/login?mode=signup&next=' + encodeURIComponent('/#launching-next'); return; }
  pendingWatch.add(item.id); button.setAttribute('aria-busy', 'true');
  let failure = '';
  try {
    const result = await api('/api/launches', { action: item.watching ? 'unwatch' : 'watch', id: item.id });
    item.watching = result.watching; item.watchers = result.watchers;
  } catch (error) { failure = error.message || 'Could not update this. Try again.'; }
  finally {
    pendingWatch.delete(item.id);
    const focused = document.activeElement === button;
    state.animate = false; render();
    const note = section.querySelector('[data-section-note]');
    if (failure) note.textContent = failure;
    else if (item.watching) note.textContent = `We’ll notify you when ${item.name} goes live.`;
    if (focused) section.querySelector(`[data-upcoming-id="${CSS.escape(item.id)}"] .dg-watch`)?.focus({ preventScroll: true });
  }
}

async function toggleVote(p, button, li) {
  if (pendingVotes.has(p.id)) return;
  pendingVotes.add(p.id); button.setAttribute('aria-busy', 'true');
  const section = li.closest('[data-board-section]');
  let failure = '';
  try {
    const result = await requestCardInteraction('project', p.id, { action: liked(p) ? 'remove-upvote' : 'upvote', includePeriods: true });
    // A background refresh may have replaced this row's data while the vote was saving.
    const targets = new Set([p, state.projects.find(item => item.id === p.id)].filter(Boolean));
    for (const target of targets) {
      target.liked = result.liked;
      if (result.fresh) target.fresh = true;
      else if (result.votes) {
        // Keep this week's launch score in step without waiting for a reload.
        if (Number.isFinite(Number(target.score))) target.score = Math.max(0, Number(target.score) + (Number(result.votes.weekly) || 0) - (Number(target.votes?.weekly) || 0));
        target.votes = result.votes;
      }
    }
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

function sectionNote(key, items) {
  const howLink = () => Object.assign(el('a', 'How ranking works', 'dg-note-link'), { href: '/winners#how-ranking-works' });
  if (key === 'archive') return ['Sorted by all-time upvotes.'];
  if (key === 'upcoming') return [`Scheduled free launches · tap Notify me to hear when they go live.`];
  const bounds = launchBounds(key);
  const dates = `${shortDate(bounds.start)} – ${shortDate(bounds.end - 86_400_000)}`;
  if (key === 'current') return state.fair.active
    ? [`${dates} · fresh week: order shuffles every hour and upvotes show ${localTime(state.fair.endsAt)} · `, howLink()]
    : [`${dates} · ranked by launch score · `, howLink()];
  return state.podium?.order?.length ? [`${dates} · final results · `, Object.assign(el('a', 'Winners', 'dg-note-link'), { href: '/winners' })] : [`${dates} · sorted by upvotes`];
}

function renderRising() {
  const box = board.querySelector('[data-rising]');
  if (!box) return;
  const items = state.projects.filter(p => Number(p.rising) > 0 && !p.fresh && local(p.pageUrl)).sort((a, b) => b.rising - a.rising || launchTimestamp(b) - launchTimestamp(a)).slice(0, 4);
  box.hidden = items.length < 2;
  if (box.hidden) return;
  const top = Math.max(...items.map(p => Number(p.rising) || 0)) || 1;
  box.querySelector('[data-rising-list]').replaceChildren(...items.map((p, i) => {
    const li = el('li'); const a = el('a', null, 'dg-rising-item'); a.href = local(p.pageUrl);
    const filled = Math.max(1, Math.round((Number(p.rising) / top) * 6));
    const meter = el('span', '▮'.repeat(filled) + '▯'.repeat(6 - filled), 'dg-rising-meter'); meter.setAttribute('aria-hidden', 'true');
    const rank = el('span', `#${i + 1}`, 'dg-rising-rank'); rank.setAttribute('aria-hidden', 'true');
    const text = el('span', null, 'dg-rising-text'); text.append(el('strong', p.name, 'dg-decode'), el('small', p.category || 'Project'));
    a.append(rank, logo(p, 'dg-rising-logo'), text, meter);
    a.setAttribute('aria-label', `${p.name}, number ${i + 1} rising in the last 24 hours`);
    li.append(a); return li;
  }));
  decodeIn(box, state.animate);
}

function render() {
  const g = groups();
  renderRising();
  for (const section of board.querySelectorAll('[data-board-section]')) {
    const key = section.dataset.boardSection, items = g[key] || [], limit = state.limits[key];
    if (key === 'upcoming') { section.hidden = !items.length; if (!items.length) continue; }
    const count = section.querySelector('[data-section-count]');
    const note = section.querySelector('[data-section-note]');
    count.textContent = key === 'archive' ? `${items.length} ${items.length === 1 ? 'project' : 'projects'}` : key === 'upcoming' ? `${items.length} scheduled` : `${items.length} ${items.length === 1 ? 'launch' : 'launches'}`;
    note.replaceChildren(...sectionNote(key, items));
    const list = section.querySelector('[data-section-list]');
    list.classList.toggle('is-entering', state.animate && !reduced.matches);
    list.replaceChildren(...items.slice(0, limit).map((p, i) => key === 'upcoming' ? upcomingRow(p, i) : row(p, key, i)));
    if (!items.length) {
      const empty = el('li', null, 'dg-row dg-row-empty');
      if (key === 'current') { const cta = el('a', 'Be the first launch this week →'); cta.href = '/submit-project'; empty.append(cta); }
      else empty.textContent = 'No launches here yet.';
      list.append(empty);
    }
    const more = section.querySelector('[data-section-more]');
    more.hidden = items.length <= limit;
    more.onclick = () => { state.limits[key] += PAGE; state.animate = false; render(); };
    more.textContent = `View ${Math.min(PAGE, items.length - limit)} more`;
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
    if (page.fairStart && offsets.size === 1) state.fair = { active: !!page.fairStart.active, endsAt: Number(page.fairStart.endsAt) || 0 };
    items.push(...(page.items || []));
    offset = page.next;
  } while (offset != null);
  return [...new Map(items.filter(p => p?.id && p.name).map(p => [p.id, p])).values()];
}
async function loadLaunches(view) {
  try {
    const token = view === 'upcoming' ? await session() : '';
    const response = await fetch('/api/launches?view=' + view, { cache: 'no-store', credentials:'same-origin', headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
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
  const show = total => { if (!Number.isFinite(total)) return; chip.querySelector('[data-points-total]').textContent = String(total); chip.querySelector('[data-points-label]')?.setAttribute('hidden', ''); chip.querySelector('[data-points-have]')?.removeAttribute('hidden'); chip.hidden = false; };
  document.addEventListener('digivated:points', event => show(event.detail?.total));
  document.addEventListener('digivated:points-awarded', event => {
    show(event.detail?.total);
    if (!reduced.matches) chip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
  });
}

async function railThreads() {
  const box = document.querySelector('[data-rail-threads]');
  if (!box) return;
  try {
    const response = await fetch('/api/threads?sort=trending', { cache: 'no-store', credentials:'same-origin', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return;
    const { threads = [] } = await response.json();
    if (!threads.length) return;
    box.querySelector('[data-rail-thread-list]').replaceChildren(...threads.slice(0, 4).map(thread => {
      const li = el('li'); const a = el('a', thread.title, 'dg-decode'); a.href = `/threads/${thread.slug}`;
      li.append(a, el('small', `▲ ${thread.votes} · ${thread.comments} ${thread.comments === 1 ? 'reply' : 'replies'}`));
      return li;
    }));
    box.hidden = false;
    decodeIn(box);
  } catch { /* The box stays hidden. */ }
}

// The last good feed is kept on this device so a return visit paints at once;
// fresh data replaces it quietly a moment later.
const CACHE_KEY = 'digivated:home-board:v1';
const CACHE_AGE = 60 * 60_000;
function readCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.projects) || !saved.projects.length || !(Date.now() - saved.at < CACHE_AGE)) return null;
    return saved;
  } catch { return null; }
}
function writeCache(patch) {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {};
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...saved, ...patch }));
  } catch { /* Storage is optional. */ }
}
const featuredFrom = projects => projects.filter(p => p.status === 'featured').sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
const sponsoredFrom = projects => { const now = Date.now(); return projects.filter(p => p.sponsored && p.status !== 'featured' && now - launchTimestamp(p) < WEEK).sort((a, b) => launchTimestamp(b) - launchTimestamp(a)); };

if (board) {
  pointsChip();
  railThreads();
  board.querySelectorAll('.dg-list-head h2 .dg-list-title').forEach(node => node.classList.add('dg-decode'));
  decodeIn(board);
  const cached = readCache();
  if (cached) {
    state.projects = cached.projects;
    state.fair = cached.fair || state.fair;
    if (cached.podium?.order) state.podium = cached.podium;
    render();
    if (home) renderSpots(featuredFrom(cached.projects), sponsoredFrom(cached.projects), cached.instant || null);
  }
  const catalogue = loadCatalogue();
  // Last week's final results and the podium arrive separately; lists re-render when they do.
  loadLaunches('podium').then(data => { if (!data?.order) return; state.podium = data; writeCache({ podium: data }); if (state.projects.length) { state.animate = false; render(); } });
  loadLaunches('upcoming').then(data => { if (!data?.items) return; state.upcoming = data; if (state.projects.length) { state.animate = false; render(); } });
  catalogue.then(projects => {
    state.projects = projects;
    if (cached) state.animate = false;
    render();
    writeCache({ at: Date.now(), projects: projects.map(({ liked, ...p }) => p), fair: state.fair });
  }).catch(error => {
    if (cached) return; // Keep showing the saved launches.
    board.querySelectorAll('[data-board-section]').forEach(section => {
      section.querySelector('[data-section-list]').replaceChildren();
      section.querySelector('[data-section-note]').replaceChildren(error.message + ' ', Object.assign(el('a', 'Browse the directory →'), { href: '/discover' }));
    });
  });
  if (home) {
    // The catalogue already carries every featured project (same records and view
    // counts as the old separate featured request), so spots come from it.
    Promise.all([catalogue.then(projects => ({ projects, ok: true }), () => ({ projects: cached?.projects || [], ok: false })), loadInstant()]).then(([{ projects, ok }, instant]) => {
      const featured = featuredFrom(projects);
      const status = home.querySelector('[data-featured-status]');
      if (status) {
        status.hidden = !!featured.length || ok;
        if (!status.hidden) status.textContent = 'Featured projects are temporarily unavailable. Browse the directory instead.';
      }
      if (instant) writeCache({ instant });
      renderSpots(featured, sponsoredFrom(projects), instant || cached?.instant || null);
    });
  }
}
