/* Page transitions: hand the outgoing page's on-screen position to the incoming page, so the old
   snapshot fades out exactly where it was (and scales around the middle of what was visible). */
(() => {
  const key = 'gm-vt-from';
  const page = () => document.querySelector('.dg-workspace-content');
  addEventListener('pageswap', event => {
    try {
      const el = page();
      if (event.viewTransition && el) sessionStorage.setItem(key, String(Math.round(el.getBoundingClientRect().top)));
      else sessionStorage.removeItem(key);
    } catch {}
  });
  addEventListener('pagereveal', event => {
    let from = null;
    try { from = sessionStorage.getItem(key); sessionStorage.removeItem(key); } catch {}
    const transition = event.viewTransition, root = document.documentElement;
    if (!transition) return;
    root.setAttribute('data-vt-arrived', String(Math.round(performance.now())));
    const el = page();
    if (el && from && /^-?\d+$/.test(from)) {
      const top = Number(from), now = Math.round(el.getBoundingClientRect().top);
      root.style.setProperty('--gm-vt-shift', `${top - now}px`);
      root.style.setProperty('--gm-vt-origin', `50% ${Math.round(innerHeight / 2 - top)}px`);
    }
    const clear = () => {
      root.style.removeProperty('--gm-vt-shift');
      root.style.removeProperty('--gm-vt-origin');
    };
    transition.finished.then(clear, clear);
  });
})();
