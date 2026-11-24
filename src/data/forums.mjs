// Topic forums for Threads. Product discussions live on each project page.
export const forums = [
  { slug: 'general', name: 'General', glyph: '#', icon: 'layers', description: 'Talk tech, products, startups and building in public.', titleHint: 'What do you want to talk about?', bodyHint: 'Share the context. A specific question gets a better answer.' },
  { slug: 'feedback', name: 'Ask for feedback', glyph: '?', icon: 'eye', description: 'Share what you are building and get honest, useful feedback.', titleHint: 'What should people look at?', bodyHint: 'Say what you made, where to look, and what kind of feedback would help.' },
  { slug: 'show', name: 'Show your build', glyph: '>', icon: 'upload', description: 'Launches, milestones and updates on your project.', titleHint: 'What did you ship?', bodyHint: 'Share the update and what you want people to try.' },
  { slug: 'introductions', name: 'Introduce yourself', glyph: '@', icon: 'profile', description: 'New here? Say hi and tell everyone what you are working on.', titleHint: 'Who are you, and what are you building?', bodyHint: 'Say hi and tell people what you are working on.' },
  { slug: 'help', name: 'Digivated help', glyph: '!', icon: 'tool', description: 'Questions about launching, spots, badges and your account.', titleHint: 'What are you trying to do on Digivated?', bodyHint: 'Describe the step you are on and where you got stuck.' },
];
export const forumBySlug = Object.fromEntries(forums.map(forum => [forum.slug, forum]));
export const THREAD_TITLE_MIN = 8;
export const THREAD_TITLE_MAX = 120;
export const THREAD_BODY_MAX = 4000;
export const COMMENT_MAX = 1500;

// Optional composer styles. Stored only when the author picks one.
export const postKinds = [
  { id: '', name: 'Discussion' },
  { id: 'ask', name: 'Ask DG', titleHint: 'Ask DG: what do you want a take on?', bodyHint: 'Say what you want DG and other builders to weigh in on.' },
  { id: 'show', name: 'Show DG', titleHint: 'Show DG: what did you ship?', bodyHint: 'Share what you shipped and what people should try.' },
];

// Clearly labeled prompts. They open the composer. They are not posts.
export const starters = [
  { id: 'feedback-first', forum: 'feedback', title: 'What should I change first on ', label: 'Ask what to change first', detail: 'Opens Ask for feedback with a title started for you.' },
  { id: 'show-shipped', forum: 'show', title: 'I just shipped ', label: 'Share something you shipped', detail: 'Opens Show your build with a title started for you.' },
  { id: 'intro-hello', forum: 'introductions', title: 'Hi, I am building ', label: 'Introduce yourself', detail: 'Opens Introduce yourself with a title started for you.' },
];

export function starterById(id) {
  return starters.find(starter => starter.id === id) || null;
}

export function threadSlug(title, id) {
  const base = String(title).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/g, '');
  return `${base || 'thread'}-${String(id).slice(0, 8)}`;
}
