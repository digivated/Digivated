import { createShowcaseCard as createCard } from './project-showcase-card.js';

for (const reel of document.querySelectorAll('[data-project-ticker]')) {
  const rail = reel.querySelector('[data-reel-window]');
  const track = reel.querySelector('[data-ticker-track]');
  const toggle = reel.querySelector('[data-reel-pause]');
  const status = reel.querySelector('[data-reel-status]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false, hovering = false, focused = false, touching = false, visible = false;
  let groupWidth = 0, ready = false, motion = null;
  const speed = 32;
  const canMove = () => ready && !paused && !hovering && !focused && !touching && visible && !document.hidden && !reduced.matches;
  function position() {
    if (!motion || !groupWidth) return rail.scrollLeft;
    return ((Number(motion.currentTime) || 0) / 1000 * speed) % groupWidth;
  }
  function manual() {
    const offset = position();
    motion?.cancel(); motion = null;
    rail.scrollLeft = offset;
  }
  function sync() {
    const moving = canMove();
    reel.dataset.moving = String(moving);
    reel.dataset.paused = String(paused || reduced.matches);
    toggle.disabled = reduced.matches || !ready;
    toggle.setAttribute('aria-pressed', String(paused || reduced.matches));
    toggle.setAttribute('aria-label', reduced.matches ? 'Automatic motion disabled by your preferences' : paused ? 'Play project reel' : 'Pause project reel');
    reel.querySelector('[data-reel-pause-icon]').hidden = paused || reduced.matches;
    reel.querySelector('[data-reel-play-icon]').hidden = !paused && !reduced.matches;
    status.textContent = reduced.matches ? 'Browse at your own pace.' : paused ? 'Take a closer look.' : 'Explore independent projects.';
    if (reduced.matches) { manual(); return; }
    if (moving && !motion && groupWidth && track.animate) {
      const offset = rail.scrollLeft % groupWidth;
      rail.scrollLeft = 0;
      motion = track.animate([{transform:'translateX(0)'},{transform:`translateX(-${groupWidth}px)`}], {duration:groupWidth / speed * 1000,iterations:Infinity,easing:'linear'});
      motion.currentTime = offset / speed * 1000;
    }
    if (motion) { if (moving) motion.play(); else motion.pause(); }
  }
  toggle.addEventListener('click', () => { paused = !paused; sync(); });
  const step = direction => {
    paused = true; manual(); sync();
    if (direction < 0 && rail.scrollLeft < 1 && groupWidth > 0) rail.scrollLeft = groupWidth;
    rail.scrollBy({left:direction * 280,behavior:reduced.matches?'auto':'smooth'});
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
  rail.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') { paused = true; manual(); } touching = true; sync(); });
  window.addEventListener('pointerup', () => { touching = false; sync(); }, { passive: true });
  window.addEventListener('pointercancel', () => { touching = false; sync(); }, { passive: true });
  rail.addEventListener('focusin', () => { focused = true; manual(); sync(); });
  rail.addEventListener('focusout', event => { if (!rail.contains(event.relatedTarget)) { focused = false; sync(); } });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
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
    new ResizeObserver(() => { manual(); groupWidth = group.getBoundingClientRect().width; sync(); }).observe(group);
    reel.querySelector('[data-reel-count]').textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} in the mix`;
    reel.dataset.ready = 'true'; ready = projects.length > 1;
    sync();
  }
  load().catch(() => {
    reel.hidden = true;
    motion?.cancel();
    observer.disconnect();
  });
}
