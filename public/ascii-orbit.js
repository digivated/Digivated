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
        const tilt = -.32;
        const orbitX = dx * Math.cos(tilt) + dy * Math.sin(tilt);
        const orbitY = -dx * Math.sin(tilt) + dy * Math.cos(tilt);
        const orbitRadius = Math.hypot(orbitX * .82, orbitY * 2.65);
        const band = Math.exp(-Math.pow((orbitRadius - .79) / .09, 2));
        const globe = radius < .44
          ? .18 + .68 * Math.max(0, .55 - dx + Math.sqrt(.194 - radius * radius))
          : 0;
        const drift = .73 + .19 * Math.sin(angle * 3 - time * .00038);
        const ring = globe && orbitY < 0 ? 0 : band * drift;
        const strength = Math.max(globe, ring);
        line += shades[Math.min(shades.length - 1, Math.floor(strength * (shades.length - 1)))];
      }
      output.push(line);
    }
    canvas.textContent = output.join('\n');
  }

  function tick(time) {
    if (!visible || document.hidden || reduced.matches) return;
    if (time - last > 120) { draw(time); last = time; }
    frame = requestAnimationFrame(tick);
  }
  function start() {
    cancelAnimationFrame(frame);
    draw(performance.now());
    if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }).observe(canvas);
  reduced.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);
  window.addEventListener('resize', start, { passive: true });
  start();
})();
