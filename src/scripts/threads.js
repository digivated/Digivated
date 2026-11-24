// Threads (Product Hunt-style forums): list, thread page and new-thread form.
import { forumBySlug, forums, starterById, starters, THREAD_TITLE_MAX } from '../data/forums.mjs';
import { discussPath, launchFromToday, starterPath, storyFromToday } from '../lib/threads-ui.mjs';
import { api, avatar, mountDiscussion, personName, session, signInPrompt, timeAgo } from './discussion.js';
import { cardIconMarkup } from '../lib/card-icons.mjs';

const page = document.querySelector('[data-threads-page]')?.dataset.threadsPage;
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const $ = selector => document.querySelector(selector);
const dot = () => { const node = el('span', '·', 'dg-dot'); node.setAttribute('aria-hidden', 'true'); return node; };
const validNewsId = id => /^[a-f0-9]{24}$/.test(id || '');

function topicLink(slug, className = 'dg-thread-forum') {
  const forum = forumBySlug[slug];
  if (!forum) return null;
  const link = el('a', null, className);
  link.href = `/threads?forum=${slug}`;
  link.dataset.topic = slug;
  const mark = el('span', null, 'dg-topic-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = cardIconMarkup(forum.icon);
  link.append(mark, el('span', forum.name));
  return link;
}

function paintCounts(counts = {}) {
  document.querySelectorAll('[data-forum-count]').forEach(node => {
    const count = Number(counts[node.dataset.forumCount]);
    node.textContent = Number.isInteger(count) && count > 0 ? String(count) : '';
  });
}

function voteButton(thread, big = false) {
  const button = el('button', null, 'dg-vote' + (big ? ' is-big' : '')); button.type = 'button';
  const update = () => {
    button.setAttribute('aria-pressed', String(Boolean(thread.voted)));
    button.setAttribute('aria-label', `${thread.voted ? 'Remove upvote from' : 'Upvote'} “${thread.title}”, ${thread.votes} upvote${thread.votes === 1 ? '' : 's'}`);
    button.replaceChildren(el('span', '▲', 'dg-vote-caret'), el('strong', String(thread.votes)));
  };
  update();
  button.addEventListener('click', async () => {
    if (!await session()) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
    button.setAttribute('aria-busy', 'true');
    try { const r = await api('/api/threads', { action: 'vote', id: thread.id }); thread.voted = r.voted; thread.votes = r.votes; update(); }
    catch (error) { button.title = error.message; }
    finally { button.removeAttribute('aria-busy'); }
  });
  return button;
}

const kindLabel = { ask: 'Ask DG', show: 'Show DG' };

function reactionRow(thread) {
  const row = $('[data-thread-react]');
  if (!row) return;
  const kinds = [['useful', 'Useful', 'sparkle'], ['learned', 'Learned', 'book'], ['shipped', 'Shipped', 'upload']];
  row.hidden = false;
  row.replaceChildren(...kinds.map(([kind, label, icon]) => {
    const button = el('button', null, 'dg-react');
    button.type = 'button';
    const paint = () => {
      const count = Number(thread.reactions?.[kind]) || 0;
      const mine = Boolean(thread.reacted?.[kind]);
      button.setAttribute('aria-pressed', String(mine));
      button.setAttribute('aria-label', `${mine ? 'Remove' : 'Add'} ${label}${count ? `, ${count}` : ''}`);
      const mark = el('span');
      mark.innerHTML = cardIconMarkup(icon);
      button.replaceChildren(mark, el('span', label), ...(count ? [el('strong', String(count))] : []));
    };
    paint();
    button.addEventListener('click', async () => {
      if (!await session()) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
      button.setAttribute('aria-busy', 'true');
      try {
        const result = await api('/api/threads', { action: 'react', id: thread.id, kind });
        thread.reactions = { ...thread.reactions, [kind]: result.count };
        thread.reacted = { ...thread.reacted, [kind]: result.reacted };
        paint();
      } catch (error) { button.title = error.message; }
      finally { button.removeAttribute('aria-busy'); }
    });
    return button;
  }));
}

/* ---------- List ---------- */
async function listPage() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view') === 'recent' ? 'recent' : 'list';
  const forum = forumBySlug[params.get('forum')] ? params.get('forum') : '';
  const query = (params.get('q') || '').slice(0, 80);
  let sort = ['trending', 'new', 'top'].includes(params.get('sort')) ? params.get('sort') : 'trending';
  let offset = 0;
  let requestVersion = 0;
  const list = $('[data-thread-list]'), status = $('[data-forum-status]'), more = $('[data-forum-more]'), empty = $('[data-forum-empty]');
  const active = view === 'recent' ? 'recent' : forum || (query ? '' : 'home');
  document.querySelectorAll('[data-forum-link]').forEach(link => { if (link.dataset.forumLink === active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  const search = $('#dg-forum-search'); if (search) search.value = query;
  const info = forum ? forumBySlug[forum] : null;
  $('[data-forum-title]').textContent = view === 'recent' ? 'Recent comments' : query ? `Search: “${query}”` : info ? info.name : 'Threads';
  const description = $('[data-forum-description]');
  description.textContent = view === 'recent' ? 'The latest replies on threads and product pages.' : info?.description || 'Talk shop with other builders. Share, ask, get feedback.';
  description.hidden = false;
  if (info) $('[data-forum-new]').href = `/threads/new?forum=${forum}`;
  document.title = `${view === 'recent' ? 'Recent comments' : info ? info.name : 'Threads'} · Digivated`;
  const today = $('[data-today]');
  if (today) today.hidden = true;

  if (view === 'recent') {
    $('[data-forum-toolbar]').hidden = true;
    try {
      const data = await api('/api/threads?view=recent');
      paintCounts(data.counts);
      const comments = data.comments || [];
      status.textContent = comments.length ? '' : 'No comments yet.'; status.hidden = !!comments.length;
      if (empty) empty.hidden = true;
      list.replaceChildren(...comments.map(c => {
        const li = el('li', null, 'dg-thread-row dg-recent-row');
        const meta = el('p', null, 'dg-thread-meta'); meta.append(avatar(c.author, 20), personName(c.author, 'span'), el('span', c.subject.type === 'project' ? 'on product' : 'in', 'dg-muted'));
        const subject = el('a', c.subject.title, 'dg-recent-subject'); subject.href = c.subject.href; meta.append(subject);
        const time = el('time', timeAgo(c.date)); time.dateTime = c.date; meta.append(time);
        const body = el('a', c.body, 'dg-recent-body'); body.href = c.subject.href;
        li.append(meta, body); return li;
      }));
    } catch (error) { status.textContent = error.message; }
    return;
  }

  const sortButtons = [...document.querySelectorAll('[data-sort]')];
  const syncSort = () => sortButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === sort)));
  syncSort();
  sortButtons.forEach(b => b.addEventListener('click', () => { if (sort === b.dataset.sort) return; sort = b.dataset.sort; const next = new URLSearchParams(location.search); next.set('sort', sort); history.replaceState(null, '', `?${next}`); syncSort(); offset = 0; load(false); }));

  function showStarters() {
    if (!empty) return;
    empty.hidden = false;
    empty.replaceChildren(el('p', 'Starter prompts', 'dg-starters-label'), el('p', 'Nothing is posted until you submit one.', 'dg-starters-note'));
    const choices = el('div', null, 'dg-starter-list');
    for (const starter of starters) {
      const link = el('a', null, 'dg-starter');
      link.href = starterPath(starter.id);
      link.append(el('span', starter.label), el('small', starter.detail));
      choices.append(link);
    }
    empty.append(choices);
  }

  function row(thread) {
    const li = el('li', null, 'dg-thread-row');
    const main = el('div', null, 'dg-thread-main');
    const h = el('h2');
    if (thread.pinned) h.append(el('span', 'Pinned', 'dg-badge'));
    const a = el('a', thread.title); a.href = `/threads/${thread.slug}`; h.append(a);
    if (kindLabel[thread.kind]) h.append(el('span', kindLabel[thread.kind], 'dg-thread-kind'));
    const foot = el('p', null, 'dg-thread-foot');
    foot.append(personName(thread.author, 'span'), dot());
    const comments = el('a', thread.comments === 1 ? '1 reply' : `${thread.comments} replies`);
    comments.href = `/threads/${thread.slug}#replies`;
    comments.setAttribute('aria-label', `${thread.comments} ${thread.comments === 1 ? 'reply' : 'replies'}`);
    const time = el('time', timeAgo(thread.createdAt)); time.dateTime = thread.createdAt; time.title = new Date(thread.createdAt).toLocaleString();
    foot.append(comments, dot(), time);
    const topic = topicLink(thread.forum);
    if (topic) foot.append(dot(), topic);
    main.append(h, el('p', thread.excerpt, 'dg-thread-excerpt'), foot);
    const side = el('div', null, 'dg-thread-side');
    side.append(voteButton(thread));
    li.append(main, side);
    return li;
  }
  function paintToday(hot) {
    if (!today || forum || query || offset) return;
    const bits = [];
    if (hot?.title && hot.slug && sort === 'trending') bits.push({ kicker: 'Hottest thread', title: hot.title, href: `/threads/${hot.slug}` });
    const render = items => {
      if (!items.length) { today.hidden = true; today.replaceChildren(); return; }
      const heading = el('h2', 'Today on Digivated');
      const ol = el('ol');
      for (const item of items) {
        const li = el('li');
        const link = el('a');
        link.href = item.href;
        link.append(el('span', item.kicker, 'dg-today-kicker'), el('span', item.title, 'dg-today-title'));
        li.append(link);
        ol.append(li);
      }
      today.hidden = false;
      today.replaceChildren(heading, ol);
    };
    render(bits);
    Promise.all([
      fetch('/api/news', { cache: 'no-store', signal: AbortSignal.timeout(12000) }).then(response => response.ok ? response.json() : null).catch(() => null),
      fetch('/api/launches?view=upcoming', { cache: 'no-store', signal: AbortSignal.timeout(12000) }).then(response => response.ok ? response.json() : null).catch(() => null),
    ]).then(([news, launches]) => {
      const story = storyFromToday(news?.items);
      const launch = launchFromToday(launches?.items);
      const next = [];
      if (story) next.push({ kicker: 'News', title: story.headline, href: `/news/${story.id}` });
      if (launch) next.push({ kicker: 'Launch', title: launch.name, href: '/#launching-next' });
      render([...next, ...bits]);
    }).catch(() => {});
  }
  async function load(append) {
    const version = ++requestVersion;
    more.hidden = true;
    if (!append) { status.hidden = false; status.textContent = 'Loading threads…'; if (empty) empty.hidden = true; list.replaceChildren(); }
    try {
      const qs = new URLSearchParams({ sort, offset: String(offset), ...(forum ? { forum } : {}), ...(query ? { q: query } : {}) });
      const data = await api(`/api/threads?${qs}`);
      if (version !== requestVersion) return;
      paintCounts(data.counts);
      $('[data-forum-total]').textContent = data.total ? `${data.total} ${data.total === 1 ? 'thread' : 'threads'}` : '';
      list.append(...data.threads.map(row));
      status.hidden = !!list.children.length;
      if (!list.children.length) {
        if (query) {
          status.hidden = false;
          status.textContent = 'No threads match that search.';
          if (empty) empty.hidden = true;
        } else {
          status.hidden = true;
          showStarters();
        }
      }
      if (!append) paintToday(data.threads[0]);
      offset = data.next ?? offset; more.hidden = data.next == null;
    } catch (error) {
      if (version !== requestVersion) return;
      status.hidden = false; status.textContent = error.message;
      if (append) more.hidden = false;
    }
  }
  more.addEventListener('click', () => load(true));
  load(false);
}

async function showLinkedStory(newsId) {
  const slot = $('[data-thread-news]');
  if (!slot || !validNewsId(newsId)) return;
  try {
    const response = await fetch(`/api/news?id=${newsId}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) return;
    const data = await response.json();
    const story = data.story;
    if (!story?.headline) return;
    const link = el('a', null, 'dg-thread-news-card');
    link.href = `/news/${story.id}`;
    link.append(el('span', 'From the news', 'dg-thread-news-kicker'), el('span', story.headline, 'dg-thread-news-title'));
    if (story.sourceName) link.append(el('span', story.sourceName, 'dg-thread-news-kicker'));
    slot.replaceChildren(link);
    slot.hidden = false;
  } catch { /* The thread still reads without the story card. */ }
}

/* ---------- Thread page ---------- */
async function threadPage() {
  const slug = location.pathname.replace(/\/+$/, '').split('/').pop();
  const status = $('[data-thread-status]');
  if (!/^[a-z0-9-]{1,100}$/.test(slug) || slug === 'thread') { status.textContent = 'This thread could not be found. '; const back = el('a', 'Back to Threads →'); back.href = '/threads'; status.append(back); return; }
  let thread;
  try { ({ thread } = await api(`/api/threads?slug=${encodeURIComponent(slug)}`)); }
  catch (error) { status.textContent = `${error.message} `; const back = el('a', 'Back to Threads →'); back.href = '/threads'; status.append(back); return; }
  document.title = `${thread.title} · Digivated Threads`;
  document.querySelector('link[rel=canonical]')?.setAttribute('href', `${location.origin}/threads/${thread.slug}`);
  document.querySelectorAll('[data-forum-link]').forEach(link => { if (link.dataset.forumLink === thread.forum) link.setAttribute('aria-current', 'page'); });
  const forumLink = topicLink(thread.forum);
  const forum = $('[data-thread-forum]');
  if (forumLink) { forum.replaceWith(forumLink); forumLink.dataset.threadForum = ''; }
  else { forum.textContent = thread.forumName; forum.href = `/threads?forum=${thread.forum}`; }
  const title = $('[data-thread-title]');
  title.textContent = thread.title;
  if (kindLabel[thread.kind]) title.prepend(el('span', kindLabel[thread.kind] + ' ', 'dg-thread-kind'));
  const line = el('p', null, 'dg-thread-meta dg-thread-byline');
  line.append(avatar(thread.author, 20), personName(thread.author, 'span'));
  const time = el('time', timeAgo(thread.createdAt)); time.dateTime = thread.createdAt; time.title = new Date(thread.createdAt).toLocaleString();
  line.append(time);
  $('[data-thread-byline]').replaceWith(line);
  const body = $('[data-thread-body]');
  body.replaceChildren(...thread.body.split(/\n{2,}/).map(paragraph => el('p', paragraph)));
  reactionRow(thread);
  showLinkedStory(thread.newsId);
  const actions = $('[data-thread-actions]');
  const share = el('button', 'Share', 'dg-btn'); share.type = 'button';
  share.addEventListener('click', async () => { const link = `${location.origin}/threads/${thread.slug}`; try { if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: thread.title, url: link }); else { await navigator.clipboard.writeText(link); share.textContent = 'Link copied'; setTimeout(() => { share.textContent = 'Share'; }, 1800); } } catch { /* cancelled */ } });
  const reply = el('a', 'Reply', 'dg-btn'); reply.href = '#replies';
  actions.append(voteButton(thread, true), reply, share);
  if (thread.mine) {
    const remove = el('button', 'Delete thread', 'dg-btn dg-d-danger'); remove.type = 'button';
    remove.addEventListener('click', async () => { if (!confirm('Delete this thread and its replies?')) return; remove.disabled = true; try { await api('/api/threads', { action: 'delete', id: thread.id }); location.href = '/threads'; } catch (error) { remove.disabled = false; status.hidden = false; status.textContent = error.message; } });
    actions.append(remove);
  }
  status.hidden = true; $('[data-thread-root]').hidden = false;
  const discussion = $('[data-thread-discussion]'); discussion.hidden = false; discussion.id = 'replies';
  mountDiscussion(discussion, {
    type: 'thread', id: thread.id,
    ...(thread.forum === 'feedback' && (thread.mine || thread.helpfulCommentId) ? { helpful: { commentId: thread.helpfulCommentId || '', canMark: Boolean(thread.mine), threadId: thread.id } } : {}),
  });
  api('/api/threads?view=counts').then(data => paintCounts(data.counts)).catch(() => {});
}

function applyHints(form) {
  const forum = forumBySlug[form.elements.forum.value] || forums[0];
  const kind = form.elements.kind.value;
  const picked = kind === 'ask' || kind === 'show' ? { titleHint: kind === 'ask' ? 'Ask DG: what do you want a take on?' : 'Show DG: what did you ship?', bodyHint: kind === 'ask' ? 'Say what you want DG and other builders to weigh in on.' : 'Share what you shipped and what people should try.' } : null;
  form.elements.title.placeholder = picked?.titleHint || forum.titleHint;
  form.elements.body.placeholder = picked?.bodyHint || forum.bodyHint;
}

/* ---------- New thread ---------- */
async function newPage() {
  const gate = $('[data-new-gate]'), form = $('[data-new-thread]'), status = $('[data-new-status]');
  const params = new URLSearchParams(location.search);
  const newsId = validNewsId(params.get('news')) ? params.get('news') : '';
  if (newsId && discussPath(newsId)) {
    try {
      const linked = await api(`/api/threads?news=${newsId}`);
      if (linked.thread?.slug) { location.replace(`/threads/${linked.thread.slug}`); return; }
    } catch { /* The composer can still start the discussion. */ }
  }
  const token = await session();
  if (!token) { gate.replaceChildren(signInPrompt('Sign in to start a thread. Anyone can read Threads without an account.')); return; }
  const starter = starterById(params.get('starter'));
  const preset = starter?.forum || params.get('forum');
  if (forumBySlug[preset]) form.querySelector(`input[name=forum][value="${preset}"]`).checked = true;
  if (starter) form.elements.title.value = starter.title;
  if (newsId) {
    form.elements.newsId.value = newsId;
    try {
      const response = await fetch(`/api/news?id=${newsId}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (response.ok) {
        const data = await response.json();
        const headline = String(data.story?.headline || '').replace(/\s+/g, ' ').trim().slice(0, THREAD_TITLE_MAX);
        if (headline.length >= 8 && !form.elements.title.value) form.elements.title.value = headline;
        if (!form.elements.body.value) form.elements.body.value = 'From the news story. What do you think?';
      }
    } catch { /* The author can still write the thread. */ }
  }
  try { const me = await api('/api/creator-profile'); if (!me.profile?.name) form.querySelector('[data-new-name]').hidden = false; } catch { form.querySelector('[data-new-name]').hidden = false; }
  gate.hidden = true; form.hidden = false;
  applyHints(form);
  form.querySelectorAll('[data-count-for]').forEach(counter => { const field = form.elements[counter.dataset.countFor]; const max = field.maxLength; const sync = () => { counter.textContent = `${field.value.length} / ${max}`; }; field.addEventListener('input', sync); sync(); });
  form.elements.forum.forEach?.(radio => radio.addEventListener('change', () => applyHints(form)));
  [...form.querySelectorAll('input[name=forum], input[name=kind]')].forEach(radio => radio.addEventListener('change', () => applyHints(form)));
  const focus = form.elements.title;
  focus.focus({ preventScroll: true });
  if (focus.value) focus.setSelectionRange(focus.value.length, focus.value.length);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]'); submit.disabled = true; submit.setAttribute('aria-busy', 'true'); status.textContent = 'Posting…';
    try {
      const nameField = form.querySelector('[data-new-name]');
      const kind = form.elements.kind.value;
      const { thread } = await api('/api/threads', { action: 'create', forum: form.elements.forum.value, title: form.elements.title.value, body: form.elements.body.value, company: form.elements.company.value, ...(kind === 'ask' || kind === 'show' ? { kind } : {}), ...(form.elements.newsId.value ? { newsId: form.elements.newsId.value } : {}), ...(!nameField.hidden ? { displayName: form.elements.displayName.value } : {}) });
      location.href = `/threads/${thread.slug}`;
    } catch (error) {
      if (error.data?.needsName) { form.querySelector('[data-new-name]').hidden = false; form.elements.displayName.focus(); }
      status.textContent = error.message; submit.disabled = false;
    } finally { submit.removeAttribute('aria-busy'); }
  });
  api('/api/threads?view=counts').then(data => paintCounts(data.counts)).catch(() => {});
}

const topics = $('.dg-forum-topics');
if (topics) {
  const narrow = matchMedia('(max-width: 760px)');
  const syncTopics = () => { topics.open = !narrow.matches; };
  syncTopics();
  narrow.addEventListener('change', syncTopics);
}

if (page === 'list') listPage();
else if (page === 'thread') threadPage();
else if (page === 'new') newPage();
