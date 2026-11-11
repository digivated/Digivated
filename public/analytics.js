// Public GA4 measurement ID. Run only on the public production hostname.
(() => {
  if (window.location.hostname !== 'digivated.com') return;
  if (document.querySelector('script[data-digivated-analytics]')) return;
  const measurementId = 'G-BRXWQ313J5';
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const safeUrl = value => {
    try { const url = new URL(value); return url.origin + url.pathname; }
    catch { return ''; }
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    page_location: safeUrl(window.location.href),
    page_referrer: safeUrl(document.referrer),
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  // Keep product events intentionally small and free of account, search, or URL data.
  const events = new Set(['project_open', 'project_site_visit', 'project_feedback_open', 'project_submit',
    'membership_checkout', 'membership_verified', 'news_category_select',
    'creator_post_publish', 'creator_reply_publish']);
  const categories = new Set(['all', 'ai-tech', 'markets', 'security']);
  window.digivatedTrack = (name, details = {}) => {
    if (!events.has(name)) return;
    const parameters = {};
    if (typeof details.project_category === 'string' && /^[a-zA-Z0-9 &/+.-]{1,40}$/.test(details.project_category))
      parameters.project_category = details.project_category;
    if (categories.has(details.news_category)) parameters.news_category = details.news_category;
    if (details.media_type === 'image' || details.media_type === 'video' || details.media_type === 'text')
      parameters.media_type = details.media_type;
    window.gtag('event', name, parameters);
  };
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('a,button') : null;
    if (!target) return;
    if (target.matches('a.membership-checkout')) window.digivatedTrack('membership_checkout');
    const card = target.closest('[data-project]');
    if (!card) return;
    const project_category = card.querySelector('.wall-tile-caption small, .wall-focus-category')?.textContent?.trim();
    if (target.matches('.wall-card-open')) window.digivatedTrack('project_open', { project_category });
    if (target.matches('.wall-focus-actions a[target="_blank"]')) window.digivatedTrack('project_site_visit', { project_category });
    if (target.matches('[data-comment-type="project"]')) window.digivatedTrack('project_feedback_open', { project_category });
  }, { capture: true, passive: true });
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
  tag.dataset.digivatedAnalytics = measurementId;
  tag.onload = () => { tag.dataset.loaded = 'true'; };
  document.head.appendChild(tag);
})();
