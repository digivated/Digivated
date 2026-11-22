const header = document.querySelector('[data-site-header]');
const preference = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
let surface;
let target;
let glint;
let frame = 0;
let lastFrame = 0;

function clear() {
  surface?.removeAttribute('data-reflecting');
  surface = undefined;
  target = undefined;
  glint = undefined;
  cancelAnimationFrame(frame);
  frame = 0;
  lastFrame = 0;
}

function paint(now) {
  const ease = lastFrame ? 1 - Math.exp(-(now - lastFrame) / 48) : .25;
  lastFrame = now;
  glint.x += (target.x - glint.x) * ease;
  glint.y += (target.y - glint.y) * ease;
  surface.style.setProperty('--reflection-x', `${glint.x.toFixed(1)}px`);
  surface.style.setProperty('--reflection-y', `${glint.y.toFixed(1)}px`);
  surface.setAttribute('data-reflecting', '');
  if (Math.hypot(target.x - glint.x, target.y - glint.y) > .4) {
    frame = requestAnimationFrame(paint);
  } else {
    frame = 0;
    lastFrame = 0;
  }
}

header?.addEventListener('pointermove', event => {
  if (!preference.matches || event.pointerType === 'touch' || !document.documentElement.hasAttribute('data-motion-ready')) return;
  const next = event.target.closest('[data-nav-reflection]');
  if (surface !== next) clear();
  if (!next) return;
  surface = next;
  const bounds = next.getBoundingClientRect();
  target = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  glint ??= { ...target };
  if (!frame) frame = requestAnimationFrame(paint);
}, { passive: true });

header?.addEventListener('pointerleave', clear);
header?.addEventListener('toggle', clear, true);
preference.addEventListener('change', clear);
window.addEventListener('pagehide', clear);
