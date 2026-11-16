// Restrained ASCII motion: headline decode, label typing, nav glyph hover and
// soft section reveals. Text content always ends exactly as authored, screen
// readers get the real text, and nothing runs with reduced motion.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;
  const glyphs = '01<>/\\[]{}=+*#:._-';
  const random = () => glyphs[Math.floor(Math.random() * glyphs.length)];
  const running = new WeakMap();

  // Decode one text node from glyph noise into its real text.
  function decode(node, duration = 700) {
    const target = node.nodeValue;
    if (!target.trim() || running.get(node)) return;
    const start = performance.now();
    running.set(node, true);
    const frame = now => {
      const progress = Math.min(1, (now - start) / duration);
      const settled = Math.floor(progress * target.length);
      let out = target.slice(0, settled);
      for (let i = settled; i < target.length; i++) out += /\s/.test(target[i]) ? target[i] : random();
      node.nodeValue = out;
      if (progress < 1) requestAnimationFrame(frame);
      else { node.nodeValue = target; running.delete(node); }
    };
    requestAnimationFrame(frame);
  }
  const textNodes = el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) if (!walker.currentNode.parentElement?.closest('[data-site-visits-headline],[aria-live]')) nodes.push(walker.currentNode); return nodes;
  };
  const decodeElement = (el, duration) => {
    if (!el || el.closest('[data-no-scramble]')) return;
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    textNodes(el).forEach(node => decode(node, duration));
  };

  // 1. Page headline and its label decode once on load.
  const h1 = document.querySelector('#main h1');
  const label = h1?.closest('header, section, div')?.querySelector('.eyebrow, .home-editorial-kicker');
  requestAnimationFrame(() => { decodeElement(label, 500); decodeElement(h1, 800); });
  label?.classList.add('fl-cursor');

  // 2. Primary navigation re-decodes on hover, like a terminal re-render.
  document.querySelectorAll('.header-primary > a').forEach(link => {
    link.addEventListener('mouseenter', () => textNodes(link).forEach(node => decode(node, 280)));
  });

  // 3. Cards and section blocks rise in as they enter the viewport.
  document.documentElement.classList.add('fl-motion');
  const targets = document.querySelectorAll('#main :is(.fl-card,.fl-project,.free-launch-guide,.home-launch-group,.home-about,.launch-row,.project-card,.home-featured-card)');
  targets.forEach(el => el.setAttribute('data-fl-reveal', ''));
  const show = el => el.classList.add('is-in');
  if (!('IntersectionObserver' in window)) { targets.forEach(show); return; }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { show(entry.target); observer.unobserve(entry.target); }
  }), { rootMargin: '0px 0px -5% 0px' });
  targets.forEach(el => observer.observe(el));
  // Content added later (dashboard cards, feeds) joins the same treatment.
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType !== 1) return;
    const items = node.matches?.('.fl-card,.fl-project,.notification-item') ? [node] : [...node.querySelectorAll?.('.fl-card,.fl-project') || []];
    items.forEach(el => { if (!el.hasAttribute('data-fl-reveal')) { el.setAttribute('data-fl-reveal', ''); observer.observe(el); } });
  }))).observe(document.querySelector('#main') || document.body, { childList: true, subtree: true });
  // Safety: never leave anything hidden.
  setTimeout(() => document.querySelectorAll('[data-fl-reveal]:not(.is-in)').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.top < innerHeight) show(el);
  }), 1500);
})();
