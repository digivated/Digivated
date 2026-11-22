// The bar holds the main destinations. On smaller screens they move into the menu.
export const primaryLinks = [
  ['/', 'Launches'],
  ['/discover', 'Directory'],
  ['/threads', 'Threads'],
];
const moreExploreLinks = [
  ['/news', 'News'],
  ['/winners', 'Weekly winners'],
  ['/resources', 'Resources'],
  ['/invstr', 'For Investors'],
];
export const menuGroups = [
  { label: 'Explore', links: moreExploreLinks },
  { label: 'For makers', links: [
    ['/badges', 'Embed badges'],
    ['/points', 'Feedback points'],
    ['/shop', 'Shop'],
  ] },
];
export const menuLinks = menuGroups.flatMap(group => group.links);
// Footer: the same destinations as the header and menu, plus account pages and socials.
export const footerGroups = [
  { title: 'Explore', links: [...primaryLinks, ...moreExploreLinks] },
  { title: 'For makers', links: [
    ['/submit-project', 'Submit a project'], ['/points', 'Feedback points'], ['/account', 'Your projects'], ['/saved', 'Saved items'],
    ['/inbox', 'Inbox'], ['/badges', 'Embed badges'], ['/shop', 'Shop'],
  ] },
  { title: 'Digivated', links: [
    ['/about', 'About'], ['/privacy', 'Privacy'], ['/terms', 'Terms'],
  ] },
  { title: 'Follow', links: [
    ['https://x.com/digivatedx', 'X'],
    ['https://www.threads.com/@digivated', 'Threads app'],
    ['https://www.instagram.com/digivated/', 'Instagram'],
    ['https://www.pinterest.com/digivated/', 'Pinterest'],
  ] },
];
