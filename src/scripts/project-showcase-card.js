import { safeSearchHref } from '../lib/discovery-search.mjs';

export function createShowcaseCard(project, index, duplicate = false) {
    const link = document.createElement('a');
    link.className = 'project-reel-card';
    link.href = safeSearchHref(project.pageUrl) || `/discover#project-${encodeURIComponent(project.id)}`;
    link.dataset.reelProject = project.id;
    link.style.setProperty('--reel-tilt', `${[-1.4, 1.1, -0.7, 1.6, -1][index % 5]}deg`);
    link.style.setProperty('--reel-delay', `${-(index % 7) * 0.9}s`);
    if (duplicate) { link.tabIndex = -1; link.setAttribute('aria-hidden', 'true'); }
    const artwork = document.createElement('span'); artwork.className = 'project-reel-art';
    const monogram = document.createElement('span'); monogram.className = 'project-reel-monogram'; monogram.textContent = project.name.slice(0, 2).toUpperCase();
    artwork.append(monogram);
    const imageUrl = safeSearchHref(project.image);
    if (imageUrl && new URL(imageUrl, location.origin).origin === location.origin) {
      const image = document.createElement('img'); image.src = imageUrl; image.alt = ''; image.width = 232; image.height = 88;
      image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), { once: true }); artwork.append(image);
    }
    const category = document.createElement('span'); category.className = 'project-reel-category'; category.textContent = project.category || 'Independent project';
    const copy = document.createElement('span'); copy.className = 'project-reel-copy';
    const name = document.createElement('strong'); name.textContent = project.name;
    const maker = document.createElement('span'); maker.textContent = project.creator ? `By ${project.creator}` : 'Meet the project';
    const arrow = document.createElement('span'); arrow.className = 'project-reel-arrow'; arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
    copy.append(name, maker, arrow); link.append(artwork, category, copy); link.title = `${project.name}${project.creator ? ` by ${project.creator}` : ''}`;
    return link;
  }
