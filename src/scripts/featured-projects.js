import { cardIconMarkup } from '../lib/card-icons.mjs';
import { observeProjectViews } from './project-views.js';
import { safeSearchHref } from '../lib/discovery-search.mjs';

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
    rail.replaceChildren(...items.slice(0, 3).map((project, index) => {
      const card = document.createElement('a');
      card.className = 'home-featured-card';
      card.href = safeSearchHref(project.pageUrl) || `/discover#project-${encodeURIComponent(project.id)}`;
      card.dataset.featuredProject = project.id;
      card.dataset.projectId = project.id;
      card.dataset.featuredRank = ['gold','silver','bronze'][index];
      const ribbon = document.createElement('span');
      ribbon.className = 'home-featured-ribbon';
      ribbon.setAttribute('aria-label', 'Featured project');
      const track = document.createElement('span');
      track.className = 'home-featured-ribbon-track';
      track.setAttribute('aria-hidden', 'true');
      track.textContent = '[ SPOTLIGHT ]';
      ribbon.append(track);
      const content = document.createElement('span'); content.className = 'home-featured-content';
      const art = document.createElement('span'); art.className = 'home-featured-logo';
      const imageUrl = safeSearchHref(project.image);
      if (imageUrl && new URL(imageUrl, location.origin).origin === location.origin) {
        const image = document.createElement('img'); image.src = imageUrl; image.alt = '';
        image.width = 64; image.height = 64; image.loading = 'lazy'; image.decoding = 'async';
        image.addEventListener('error', () => image.remove(), { once: true }); art.append(image);
      }
      const monogram = document.createElement('span'); monogram.className = 'home-featured-monogram'; monogram.textContent = project.name.slice(0,2).toUpperCase(); art.prepend(monogram);
      const copy = document.createElement('span'); copy.className = 'home-featured-copy';
      const meta = document.createElement('small'); meta.textContent = `${index+1}${['st','nd','rd'][index]} place · ${project.category || 'Project'}`;
      const name = document.createElement('strong'); name.textContent = project.name;
      const summary = document.createElement('span'); summary.className = 'home-featured-summary'; summary.textContent = project.description || 'Explore this project and meet its maker.';
      copy.append(meta,name,summary);
      const arrow = document.createElement('span'); arrow.className = 'home-featured-arrow'; arrow.setAttribute('aria-hidden','true'); arrow.innerHTML = cardIconMarkup('arrow');
      content.append(art,copy,arrow); card.append(ribbon,content);
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
