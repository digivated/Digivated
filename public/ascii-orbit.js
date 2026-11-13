(() => {
  const canvas = document.querySelector('[data-ascii-orbit]');
  if (!canvas) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const shades = ' .:-=+*#%@';
  let visible = true;
  let last = 0;
  let frame = 0;

  function draw(time) {
    const columns = window.innerWidth < 600 ? 48 : 76;
    const rows = window.innerWidth < 600 ? 13 : 18;
    const output = [];
    for (let y = 0; y < rows; y++) {
      let line = '';
      for (let x = 0; x < columns; x++) {
        const dx = (x - (columns - 1) / 2) / (columns * .35);
        const dy = (y - (rows - 1) / 2) / (rows * .57);
        const radius = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const ring = Math.exp(-Math.pow((radius - .72) / .16, 2));
        const orbit = .72 + .28 * Math.sin(angle * 4 - time * .00055);
        const sparks = Math.max(0, Math.sin(x * .37 + y * .71 + time * .00035)) * .15;
        const strength = ring * orbit + (ring > .15 ? sparks : 0);
        line += shades[Math.min(shades.length - 1, Math.floor(strength * (shades.length - 1)))];
      }
      output.push(line);
    }
    canvas.textContent = output.join('\n');
  }

  function tick(time) {
    if (!visible || document.hidden || reduced.matches) return;
    if (time - last > 85) { draw(time); last = time; }
    frame = requestAnimationFrame(tick);
  }
  function start() {
    cancelAnimationFrame(frame);
    draw(performance.now());
    if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
  }
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }).observe(canvas);
  reduced.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);
  window.addEventListener('resize', start, { passive: true });
  start();
})();
