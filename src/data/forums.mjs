// Topic forums for Threads. Product discussions live on each project page.
export const forums = [
  { slug: 'general', name: 'General', glyph: '#', description: 'Talk tech, products, startups and building in public.' },
  { slug: 'feedback', name: 'Ask for feedback', glyph: '?', description: 'Share what you are building and get honest, useful feedback.' },
  { slug: 'show', name: 'Show your build', glyph: '>', description: 'Launches, milestones and updates on your project.' },
  { slug: 'introductions', name: 'Introduce yourself', glyph: '@', description: 'New here? Say hi and tell everyone what you are working on.' },
  { slug: 'help', name: 'Digivated help', glyph: '!', description: 'Questions about launching, spots, badges and your account.' },
];
export const forumBySlug = Object.fromEntries(forums.map(forum => [forum.slug, forum]));
export const THREAD_TITLE_MIN = 8;
export const THREAD_TITLE_MAX = 120;
export const THREAD_BODY_MAX = 4000;
export const COMMENT_MAX = 1500;

export function threadSlug(title, id) {
  const base = String(title).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/g, '');
  return `${base || 'thread'}-${String(id).slice(0, 8)}`;
}
