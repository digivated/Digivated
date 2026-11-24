import { safeSearchHref } from '../lib/discovery-search.mjs';

let eagerLogos = 4;
export function resolveProjectLogo(art) {
  const image = art.querySelector('img');
  if (!image) return;

  // The initials start hidden whenever there is a logo, so nothing swaps in while
  // it loads. They only come back if the image fails.
  const monogram = art.querySelector('.dg-monogram');
  const showLogo = () => { if (monogram) monogram.hidden = true; };
  const showFallback = () => { image.remove(); if (monogram) monogram.hidden = false; };
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
    initials.hidden = true;
    const image = document.createElement('img');
    image.alt = '';
    image.width = 44;
    image.height = 44;
    // The first few logos sit above the fold, so they load right away (better LCP); the rest wait.
    image.loading = eagerLogos > 0 ? 'eager' : 'lazy';
    if (eagerLogos > 0) eagerLogos--;
    image.decoding = 'async';
    image.src = src;
    wrap.append(image);
    resolveProjectLogo(wrap);
  }
  return wrap;
}
