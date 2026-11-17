// Product discussion threads (Product Hunt style): comments, one level of replies,
// comment upvotes, a Maker badge, Top/New sorting. Used inline on project pages
// and in a side drawer everywhere else.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const ago = date => {
  const s = Math.max(0, (Date.now() - Date.parse(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const initials = name => (String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();

async function token() {
  try { const { accountSession } = await import('./account-session.js'); const s = await accountSession(); return s.state === 'signed-in' ? s.session.access_token : ''; } catch { return ''; }
}
async function api(id, body) {
  const auth = body?.action === 'post' ? await token() : '';
  const response = await fetch(body ? '/api/project-threads' : `/api/project-threads?id=${encodeURIComponent(id)}`, {
    method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
    headers: body ? { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } : {},
    ...(body ? { body: JSON.stringify({ id, ...body }) } : {}), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Try again in a moment.');
  return data;
}

function composer({ placeholder, submitLabel, onSubmit, compact = false, autofocus = false, onCancel }) {
  const form = el('form', null, 'dg-th-composer' + (compact ? ' is-compact' : ''));
  const area = el('textarea'); area.name = 'body'; area.rows = compact ? 2 : 3; area.maxLength = 800; area.placeholder = placeholder; area.required = true;
  area.setAttribute('aria-label', placeholder);
  const row = el('div', null, 'dg-th-composer-row');
  const name = el('input'); name.name = 'name'; name.maxLength = 40; name.placeholder = 'Your name (optional)'; name.setAttribute('aria-label', 'Your name (optional)');
  const trap = el('input'); trap.name = 'company'; trap.tabIndex = -1; trap.autocomplete = 'off'; trap.className = 'sr-only'; trap.setAttribute('aria-hidden', 'true');
  const actions = el('div', null, 'dg-th-composer-actions');
  if (onCancel) { const cancel = el('button', 'Cancel', 'dg-th-text'); cancel.type = 'button'; cancel.addEventListener('click', onCancel); actions.append(cancel); }
  const send = el('button', submitLabel, 'dg-btn dg-btn-primary'); send.type = 'submit'; send.disabled = true;
  actions.append(send);
  row.append(name, actions);
  const status = el('p', null, 'dg-th-status'); status.setAttribute('role', 'status');
  form.append(area, row, trap, status);
  area.addEventListener('input', () => { send.disabled = area.value.trim().length < 2; });
  area.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !send.disabled) form.requestSubmit(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (trap.value) return;
    send.disabled = true; send.setAttribute('aria-busy', 'true'); status.textContent = '';
    try { await onSubmit({ body: area.value, name: name.value }); area.value = ''; }
    catch (error) { status.textContent = error.message; send.disabled = false; }
    finally { send.removeAttribute('aria-busy'); }
  });
  if (autofocus) queueMicrotask(() => area.focus({ preventScroll: true }));
  return form;
}

export function mountThread(root, { projectId, onCount } = {}) {
  let comments = [], sort = 'top', openReply = null;
  root.classList.add('dg-thread');
  root.replaceChildren();
  const head = el('div', null, 'dg-th-head');
  const title = el('h2', null, 'dg-th-title'); title.append(el('span', 'Discussion'), el('span', '', 'dg-th-count'));
  const tabs = el('div', null, 'dg-th-sort'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Sort comments');
  const sortButtons = [['top', 'Top'], ['new', 'Newest']].map(([key, label]) => { const b = el('button', label); b.type = 'button'; b.dataset.sort = key; b.addEventListener('click', () => { sort = key; render(); }); tabs.append(b); return b; });
  head.append(title, tabs);
  const main = composer({ placeholder: 'What do you think? Ask a question or share feedback…', submitLabel: 'Comment', onSubmit: async input => {
    const { comment } = await api(projectId, { action: 'post', ...input });
    comments.unshift(comment); sort = 'new'; render(comment.id);
  } });
  const status = el('p', 'Loading discussion…', 'dg-th-empty'); status.setAttribute('role', 'status');
  const list = el('ol', null, 'dg-th-list');
  root.append(head, main, status, list);

  const score = c => c.likes * 3 + comments.filter(r => r.parentId === c.id).length * 2;
  function item(c, isReply, flash) {
    const li = el('li', null, 'dg-th-item' + (isReply ? ' is-reply' : '') + (flash === c.id ? ' is-new' : ''));
    li.id = 'comment-' + c.id;
    const avatar = el('span', initials(c.name), 'dg-th-avatar'); avatar.setAttribute('aria-hidden', 'true');
    const body = el('div', null, 'dg-th-body');
    const meta = el('p', null, 'dg-th-meta');
    meta.append(el('strong', c.name));
    if (c.maker) meta.append(el('span', 'Maker', 'dg-th-maker'));
    const time = el('time', ago(c.date)); time.dateTime = c.date; time.title = new Date(c.date).toLocaleString(); meta.append(time);
    const text = el('p', null, 'dg-th-text-body');
    if (isReply && c.replyTo) text.append(el('span', '@' + c.replyTo + ' ', 'dg-th-mention'));
    text.append(c.body);
    const actions = el('div', null, 'dg-th-actions');
    const like = el('button', null, 'dg-th-like'); like.type = 'button';
    like.setAttribute('aria-pressed', String(Boolean(c.liked)));
    like.setAttribute('aria-label', `${c.liked ? 'Remove upvote from' : 'Upvote'} ${c.name}’s comment, ${c.likes} upvote${c.likes === 1 ? '' : 's'}`);
    like.append(el('span', '▲', 'dg-th-caret'), el('span', String(c.likes)));
    like.addEventListener('click', async () => {
      like.disabled = true;
      try { const r = await api(projectId, { action: 'like', commentId: c.id }); c.liked = r.liked; c.likes = r.likes; render(); root.querySelector(`#comment-${CSS.escape(c.id)} .dg-th-like`)?.focus({ preventScroll: true }); }
      catch (error) { status.textContent = error.message; like.disabled = false; }
    });
    const reply = el('button', 'Reply', 'dg-th-text'); reply.type = 'button';
    reply.addEventListener('click', () => { openReply = openReply === c.id ? null : c.id; render(); });
    actions.append(like, reply);
    body.append(meta, text, actions);
    if (openReply === c.id) {
      body.append(composer({ placeholder: `Reply to ${c.name}…`, submitLabel: 'Reply', compact: true, autofocus: true, onCancel: () => { openReply = null; render(); }, onSubmit: async input => {
        const { comment } = await api(projectId, { action: 'post', parentId: c.id, ...input });
        comments.push(comment); openReply = null; render(comment.id);
      } }));
    }
    li.append(avatar, body);
    return li;
  }
  function render(flash) {
    sortButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === sort)));
    const roots = comments.filter(c => !c.parentId);
    roots.sort(sort === 'top' ? (a, b) => score(b) - score(a) || Date.parse(b.date) - Date.parse(a.date) : (a, b) => Date.parse(b.date) - Date.parse(a.date));
    title.querySelector('.dg-th-count').textContent = comments.length ? String(comments.length) : '';
    status.textContent = comments.length ? '' : 'No comments yet. Start the discussion.';
    status.hidden = !!comments.length;
    list.replaceChildren(...roots.map(c => {
      const node = item(c, false, flash);
      const replies = comments.filter(r => r.parentId === c.id).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      if (replies.length) { const ul = el('ol', null, 'dg-th-replies'); ul.append(...replies.map(r => item(r, true, flash))); node.querySelector('.dg-th-body').append(ul); }
      return node;
    }));
    if (flash && !reduced.matches) root.querySelector(`#comment-${CSS.escape(flash)}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onCount?.(comments.length);
  }
  api(projectId).then(data => { comments = data.comments || []; render(); }).catch(error => { status.textContent = error.message || 'The discussion is temporarily unavailable.'; });
  return { reload: () => api(projectId).then(data => { comments = data.comments || []; render(); }) };
}

/* ---------- Drawer ---------- */
let drawer, drawerBody, drawerTitle, drawerLink, returnFocus;
function ensureDrawer() {
  if (drawer) return;
  drawer = el('dialog', null, 'dg-th-drawer');
  drawer.setAttribute('aria-labelledby', 'dg-th-drawer-title');
  const head = el('header', null, 'dg-th-drawer-head');
  const titles = el('div');
  drawerTitle = el('h2'); drawerTitle.id = 'dg-th-drawer-title';
  titles.append(drawerTitle);
  drawerLink = el('a', 'Open project page →', 'dg-quiet-link');
  const close = el('button', '×', 'dg-th-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close discussion');
  close.addEventListener('click', () => drawer.close());
  head.append(titles, close);
  drawerBody = el('div', null, 'dg-th-drawer-body');
  drawer.append(head, drawerLink, drawerBody);
  drawer.addEventListener('click', event => { if (event.target === drawer) drawer.close(); });
  drawer.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  document.body.append(drawer);
}
export function openThreadDrawer(projectId, { name = 'this project', pageUrl = '', trigger } = {}) {
  ensureDrawer();
  returnFocus = trigger || document.activeElement;
  drawerTitle.textContent = name;
  drawerLink.hidden = !pageUrl; if (pageUrl) drawerLink.href = pageUrl + '#feedback';
  const host = el('div'); drawerBody.replaceChildren(host);
  mountThread(host, { projectId, onCount: count => document.dispatchEvent(new CustomEvent('digivated:thread-count', { detail: { id: projectId, count } })) });
  drawer.showModal();
  drawer.querySelector('textarea')?.focus({ preventScroll: true });
}
