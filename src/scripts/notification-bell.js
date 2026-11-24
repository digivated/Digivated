import { accountSession } from './account-session.js';
import { notificationRow } from './notification-item.js';

// Header bell: a small preview of recent notifications, like Product Hunt.
// Modified clicks (new tab) and signed-out visitors keep the plain /notifications link.
const bell = document.getElementById('header-notifications-link');
if (bell) {
  const siteHeader = bell.closest('[data-site-header]');
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
  const panel = el('section', null, 'dg-bell-panel'); panel.hidden = true; panel.id = 'dg-bell-panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Notifications');
  const head = el('header', null, 'dg-bell-head');
  const readAll = el('button', 'Mark all read'); readAll.type = 'button'; readAll.hidden = true;
  head.append(el('strong', 'Notifications'), readAll);
  const list = el('div', null, 'dg-bell-list');
  const foot = el('a', 'See all notifications', 'dg-bell-foot'); foot.href = '/notifications';
  panel.append(head, list, foot);
  document.body.append(panel);
  bell.classList.add('dg-bell');
  bell.setAttribute('aria-haspopup', 'dialog'); bell.setAttribute('aria-expanded', 'false'); bell.setAttribute('aria-controls', panel.id);
  let token = '', items = [];

  const badge = () => document.getElementById('header-notifications-badge');
  const syncBadge = () => {
    const unread = items.filter(item => item.unread).length;
    const node = badge(); if (node) { node.textContent = unread > 9 ? '9+' : String(unread); node.hidden = !unread; }
    readAll.hidden = !unread;
  };
  const post = (action, body) => fetch(`/api/notifications?action=${action}`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function render() {
    if (!items.length) { list.replaceChildren(el('p', 'You’re all caught up. New activity and project updates will appear here.', 'dg-bell-empty')); syncBadge(); return; }
    list.replaceChildren(...items.slice(0, 7).map(item => notificationRow(item, { onOpen: opened => { if (opened.unread) { opened.unread = false; post('read', { id: opened.id }).catch(() => {}); } } })));
    syncBadge();
  }
  const close = (focus = false) => { if (panel.hidden) return; panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); if (focus) bell.focus(); };
  // Keep the panel on screen. Under a top bar it drops below the bell. In the desktop
  // sidebar the bell sits at the bottom, so the panel opens beside the sidebar instead.
  function place() {
    if (panel.hidden) return;
    const bounds = siteHeader?.getBoundingClientRect(), b = bell.getBoundingClientRect();
    const w = panel.offsetWidth, h = panel.offsetHeight, gap = 8, edge = 12;
    const sidebar = bounds && bounds.right < innerWidth / 2 && b.bottom > innerHeight / 2;
    let top, right;
    if (sidebar) {
      const left = Math.min(Math.ceil(bounds.right) + edge, innerWidth - w - edge);
      right = innerWidth - left - w;
      top = Math.min(b.bottom - h, innerHeight - h - edge);
    } else {
      right = Math.min(innerWidth - w - edge, Math.floor(innerWidth - (bounds ? bounds.right : b.right)));
      top = b.bottom + gap;
      if (top + h > innerHeight - edge && b.top - h - gap >= edge) top = b.top - h - gap;
    }
    panel.style.setProperty('--bell-top', `${Math.max(edge, Math.round(top))}px`);
    panel.style.setProperty('--bell-right', `${Math.max(edge, Math.round(right))}px`);
  }
  async function open() {
    panel.hidden = false;
    place();
    bell.setAttribute('aria-expanded', 'true');
    list.replaceChildren(el('p', 'Loading…', 'dg-bell-empty'));
    try {
      const response = await fetch('/api/notifications?action=list', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw Error();
      items = (await response.json()).items || [];
      render();
      place();
      panel.querySelector('a')?.focus({ preventScroll: true });
    } catch { list.replaceChildren(el('p', 'Notifications are unavailable right now.', 'dg-bell-empty')); place(); }
  }
  bell.addEventListener('click', async event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
    if (!token && siteHeader?.dataset.account !== 'signed-in') return;
    event.preventDefault();
    if (!token) {
      try { const s = await accountSession(); if (s.state === 'signed-in') token = s.session.access_token; } catch { /* Use the notifications page. */ }
      if (!token) { location.assign(bell.href); return; }
    }
    if (panel.hidden) open(); else close();
  });
  readAll.addEventListener('click', async () => {
    readAll.disabled = true;
    panel.querySelector('[role="status"]')?.remove();
    try {
      if (!(await post('read-all', {})).ok) throw new Error();
      items.forEach(item => { item.unread = false; });
      render();
      if (!panel.hidden) foot.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('digivated:notifications-updated'));
    } catch {
      const status = el('p', 'Couldn’t mark notifications as read. Try again.', 'dg-bell-empty');
      status.setAttribute('role', 'status');
      list.before(status);
    } finally { readAll.disabled = false; }
  });
  document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) close(); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(true); } });
  addEventListener('resize', () => close(), { passive: true });
}
