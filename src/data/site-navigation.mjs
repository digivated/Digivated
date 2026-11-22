// The bar holds the main destinations. On smaller screens they move into the menu.
export const primaryLinks = [
  ['/submit-project', 'New Launch'],
  ['/', 'Home'],
  ['/discover', 'Directory'],
  ['/account', 'Dashboard'],
  ['/news', 'News'],
  ['/resources', 'Extra Tools'],
];
const moreExploreLinks = [
  ['/categories', 'Categories'],
  ['/threads', 'Threads'],
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
  { title: 'Explore', links: [...primaryLinks.filter(([href]) => !['/submit-project', '/account'].includes(href)), ['/categories', 'Categories'], ['/threads', 'Threads']] },
  { title: 'For makers', links: [
    ['/submit-project', 'New Launch'], ['/account', 'Dashboard'], ['/badges', 'Embed badges'], ['/points', 'Feedback points'],
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
