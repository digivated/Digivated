import { REVIEW_MIN_SECONDS } from '../lib/feedback-score.mjs';
import { COMMENT_MAX } from '../data/forums.mjs';
import { api, session, signInPrompt } from './discussion.js';

// After someone opens a product from Digivated and comes back, a small card asks
// one question. The answer is posted to the project's discussion. Specific comments
// after a real visit quietly earn points that lift the commenter's own launch.
const KEY = 'digivated:pending-visit';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = value => { try { value ? sessionStorage.setItem(KEY, JSON.stringify(value)) : sessionStorage.removeItem(KEY); } catch { /* optional */ } };

const panel = el('section', null, 'dg-review');
panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'dg-review-title'); panel.hidden = true;
const head = el('header', null, 'dg-review-head');
const logo = el('span', null, 'dg-review-logo');
const titles = el('div');
const title = el('h2', 'How was it?'); title.id = 'dg-review-title';
titles.append(el('p', 'Welcome back', 'dg-label'), title);
const close = el('button', '×', 'dg-review-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
head.append(logo, titles, close);
const content = el('div', null, 'dg-review-content');
panel.append(head, content);
document.body.append(panel);

let visit = null, returnFocus = null;
function hide() {
  const finish = () => { panel.hidden = true; panel.classList.remove('is-leaving'); };
  if (reduced.matches) finish(); else { panel.classList.add('is-leaving'); setTimeout(finish, 180); }
  write(null);
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}
close.addEventListener('click', hide);
panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } });

function form(viewerNeedsName) {
  const f = el('form', null, 'dg-review-form');
  let nameInput = null;
  if (viewerNeedsName) {
    const label = el('label', null, 'dg-review-field'); label.append(el('span', 'Display name'));
    nameInput = el('input'); nameInput.maxLength = 40; nameInput.required = true; nameInput.placeholder = 'Shown with your comment';
    label.append(nameInput); f.append(label);
  }
  const label = el('label', null, 'dg-review-field'); label.append(el('span', 'What stood out, and what would you improve?'));
  const area = el('textarea'); area.rows = 3; area.maxLength = COMMENT_MAX; area.placeholder = 'The onboarding is fast. I wasn’t sure what the pricing includes…';
  label.append(area); f.append(label);
  const note = el('p', `Posted to ${visit.name}’s discussion. Specific comments after a real visit earn points that lift your own launch.`, 'dg-review-note');
  const actions = el('div', null, 'dg-review-actions');
  const later = el('button', 'Not now', 'dg-btn'); later.type = 'button'; later.addEventListener('click', hide);
  const send = el('button', 'Post comment', 'dg-btn dg-btn-primary'); send.type = 'submit'; send.disabled = true;
  actions.append(later, send);
  const status = el('p', null, 'dg-review-status'); status.setAttribute('role', 'status');
  f.append(note, actions, status);
  const sync = () => { send.disabled = area.value.trim().length < 2 || (nameInput && nameInput.value.trim().length < 2); };
  area.addEventListener('input', sync); nameInput?.addEventListener('input', sync);
  f.addEventListener('submit', async event => {
    event.preventDefault();
    send.disabled = true; send.setAttribute('aria-busy', 'true'); status.textContent = 'Posting…';
    try {
      const data = await api('/api/feedback-points', { action: 'review', id: visit.id, token: visit.token, comment: area.value, ...(nameInput ? { displayName: nameInput.value } : {}) });
      done(data);
    } catch (error) { status.textContent = error.message; send.disabled = false; }
    finally { send.removeAttribute('aria-busy'); }
  });
  queueMicrotask(() => (nameInput || area).focus({ preventScroll: true }));
  return f;
}

function done(data) {
  write(null);
  const box = el('div', null, 'dg-review-done');
  if (data.points > 0) {
    const award = el('p', null, 'dg-award'); award.append(el('strong', `+${data.points}`), el('span', 'points'));
    const sparks = el('span', null, 'dg-sparks'); sparks.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i++) { const s = el('span', ['+', '*', '·'][i % 3]); s.style.setProperty('--a', `${30 * i}deg`); s.style.setProperty('--d', `${44 + (i % 3) * 16}px`); sparks.append(s); }
    award.append(sparks); box.append(award);
    document.dispatchEvent(new CustomEvent('digivated:points-awarded', { detail: { points: data.points, total: data.total } }));
  }
  box.append(el('p', 'Comment posted. The maker has been notified.', 'dg-award-copy'));
  const view = el('a', 'View in the discussion →', 'dg-btn'); view.href = data.href;
  const finish = el('button', 'Done', 'dg-btn dg-btn-primary'); finish.type = 'button'; finish.addEventListener('click', hide);
  const row = el('div', null, 'dg-review-actions'); row.append(view, finish); box.append(row);
  content.replaceChildren(box);
  finish.focus({ preventScroll: true });
}

async function open(pending) {
  visit = pending;
  returnFocus = document.querySelector(`[data-visit-project="${CSS.escape(visit.id)}"]`) || document.activeElement;
  title.textContent = `How was ${visit.name}?`;
  logo.replaceChildren(el('span', visit.name.slice(0, 2).toUpperCase()));
  if (visit.image) { const img = el('img'); img.src = visit.image; img.alt = ''; img.width = 40; img.height = 40; img.addEventListener('error', () => img.remove(), { once: true }); logo.append(img); }
  content.replaceChildren(el('p', 'Loading…', 'dg-review-note'));
  panel.hidden = false;
  const token = await session();
  if (!token) { content.replaceChildren(signInPrompt(`Sign in to leave a comment for ${visit.name}.`)); content.querySelector('a')?.focus({ preventScroll: true }); return; }
  let needsName = false;
  try { needsName = Boolean((await api(`/api/discussions?type=project&id=${encodeURIComponent(visit.id)}`)).viewer?.needsName); } catch { /* fall back to the plain form */ }
  content.replaceChildren(form(needsName));
  if (Date.now() - visit.startedAt < REVIEW_MIN_SECONDS * 1000) content.querySelector('.dg-review-note')?.append(` Points need ${REVIEW_MIN_SECONDS}s or more on the product.`);
}

document.addEventListener('click', event => {
  const link = event.target.closest?.('a[data-visit-project]');
  if (!link || event.defaultPrevented || event.button > 1) return;
  const pending = { id: link.dataset.visitProject, name: link.dataset.visitName || 'this product', image: link.dataset.visitImage || '', startedAt: Date.now(), token: '' };
  write(pending);
  fetch('/api/feedback-points', { method: 'POST', credentials:'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'visit', id: pending.id }) })
    .then(response => response.ok ? response.json() : null)
    .then(data => { const current = read(); if (data?.token && current?.id === pending.id && current.startedAt === pending.startedAt) write({ ...current, token: data.token }); })
    .catch(() => {});
});
const maybePrompt = () => {
  if (document.hidden || !panel.hidden) return;
  const pending = read();
  if (!pending?.id || Date.now() - pending.startedAt < 4000 || Date.now() - pending.startedAt > 6 * 3_600_000) return;
  open(pending);
};
document.addEventListener('visibilitychange', maybePrompt);
addEventListener('focus', maybePrompt);
addEventListener('pageshow', () => setTimeout(maybePrompt, 400));
