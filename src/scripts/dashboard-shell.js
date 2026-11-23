// Keeps the dashboard chrome in step with the open dashboard tab:
// sidebar section links, the breadcrumb, and the greeting. It never changes account data.
const labels = { projects: 'Overview', analytics: 'Analytics', profile: 'Profile', settings: 'Settings' };
const root = document.documentElement;
const crumbs = document.querySelector('.site-breadcrumbs');
const title = document.getElementById('dash-title');
const lede = document.getElementById('dash-lede');
const signedIn = document.getElementById('account-signed-in');

function setTab(name) {
  if (!labels[name]) return;
  root.dataset.dashTab = name;
  for (const link of document.querySelectorAll('[data-account-link]')) {
    if (link.dataset.accountLink === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (!crumbs) return;
  crumbs.querySelectorAll('[data-dash-crumb]').forEach(node => node.remove());
  const current = crumbs.querySelector('[aria-current="page"]');
  if (!current) return;
  if (name === 'projects') { current.hidden = false; return; }
  // Home › Dashboard › Analytics, with Dashboard linking back to the overview.
  current.hidden = true;
  const link = Object.assign(document.createElement('a'), { href: '/dashboard', textContent: 'Dashboard' });
  const separator = Object.assign(document.createElement('span'), { className: 'breadcrumb-separator', textContent: '›' });
  separator.setAttribute('aria-hidden', 'true');
  const section = Object.assign(document.createElement('span'), { textContent: labels[name] });
  section.setAttribute('aria-current', 'page');
  for (const node of [link, separator, section]) { node.dataset.dashCrumb = ''; crumbs.append(node); }
}

document.addEventListener('dg:account-tab', event => setTab(event.detail));
const selected = document.querySelector('[data-account-tab][aria-selected="true"]');
if (selected && signedIn && !signedIn.hidden) setTab(selected.dataset.accountTab);

// Sidebar section links switch tabs in place once the dashboard is open.
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[data-account-link]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const tab = document.querySelector(`[data-account-tab="${link.dataset.accountLink}"]`);
  if (!tab || !signedIn || signedIn.hidden) return;
  event.preventDefault();
  tab.click();
  const menu = link.closest('details[open]');
  if (menu) menu.open = false;
  window.scrollTo({ top: 0 });
});

document.addEventListener('dg:account-ready', () => {
  root.dataset.dashSignedIn = 'true';
  if (lede) lede.hidden = true; // The signed-in line under the heading takes its place.
  const open = document.querySelector('[data-account-tab][aria-selected="true"]');
  if (open) setTab(open.dataset.accountTab);
});

document.addEventListener('dg:account-profile', event => {
  if (!title) return;
  const first = String(event.detail?.name || '').trim().split(/\s+/)[0];
  title.textContent = first ? `Hey ${first}, what are you launching?` : 'Welcome back. What are you launching?';
});
