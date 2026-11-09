// Canonical public destinations shared by the header and footer.
export const primaryLinks = [
  ['/discover', 'Projects'],
  ['/creators', 'Creators'],
  ['/news', 'News'],
  ['/resources', 'Resources'],
  ['/rankings', 'Rankings'],
];
export const menuLinks = [
  ...primaryLinks,
  ['/membership', 'Membership'],
  ['/submit-project', 'Submit a project'],
];
export const footerGroups = [
  { title: 'Explore', links: primaryLinks },
  { title: 'Your workspace', links: [
    ['/submit-project', 'Submit a project'], ['/account', 'Your projects'],
    ['/saved', 'Saved items'], ['/inbox', 'Inbox'], ['/membership', 'Membership'],
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
