// Canonical public destinations shared by the header and footer.
const exploreLinks = [
  ['/discover', 'Browse projects'],
  ['/creators', 'Creator Hub'],
  ['/news', 'News'],
  ['/resources', 'Resources'],
  ['/rankings', 'Rankings'],
];
// The header bar keeps four destinations; everything else lives in the compact menu.
export const primaryLinks = [
  ['/discover', 'Discover'],
  ['/rankings', 'Rankings'],
  ['/creators', 'Creators'],
  ['/news', 'News'],
];
export const menuGroups = [
  { title: 'Explore', links: [...primaryLinks, ['/resources', 'Resources'], ['/invstr', 'Market Scanner']] },
  { title: 'Build', links: [['/submit-project', 'Submit a project'], ['/submit-project?spot=1', 'Claim a $3 spot'], ['/membership', 'Membership'], ['/badges', 'Embed badges']] },
];
export const menuLinks = menuGroups.flatMap(group => group.links);
export const footerGroups = [
  { title: 'Explore', links: exploreLinks },
  { title: 'Your workspace', links: [
    ['/submit-project', 'Submit a project'], ['/account', 'Your projects'],
    ['/saved', 'Saved items'], ['/inbox', 'Inbox'], ['/notifications', 'Notifications'], ['/badges', 'Embed badges'], ['/membership', 'Membership'],
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
