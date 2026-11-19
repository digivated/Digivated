// Canonical public destinations shared by the header and footer.
const exploreLinks = [
  ['/', 'Launches'],
  ['/discover', 'Products'],
  ['/threads', 'Threads'],
  ['/news', 'News'],
  ['/rankings', 'Rankings'],
  ['/winners', 'Weekly winners'],
  ['/resources', 'Resources'],
  ['/invstr', 'Market Scanner'],
];
// The header bar keeps the five places people use most; the rest lives in the menu.
export const primaryLinks = [
  ['/', 'Launches'],
  ['/discover', 'Products'],
  ['/rankings', 'Rankings'],
  ['/threads', 'Threads'],
  ['/news', 'News'],
];
// The menu holds what the bar doesn't: two short groups, makers first. When the
// bar is hidden, its five destinations show as a row of tabs at the top instead.
export const menuGroups = [
  { title: 'For makers', links: [['/submit-project', 'Submit a project'], ['/shop', 'Shop'], ['/points', 'Feedback points'], ['/badges', 'Embed badges']] },
  { title: 'Explore', links: [['/winners', 'Weekly winners'], ['/resources', 'Resources'], ['/invstr', 'Market Scanner']] },
];
export const menuLinks = [...primaryLinks, ...menuGroups.flatMap(group => group.links)];
// Footer: the same destinations as the header and menu, plus account pages and socials.
export const footerGroups = [
  { title: 'Explore', links: exploreLinks },
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
