/* Page transitions: remember the middle of what was on screen so the outgoing page scales around it. */
(() => {
  const key = 'gm-vt-origin';
  const main = () => document.querySelector('.dg-workspace-content > #main');
  addEventListener('pageswap', event => {
    try {
      const el = main();
      if (event.viewTransition && el) sessionStorage.setItem(key, String(Math.round(innerHeight / 2 - el.getBoundingClientRect().top)));
      else sessionStorage.removeItem(key);
    } catch {}
  });
  addEventListener('pagereveal', event => {
    let y = null;
    try { y = sessionStorage.getItem(key); sessionStorage.removeItem(key); } catch {}
    const transition = event.viewTransition, root = document.documentElement;
    if (!transition || !y || !/^-?\d+$/.test(y)) return;
    root.style.setProperty('--gm-vt-origin', `50% ${y}px`);
    const clear = () => root.style.removeProperty('--gm-vt-origin');
    transition.finished.then(clear, clear);
  });
})();
