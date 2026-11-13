import { accountSession } from './account-session.js';
import { cardIconMarkup } from '../lib/card-icons.mjs';

const $ = id => document.getElementById(id);
const prefInputs = [...document.querySelectorAll('[data-notification-pref]')];
const label = { reply:'Reply', follow:'Follower', message:'Message', feedback:'Project feedback' };
let token = '', preferences = null, items = [], busy = false;

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
function relativeTime(value) {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Recently';
  const formatter = new Intl.RelativeTimeFormat(undefined,{numeric:'auto'});
  if (elapsed < 3600000) return formatter.format(-Math.max(1,Math.floor(elapsed/60000)),'minute');
  if (elapsed < 86400000) return formatter.format(-Math.floor(elapsed/3600000),'hour');
  if (elapsed < 604800000) return formatter.format(-Math.floor(elapsed/86400000),'day');
  return new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function render() {
  const list = $('notifications-items'); list.replaceChildren();
  const unread = items.filter(item => item.unread).length;
  $('notifications-count').textContent = items.length ? `${unread} unread · ${items.length} recent` : preferences.enabled ? 'You’re all caught up.' : 'Turn on notifications to see new activity here.';
  $('notifications-read-all').hidden = !unread;
  $('notifications-clear').hidden = !items.length;
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'notifications-empty';
    const title = document.createElement('strong'); title.textContent = preferences.enabled ? 'Nothing new right now.' : 'Your activity, when you want it.';
    const copy = document.createElement('p'); copy.textContent = preferences.enabled ? 'Replies, follows, messages, and feedback will appear here.' : 'Turn on notifications above to keep up with your projects and conversations.';
    empty.append(title,copy); list.append(empty); return;
  }
  for (const item of items) {
    if (!item.href?.startsWith('/') || item.href.startsWith('//')) continue;
    const link = document.createElement('a'); link.href = item.href; link.className = 'notification-item';
    if (item.unread) link.classList.add('unread');
    const mark = document.createElement('span'); mark.className = 'notification-mark'; mark.setAttribute('aria-hidden','true'); mark.innerHTML = cardIconMarkup({reply:'comment',follow:'profile',message:'message',feedback:'sparkle'}[item.type] || 'bell');
    const content = document.createElement('span'); content.className = 'notification-copy';
    const kind = document.createElement('small'); kind.textContent = label[item.type] || 'Activity';
    const title = document.createElement('strong'); title.textContent = item.title;
    const time = document.createElement('time'); time.dateTime = item.createdAt; time.textContent = relativeTime(item.createdAt);
    content.append(kind,title,time); link.append(mark,content);
    if (item.unread) link.addEventListener('click', () => {
      item.unread = false;
      fetch('/api/notifications?action=read', {method:'POST',credentials:'same-origin',keepalive:true,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({id:item.id})}).catch(()=>{});
    });
    list.append(link);
  }
}
async function load() {
  const data = await api();
  preferences = data.preferences; items = data.items || [];
  syncPreferences(); render(); status('');
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
