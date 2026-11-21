// Keep pointer feedback and live signals independent of the page's first paint.
(() => {
  const doc = document;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  // Pointer spotlight (desktop only). Cheap: two CSS variables per move.
  const SPOT = '.dg-dir-podium-card,.fl-badge-card,.news-card,.resource-card,.dg-thread-row,.launch-row,.dg-row,.dg-spot,.rl-card';
  if (doc.documentElement.dataset.theme !== 'daylight' && !motion.matches && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    doc.addEventListener('pointermove', (event) => {
      if (motion.matches) return;
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
  const signals = [...doc.querySelectorAll('.dg-dot')];
  if (!signals.length) return;
  let tick = 2, interval;
  const paintSignals = () => signals.forEach((dot, i) => { dot.textContent = meter(tick, i * 0.9); });
  const syncSignals = () => {
    clearInterval(interval);
    if (!doc.hidden && !motion.matches) {
      interval = setInterval(() => { tick++; paintSignals(); }, 160);
    }
  };
  paintSignals();
  syncSignals();
  doc.addEventListener('visibilitychange', syncSignals);
  motion.addEventListener('change', syncSignals);
})();
