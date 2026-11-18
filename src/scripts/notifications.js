import { accountSession } from './account-session.js';
import { notificationRow } from './notification-item.js';

const $ = id => document.getElementById(id);
const prefInputs = [...document.querySelectorAll('[data-notification-pref]')];
let token = '', preferences = null, items = [], busy = false, filter = 'all';
const filterTabs = [...document.querySelectorAll('[data-notification-filter]')];
filterTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => { filter = tab.dataset.notificationFilter; filterTabs.forEach(other => { const on = other === tab; other.setAttribute('aria-selected', String(on)); other.tabIndex = on ? 0 : -1; }); if (preferences) render(); });
  tab.addEventListener('keydown', event => { if (!['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const other = filterTabs[(index + 1) % filterTabs.length]; other.click(); other.focus(); });
});

async function api(action = 'list', body) {
  const response = await fetch('/api/notifications?action=' + action, {
    method: body ? 'POST' : 'GET', cache:'no-store', credentials:'same-origin',
    headers: { Authorization:`Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {}) },
    ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Notifications are unavailable. Try again.');
  return data;
}
function status(message) { $('notifications-settings-status').textContent = message; }
function syncPreferences() {
  $('notifications-enabled').checked = preferences.enabled;
  for (const input of prefInputs) input.checked = preferences[input.dataset.notificationPref];
}
function itemLink(item) {
  return notificationRow(item, { onOpen: opened => {
    if (!opened.unread) return;
    opened.unread = false;
    fetch('/api/notifications?action=read', {method:'POST',credentials:'same-origin',keepalive:true,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({id:opened.id})}).catch(()=>{});
  } });
}
function render() {
  const list = $('notifications-items'); list.replaceChildren();
  document.dispatchEvent(new CustomEvent('digivated:notifications-updated'));
  const safe = items.filter(item => item.href?.startsWith('/') && !item.href.startsWith('//'));
  const unread = safe.filter(item => item.unread).length;
  $('notifications-count').textContent = safe.length ? (unread ? `${unread} unread · ${safe.length} recent` : `You’re all caught up · ${safe.length} recent`) : 'Launch updates and activity will appear here.';
  $('notifications-read-all').hidden = !unread;
  $('notifications-clear').hidden = !safe.length;
  const shown = filter === 'unread' ? safe.filter(item => item.unread) : safe;
  if (!shown.length) {
    const empty = document.createElement('div'); empty.className = 'notifications-empty';
    const title = document.createElement('strong');
    const copy = document.createElement('p');
    if (filter === 'unread' && safe.length) { title.textContent = 'No unread notifications.'; copy.textContent = 'You’re all caught up.'; }
    else { title.textContent = 'Nothing new right now.'; copy.textContent = preferences.enabled ? 'Comments, replies, upvotes and launch updates will appear here.' : 'Launch updates appear here automatically. Turn on activity notifications below for replies, follows, and messages.'; }
    empty.append(title,copy); list.append(empty); return;
  }
  const groups = filter === 'unread' ? [['', shown]] : [['New', shown.filter(item => item.unread)], ['Earlier', shown.filter(item => !item.unread)]];
  for (const [heading, group] of groups) {
    if (!group.length) continue;
    if (heading && groups.some(([, other]) => other !== group && other.length)) { const h = document.createElement('h3'); h.className = 'fl-notify-group'; h.textContent = heading; list.append(h); }
    for (const item of group) list.append(itemLink(item));
  }
}
function renderApprovals(approvals) {
  const list = $('notifications-approvals');
  list.replaceChildren();
  $('notifications-approval-status').textContent = !Array.isArray(approvals)
    ? 'Live projects couldn’t be checked. Try refreshing.'
    : approvals.length ? 'Approved and live on Digivated.' : 'None yet. Track your launch progress in your dashboard.';
  for (const project of approvals || []) {
    if (!project.href?.startsWith('/projects/')) continue;
    const link = document.createElement('a');
    link.href = project.href;
    link.className = 'notification-item';
    const content = document.createElement('span');
    content.className = 'notification-copy';
    const state = document.createElement('small');
    state.textContent = 'Approved and live';
    const title = document.createElement('strong');
    title.textContent = project.name;
    content.append(state, title);
    link.append(content);
    list.append(link);
  }
}
async function load() {
  const data = await api();
  preferences = data.preferences; items = data.items || [];
  syncPreferences(); renderApprovals(data.approvals); render(); status('');
}
async function savePreferences() {
  if (busy || !preferences) return;
  const next = {enabled:$('notifications-enabled').checked};
  for (const input of prefInputs) next[input.dataset.notificationPref] = input.checked;
  busy = true; $('notifications-enabled').disabled = true; prefInputs.forEach(input => { input.disabled = true; });
  status('Saving your choices…');
  try { const data = await api('preferences',{preferences:next}); preferences = data.preferences; syncPreferences(); render(); status('Preferences saved.'); }
  catch(error) { syncPreferences(); status(error.message); }
  finally { busy = false; $('notifications-enabled').disabled = false; prefInputs.forEach(input => { input.disabled = false; }); }
}
$('notifications-enabled').addEventListener('change',savePreferences);
for (const input of prefInputs) input.addEventListener('change',savePreferences);
$('notifications-read-all').addEventListener('click',async () => {
  if (busy) return; busy = true; $('notifications-read-all').disabled = true;
  try { await api('read-all',{}); items.forEach(item => {item.unread = false;}); render(); status('All caught up.'); }
  catch(error) { status(error.message); }
  finally { busy = false; $('notifications-read-all').disabled = false; }
});
$('notifications-clear').addEventListener('click',async () => {
  if (busy || !confirm('Clear your notification history?')) return;
  busy = true; $('notifications-clear').disabled = true;
  try { await api('clear',{}); items = []; render(); status('Notification history cleared.'); }
  catch(error) { status(error.message); }
  finally { busy = false; $('notifications-clear').disabled = false; }
});
(async () => {
  try {
    const auth = await accountSession();
    if (auth?.state !== 'signed-in') throw new Error('Sign in to see your notifications.');
    token = auth.session.access_token;
    await load();
    $('notifications-auth').hidden = true; $('notifications-main').hidden = false;
  } catch(error) {
    $('notifications-auth').querySelector('p').textContent = error.message || 'Notifications could not be loaded. Try again.';
    if (!token) $('notifications-auth').querySelector('a').hidden = false;
  }
})();
document.addEventListener('visibilitychange',() => { if (!document.hidden && token && preferences && !busy) load().catch(()=>{}); });
