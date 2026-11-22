// Product Hunt-style discussion: comment, reply (one visual level), upvote, share,
// delete your own. Used on project pages and forum threads.
import { COMMENT_MAX } from '../data/forums.mjs';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const initials = name => (String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();
export function timeAgo(date) {
  const s = Math.max(0, (Date.now() - Date.parse(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function avatar(person, size = 32) {
  const wrap = el('span', null, 'dg-avatar'); wrap.style.setProperty('--size', size + 'px'); wrap.setAttribute('aria-hidden', 'true');
  wrap.append(el('span', initials(person?.name)));
  if (person?.avatar && person.avatar.startsWith('/')) { const img = el('img'); img.src = person.avatar; img.alt = ''; img.width = size; img.height = size; img.loading = 'lazy'; img.addEventListener('error', () => img.remove(), { once: true }); wrap.append(img); }
  return wrap;
}
export function personName(person, tag = 'strong') {
  if (person?.profileUrl && person.profileUrl.startsWith('/creator?id=')) { const a = el('a', person.name, 'dg-person'); a.href = person.profileUrl; return a; }
  return el(tag, person?.name || 'Member', 'dg-person');
}

let sessionPromise;
export async function session() {
  sessionPromise ||= import('./account-session.js').then(m => m.accountSession({optional:true})).then(s => s.state === 'signed-in' ? s.session.access_token : '').catch(() => '');
  return sessionPromise;
}
export async function api(path, body) {
  const token = await session();
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', credentials:'same-origin',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = Error(data.error || 'Try again in a moment.'); error.status = response.status; error.data = data; throw error; }
  return data;
}
export function signInPrompt(text = 'Sign in to join the discussion.') {
  const box = el('div', null, 'dg-signin');
  box.append(el('p', text));
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  const login = el('a', 'Log in', 'dg-btn dg-btn-primary'); login.href = `/login?next=${next}`;
  const signup = el('a', 'Create account', 'dg-btn'); signup.href = `/login?mode=signup&next=${next}`;
  const row = el('div', null, 'dg-signin-actions'); row.append(login, signup); box.append(row);
  return box;
}

export function mountDiscussion(root, { type = 'project', id, onCount } = {}) {
  let comments = [], viewer = { signedIn: false }, sort = 'top', openReply = null, expanded = new Set();
  const labelId = root.getAttribute('aria-labelledby');
  const replacesLabel = labelId && root.contains(root.ownerDocument.getElementById(labelId));
  root.classList.add('dg-discussion');
  root.replaceChildren();
  const head = el('div', null, 'dg-d-head');
  const title = el('h2', null, 'dg-d-title'); title.append(el('span', 'Discussion', 'dg-d-title-text'), el('span', '', 'dg-d-count'));
  if (replacesLabel) title.id = labelId;
  const tabs = el('div', null, 'dg-d-sort'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Sort comments');
  const sortButtons = [['top', 'Top'], ['new', 'Newest']].map(([key, label]) => { const b = el('button', label); b.type = 'button'; b.dataset.sort = key; b.addEventListener('click', () => { sort = key; render(); }); tabs.append(b); return b; });
  head.append(title, tabs);
  const composerSlot = el('div', null, 'dg-d-composer-slot');
  const status = el('p', 'Loading discussion…', 'dg-d-empty'); status.setAttribute('role', 'status');
  const list = el('ol', null, 'dg-d-list');
  root.append(head, composerSlot, status, list);

  function composer({ placeholder, label, parentId, compact = false, onDone, onCancel }) {
    if (!viewer.signedIn) return signInPrompt(compact ? 'Sign in to reply.' : 'Sign in to join the discussion.');
    const form = el('form', null, 'dg-d-composer' + (compact ? ' is-compact' : ''));
    const row = el('div', null, 'dg-d-composer-row');
    row.append(avatar({ name: viewer.name || '?', avatar: viewer.avatar }, compact ? 26 : 32));
    const fields = el('div', null, 'dg-d-composer-fields');
    let nameInput = null;
    if (viewer.needsName) {
      const nameLabel = el('label', null, 'dg-d-name'); nameLabel.append(el('span', 'Display name (shown with your posts)'));
      nameInput = el('input'); nameInput.maxLength = 40; nameInput.required = true; nameInput.autocomplete = 'nickname'; nameInput.placeholder = 'e.g. Sam Rivera';
      nameLabel.append(nameInput); fields.append(nameLabel);
    }
    const area = el('textarea'); area.rows = compact ? 2 : 3; area.maxLength = COMMENT_MAX; area.placeholder = placeholder; area.setAttribute('aria-label', label);
    fields.append(area); row.append(fields);
    const actions = el('div', null, 'dg-d-composer-actions');
    const hint = el('span', '⌘/Ctrl + Enter to post', 'dg-d-hint');
    actions.append(hint);
    if (onCancel) { const cancel = el('button', 'Cancel', 'dg-d-link'); cancel.type = 'button'; cancel.addEventListener('click', onCancel); actions.append(cancel); }
    const send = el('button', compact ? 'Reply' : 'Comment', 'dg-btn dg-btn-primary'); send.type = 'submit'; send.disabled = true;
    actions.append(send);
    const note = el('p', null, 'dg-d-note'); note.setAttribute('role', 'status');
    form.append(row, actions, note);
    const sync = () => { send.disabled = area.value.trim().length < 2 || (nameInput && nameInput.value.trim().length < 2); };
    area.addEventListener('input', sync); nameInput?.addEventListener('input', sync);
    area.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !send.disabled) form.requestSubmit(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      send.disabled = true; send.setAttribute('aria-busy', 'true'); note.textContent = '';
      try {
        const { comment } = await api('/api/discussions', { action: 'post', type, id, body: area.value, ...(parentId ? { parentId } : {}), ...(nameInput ? { displayName: nameInput.value } : {}) });
        if (nameInput) viewer = { ...viewer, needsName: false, name: comment.author.name };
        comments.push(comment); area.value = ''; onDone?.(comment);
      } catch (error) {
        if (error.status === 401) { viewer = { signedIn: false }; render(); return; }
        note.textContent = error.message; send.disabled = false;
      } finally { send.removeAttribute('aria-busy'); }
    });
    queueMicrotask(() => { if (compact) (nameInput || area).focus({ preventScroll: true }); });
    return form;
  }

  const score = c => c.likes * 3 + comments.filter(r => r.parentId === c.id).length * 2 + (c.badge ? 1 : 0);
  function item(c, isReply, flash) {
    const li = el('li', null, 'dg-d-item' + (isReply ? ' is-reply' : '') + (flash === c.id ? ' is-flash' : ''));
    li.id = 'comment-' + c.id;
    const body = el('div', null, 'dg-d-body');
    const meta = el('p', null, 'dg-d-meta');
    meta.append(personName(c.author));
    if (c.badge) meta.append(el('span', c.badge, 'dg-d-badge'));
    const time = el('time', timeAgo(c.date)); time.dateTime = c.date; time.title = new Date(c.date).toLocaleString(); meta.append(time);
    const text = el('p', null, 'dg-d-text');
    if (isReply && c.replyTo) text.append(el('span', '@' + c.replyTo + ' ', 'dg-d-mention'));
    text.append(c.body);
    const actions = el('div', null, 'dg-d-actions');
    const like = el('button', null, 'dg-d-action dg-d-like'); like.type = 'button';
    like.setAttribute('aria-pressed', String(Boolean(c.liked)));
    like.setAttribute('aria-label', `${c.liked ? 'Remove upvote from' : 'Upvote'} ${c.author.name}’s comment, ${c.likes} upvote${c.likes === 1 ? '' : 's'}`);
    like.append(el('span', '▲', 'dg-d-caret'), el('span', c.likes ? `Upvote (${c.likes})` : 'Upvote'));
    like.addEventListener('click', async () => {
      if (!viewer.signedIn) { status.hidden = false; status.replaceChildren(signInPrompt('Sign in to upvote comments.')); status.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }); return; }
      like.disabled = true;
      try { const r = await api('/api/discussions', { action: 'like', type, id, commentId: c.id }); c.liked = r.liked; c.likes = r.likes; render(); root.querySelector(`#comment-${CSS.escape(c.id)} .dg-d-like`)?.focus({ preventScroll: true }); }
      catch (error) { like.disabled = false; status.hidden = false; status.textContent = error.message; }
    });
    const reply = el('button', 'Reply', 'dg-d-action'); reply.type = 'button';
    reply.setAttribute('aria-expanded', String(openReply === c.id));
    reply.addEventListener('click', () => { openReply = openReply === c.id ? null : c.id; render(); });
    const share = el('button', 'Share', 'dg-d-action'); share.type = 'button';
    share.addEventListener('click', async () => {
      const link = `${location.origin}${location.pathname}#comment-${c.id}`;
      try { if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ url: link }); else { await navigator.clipboard.writeText(link); share.textContent = 'Link copied'; setTimeout(() => { share.textContent = 'Share'; }, 1800); } } catch { /* cancelled */ }
    });
    actions.append(like, reply, share);
    if (c.mine) {
      const remove = el('button', 'Delete', 'dg-d-action dg-d-danger'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!confirm('Delete this comment? Replies to it will be hidden too.')) return;
        remove.disabled = true;
        try { await api('/api/discussions', { action: 'delete', type, id, commentId: c.id }); comments = comments.filter(x => x.id !== c.id && x.parentId !== c.id); render(); }
        catch (error) { remove.disabled = false; status.hidden = false; status.textContent = error.message; }
      });
      actions.append(remove);
    }
    body.append(meta, text, actions);
    if (openReply === c.id) body.append(composer({ placeholder: `Reply to ${c.author.name}…`, label: `Reply to ${c.author.name}`, parentId: c.id, compact: true, onCancel: () => { openReply = null; render(); }, onDone: comment => { openReply = null; render(comment.id); } }));
    li.append(avatar(c.author, isReply ? 26 : 32), body);
    return li;
  }

  function render(flash) {
    sortButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === sort)));
    title.querySelector('.dg-d-count').textContent = comments.length ? String(comments.length) : '';
    composerSlot.replaceChildren(composer({ placeholder: type === 'project' ? 'What do you think? Ask the maker a question or share feedback…' : 'Add to the discussion…', label: 'Write a comment', onDone: comment => { sort = 'new'; render(comment.id); } }));
    const roots = comments.filter(c => !c.parentId);
    roots.sort(sort === 'top' ? (a, b) => score(b) - score(a) || Date.parse(b.date) - Date.parse(a.date) : (a, b) => Date.parse(b.date) - Date.parse(a.date));
    status.hidden = Boolean(comments.length);
    if (!comments.length) status.textContent = type === 'project' ? 'No comments yet. Be the first to share feedback with the maker.' : 'No replies yet. Start the conversation.';
    list.replaceChildren(...roots.map(c => {
      const node = item(c, false, flash);
      const replies = comments.filter(r => r.parentId === c.id).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      if (replies.length) {
        const ol = el('ol', null, 'dg-d-replies');
        const showAll = expanded.has(c.id) || replies.length <= 3 || replies.some(r => r.id === flash);
        (showAll ? replies : replies.slice(0, 2)).forEach(r => ol.append(item(r, true, flash)));
        if (!showAll) { const more = el('button', `Show ${replies.length - 2} more ${replies.length - 2 === 1 ? 'reply' : 'replies'}`, 'dg-d-more'); more.type = 'button'; more.addEventListener('click', () => { expanded.add(c.id); render(); }); const li = el('li'); li.append(more); ol.append(li); }
        node.querySelector('.dg-d-body').append(ol);
      }
      return node;
    }));
    if (flash) { const target = root.querySelector(`#comment-${CSS.escape(flash)}`); target?.scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' }); }
    onCount?.(comments.length);
  }

  async function load() {
    const data = await api(`/api/discussions?type=${type}&id=${encodeURIComponent(id)}`);
    comments = data.comments || []; viewer = data.viewer || { signedIn: false };
    const hash = /^#comment-([a-f0-9-]{36})$/.exec(location.hash)?.[1];
    if (hash && comments.some(c => c.id === hash)) { const target = comments.find(c => c.id === hash); if (target.parentId) expanded.add(target.parentId); }
    render(hash && comments.some(c => c.id === hash) ? hash : undefined);
  }
  load().catch(error => { status.hidden = false; status.textContent = error.status === 404 ? 'This discussion is closed.' : 'The discussion is temporarily unavailable. Refresh to try again.'; composerSlot.replaceChildren(); });
  addEventListener('hashchange', () => { const hash = /^#comment-([a-f0-9-]{36})$/.exec(location.hash)?.[1]; if (hash && comments.some(c => c.id === hash)) render(hash); });
  return { reload: load };
}
