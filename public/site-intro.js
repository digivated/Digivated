(() => {
  const root = document.documentElement;
  const key = 'digivated:intro:v1';
  try {
    if (sessionStorage.getItem(key) ||
        matchMedia('(prefers-reduced-motion: reduce)').matches ||
        navigator.connection?.saveData ||
        /^(?:\/login|\/account|\/inbox)(?:\/|$)/.test(location.pathname) ||
        location.hash.includes('access_token=') ||
        ['back_forward', 'reload'].includes(performance.getEntriesByType('navigation')[0]?.type)) return;
    sessionStorage.setItem(key, '1');
    root.dataset.siteIntro = 'show';
  } catch { return; }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const intro = document.getElementById('site-intro');
    if (!intro) { delete root.dataset.siteIntro; return; }
    intro.classList.add('leaving');
    setTimeout(() => { delete root.dataset.siteIntro; intro.remove(); }, document.hidden ? 0 : 260);
  };
  document.addEventListener('DOMContentLoaded', () => setTimeout(finish, 560), { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  window.addEventListener('pageshow', event => { if (event.persisted) finish(); }, { once: true });
  setTimeout(finish, 1800);
})();
