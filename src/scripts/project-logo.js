import { safeSearchHref } from '../lib/discovery-search.mjs';

export function resolveProjectLogo(art) {
  const image = art.querySelector('img');
  if (!image) return;

  const showLogo = () => { art.querySelector('.dg-monogram').hidden = true; };
  const showFallback = () => { image.remove(); };
  if (image.complete) {
    if (image.naturalWidth) showLogo();
    else showFallback();
  } else {
    image.addEventListener('load', showLogo, { once: true });
    image.addEventListener('error', showFallback, { once: true });
  }
}

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
    image.src = src;
    wrap.append(image);
    resolveProjectLogo(wrap);
  }
  return wrap;
}
