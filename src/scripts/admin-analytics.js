const $ = id => document.getElementById(id);
const format = value => new Intl.NumberFormat().format(value || 0);
const labels = {
  project_open: 'Project opens', project_site_visit: 'Project website visits',
  project_feedback_open: 'Feedback opened', project_submit: 'Projects submitted',
  membership_checkout: 'Checkout clicks', membership_verified: 'Memberships verified',
  news_category_select: 'News category choices', creator_post_publish: 'Creator posts',
  creator_reply_publish: 'Creator replies',
};
let csrf = '';

async function request(path = '') {
  const response = await fetch('/api/admin' + path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Analytics could not be loaded.');
  return data;
}
function row(label, value) {
  const item = document.createElement('div'); item.className = 'analytics-row';
  const name = document.createElement('span'); name.textContent = label;
  const number = document.createElement('strong'); number.textContent = format(value);
  item.append(name, number); return item;
}
function list(id, items, key, value, empty) {
  const container = $(id); container.replaceChildren();
  if (!items.length) { const note = document.createElement('p'); note.className = 'analytics-empty'; note.textContent = empty; container.append(note); return; }
  for (const item of items) container.append(row(item[key], item[value]));
}
function render(data) {
  const actions = data.actions || [];
  const metrics = $('analytics-metrics'); metrics.replaceChildren();
  for (const [name, value] of [
    ['Active users', data.totals.activeUsers], ['Sessions', data.totals.sessions],
    ['Page views', data.totals.pageViews], ['Tracked actions', actions.reduce((sum, item) => sum + item.count, 0)],
  ]) {
    const card = document.createElement('div'); card.className = 'analytics-metric';
    const label = document.createElement('span'); label.textContent = name;
    const number = document.createElement('strong'); number.textContent = format(value);
    card.append(label, number); metrics.append(card);
  }
  const trend = $('analytics-trend'); trend.replaceChildren();
  const days = data.trend || [], max = Math.max(1, ...days.map(day => day.users));
  for (const day of days) {
    const item = document.createElement('li');
    const date = `${day.date.slice(0, 4)}-${day.date.slice(4, 6)}-${day.date.slice(6)}`;
    item.title = `${date}: ${format(day.users)} active users`;
    item.setAttribute('aria-label', item.title);
    const bar = document.createElement('span'); bar.style.height = `${Math.max(day.users ? 5 : 1, day.users / max * 100)}%`;
    item.append(bar); trend.append(item);
  }
  list('analytics-events', actions.map(item => ({...item, label: labels[item.name] || item.name})), 'label', 'count', 'No product actions recorded in this period.');
  list('analytics-sources', data.sources || [], 'label', 'sessions', 'No traffic-source data yet.');
  list('analytics-pages', data.pages || [], 'path', 'views', 'No page-view data yet.');
  $('analytics-period').textContent = `${data.period} · Google Analytics 4 · Updated ${new Date(data.updatedAt).toLocaleString()}`;
}
async function load() {
  const button = $('analytics-refresh'); button.disabled = true;
  $('analytics-status').textContent = 'Loading Google Analytics…';
  try {
    const data = await request('?action=analytics');
    if (data.status !== 'ready') {
      $('analytics-status').textContent = data.status === 'unconfigured'
        ? 'GA4 reporting credentials are not configured for this deployment.'
        : 'Google Analytics is temporarily unavailable. Try refreshing shortly.';
      return;
    }
    render(data); $('analytics-status').textContent = '';
  } catch (error) { $('analytics-status').textContent = error.name === 'TimeoutError' ? 'Google Analytics timed out. Try again.' : error.message; }
  finally { button.disabled = false; }
}

$('analytics-refresh').addEventListener('click', load);
$('owner-logout').addEventListener('click', async () => {
  try {
    await fetch('/api/admin', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Admin-CSRF': csrf }, body: JSON.stringify({action: 'logout'}) });
  } finally { location.href = '/admin'; }
});
(async () => {
  try {
    const session = await request();
    csrf = session.csrf;
    if (!csrf) throw new Error('Sign in to your owner dashboard first.');
    $('analytics-signin').hidden = true;
    $('analytics-page').hidden = false;
    $('owner-logout').hidden = false;
    await load();
  } catch (error) { $('analytics-signin-status').textContent = error.message || 'Sign in to your owner dashboard first.'; }
})();
