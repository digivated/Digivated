// The bar holds the main destinations. On smaller screens they move into the menu.
export const primaryLinks = [
  ['/', 'Home'],
  ['/categories', 'Categories'],
  ['/account', 'Dashboard'],
  ['/shop', 'Shop'],
  ['/news', 'News'],
  ['/threads', 'Threads'],
  ['/resources', 'Tools'],
];
export function isNavigationCurrent(path, href) {
  return !href.includes('?') && (
    path === href || (href !== '/' && path.startsWith(href + '/')) ||
    (href === '/categories' && (path === '/discover' || path === '/launch-template' || path.startsWith('/projects/'))) ||
    (href === '/shop' && ['/membership', '/products', '/promote', '/founding-members'].includes(path))
  );
}
// Footer: the same destinations as the header and menu, plus account pages and socials.
export const footerGroups = [
  { title: 'Explore', links: [...primaryLinks.filter(([href]) => href !== '/account'), ['/discover', 'Directory']] },
  { title: 'For makers', links: [
    ['/submit-project', 'New Launch'], ['/account', 'Dashboard'], ['/notifications', 'Notifications'],
    ['/saved', 'Saved items'], ['/badges', 'Embed badges'],
  ] },
  { title: 'Company', links: [
    ['/about', 'About'], ['/privacy', 'Privacy'], ['/terms', 'Terms'],
  ] },
  { title: 'Follow', links: [
    ['https://x.com/digivatedx', 'X'],
    ['https://www.pinterest.com/digivated/', 'Pinterest'],
  ] },
];
