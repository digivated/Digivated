import { cardIconMarkup } from '../lib/card-icons.mjs';
import { observeProjectViews, viewLabel } from './project-views.js';
import { createShowcaseCard } from './project-showcase-card.js';

const section = document.querySelector('[data-home-featured]');
if (section) {
  const rail = section.querySelector('[data-featured-rail]');
  const status = section.querySelector('[data-featured-status]');
  async function load() {
    const items = [], seen = new Set(), offsets = new Set();
    let offset = 0;
    do {
      if (offsets.has(offset)) throw Error('Repeated project page');
      offsets.add(offset);
      const response = await fetch(`/api/projects?view=featured&offset=${encodeURIComponent(offset)}`, { cache:'no-store', credentials:'omit', signal:AbortSignal.timeout(15000) });
      if (!response.ok) throw Error('Featured projects unavailable');
      const page = await response.json();
      for (const project of page.items || []) {
        if (!project.id || !project.name || project.status !== 'featured' || seen.has(project.id)) continue;
        seen.add(project.id); items.push(project);
      }
      offset = page.next;
    } while (offset != null);
    if (!items.length) { section.hidden = true; return; }
    items.sort((a,b)=>(Number.isFinite(Number(b.views))?Number(b.views):0)-(Number.isFinite(Number(a.views))?Number(a.views):0));
    rail.replaceChildren(...items.map((project, index) => {
      const card = createShowcaseCard(project, index);
      card.classList.replace('project-reel-card', 'home-featured-card');
      card.dataset.featuredProject = project.id;
      card.dataset.projectId = project.id;
      if (index < 3) {
        const place = ['gold','silver','bronze'][index];
        card.dataset.featuredRank = place;
        const badge = document.createElement('span');
        badge.className = 'home-featured-rank';
        badge.textContent = `${index+1}${['st','nd','rd'][index]} place`;
        card.querySelector('.project-reel-art').append(badge);
      }
      const views = document.createElement('span');
      views.className = 'home-featured-views';
      const eye = document.createElement('span'); eye.innerHTML = cardIconMarkup('eye');
      const count = document.createElement('span');
      count.dataset.projectViews = project.id; count.textContent = viewLabel(project.views);
      views.append(eye, count); card.querySelector('.project-reel-art').append(views);
      return card;
    }));
    rail.setAttribute('aria-busy', 'false');
    section.dataset.ready = 'true';
    observeProjectViews();
  }
  load().catch(() => {
    rail.replaceChildren(); rail.setAttribute('aria-busy', 'false');
    status.textContent = 'Featured projects are temporarily unavailable. You can still explore the directory.';
    status.hidden = false;
  });
}
