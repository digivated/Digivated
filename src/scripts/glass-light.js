// Progressive specular lighting; does not alter navigation, form, or card state.
const surfaces = '.project-card,.resource-card,.gumroad-card,.product-feature,.login-panel,.project-account-card,.submission-form,.wall-focus-panel,.home-featured-card,.wall-tile,.home-editorial-actions .button.primary';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const fineHover = matchMedia('(hover: hover) and (pointer: fine)');
let current = null, frame = 0, x = 0, y = 0;
const enabled = () => fineHover.matches && !reducedMotion.matches && !document.hidden;

function clear() {
  cancelAnimationFrame(frame);
  frame = 0;
  if (current) {
    current.removeAttribute('data-glass-active');
    current.style.removeProperty('--glass-x');
    current.style.removeProperty('--glass-y');
    current = null;
  }
}

function paint() {
  frame = 0;
  if (!enabled() || !current?.isConnected) { clear(); return; }
  const rect = current.getBoundingClientRect();
  if (!rect.width || !rect.height) { clear(); return; }
  const percent = (position, start, size) => `${Math.max(0, Math.min(100, (position - start) / size * 100))}%`;
  current.style.setProperty('--glass-x', percent(x, rect.left, rect.width));
  current.style.setProperty('--glass-y', percent(y, rect.top, rect.height));
  current.dataset.glassActive = 'true';
}

document.addEventListener('pointermove', event => {
  if (!enabled() || event.pointerType === 'touch') { clear(); return; }
  const target = event.target instanceof Element ? event.target.closest(surfaces) : null;
  if (target !== current) { clear(); current = target; }
  if (!current) return;
  x = event.clientX; y = event.clientY;
  if (!frame) frame = requestAnimationFrame(paint);
}, { passive: true });

document.addEventListener('pointerout', event => {
  if (current && !(event.relatedTarget instanceof Node && current.contains(event.relatedTarget))) clear();
}, { passive: true });
document.addEventListener('pointercancel', clear, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
reducedMotion.addEventListener('change', clear);
fineHover.addEventListener('change', clear);
