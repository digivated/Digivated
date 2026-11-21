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
  const colorFields = [
    { x: .80, y: .42, radius: .42, color: '#9082dd27' },
    { x: .69, y: .70, radius: .35, color: '#efac8d32' },
    { x: .93, y: .60, radius: .44, color: '#7b8ad527' },
  ];
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
    const ratio = .65;
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

    for (const [index, field] of colorFields.entries()) {
      const phase = elapsed * .64 + index * 1.9;
      const radius = height * field.radius;
      const x = field.x * width + Math.sin(phase) * 14 + offsetX * (index + 1);
      const y = field.y * height + Math.cos(phase) * 10 + offsetY * (index + 1);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, field.color);
      gradient.addColorStop(1, 'transparent');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

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
