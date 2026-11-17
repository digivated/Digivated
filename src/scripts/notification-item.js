// One notification row, shared by the header preview and the Notifications page.
const GLYPH = { reply: '>', feedback: '#', upvote: '▲', follow: '+', message: '@', approved: '✓', scheduled: '◷' };
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };

export function relativeTime(value) {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'just now';
  if (elapsed < 60000) return 'just now';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m ago`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}h ago`;
  if (elapsed < 604800000) return `${Math.floor(elapsed / 86400000)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "Sam commented on Pocketlog", "3 upvotes today on your project Pocketlog", or the stored title.
export function notificationLine(item) {
  const line = el('p', null, 'dg-note-line');
  if (item.type === 'upvote' && item.count && item.verb) line.append(el('b', String(item.count)), ` ${item.verb} `, el('b', item.subject || ''));
  else if (item.actor && item.verb) { line.append(el('b', item.actor), ` ${item.verb} `); if (item.subject) line.append(el('b', item.subject)); }
  else line.append(item.title || 'Activity on Digivated');
  return line;
}

export function notificationRow(item, { onOpen } = {}) {
  const link = el('a', null, 'dg-note' + (item.unread ? ' is-unread' : ''));
  link.href = item.href?.startsWith('/') && !item.href.startsWith('//') ? item.href : '/notifications';
  link.dataset.type = item.type;
  const icon = el('span', GLYPH[item.type] || '*', 'dg-note-icon'); icon.setAttribute('aria-hidden', 'true');
  const copy = el('span', null, 'dg-note-copy');
  copy.append(notificationLine(item));
  if (item.excerpt) copy.append(el('span', item.excerpt, 'dg-note-quote'));
  const time = el('time', relativeTime(item.createdAt)); time.dateTime = item.createdAt; copy.append(time);
  link.append(icon, copy);
  if (item.unread) { const dot = el('span', null, 'dg-note-dot'); dot.setAttribute('aria-label', 'Unread'); link.append(dot); }
  link.addEventListener('click', () => onOpen?.(item));
  return link;
}
