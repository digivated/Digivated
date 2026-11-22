import { safeSearchHref } from '../lib/discovery-search.mjs';

export function projectLogo(project, className) {
  const wrap = document.createElement('span');
  wrap.className = className + ' dg-project-art';
  wrap.setAttribute('aria-hidden', 'true');

  const initials = document.createElement('span');
  initials.className = 'dg-monogram';
  initials.textContent = (project.name || '?').slice(0, 2).toUpperCase();
  wrap.append(initials);

  const src = safeSearchHref(project.image);
  if (src?.startsWith('/')) {
    const image = document.createElement('img');
    image.alt = '';
    image.width = 44;
    image.height = 44;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('load', () => { initials.hidden = true; }, { once: true });
    image.addEventListener('error', () => { image.remove(); }, { once: true });
    image.src = src;
    wrap.append(image);
  }
  return wrap;
}
