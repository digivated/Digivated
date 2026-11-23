import { newsArticleMarkup, newsIdFromPath, newsMissingMarkup, relativeTime } from '../lib/news-story.mjs';

const root = document.querySelector('[data-news-story-root]');

function enhance() {
  const local = new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' });
  for (const time of root.querySelectorAll('time[data-news-time]')) {
    const n = Date.parse(time.dateTime);
    if (Number.isFinite(n)) { time.textContent = local.format(n); time.title = new Date(n).toISOString(); }
  }
  for (const time of root.querySelectorAll('time[data-news-relative]')) {
    const text = relativeTime(time.dateTime);
    if (text) { time.textContent = text; time.title = local.format(Date.parse(time.dateTime)); }
  }
  const share = root.querySelector('[data-news-share]');
  if (share) share.addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    const label = share.querySelector('span');
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title:document.title, url }); return; }
      await navigator.clipboard.writeText(url);
      label.textContent = 'Link copied';
    } catch (error) {
      if (error?.name === 'AbortError') return;
      label.textContent = 'Copy failed';
    }
    setTimeout(() => { label.textContent = 'Copy link'; }, 2200);
    window.digivatedTrack?.('news_story_share', {});
  });
}

async function load() {
  const id = newsIdFromPath(location.pathname);
  if (!id) { root.innerHTML = newsMissingMarkup(404); return; }
  try {
    const response = await fetch('/api/news?id=' + id, { credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(15000) });
    if (!response.ok) { root.innerHTML = newsMissingMarkup(response.status === 404 ? 404 : 503); return; }
    const data = await response.json();
    if (!data?.story?.headline) { root.innerHTML = newsMissingMarkup(404); return; }
    root.innerHTML = newsArticleMarkup(data.story, Array.isArray(data.related) ? data.related : []);
    document.title = `${data.story.headline} · Digivated News`;
    enhance();
  } catch { root.innerHTML = newsMissingMarkup(503); }
}

if (root) {
  if (root.hasAttribute('data-news-story-ready')) enhance();
  else load();
}
