// Pure helpers for the Threads page. No network and no invented posts.
import { starterById } from '../data/forums.mjs';

const timeValue = value => { const n = Date.parse(value || ''); return Number.isFinite(n) ? n : null; };
const dayStart = now => { const day = new Date(now); day.setHours(0, 0, 0, 0); return day.getTime(); };

export function storyFromToday(items, now = Date.now()) {
  const start = dayStart(now);
  return (Array.isArray(items) ? items : [])
    .filter(story => {
      const published = timeValue(story?.publishedAt);
      return story?.id && story.headline && published !== null && published >= start && published <= now + 300000;
    })
    .sort((a, b) => timeValue(b.publishedAt) - timeValue(a.publishedAt))[0] || null;
}

// A launch counts for today only when its scheduled time is today.
export function launchFromToday(items, now = Date.now()) {
  const start = dayStart(now);
  const end = start + 86400000;
  return (Array.isArray(items) ? items : [])
    .filter(item => {
      const at = timeValue(item?.launchAt);
      return item?.name && at !== null && at >= start && at < end;
    })
    .sort((a, b) => timeValue(b.launchAt) - timeValue(a.launchAt))[0] || null;
}

export function starterPath(id) {
  const starter = starterById(id);
  if (!starter) return '/threads/new';
  return `/threads/new?forum=${encodeURIComponent(starter.forum)}&starter=${encodeURIComponent(starter.id)}`;
}

export function discussPath(newsId) {
  return /^[a-f0-9]{24}$/.test(newsId || '') ? `/threads/new?news=${newsId}` : '';
}
