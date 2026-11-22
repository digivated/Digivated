// Threads (Product Hunt-style forums): list, thread page and new-thread form.
import { forumBySlug } from '../data/forums.mjs';
import { api, avatar, mountDiscussion, personName, session, signInPrompt, timeAgo } from './discussion.js';
import { cardIconMarkup } from '../lib/card-icons.mjs';

const page = document.querySelector('[data-threads-page]')?.dataset.threadsPage;
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const $ = selector => document.querySelector(selector);

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

function byline(thread, withForum = true) {
  const p = el('p', null, 'dg-thread-meta');
  p.append(avatar(thread.author, 20), personName(thread.author, 'span'));
  const time = el('time', timeAgo(thread.createdAt)); time.dateTime = thread.createdAt; time.title = new Date(thread.createdAt).toLocaleString(); p.append(time);
  if (withForum && forumBySlug[thread.forum]) { const forum = el('a', forumBySlug[thread.forum].name, 'dg-thread-forum'); forum.href = `/threads?forum=${thread.forum}`; p.append(forum); }
  return p;
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
  const list = $('[data-thread-list]'), status = $('[data-forum-status]'), more = $('[data-forum-more]');
  const active = view === 'recent' ? 'recent' : forum || (query ? '' : 'home');
  document.querySelectorAll('[data-forum-link]').forEach(link => { if (link.dataset.forumLink === active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  const search = $('#dg-forum-search'); if (search) search.value = query;
  const info = forum ? forumBySlug[forum] : null;
  $('[data-forum-title]').textContent = view === 'recent' ? 'Recent comments' : query ? `Search: “${query}”` : info ? info.name : 'Threads';
  const description = $('[data-forum-description]');
  description.textContent = info?.description || '';
  description.hidden = !description.textContent;
  if (info) $('[data-forum-new]').href = `/threads/new?forum=${forum}`;
  document.title = `${view === 'recent' ? 'Recent comments' : info ? info.name : 'Threads'} · Digivated`;

  if (view === 'recent') {
    $('[data-forum-toolbar]').hidden = true;
    try {
      const { comments } = await api('/api/threads?view=recent');
      status.textContent = comments.length ? '' : 'No comments yet.'; status.hidden = !!comments.length;
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

  function row(thread) {
    const li = el('li', null, 'dg-thread-row');
    const main = el('div', null, 'dg-thread-main');
    main.append(byline(thread, !forum));
    const h = el('h2'); const a = el('a', thread.title); a.href = `/threads/${thread.slug}`; h.append(a);
    if (thread.pinned) h.prepend(el('span', 'Pinned', 'dg-badge'));
    main.append(h, el('p', thread.excerpt, 'dg-thread-excerpt'));
    const side = el('div', null, 'dg-thread-side');
    const comments = el('a', null, 'dg-comments'); comments.href = `/threads/${thread.slug}#replies`;
    comments.setAttribute('aria-label', `${thread.comments} ${thread.comments === 1 ? 'reply' : 'replies'}`);
    const glyph = document.createElement('template'); glyph.innerHTML = cardIconMarkup('comment');
    comments.append(glyph.content.firstElementChild, el('span', String(thread.comments)));
    side.append(comments, voteButton(thread));
    li.append(main, side);
    return li;
  }
  async function load(append) {
    const version = ++requestVersion;
    more.hidden = true;
    if (!append) { status.hidden = false; status.textContent = 'Loading threads…'; list.replaceChildren(); }
    try {
      const qs = new URLSearchParams({ sort, offset: String(offset), ...(forum ? { forum } : {}), ...(query ? { q: query } : {}) });
      const data = await api(`/api/threads?${qs}`);
      if (version !== requestVersion) return;
      $('[data-forum-total]').textContent = data.total ? `${data.total} ${data.total === 1 ? 'thread' : 'threads'}` : '';
      list.append(...data.threads.map(row));
      status.hidden = !!list.children.length;
      if (!list.children.length) {
        status.replaceChildren(query ? 'No threads match that search. ' : 'No threads here yet. ');
        const start = el('a', 'Start the first one →'); start.href = forum ? `/threads/new?forum=${forum}` : '/threads/new'; status.append(start);
      }
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
  const forum = $('[data-thread-forum]'); forum.textContent = thread.forumName; forum.href = `/threads?forum=${thread.forum}`;
  $('[data-thread-title]').textContent = thread.title;
  const line = byline(thread, false); line.classList.add('dg-thread-byline'); line.dataset.threadByline = ''; $('[data-thread-byline]').replaceWith(line);
  const body = $('[data-thread-body]');
  body.replaceChildren(...thread.body.split(/\n{2,}/).map(paragraph => el('p', paragraph)));
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
  mountDiscussion(discussion, { type: 'thread', id: thread.id });
}

/* ---------- New thread ---------- */
async function newPage() {
  const gate = $('[data-new-gate]'), form = $('[data-new-thread]'), status = $('[data-new-status]');
  const token = await session();
  if (!token) { gate.replaceChildren(signInPrompt('Sign in to start a thread. Anyone can read Threads without an account.')); return; }
  const preset = new URLSearchParams(location.search).get('forum');
  if (forumBySlug[preset]) form.querySelector(`input[name=forum][value="${preset}"]`).checked = true;
  try { const me = await api('/api/creator-profile'); if (!me.profile?.name) form.querySelector('[data-new-name]').hidden = false; } catch { form.querySelector('[data-new-name]').hidden = false; }
  gate.hidden = true; form.hidden = false;
  form.querySelectorAll('[data-count-for]').forEach(counter => { const field = form.elements[counter.dataset.countFor]; const max = field.maxLength; const sync = () => { counter.textContent = `${field.value.length} / ${max}`; }; field.addEventListener('input', sync); sync(); });
  form.elements.title.focus({ preventScroll: true });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]'); submit.disabled = true; submit.setAttribute('aria-busy', 'true'); status.textContent = 'Posting…';
    try {
      const nameField = form.querySelector('[data-new-name]');
      const { thread } = await api('/api/threads', { action: 'create', forum: form.elements.forum.value, title: form.elements.title.value, body: form.elements.body.value, company: form.elements.company.value, ...(!nameField.hidden ? { displayName: form.elements.displayName.value } : {}) });
      location.href = `/threads/${thread.slug}`;
    } catch (error) {
      if (error.data?.needsName) { form.querySelector('[data-new-name]').hidden = false; form.elements.displayName.focus(); }
      status.textContent = error.message; submit.disabled = false;
    } finally { submit.removeAttribute('aria-busy'); }
  });
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
