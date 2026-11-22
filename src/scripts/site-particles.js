const canvas = document.querySelector('canvas[data-site-backdrop]');
const context = canvas?.getContext('2d');

if (context) mountParticles(canvas, context);

function mountParticles(canvas, context) {
  const particleCount = 200;
  const baseSize = 100;
  const cameraDistance = 20;
  const spread = 10;
  const speed = 0.1;
  const twinkle = 0.3;
  const hoverRadius = 140;
  const tau = 2 * Math.PI;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = matchMedia('(forced-colors: active)');
  const touch = matchMedia('(hover: none) and (pointer: coarse)');
  const particles = Array.from({ length: particleCount }, () => {
    const depth = (Math.random() - 0.5) * spread;
    const perspective = cameraDistance / (cameraDistance - depth);
    return {
      x: Math.random(),
      y: Math.random(),
      phase: Math.random() * tau,
      perspective,
      radius: baseSize * perspective * (0.006 + Math.random() * 0.014),
      opacity: 0.38 + Math.random() * 0.2,
    };
  });

  // Reuse the same glow sprite for every particle on the light page surface.
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 24;
  const ink = sprite.getContext('2d');
  if (!ink) return;
  const glow = ink.createRadialGradient(13, 14, 0, 13, 14, 11);
  glow.addColorStop(0, 'rgba(92, 97, 88, 0.85)');
  glow.addColorStop(0.45, 'rgba(92, 97, 88, 0.55)');
  glow.addColorStop(1, 'rgba(92, 97, 88, 0)');
  ink.fillStyle = glow;
  ink.fillRect(0, 0, 24, 24);
  ink.beginPath();
  ink.arc(11, 11, 4, 0, tau);
  ink.fillStyle = '#fff';
  ink.fill();

  let width = 0;
  let height = 0;
  let elapsed = 0;
  let frame = 0;
  let last = 0;
  let pointer = null;
  let burst = null;
  let offsetX = 0;
  let offsetY = 0;

  function draw(still = false) {
    context.clearRect(0, 0, width, height);
    const time = still ? 0 : elapsed * speed / 100;
    const intro = still ? 1 : Math.min(1, elapsed / 700);
    const age = burst ? (elapsed - burst.started) / 550 : 1;
    for (const particle of particles) {
      let x = particle.x * width + Math.sin(particle.phase + time) * 12 * particle.perspective;
      let y = particle.y * height + Math.cos(particle.phase + time) * 9 * particle.perspective;
      if (!still) {
        if (pointer) {
          const influence = Math.max(0, 1 - Math.hypot(pointer.x - x, pointer.y - y) / hoverRadius);
          x += (x - pointer.x) * influence * 0.13;
          y += (y - pointer.y) * influence * 0.13;
        }
        x += offsetX * particle.perspective;
        y += offsetY * particle.perspective;
      }

      context.globalAlpha = intro * particle.opacity * (1 - twinkle * (0.5 + 0.5 * Math.sin(particle.phase + time * 3)));
      const radius = particle.radius;
      context.drawImage(sprite, x - radius * 2, y - radius * 2, radius * 4, radius * 4);
    }

    if (!still && burst && age < 1) {
      context.globalAlpha = (1 - age) * 0.65;
      const reach = 9 + age * 49;
      for (let i = 0; i < 12; i++) {
        const angle = i * tau / 12;
        const x = burst.x + Math.cos(angle) * reach;
        const y = burst.y + Math.sin(angle) * reach;
        context.drawImage(sprite, x - 3, y - 3, 6, 6);
      }
    }
    context.globalAlpha = 1;
  }

  function tick(now) {
    if (!last || now - last >= (touch.matches ? 48 : 38)) {
      elapsed += last ? Math.min(70, now - last) : 16;
      last = now;
      offsetX += ((pointer ? (pointer.x / width - 0.5) * 18 : 0) - offsetX) * 0.12;
      offsetY += ((pointer ? (pointer.y / height - 0.5) * 18 : 0) - offsetY) * 0.12;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function syncMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    if (forcedColors.matches || document.hidden || !width || !height) return;
    if (reducedMotion.matches) draw(true);
    else frame = requestAnimationFrame(tick);
  }

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const scale = Math.min(window.devicePixelRatio || 1, touch.matches ? 1.2 : 1.5);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    syncMotion();
  }

  window.addEventListener('pointermove', event => {
    if (frame && event.pointerType !== 'touch') pointer = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; });
  window.addEventListener('click', event => {
    if (!frame || !event.detail || !(event.target instanceof Element)) return;
    if (event.target.closest('a, button, input, select, textarea, label, summary, dialog, [role="button"], [role="menuitem"], [contenteditable]')) return;
    burst = { x: event.clientX, y: event.clientY, started: elapsed };
  }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    frame = 0;
  });
  window.addEventListener('pageshow', event => { if (event.persisted) syncMotion(); });
  reducedMotion.addEventListener('change', syncMotion);
  forcedColors.addEventListener('change', syncMotion);
  touch.addEventListener('change', resize);
  resize();
}
