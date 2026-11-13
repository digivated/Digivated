// Canonical public destinations shared by the header and footer.
const exploreLinks = [
  ['/discover', 'Browse projects'],
  ['/creators', 'Creator Hub'],
  ['/news', 'News'],
  ['/resources', 'Resources'],
  ['/rankings', 'Rankings'],
];
export const primaryLinks = [
  ...exploreLinks.slice(0, 3),
  ['/submit-project', 'Share a project'],
];
export const menuLinks = [
  ...primaryLinks,
  ...exploreLinks.slice(3),
  ['/membership', 'Membership'],
];
export const footerGroups = [
  { title: 'Explore', links: exploreLinks },
  { title: 'Your workspace', links: [
    ['/submit-project', 'Submit a project'], ['/account', 'Your projects'],
    ['/saved', 'Saved items'], ['/inbox', 'Inbox'], ['/notifications', 'Notifications'], ['/membership', 'Membership'],
  ] },
  { title: 'Digivated', links: [
    ['/about', 'About'], ['/privacy', 'Privacy & Data'], ['/terms', 'Terms of Use'],
  ] },
  { title: 'Connect', links: [
    ['https://x.com/digivatedx', 'X'],
    ['https://www.threads.com/@digivated', 'Threads'],
    ['https://www.instagram.com/digivated/', 'Instagram'],
    ['https://www.pinterest.com/digivated/', 'Pinterest'],
  ] },
];
