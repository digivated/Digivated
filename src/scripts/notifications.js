import { accountSession } from './account-session.js';
import { notificationRow } from './notification-item.js';

const $ = id => document.getElementById(id);
const prefInputs = [...document.querySelectorAll('[data-notification-pref]')];
const masterInput = $('notifications-enabled');
const optionGroups = [...document.querySelectorAll('.notifications-options')];
let token = '', preferences = null, items = [], busy = false, filter = 'all';
let loadRequest = 0, lastUnread;
const filterTabs = [...document.querySelectorAll('[data-notification-filter]')];
filterTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => { filter = tab.dataset.notificationFilter; filterTabs.forEach(other => { const on = other === tab; other.setAttribute('aria-selected', String(on)); other.tabIndex = on ? 0 : -1; }); $('notifications-items').setAttribute('aria-labelledby', tab.id); if (preferences) render(); });
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
function settingsStatus(message) { $('notifications-settings-status').textContent = message; }
function feedStatus(message) { $('notifications-feed-status').textContent = message; }
function announceUnread(count) {
  if (lastUnread === count) return;
  lastUnread = count;
  document.dispatchEvent(new CustomEvent('digivated:notifications-updated'));
}
function syncPreferences() {
  masterInput.checked = preferences.enabled;
  masterInput.disabled = busy;
  for (const group of optionGroups) group.disabled = busy || !preferences.enabled;
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
    else { title.textContent = 'You’re all caught up.'; copy.textContent = preferences.enabled ? 'New activity and project updates will appear here.' : 'Activity alerts are paused. Updates for your own projects will still appear here.'; }
    empty.append(title,copy); list.append(empty); return;
  }
  const groups = filter === 'unread' ? [['', shown]] : [['New', shown.filter(item => item.unread)], ['Earlier', shown.filter(item => !item.unread)]];
  for (const [heading, group] of groups) {
    if (!group.length) continue;
    if (heading && groups.some(([, other]) => other !== group && other.length)) { const h = document.createElement('h3'); h.className = 'notifications-group'; h.textContent = heading; list.append(h); }
    for (const item of group) list.append(itemLink(item));
  }
}
function renderApprovals(approvals) {
  const list = $('notifications-approvals');
  list.replaceChildren();
  $('notifications-approval-status').textContent = !Array.isArray(approvals)
    ? 'Live projects couldn’t be checked. Try refreshing.'
    : approvals.length ? 'Published on Digivated.' : 'Track drafts and scheduled launches in Your Projects.';
  for (const project of approvals || []) {
    if (!project.href?.startsWith('/projects/')) continue;
    const link = document.createElement('a');
    link.href = project.href;
    link.className = 'notification-item';
    const content = document.createElement('span');
    content.className = 'notification-copy';
    const state = document.createElement('small');
    state.textContent = 'Live';
    const title = document.createElement('strong');
    title.textContent = project.name;
    content.append(state, title);
    link.append(content);
    list.append(link);
  }
}
async function load() {
  const request = ++loadRequest;
  const data = await api();
  if (request !== loadRequest || busy) return;
  preferences = data.preferences; items = data.items || [];
  syncPreferences(); renderApprovals(data.approvals); render();
  announceUnread(data.unread ?? items.filter(item => item.unread).length);
}
async function savePreferences() {
  if (busy || !preferences) return;
  const next = {enabled: masterInput.checked};
  for (const input of prefInputs) if (!input.matches(':disabled')) next[input.dataset.notificationPref] = input.checked;
  loadRequest++;
  const focused = document.activeElement;
  busy = true; masterInput.disabled = true;
  for (const group of optionGroups) group.disabled = true;
  settingsStatus('Saving your choices…');
  try { const data = await api('preferences',{preferences:next}); preferences = data.preferences; render(); settingsStatus('Preferences saved.'); }
  catch(error) { settingsStatus(error.message); }
  finally {
    busy = false;
    syncPreferences();
    if (document.activeElement === document.body && focused instanceof HTMLInputElement) focused.focus({ preventScroll: true });
  }
}
masterInput.addEventListener('change',savePreferences);
for (const input of prefInputs) input.addEventListener('change',savePreferences);
$('notifications-read-all').addEventListener('click',async () => {
  if (busy) return; loadRequest++; busy = true; $('notifications-read-all').disabled = true;
  try { await api('read-all',{}); items.forEach(item => {item.unread = false;}); render(); announceUnread(0); feedStatus('All caught up.'); filterTabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.focus({ preventScroll: true }); }
  catch(error) { feedStatus(error.message); }
  finally { busy = false; $('notifications-read-all').disabled = false; }
});
$('notifications-clear').addEventListener('click',async () => {
  if (busy || !confirm('Clear your notification history?')) return;
  loadRequest++; busy = true; $('notifications-clear').disabled = true;
  try { await api('clear',{}); items = []; render(); announceUnread(0); feedStatus('Notification history cleared.'); filterTabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.focus({ preventScroll: true }); }
  catch(error) { feedStatus(error.message); }
  finally { busy = false; $('notifications-clear').disabled = false; }
});
(async () => {
  try {
    const auth = await accountSession({ optional: true });
    if (auth?.state !== 'signed-in') throw new Error('Sign in to see your notifications.');
    token = auth.session.access_token;
    await load();
    $('notifications-auth').hidden = true; $('notifications-main').hidden = false;
    const section = ['#notification-activity', '#notification-preferences'].includes(location.hash)
      ? $(location.hash.slice(1)) : null;
    if (section) {
      const { top, bottom } = section.querySelector('h2').getBoundingClientRect();
      const topInset = matchMedia('(min-width: 1120px)').matches ? 12 : 76;
      if (top < topInset || bottom > window.innerHeight) section.scrollIntoView();
    }
  } catch(error) {
    $('notifications-auth').querySelector('p').textContent = error.message || 'Notifications could not be loaded. Try again.';
    if (!token) $('notifications-auth').querySelector('a').hidden = false;
  }
})();
document.addEventListener('visibilitychange',() => { if (!document.hidden && token && preferences && !busy) load().catch(()=>{}); });
