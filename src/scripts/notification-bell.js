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
  const foot = el('a', 'See all notifications →', 'dg-bell-foot'); foot.href = '/notifications';
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
    if (!items.length) { list.replaceChildren(el('p', 'You’re all caught up. Comments, replies and upvotes on your work will show here.', 'dg-bell-empty')); syncBadge(); return; }
    list.replaceChildren(...items.slice(0, 7).map(item => notificationRow(item, { onOpen: opened => { if (opened.unread) { opened.unread = false; post('read', { id: opened.id }).catch(() => {}); } } })));
    syncBadge();
  }
  const close = (focus = false) => { if (panel.hidden) return; panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); if (focus) bell.focus(); };
  async function open() {
    const bounds = siteHeader?.getBoundingClientRect();
    if (bounds) {
      panel.style.setProperty('--bell-top', `${Math.ceil(bounds.bottom) + 8}px`);
      panel.style.setProperty('--bell-right', `${Math.max(12, Math.floor(innerWidth - bounds.right))}px`);
    }
    panel.hidden = false; bell.setAttribute('aria-expanded', 'true');
    list.replaceChildren(el('p', 'Loading…', 'dg-bell-empty'));
    try {
      const response = await fetch('/api/notifications?action=list', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw Error();
      items = (await response.json()).items || [];
      render();
      panel.querySelector('a')?.focus({ preventScroll: true });
    } catch { list.replaceChildren(el('p', 'Notifications are unavailable right now.', 'dg-bell-empty')); }
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
  readAll.addEventListener('click', () => { items.forEach(item => { item.unread = false; }); post('read-all', {}).catch(() => {}); render(); });
  document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) close(); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(true); } });
  addEventListener('resize', () => close(), { passive: true });
}
