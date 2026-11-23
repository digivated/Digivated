// The bar holds the main destinations. On smaller screens they move into the menu.
export const primaryLinks = [
  ['/', 'Home'],
  ['/categories', 'Categories'],
  ['/dashboard', 'Dashboard'],
  ['/shop', 'Shop'],
  ['/news', 'News'],
  ['/threads', 'Threads'],
  ['/tools', 'Tools'],
];
export function isNavigationCurrent(path, href) {
  return !href.includes('?') && (
    path === href || (href !== '/' && path.startsWith(href + '/')) ||
    (href === '/categories' && (path === '/discover' || path === '/launch-template' || path.startsWith('/projects/'))) ||
    (href === '/shop' && ['/membership', '/products', '/promote', '/founding-members'].includes(path))
  );
}
// Footer shortcuts and account, help, and social links.
export const footerGroups = [
  { title: 'Explore', links: [['/discover', 'Directory'], ['/news', 'News'], ['/tools', 'Tools']] },
  { title: 'For makers', links: [
    ['/new-launch', 'New Launch'], ['/dashboard', 'Dashboard'], ['/notifications', 'Notifications'],
    ['/saved', 'Saved items'], ['/badges', 'Embed badges'], ['/dashboard?tab=settings', 'Email settings'],
  ] },
  { title: 'Company', links: [
    ['/about', 'About'], ['/privacy', 'Privacy'], ['/terms', 'Terms'],
  ] },
  { title: 'Follow', links: [
    ['https://x.com/digivatedx', 'X'],
    ['https://www.pinterest.com/digivated/', 'Pinterest'],
  ] },
];
