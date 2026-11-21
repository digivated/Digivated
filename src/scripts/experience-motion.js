// Progressive, one-shot entrances: content never depends on JavaScript to be visible.
// Individual headings move, so sticky elements, dialogs and form controls
// retain their own positioning and focus behavior.
const main = document.querySelector('main#main');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const headings = [...(main?.querySelectorAll('h1, [role="heading"][aria-level="1"]') || [])].slice(0, 2);
const sections = [...(main?.querySelectorAll('h2:not(.sr-only):not([hidden])') || [])].slice(0, 5);
const sectionTitles = main?.querySelectorAll('[data-section-reveal] > h2, [data-section-reveal] > header > h2') || [];
const groups = new Set([...headings, ...sections, ...sectionTitles]);
const pending = new Set(groups);
const active = new Map();
let observer;

function finish(element) {
  const animation = active.get(element);
  if (!animation) return;
  active.delete(element);
  animation.cancel();
}
function reveal(element) {
  if (!pending.delete(element)) return;
  observer?.unobserve(element);
  if (preference.matches || navigator.connection?.saveData || document.hidden || !element.animate || element.contains(document.activeElement)) return;
  // No fill mode or inline opacity: cancellation and failures restore the base UI.
  try {
    const animation = element.animate([
      { opacity: .91, transform: 'translateY(4px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)' });
    animation.id = 'digivated-content-entrance';
    active.set(element, animation);
    animation.finished.then(() => finish(element), () => {
      if (active.get(element) === animation) active.delete(element);
    });
  } catch { /* Keep the unanimated, fully readable baseline. */ }
}
function start() {
  if (preference.matches || navigator.connection?.saveData || document.hidden) return;
  if ('IntersectionObserver' in window && !observer) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
    }, { threshold: .12 });
  }
  for (const element of pending) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      if (observer) observer.observe(element);
      else pending.delete(element);
      continue;
    }
    if (bounds.bottom <= 0) { pending.delete(element); continue; }
    if (bounds.top < innerHeight) reveal(element);
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
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', event => { if (event.persisted) start(); });
// A control is immediately stable when tabbed to, even during its entrance.
document.addEventListener('focusin', event => {
  for (const element of active.keys()) if (element.contains(event.target)) finish(element);
});
if (preference.matches) pending.clear();
else start();
