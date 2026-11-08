// Progressive, one-shot entrances: content never depends on JavaScript to be visible.
// Only small, static content groups move; the reel, fixed navigation and dialogs
// retain their own positioning, animation and focus behavior.
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const groups = [
  ...document.querySelectorAll('.home-editorial > .home-editorial-kicker,.home-editorial > h1,.home-editorial > p:not(.home-editorial-kicker),.home-editorial > .home-editorial-actions'),
  ...document.querySelectorAll('.home-featured-heading,.project-reel-heading,.page-intro > .eyebrow,.page-intro > h1,.page-intro > .lede'),
];
const pending = new Set(groups);
const active = new Map();
let observer;

function finish(element) {
  const animation = active.get(element);
  if (!animation) return;
  active.delete(element);
  animation.cancel();
}
function reveal(element, delay = 0) {
  if (!pending.delete(element)) return;
  observer?.unobserve(element);
  if (preference.matches || document.hidden || !element.animate || element.contains(document.activeElement)) return;
  // No fill mode or inline opacity: cancellation and failures restore the base UI.
  try {
    const animation = element.animate([
      { opacity: .35, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 480, delay, easing: 'cubic-bezier(.2,.75,.25,1)' });
    animation.id = 'digivated-content-entrance';
    active.set(element, animation);
    animation.finished.then(() => finish(element), () => {
      if (active.get(element) === animation) active.delete(element);
    });
  } catch { /* Keep the unanimated, fully readable baseline. */ }
}
function start() {
  if (preference.matches || document.hidden) return;
  if ('IntersectionObserver' in window && !observer) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
    }, { threshold: .12 });
  }
  let visibleIndex = 0;
  for (const element of pending) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) { pending.delete(element); continue; }
    if (bounds.bottom <= 0) { pending.delete(element); continue; }
    if (bounds.top < innerHeight) reveal(element, Math.min(visibleIndex++ * 45, 135));
    else if (observer) observer.observe(element);
    else pending.delete(element);
  }
}
function stop() {
  observer?.disconnect();
  for (const element of active.keys()) finish(element);
}
preference.addEventListener('change', () => {
  stop();
  if (preference.matches) pending.clear();
  else start();
});
document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
// A control is immediately stable when tabbed to, even during its entrance.
document.addEventListener('focusin', event => {
  for (const element of active.keys()) if (element.contains(event.target)) finish(element);
});
if (preference.matches) pending.clear();
else start();
