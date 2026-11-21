// Progressive enhancement for the homepage artwork. Links and the image are
// available at first paint, even when the browser skips motion.
const hero = document.querySelector('[data-discovery-hero]');
const canvas = hero?.querySelector('[data-discovery-lights]');
const context = canvas?.getContext('2d');

if (hero && context && "IntersectionObserver" in window && "ResizeObserver" in window) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const introDuration = 3600;
  const responseDuration = 650;
  const points = Array.from({ length: 58 }, (_, i) => ({
    x: .33 + Math.random() * .65,
    y: .36 + Math.random() * .63,
    depth: .25 + Math.random() * .75,
    phase: Math.random() * Math.PI * 2,
    tint: i % 3,
  }));
  const colors = ['#f4efce', '#bacce7', '#c2dfc7'];
  const pointer = { x: .65, y: .55, active: false };
  let width = 0;
  let height = 0;
  let frame = 0;
  let visible = false;
  let introduced = false;
  let settleAt = 0;
  let elapsed = 0;
  let lastTime = 0;
  let offsetX = 0;
  let offsetY = 0;
  let scrollProgress = 0;

  function allowed() {
    return !motion.matches && !navigator.connection?.saveData && !document.hidden;
  }

  function stop(clear = false) {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (clear) {
      context.clearRect(0, 0, width, height);
      hero.style.removeProperty('--field-x');
      hero.style.removeProperty('--field-y');
    }
  }

  function wake(duration = responseDuration) {
    if (!visible || !allowed()) return;
    settleAt = Math.max(settleAt, performance.now() + duration);
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function resize() {
    width = hero.clientWidth;
    height = hero.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    wake();
  }

  function paint(now) {
    frame = 0;
    if (!visible || !allowed()) return;
    elapsed += lastTime ? Math.min(now - lastTime, 32) / 1000 : 0;
    lastTime = now;

    const targetX = pointer.active ? (pointer.x - .5) * 12 : Math.sin(elapsed * .7) * 3;
    const targetY = (pointer.active ? (pointer.y - .5) * 8 : 0) + scrollProgress * 7;
    offsetX += (targetX - offsetX) * .075;
    offsetY += (targetY - offsetY) * .075;
    hero.style.setProperty('--field-x', offsetX.toFixed(2) + 'px');
    hero.style.setProperty('--field-y', offsetY.toFixed(2) + 'px');
    context.clearRect(0, 0, width, height);

    const mobile = width < 600;
    const influence = Math.min(width, height) * .27;
    const count = mobile ? 32 : points.length;
    for (let i = 0; i < count; i++) {
      const light = points[i];
      const wave = Math.sin(elapsed * .9 + light.phase);
      let x = (mobile ? (light.x - .33) * 1.4 : light.x) * width;
      let y = (mobile ? .39 + light.y * .56 : light.y) * height;
      x += wave * 4 + offsetX * light.depth;
      y += Math.cos(elapsed * .65 + light.phase) * 3 + offsetY * light.depth;

      let strength = 0;
      if (pointer.active) {
        const dx = x - pointer.x * width;
        const dy = y - pointer.y * height;
        const distance = Math.hypot(dx, dy);
        strength = Math.max(0, 1 - distance / influence);
        const push = strength * 17 / Math.max(distance, 1);
        x += dx * push;
        y += dy * push;
      }

      const radius = .45 + light.depth * 1.05;
      context.fillStyle = colors[light.tint];
      context.globalAlpha = .14 + light.depth * .16 + wave * .08 + strength * .3;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha *= .18;
      context.beginPath();
      context.arc(x, y, radius * 2.9, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    if (now < settleAt) frame = requestAnimationFrame(paint);
    else lastTime = 0;
  }

  hero.addEventListener('pointermove', event => {
    if (!finePointer.matches || event.pointerType !== 'mouse' || !allowed()) return;
    const bounds = hero.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left) / bounds.width;
    pointer.y = (event.clientY - bounds.top) / bounds.height;
    pointer.active = true;
    wake();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { pointer.active = false; wake(); });
  window.addEventListener('scroll', () => {
    if (!visible || !allowed()) return;
    scrollProgress = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / height));
    wake();
  }, { passive: true });
  motion.addEventListener('change', () => motion.matches ? stop(true) : wake());
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : wake());
  window.addEventListener('pagehide', () => stop());
  window.addEventListener('pageshow', event => { if (event.persisted) wake(); });
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) stop();
    else {
      wake(introduced ? responseDuration : introDuration);
      introduced = true;
    }
  }).observe(hero);
}
