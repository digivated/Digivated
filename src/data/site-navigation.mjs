// The bar holds the main destinations. On smaller screens they move into the menu.
export const primaryLinks = [
  ['/', 'Launches'],
  ['/categories', 'Categories'],
  ['/threads', 'Threads'],
  ['/news', 'News'],
];
const moreExploreLinks = [
  ['/discover', 'Directory'],
  ['/resources', 'Resources'],
  ['/winners', 'Weekly winners'],
  ['/invstr', 'For Investors'],
];
export const menuGroups = [
  { label: 'Explore', links: moreExploreLinks },
  { label: 'For makers', links: [
    ['/points', 'Feedback points'],
    ['/badges', 'Embed badges'],
    ['/shop', 'Shop'],
  ] },
];
export function isNavigationCurrent(path, href) {
  return !href.includes('?') && (
    path === href || (href !== '/' && path.startsWith(href + '/')) ||
    (href === '/discover' && (path === '/launch-template' || path.startsWith('/projects/'))) ||
    (href === '/shop' && ['/membership', '/products', '/promote', '/founding-members'].includes(path))
  );
}
export const menuLinks = menuGroups.flatMap(group => group.links);
// Footer: the same destinations as the header and menu, plus account pages and socials.
export const footerGroups = [
  { title: 'Explore', links: [...primaryLinks, ['/discover', 'All products']] },
  { title: 'For makers', links: [
    ['/submit-project', 'Submit a launch'], ['/account', 'Dashboard'], ['/badges', 'Embed badges'], ['/points', 'Feedback points'],
  ] },
  { title: 'Company', links: [
    ['/about', 'About'], ['/privacy', 'Privacy'], ['/terms', 'Terms'],
  ] },
  { title: 'Follow', links: [
    ['https://x.com/digivatedx', 'X'],
    ['https://www.threads.com/@digivated', 'Threads app'],
    ['https://www.instagram.com/digivated/', 'Instagram'],
    ['https://www.pinterest.com/digivated/', 'Pinterest'],
  ] },
];
