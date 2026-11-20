// Shared motion for every public page: pointer spotlight on cards and rows,
// and a gentle reveal for blocks that start below the fold.
// Content is never hidden unless this script is running, and anything already
// on screen at load is left alone, so nothing flashes.
(() => {
  const doc = document;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Pointer spotlight (desktop only). Cheap: two CSS variables per move.
  const SPOT = '.dg-dir-podium-card,.fl-badge-card,.news-card,.resource-card,.dg-thread-row,.launch-row,.dg-row,.dg-spot,.rl-card';
  if (!reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    doc.addEventListener('pointermove', (event) => {
      const el = event.target instanceof Element && event.target.closest(SPOT);
      if (!el) return;
      const box = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${event.clientX - box.left}px`);
      el.style.setProperty('--my', `${event.clientY - box.top}px`);
    }, { passive: true });
  }

  // Live signal: every .dg-dot is a tiny ASCII level meter (▁▂▃▄▅▆▇█).
  const LEVELS = '▁▂▃▄▅▆▇█';
  const meter = (t, seed) => [0, 1, 2].map(k => {
    const wave = Math.sin(t * 0.55 + k * 1.15 + seed) * (0.62 + 0.38 * Math.sin(t * 0.17 + k + seed));
    return LEVELS[Math.max(0, Math.min(7, Math.round(3.5 + 3.5 * wave)))];
  }).join('');
  const paintSignals = t => document.querySelectorAll('.dg-dot').forEach((dot, i) => { dot.textContent = meter(t, i * 0.9); });
  paintSignals(2);
  if (!reduced) {
    let tick = 2;
    setInterval(() => { if (!document.hidden) paintSignals(++tick); }, 120);
  }

  const setHeroHeight = () => {
  };

  const start = () => {
    setHeroHeight();
    addEventListener('resize', setHeroHeight, { passive: true });
    if (reduced || !('IntersectionObserver' in window)) return;

    // Blocks that reveal. Launch rows (.dg-row) and spots already animate themselves.
    const REVEAL = [
      'main .dg-list-head', 'main .dg-fp', 'main .dg-rising', 'main .dg-dir-podium-item',
      'main .fl-badge-card', 'main .news-card', 'main .resource-card', 'main .launch-row',
      'main .dg-points-faq > *', 'main .shop-card', 'main .membership-faq details', 'main .rl-top', 'main .membership-benefits > *', 'main .dg-forum-list > *',
      'footer .footer-columns > *'
    ].join(',');

    doc.documentElement.classList.add('dg-motion');
    const io = new IntersectionObserver((entries) => {
      let n = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        io.unobserve(el);
        el.style.setProperty('--rv-d', `${Math.min(n++, 6) * 60}ms`);
        el.classList.add('dg-in');
        const done = (event) => {
          if (event && event.target !== el) return; // ignore animations inside the block
          el.removeEventListener('animationend', done);
          el.classList.remove('dg-rv', 'dg-in');
          el.style.removeProperty('--rv-d');
        };
        el.addEventListener('animationend', done);
        setTimeout(done, 1400); // safety net if animations are disabled
      }
    }, { rootMargin: '0px 0px -24px 0px', threshold: 0 });

    const seen = new WeakSet();
    const scan = (root) => {
      const fold = innerHeight;
      const list = root.matches?.(REVEAL) ? [root] : [];
      for (const el of root.querySelectorAll?.(REVEAL) || []) list.push(el);
      for (const el of list) {
        if (seen.has(el)) continue;
        seen.add(el);
        const top = el.getBoundingClientRect().top;
        if (top < fold || !(el.checkVisibility ? el.checkVisibility() : el.offsetHeight)) continue; // already visible or hidden: leave it
        el.classList.add('dg-rv');
        io.observe(el);
      }
    };
    scan(doc);

    // Lists that render after load (launches, directory, threads).
    const main = doc.querySelector('main') || doc.body;
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
    }).observe(main, { childList: true, subtree: true });

    // Never leave anything hidden: before printing, or if the tab was backgrounded.
    const revealAll = () => { for (const el of doc.querySelectorAll('.dg-rv')) el.classList.remove('dg-rv', 'dg-in'); };
    addEventListener('beforeprint', revealAll);
    addEventListener('pagehide', revealAll);
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
