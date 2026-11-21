const header = document.querySelector('[data-site-header]');
const preference = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
let surface;
let pointer;
let frame = 0;

function clear() {
  surface?.removeAttribute('data-reflecting');
  surface = undefined;
  pointer = undefined;
  cancelAnimationFrame(frame);
  frame = 0;
}

function paint() {
  frame = 0;
  if (!surface || !pointer) return;
  const bounds = surface.getBoundingClientRect();
  surface.style.setProperty('--reflection-x', `${pointer.x - bounds.left}px`);
  surface.style.setProperty('--reflection-y', `${pointer.y - bounds.top}px`);
  surface.setAttribute('data-reflecting', '');
}

header?.addEventListener('pointermove', event => {
  if (!preference.matches || event.pointerType === 'touch' || !document.documentElement.hasAttribute('data-motion-ready')) return;
  const next = event.target.closest('[data-nav-reflection]');
  if (surface !== next) clear();
  if (!next) return;
  surface = next;
  pointer = { x: event.clientX, y: event.clientY };
  if (!frame) frame = requestAnimationFrame(paint);
}, { passive: true });

header?.addEventListener('pointerleave', clear);
header?.addEventListener('toggle', clear, true);
preference.addEventListener('change', clear);
window.addEventListener('pagehide', clear);
