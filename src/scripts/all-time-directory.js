import { requestCardInteraction } from './card-actions.js';
import { observeProjectViews } from './project-views.js';
import { cardIconMarkup } from '../lib/card-icons.mjs';
import { projectFeedbackHref } from '../lib/project-links.mjs';
import { safeSearchHref } from '../lib/discovery-search.mjs';
import { categoryFromLink } from '../lib/project-taxonomy.mjs';
import { DIRECTORY_SORTS, sortKeys, filterProjects, sortProjects, sectionLabel, categoryCounts } from '../lib/directory-sort.mjs';
import { projectMarks } from '../lib/project-marks.mjs';

// /discover: the all-time index. Same rows as the homepage, plus search, sorts,
// category chips, and a project dialog. Visiting a product
// from here counts toward feedback points (visit-feedback.js).
const root = document.querySelector('[data-directory]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const PAGE = 24;
const DEFAULT_SORT = 'new';
const CACHE_KEY = 'digivated:home-board:v1'; // Shared with the homepage: same feed.
const CACHE_AGE = 60 * 60_000;
const number = new Intl.NumberFormat('en-US');

const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };

// Membership projects show the Digivated member mark (not a generic "featured").
const memberBadge = () => { const badge = el('span', null, 'dg-badge dg-badge-member'); badge.title = 'Digivated member'; badge.append(el('span', null, 'dg-member-mark'), 'Member'); return badge; };
const markBadge = key => {
  if (key === 'member') return memberBadge();
  const rising = key === 'rising';
  return el('span', rising ? '↗ Rising' : key === 'fresh' ? 'New this week' : 'Spot', rising ? 'dg-badge dg-badge-boost' : 'dg-badge');
};
const appendMarks = (title, project) => { for (const key of projectMarks(project)) title.append(markBadge(key)); };
const icon = name => { const t = document.createElement('template'); t.innerHTML = cardIconMarkup(name); return t.content.firstElementChild; };
const local = value => { const href = safeSearchHref(value); return href && href.startsWith('/') ? href : ''; };
const outbound = value => { try { const url = new URL(safeSearchHref(value)); if (!/^https?:$/.test(url.protocol)) return ''; if (!url.searchParams.has('ref')) url.searchParams.set('ref', 'digivated'); return url.href; } catch { return ''; } };
const pageOf = p => /^\/projects\/(?:listing\/)?[a-z0-9][a-z0-9-]*$/.test(p.pageUrl || '') ? p.pageUrl : '';
const liked = p => { if (p.liked !== undefined) return p.liked; try { return localStorage.getItem('digivated:liked:project:' + p.id) === '1'; } catch { return false; } };
const pad = n => String(n).padStart(2, '0');

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
function visitLink(p, className) {
  const href = outbound(p.url);
  if (!href) return null;
  const link = el('a', null, className);
  link.href = href; link.target = '_blank'; link.rel = 'noopener';
  link.dataset.visitProject = p.id; link.dataset.visitName = p.name;
  if (local(p.image)) link.dataset.visitImage = local(p.image);
  return link;
}

if (root) {
  const params = new URLSearchParams(location.search);
  const state = {
    projects: [], loaded: false, failed: false,
    query: '', category: categoryFromLink(params.get('category') || ''),
    sort: sortKeys.includes(params.get('sort')) ? params.get('sort') : DEFAULT_SORT,
    featured: params.get('view') === 'featured',
    limit: PAGE, selected: null,
  };
  const pending = new Set();
  const $ = selector => root.querySelector(selector);
  const list = $('[data-dir-list]'), status = $('[data-dir-status]'), more = $('[data-dir-more]'), shown = $('[data-dir-shown]');
  const chips = $('[data-dir-chips]'), sorts = $('[data-dir-sorts]'), search = $('[data-dir-search]');

  // ---------- URL state ----------
  function syncUrl() {
    const url = new URL(location.href);
    const set = (key, value) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    set('view', state.featured ? 'featured' : ''); set('category', state.category); set('sort', state.sort === DEFAULT_SORT ? '' : state.sort);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }

  // ---------- Controls ----------
  for (const [key, label] of DIRECTORY_SORTS) {
    const button = el('button', null, 'dg-dir-sort' + (key === 'needs' ? ' is-points' : ''));
    button.type = 'button'; button.dataset.sort = key;
    if (key === 'needs') button.append(el('span', '✦ ', 'dg-dir-spark'));
    button.append(label);
    if (key === 'needs') button.title = 'Projects with the least feedback. Visit one, leave a specific comment, earn points.';
    button.addEventListener('click', () => { state.sort = key; state.limit = PAGE; syncUrl(); render(); });
    sorts.append(button);
  }
  root.querySelectorAll('[data-dir-collection]').forEach(button => button.addEventListener('click', () => {
    state.featured = button.dataset.dirCollection === 'featured'; state.limit = PAGE; syncUrl(); render();
  }));
  let typing = 0;
  search.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { state.query = search.value; state.limit = PAGE; render(); }, 120); });
  search.addEventListener('keydown', event => { if (event.key === 'Escape' && search.value) { search.value = ''; state.query = ''; render(); } });
  more.addEventListener('click', () => {
    const next = list.querySelectorAll('.dg-row').length;
    state.limit += PAGE; render(false);
    list.querySelectorAll('.dg-row')[next]?.querySelector('.dg-dir-open')?.focus({ preventScroll: true });
  });
  $('[data-dir-surprise]')?.addEventListener('click', () => {
    const pool = filterProjects(state.projects, state);
    const pick = (pool.length ? pool : state.projects)[Math.floor(Math.random() * (pool.length || state.projects.length))];
    if (!pick) return;
    const page = pageOf(pick);
    if (page) location.href = page; else openProject(pick.id);
  });

  // ---------- Rows ----------
  function row(p, index, rank) {
    const li = el('li', null, 'dg-row dg-dir-row');
    li.dataset.project = ''; li.dataset.projectId = p.id; li.dataset.projectName = p.name; li.dataset.projectViewsTotal = String(Number(p.views) || 0);
    li.id = 'project-' + p.id;
    li.style.setProperty('--i', String(Math.min(index, 12)));
    const rankBox = el('span', rank ? pad(rank) : '', 'dg-dir-rank'); rankBox.setAttribute('aria-hidden', 'true');
    const art = el('span', null, 'dg-logo-link'); art.setAttribute('aria-hidden', 'true'); art.append(logo(p, 'dg-logo'));
    const main = el('div', null, 'dg-main');
    const title = el('h3');
    const page = pageOf(p);
    const open = el(page ? 'a' : 'button', p.name, 'dg-dir-open');
    if (page) open.href = page; else { open.type = 'button'; open.addEventListener('click', () => openProject(p.id, open)); }
    open.setAttribute('aria-label', `Open ${p.name}`);
    title.append(open);
    appendMarks(title, p);
    main.append(title, el('p', p.description || 'Explore this project and meet its maker.', 'dg-tagline'));
    const meta = el('p', null, 'dg-meta');
    meta.append(el('span', p.category || 'Project'));
    if (p.creator) meta.append(el('span', 'by ' + p.creator));
    main.append(meta);
    li.append(rankBox, art, main, actions(p));
    return li;
  }
  function actions(p) {
    const box = el('div', null, 'dg-actions');
    const visit = visitLink(p, 'dg-visit dg-dir-visit');
    if (visit) {
      visit.append(el('span', 'Visit'), el('span', '↗', 'dg-visit-arrow'), el('span', '✦', 'dg-dir-visit-pts'));
      visit.setAttribute('aria-label', `Visit ${p.name} (opens in a new tab). Leave specific feedback when you’re back to earn points.`);
      visit.title = 'Visit, then leave specific feedback to earn points';
      box.append(visit);
    }
    const comments = el('a', null, 'dg-comments'); comments.href = projectFeedbackHref(p.id, p.pageUrl);
    const count = Number(p.comments) || 0;
    comments.setAttribute('aria-label', `Discussion for ${p.name}, ${count} comment${count === 1 ? '' : 's'}`);
    comments.append(icon('comment'), el('span', String(count)));
    box.append(comments, vote(p));
    return box;
  }
  function vote(p) {
    // During a fresh week's first hours, this week's launches hide their counts.
    const hidden = !!p.fresh;
    const votes = Number(p.votes?.all) || 0;
    const button = el('button', null, 'dg-vote' + (hidden ? ' is-hidden-count' : ''));
    button.type = 'button'; button.dataset.voteId = p.id;
    button.setAttribute('aria-pressed', String(liked(p)));
    button.setAttribute('aria-label', hidden ? `${liked(p) ? 'Remove upvote for' : 'Upvote'} ${p.name}` : `${liked(p) ? 'Remove upvote for' : 'Upvote'} ${p.name}, ${votes} upvote${votes === 1 ? '' : 's'}`);
    if (pending.has(p.id)) button.setAttribute('aria-busy', 'true');
    button.append(el('span', '▲', 'dg-vote-caret'), el('strong', hidden ? '·' : String(votes)));
    button.addEventListener('click', () => toggleVote(p, button));
    return button;
  }
  async function toggleVote(p, button) {
    if (pending.has(p.id)) return;
    pending.add(p.id); button.setAttribute('aria-busy', 'true');
    let failure = '';
    try {
      const result = await requestCardInteraction('project', p.id, { action: liked(p) ? 'remove-upvote' : 'upvote', includePeriods: true });
      p.liked = result.liked;
      if (result.fresh) p.fresh = true; else if (result.votes) p.votes = result.votes;
      try { localStorage.setItem('digivated:liked:project:' + p.id, result.liked ? '1' : '0'); } catch { /* optional */ }
    } catch (error) { failure = error.message || 'Unable to save your upvote. Try again.'; }
    finally {
      pending.delete(p.id);
      const focused = document.activeElement === button;
      for (const node of document.querySelectorAll(`[data-vote-id="${CSS.escape(p.id)}"]`)) node.replaceWith(vote(p));
      const next = document.querySelector(`.dg-dir-row[data-project-id="${CSS.escape(p.id)}"] .dg-vote, .wall-focus [data-vote-id="${CSS.escape(p.id)}"]`);
      if (focused) next?.focus({ preventScroll: true });
      if (failure) say(failure);
      else if (p.liked && next && !reduced.matches) next.animate([{ transform: 'none' }, { transform: 'translateY(-4px) scale(1.06)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
    }
  }
  const live = $('[data-dir-live]');
  const say = text => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); };

  // ---------- Category chips ----------
  function renderChips() {
    const counts = categoryCounts(filterProjects(state.projects, { featured: state.featured }));
    if (state.category && !counts.some(([name]) => name === state.category)) counts.push([state.category, 0]);
    const chip = (name, count, label = name) => {
      const button = el('button', null, 'dg-dir-chip'); button.type = 'button';
      button.setAttribute('aria-pressed', String(state.category === name));
      button.append(el('span', label), el('small', String(count)));
      button.addEventListener('click', () => { state.category = state.category === name && name ? '' : name; state.limit = PAGE; syncUrl(); render(); button.focus({ preventScroll: true }); });
      return button;
    };
    const total = filterProjects(state.projects, { featured: state.featured }).length;
    chips.replaceChildren(chip('', total, 'All'), ...counts.map(([name, count]) => chip(name, count)));
  }

  // ---------- Render ----------
  function render(animate = true) {
    sorts.querySelectorAll('[data-sort]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sort === state.sort)));
    root.querySelectorAll('[data-dir-collection]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.dirCollection === 'featured') === state.featured)));
    root.dataset.sort = state.sort;
    renderChips();
    $('[data-dir-needs]').hidden = state.sort !== 'needs';
    if (!state.loaded) return;
    const items = sortProjects(filterProjects(state.projects, state), state.sort);
    const visible = items.slice(0, state.limit);
    const ranked = state.sort === 'top' && !state.query;
    const nodes = []; let last = null;
    visible.forEach((p, i) => {
      const label = sectionLabel(p, state.sort);
      if (label && label !== last) { const divider = el('li', null, 'dg-dir-divider'); divider.setAttribute('role', 'presentation'); divider.append(el('span', label)); nodes.push(divider); last = label; }
      nodes.push(row(p, i, ranked ? i + 1 : 0));
    });
    if (!items.length) {
      const empty = el('li', null, 'dg-row dg-row-empty');
      if (state.featured && !state.query && !state.category) empty.textContent = 'No featured projects yet.';
      else { empty.append('No projects match. '); const reset = el('button', 'Clear filters', 'dg-link-button'); reset.type = 'button'; reset.addEventListener('click', () => { state.query = ''; search.value = ''; state.category = ''; state.featured = false; syncUrl(); render(); }); empty.append(reset); }
      nodes.push(empty);
    }
    list.classList.toggle('is-entering', animate && !reduced.matches);
    list.replaceChildren(...nodes);
    shown.textContent = items.length ? `Showing ${number.format(visible.length)} of ${number.format(items.length)}` : '';
    more.hidden = items.length <= visible.length;
    more.textContent = `Show ${Math.min(PAGE, items.length - visible.length)} more`;
    status.hidden = true;
    observeProjectViews();
  }
  function renderStats() {
    const ps = state.projects;
    const set = (key, value) => root.querySelectorAll(`[data-dir-stat="${key}"]`).forEach(node => { node.textContent = number.format(value); });
    set('projects', ps.length);
    set('categories', new Set(ps.map(p => p.category).filter(Boolean)).size);
    set('upvotes', ps.reduce((sum, p) => sum + (Number(p.votes?.all) || 0), 0));
    set('comments', ps.reduce((sum, p) => sum + (Number(p.comments) || 0), 0));
  }

  // ---------- Dialog (projects without a page, and #project-<id> links) ----------
  let dialog = null, returnFocus = null, selectedList = [];
  function closeProject() {
    if (!dialog) return;
    dialog.remove(); dialog = null; state.selected = null;
    document.body.classList.remove('wall-modal-open');
    document.removeEventListener('keydown', dialogKeys);
    if (location.hash.startsWith('#project-')) history.replaceState(history.state, '', location.pathname + location.search);
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function dialogKeys(event) {
    if (!dialog || document.querySelector('.dg-review:not([hidden])')?.contains(event.target)) return;
    if (event.key === 'Escape') { event.preventDefault(); closeProject(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    else if (event.key === 'Tab') {
      const focusable = [...dialog.querySelector('.wall-focus-panel').querySelectorAll('button,a[href]')].filter(n => !n.disabled && n.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0], lastNode = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); lastNode.focus(); }
      else if (!event.shiftKey && document.activeElement === lastNode) { event.preventDefault(); first.focus(); }
    }
  }
  function step(direction) {
    const index = selectedList.findIndex(p => p.id === state.selected);
    const next = selectedList[index + direction];
    if (next) fillDialog(next);
  }
  function fillDialog(p) {
    state.selected = p.id;
    const index = selectedList.findIndex(item => item.id === p.id);
    const panel = dialog.querySelector('.wall-focus-panel');
    const controls = el('div', null, 'wall-focus-controls');
    const prev = el('button', null); prev.type = 'button'; prev.append(icon('arrow-left')); prev.setAttribute('aria-label', 'Previous project'); prev.disabled = index <= 0; prev.addEventListener('click', () => step(-1));
    const next = el('button', null); next.type = 'button'; next.append(icon('arrow')); next.setAttribute('aria-label', 'Next project'); next.disabled = index < 0 || index >= selectedList.length - 1; next.addEventListener('click', () => step(1));
    const close = el('button', null, 'wall-focus-close'); close.type = 'button'; close.append(icon('close')); close.setAttribute('aria-label', 'Close project'); close.addEventListener('click', closeProject);
    controls.append(prev, next, close);
    const heading = el('h2', p.name); heading.id = 'wall-focus-title';
    const art = el('div', null, 'wall-focus-art');
    const image = local(p.image);
    if (image) { const img = el('img'); img.src = image; img.alt = `${p.name} preview`; img.addEventListener('error', () => img.replaceWith(el('span', p.name.slice(0, 2).toUpperCase(), 'wall-art-monogram')), { once: true }); art.append(img); }
    else art.append(el('span', p.name.slice(0, 2).toUpperCase(), 'wall-art-monogram'));
    const links = el('div', null, 'wall-focus-actions');
    const visit = visitLink(p, ''); if (visit) { visit.textContent = 'Visit website ↗'; links.append(visit); }
    const page = pageOf(p); if (page) { const a = el('a', 'View project page ↗'); a.href = page; links.append(a); }
    const feedback = el('a', 'Leave feedback →'); feedback.href = projectFeedbackHref(p.id, p.pageUrl); links.append(feedback);
    const voteRow = el('div', null, 'dg-dir-dialog-vote'); voteRow.append(vote(p));
    panel.dataset.projectName = p.name;
    panel.replaceChildren(controls, el('p', p.category || 'Project', 'wall-focus-category'), heading, art, el('p', `BY ${p.creator || 'AN INDEPENDENT BUILDER'}`, 'wall-focus-maker'), el('p', p.description || 'Explore this project and meet its maker.', 'wall-focus-description'), voteRow, links, el('p', '✦ Visit it, come back, and leave specific feedback to earn points.', 'dg-dir-dialog-hint'));
    panel.scrollTo?.({ top: 0, behavior: 'instant' });
    close.focus({ preventScroll: true });
  }
  function openProject(id, from) {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;
    returnFocus = from || document.activeElement;
    const visible = sortProjects(filterProjects(state.projects, state), state.sort);
    selectedList = visible.some(p => p.id === id) ? visible : sortProjects(state.projects, state.sort);
    if (!dialog) {
      dialog = el('div', null, 'wall-focus dg-dir-dialog');
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'wall-focus-title');
      const backdrop = el('button', null, 'wall-focus-backdrop'); backdrop.type = 'button'; backdrop.setAttribute('aria-label', 'Close project'); backdrop.tabIndex = -1; backdrop.addEventListener('click', closeProject);
      const panel = el('div', null, 'wall-focus-panel'); panel.dataset.project = ''; panel.tabIndex = -1;
      dialog.append(backdrop, panel);
      document.body.append(dialog);
      document.body.classList.add('wall-modal-open');
      document.addEventListener('keydown', dialogKeys);
    }
    fillDialog(project);
  }
  function openFromHash() {
    let id = null;
    try { id = location.hash.startsWith('#project-') ? decodeURIComponent(location.hash.slice(9)) : null; } catch { return; }
    if (!id) { if (dialog) closeProject(); return; }
    if (state.projects.some(p => p.id === id)) { state.featured = false; state.query = ''; search.value = ''; render(); openProject(id); }
  }
  addEventListener('hashchange', openFromHash);

  // ---------- Data ----------
  function readCache() {
    try { const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return saved && Array.isArray(saved.projects) && saved.projects.length && Date.now() - saved.at < CACHE_AGE ? saved.projects : null; } catch { return null; }
  }
  function writeCache(projects) {
    try { const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {}; localStorage.setItem(CACHE_KEY, JSON.stringify({ ...saved, at: Date.now(), projects: projects.map(({ liked: _liked, ...p }) => p) })); } catch { /* optional */ }
  }
  async function loadAll() {
    const items = [], offsets = new Set(); let offset = 0, fair = null;
    do {
      if (offsets.has(offset)) break;
      offsets.add(offset);
      const response = await fetch('/api/projects?ranking=1&offset=' + offset, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error('unavailable');
      const page = await response.json();
      if (page.fairStart && !fair) fair = page.fairStart;
      items.push(...(page.items || []));
      offset = page.next ?? null;
    } while (offset != null);
    return { projects: [...new Map(items.filter(p => p?.id && p.name).map(p => [p.id, p])).values()], fair };
  }
  function accept(projects) {
    state.projects = projects; state.loaded = true;
    renderStats(); render(!root.dataset.painted); root.dataset.painted = 'true';
  }

  const feedbackTarget = params.get('feedback');
  render();
  const cached = readCache();
  if (cached && !feedbackTarget) accept(cached);
  loadAll().then(({ projects, fair }) => {
    if (feedbackTarget) { const target = projects.find(p => p.id === feedbackTarget); if (target) { location.replace(projectFeedbackHref(target.id, target.pageUrl)); return; } }
    accept(projects);
    if (projects.length) {
      writeCache(projects);
      if (fair) try { const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); localStorage.setItem(CACHE_KEY, JSON.stringify({ ...saved, fair: { active: !!fair.active, endsAt: Number(fair.endsAt) || 0 } })); } catch { /* optional */ }
    }
    if (!projects.length) { status.hidden = false; status.textContent = 'No projects yet. '; const a = el('a', 'Be the first →'); a.href = '/submit-project'; status.append(a); }
    openFromHash();
  }).catch(() => {
    if (state.loaded) return; // Keep showing the saved copy.
    list.replaceChildren();
    status.hidden = false; status.textContent = 'Projects are temporarily unavailable. ';
    const retry = el('a', 'Try again →'); retry.href = '/discover'; status.append(retry);
  });
  if (cached && !feedbackTarget) openFromHash();
}
