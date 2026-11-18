// All-time directory: filtering, ordering and section dividers. Pure functions,
// shared by the /discover page script and its tests.
export const DIRECTORY_SORTS = [
  ['top', 'Top'],
  ['new', 'Newest'],
  ['discussed', 'Most discussed'],
  ['needs', 'Needs feedback'],
  ['rising', 'Rising'],
  ['az', 'A–Z'],
];
export const sortKeys = DIRECTORY_SORTS.map(([key]) => key);

const upvotes = p => Number(p?.votes?.all) || 0;
const comments = p => Number(p?.comments) || 0;
const when = p => { const t = Date.parse(p?.publishedAt || p?.date || ''); return Number.isFinite(t) ? t : 0; };
const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' });

export function matchesQuery(project, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${project.name} ${project.creator || ''} ${project.category || ''} ${project.description || ''}`.toLowerCase();
  return words.every(word => text.includes(word));
}

export function filterProjects(projects, { query = '', category = '', featured = false } = {}) {
  return projects.filter(p => (!featured || p.status === 'featured') && (!category || p.category === category) && matchesQuery(p, query));
}

export function sortProjects(projects, sort = 'top') {
  const list = projects.slice();
  const tie = (a, b) => when(b) - when(a) || byName(a, b);
  if (sort === 'new') return list.sort(tie);
  if (sort === 'discussed') return list.sort((a, b) => comments(b) - comments(a) || upvotes(b) - upvotes(a) || tie(a, b));
  // Projects with the fewest comments first, newest first among equals: where feedback helps most.
  if (sort === 'needs') return list.sort((a, b) => comments(a) - comments(b) || tie(a, b));
  if (sort === 'rising') return list.sort((a, b) => (Number(b.rising) || 0) - (Number(a.rising) || 0) || (Number(b.votes?.weekly) || 0) - (Number(a.votes?.weekly) || 0) || tie(a, b));
  if (sort === 'az') return list.sort(byName);
  return list.sort((a, b) => upvotes(b) - upvotes(a) || comments(b) - comments(a) || tie(a, b));
}

// Divider label for a row: month for Newest, first letter for A–Z, none otherwise.
export function sectionLabel(project, sort) {
  if (sort === 'new') { const t = when(project); return t ? new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Earlier'; }
  if (sort === 'az') { const first = String(project.name || '').trim().charAt(0).toUpperCase(); return /[A-Z]/.test(first) ? first : '#'; }
  return '';
}

export function categoryCounts(projects) {
  const counts = new Map();
  for (const p of projects) if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
