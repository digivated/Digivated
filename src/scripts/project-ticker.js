import { createShowcaseCard as createCard } from './project-showcase-card.js';

for (const reel of document.querySelectorAll('[data-project-ticker]')) {
  const rail = reel.querySelector('[data-reel-window]');
  const track = reel.querySelector('[data-ticker-track]');
  const toggle = reel.querySelector('[data-reel-pause]');
  const status = reel.querySelector('[data-reel-status]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 760px)');
  let paused = false, hovering = false, focused = false, touching = false, visible = false, pageScrolling = false, scrollTimer;
  let frame = 0, last = 0, position = 0, groupWidth = 0, ready = false;
  const canMove = () => ready && !paused && !hovering && !focused && !touching && !pageScrolling && visible && !document.hidden && !reduced.matches && !mobile.matches;
  function tick(time) {
    frame = 0;
    if (!canMove()) return;
    const elapsed = last ? Math.min(40, time - last) : 0;
    last = time;
    if (groupWidth > 0) { position = (position + elapsed * 0.043) % groupWidth; rail.scrollLeft = position; }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    const moving = canMove();
    reel.dataset.moving = String(moving);
    reel.dataset.paused = String(paused || reduced.matches || mobile.matches);
    toggle.disabled = reduced.matches || mobile.matches || !ready;
    toggle.setAttribute('aria-pressed', String(paused || reduced.matches || mobile.matches));
    toggle.setAttribute('aria-label', mobile.matches ? 'Swipe or use arrows to browse projects' : reduced.matches ? 'Automatic motion disabled by your preferences' : paused ? 'Play project reel' : 'Pause project reel');
    reel.querySelector('[data-reel-pause-icon]').hidden = paused || reduced.matches || mobile.matches;
    reel.querySelector('[data-reel-play-icon]').hidden = !paused && !reduced.matches && !mobile.matches;
    status.textContent = mobile.matches ? 'Swipe to explore projects.' : reduced.matches ? 'Browse at your own pace.' : paused ? 'Take a closer look.' : 'Good things are being built.';
    if (!moving) { cancelAnimationFrame(frame); frame = 0; last = 0; }
    else if (!frame) { last = 0; position = rail.scrollLeft; frame = requestAnimationFrame(tick); }
  }
  toggle.addEventListener('click', () => { paused = !paused; sync(); });
  const step = direction => {
    paused = true; sync();
    if (groupWidth && rail.scrollLeft >= groupWidth) rail.scrollLeft %= groupWidth;
    if (direction < 0 && rail.scrollLeft < 1 && groupWidth > 0) rail.scrollLeft = groupWidth;
    rail.scrollBy({ left: direction * (matchMedia('(max-width: 600px)').matches ? 210 : 256), behavior: reduced.matches ? 'auto' : 'smooth' });
  };
  reel.querySelector('[data-reel-previous]').addEventListener('click', () => step(-1));
  reel.querySelector('[data-reel-next]').addEventListener('click', () => step(1));
  rail.addEventListener('keydown', event => {
    if (event.target === rail && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  rail.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; sync(); } });
  rail.addEventListener('pointerleave', () => { hovering = false; sync(); });
  rail.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') paused = true; touching = true; sync(); });
  window.addEventListener('pointerup', () => { touching = false; sync(); }, { passive: true });
  window.addEventListener('pointercancel', () => { touching = false; sync(); }, { passive: true });
  rail.addEventListener('focusin', () => { focused = true; sync(); });
  rail.addEventListener('focusout', event => { if (!rail.contains(event.relatedTarget)) { focused = false; sync(); } });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  mobile.addEventListener('change', sync);
  window.addEventListener('scroll', () => {
    if (!visible || mobile.matches) return;
    if (!pageScrolling) { pageScrolling = true; sync(); }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { pageScrolling = false; sync(); }, 180);
  }, { passive: true });
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { rootMargin: '80px' });
  observer.observe(reel);

  async function load() {
    const projects = [], seen = new Set(), offsets = new Set();
    let offset = 0;
    do {
      if (offsets.has(offset)) throw Error('Repeated page');
      offsets.add(offset);
      const response = await fetch(`/api/projects?offset=${encodeURIComponent(offset)}`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error('Projects unavailable');
      const page = await response.json();
      for (const project of page.items || []) {
        if (!project.id || !project.name || seen.has(project.id) || !['approved', 'featured'].includes(project.status)) continue;
        seen.add(project.id); projects.push(project);
      }
      offset = page.next;
    } while (offset != null);
    if (!projects.length) { reel.hidden = true; return; }
    const group = document.createElement('div'); group.className = 'project-reel-group';
    projects.forEach((project, index) => group.append(createCard(project, index)));
    // Tiny catalogues still fill the viewport; only the originals are tab stops.
    const repeats = Math.max(1, Math.ceil((rail.clientWidth + 280) / (projects.length * 210)));
    for (let repeat = 1; repeat < repeats; repeat++) projects.forEach((project, index) => group.append(createCard(project, index, true)));
    const clone = group.cloneNode(true); clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('a').forEach(link => { link.tabIndex = -1; link.setAttribute('aria-hidden', 'true'); });
    // Cloning DOM does not clone image error listeners.
    clone.querySelectorAll('img').forEach(image => image.addEventListener('error', () => image.remove(), { once: true }));
    track.replaceChildren(group, clone);
    groupWidth = group.getBoundingClientRect().width;
    new ResizeObserver(() => { groupWidth = group.getBoundingClientRect().width; }).observe(group);
    reel.querySelector('[data-reel-count]').textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} in the mix`;
    reel.dataset.ready = 'true'; ready = projects.length > 1;
    sync();
  }
  load().catch(() => {
    reel.hidden = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
  });
}
