/* Page loader: if a page or navigation is taking longer than a moment, show a small lattice loader over a soft
   backdrop, and fade it out the instant the page is ready. Fast loads never show it. No effect without JS. */
(() => {
  const SHOW_AFTER = 280, FAILSAFE = 12000;
  const ring = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]];
  const trail = [1, 0.55, 0.3];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let box = null, timer = 0, wait = 0, fail = 0;

  function show() {
    if (box || !document.body) return;
    box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(247,247,250,.78);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;transition:opacity .18s ease;pointer-events:none';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,9px);gap:4px;color:#171717';
    const cells = [];
    for (let i = 0; i < 9; i += 1) {
      const c = document.createElement('span');
      c.style.cssText = 'width:9px;height:9px;border-radius:50%;background:currentColor;opacity:.15;transition:opacity .14s ease';
      cells.push(c); grid.append(c);
    }
    box.append(grid); document.body.append(box);
    requestAnimationFrame(() => { if (box) box.style.opacity = '1'; });
    let tick = 0;
    const paint = () => {
      cells.forEach((c) => { c.style.opacity = '.15'; });
      trail.forEach((o, i) => { const [r, k] = ring[(tick - i + 64) % 8]; cells[r * 3 + k].style.opacity = String(o); });
      tick += 1;
    };
    paint();
    if (!reduce) timer = setInterval(paint, 90);
    fail = setTimeout(hide, FAILSAFE);
  }

  function hide() {
    clearTimeout(wait); clearTimeout(fail); clearInterval(timer);
    const el = box; box = null;
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }

  const arm = () => { clearTimeout(wait); wait = setTimeout(show, SHOW_AFTER); };

  // First load / refresh: only if the page is still being parsed after a moment.
  if (document.readyState === 'loading') {
    arm();
    document.addEventListener('DOMContentLoaded', hide, { once: true });
    addEventListener('load', hide, { once: true });
  }
  // Back/forward cache restores the page as it was left: make sure no loader is left over.
  addEventListener('pageshow', (event) => { if (event.persisted) hide(); });

  // Navigating to another page of the site: start the clock; the page unloads when the next one arrives.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    let url; try { url = new URL(link.href, location.href); } catch { return; }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    arm();
  });
  document.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return;
    const form = event.target;
    if (form instanceof HTMLFormElement && (!form.target || form.target === '_self')) arm();
  });
})();
