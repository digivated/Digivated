import '../styles/experience-motion.css';

const main = document.querySelector('main#main');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const connection = navigator.connection;
const headings = [...(main?.querySelectorAll('h1, [role="heading"][aria-level="1"]') || [])].slice(0, 2);
const sectionTitles = main?.querySelectorAll('[data-section-reveal] > h2, [data-section-reveal] > header > h2') || [];
const subheads = [...(main?.querySelectorAll('h2:not(.sr-only):not([hidden])') || [])].slice(0, 10);
const introSelector = '.dg-hero-copy, .page-intro, .page-heading, .news-masthead, .dg-forum-header, .creator-social-heading, .login-heading, .membership-heading, .invstr-heading';
const copySelector = '.lede, .dg-hero-lede, .news-intro, [data-forum-description], .login-heading > p:not(.eyebrow)';

const easing = getComputedStyle(document.documentElement).getPropertyValue('--dg-motion-ease').trim() || 'ease-out';
const cues = new Map();
for (const heading of headings) {
  cues.set(heading, { duration: 420, offset: 6 });
  const intro = heading.closest(introSelector);
  const lede = intro?.querySelector(copySelector);
  if (lede) cues.set(lede, { duration: 420, offset: 4, delay: 45 });
}
for (const heading of new Set([...subheads, ...sectionTitles])) {
  cues.set(heading, { duration: 360, offset: 4 });
}
for (const scene of document.querySelectorAll('[data-motion-scene]')) cues.set(scene, null);

const active = new Map();
let observer;
let running = false;

const allowed = () => !preference.matches && !connection?.saveData && !document.hidden;

function finish(element) {
  const animation = active.get(element);
  if (!animation) return;
  active.delete(element);
  animation.cancel();
}

// A page that arrives through the page transition already moves as a whole; its first screen
// should not animate a second time underneath it.
const arrivedSettling = () => { const at = document.documentElement.getAttribute('data-vt-arrived'); return at !== null && performance.now() - Number(at) < 900; };

function reveal(element) {
  if (!allowed() || !cues.has(element)) return;
  const cue = cues.get(element);
  cues.delete(element);
  observer?.unobserve(element);
  if (!cue) {
    element.dataset.motionEntered = '';
    return;
  }
  if (arrivedSettling()) return;
  if (!element.animate || element.contains(document.activeElement)) return;
  // Keep a readable starting pose. Leaving the page or focusing a control restores it instantly.
  try {
    const animation = element.animate([
      { opacity: .9, translate: `0 ${cue.offset}px` },
      { opacity: 1, translate: '0 0' },
    ], { duration: cue.duration, delay: cue.delay, fill: 'backwards', easing });
    animation.id = 'digivated-content-entrance';
    active.set(element, animation);
    animation.finished.then(() => finish(element), () => {
      if (active.get(element) === animation) active.delete(element);
    });
  } catch { /* Static content is always available. */ }
}

function stop() {
  running = false;
  document.documentElement.removeAttribute('data-motion-ready');
  observer?.disconnect();
  for (const element of active.keys()) finish(element);
}

function sync() {
  if (!allowed()) {
    stop();
    return;
  }
  running = true;
  document.documentElement.setAttribute('data-motion-ready', '');

  if (!observer && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
    }, { rootMargin: '0px 0px -7% 0px' });
  }
  for (const element of cues.keys()) {
    const bounds = element.getBoundingClientRect();
    if (bounds.height && bounds.bottom <= 0) {
      cues.delete(element);
      continue;
    }
    if (bounds.height && bounds.top < innerHeight * .93) reveal(element);
    else observer?.observe(element);
  }
}

preference.addEventListener('change', sync);
connection?.addEventListener('change', sync);
document.addEventListener('visibilitychange', sync);
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', event => { if (event.persisted) sync(); });
document.addEventListener('focusin', event => {
  for (const element of active.keys()) if (element.contains(event.target)) finish(element);
});
sync();
