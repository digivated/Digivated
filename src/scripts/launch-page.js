import { mountDiscussion } from './discussion.js';

const comments = document.querySelector('[data-project-comments]');
// The server renders a placeholder; the discussion replaces it once scripts run.
if (comments) mountDiscussion(comments, { type: 'project', id: comments.dataset.projectComments });
// Point people at feedback points right where they write comments.
if (comments) {
  const hint = document.createElement('p'); hint.className = 'launch-points-hint';
  const link = document.createElement('a'); link.href = '/points'; link.textContent = 'feedback points';
  hint.append('Tried this product? Share what worked or what could improve to earn ', link, '.');
  comments.querySelector('.dg-d-head')?.after(hint);
}

const status = document.querySelector('[data-share-status]');
const url = location.origin + location.pathname;
document.querySelector('[data-copy-link]')?.addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(url); status.textContent='Link copied.'; }
  catch { status.replaceChildren(document.createTextNode('Copy this link: '));const input=document.createElement('input');input.value=url;input.readOnly=true;input.setAttribute('aria-label','Project link');status.append(input);input.focus();input.select(); }
});
const share=document.querySelector('[data-native-share]');
if(share && navigator.share){share.hidden=false;share.addEventListener('click',async()=>{try{await navigator.share({title:document.title,url});status.textContent='';}catch(error){if(error.name!=='AbortError')status.textContent='Sharing is unavailable. Use Copy link instead.';}});}
const cover = document.querySelector('.launch-cover img');
if (cover) {
  if (cover.complete && !cover.naturalWidth) cover.remove();
  else cover.addEventListener('error', () => cover.remove(), { once: true });
}

for (const image of document.querySelectorAll('.launch-shot img')) {
  const showUnavailable = () => {
    const note = document.createElement('p');
    note.className = 'launch-shot-unavailable';
    note.textContent = 'Screenshot currently unavailable.';
    image.replaceWith(note);
  };
  if (image.complete && !image.naturalWidth) showUnavailable();
  else image.addEventListener('error', showUnavailable, { once: true });
}

const logo = document.querySelector('.launch-identity img');
if (logo) {
  if (logo.complete && !logo.naturalWidth) logo.remove();
  else logo.addEventListener('error', () => logo.remove(), { once: true });
}

const relatedPanel = document.querySelector('[data-launch-related]');
function loadRelatedProjects() {
  const { launchRelated: currentId, category } = relatedPanel.dataset;
  fetch('/api/projects', { signal: AbortSignal.timeout(8000) })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (!Array.isArray(data?.items)) return;
      const projects = data.items.filter(project => project.id !== currentId && project.category === category
        && /^\/projects\/(?:listing\/)?[a-z0-9][a-z0-9-]*$/.test(project.pageUrl || '')).slice(0, 4);
      if (!projects.length) return;
      const list = relatedPanel.querySelector('ul');
      for (const project of projects) {
        const row = document.createElement('li');
        const link = document.createElement('a');
        link.href = project.pageUrl;
        link.setAttribute('aria-label', project.name);
        const art = document.createElement('span');
        art.className = 'launch-related-art';
        art.setAttribute('aria-hidden', 'true');
        art.textContent = project.name.slice(0, 2).toUpperCase();
        if (project.image === '/api/projects?image=' + project.id || project.image === '/media/project-logos/' + project.id + '.webp') {
          const image = document.createElement('img');
          image.src = project.image;
          image.alt = '';
          image.width = 40;
          image.height = 40;
          image.decoding = 'async';
          image.loading = 'lazy';
          image.addEventListener('error', () => image.remove(), { once: true });
          art.append(image);
        }
        const copy = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = project.name;
        const description = document.createElement('small');
        const summary = String(project.description || '').trim().replace(/\s+/g, ' ');
        description.textContent = summary.length > 100 ? summary.slice(0, 99).trimEnd() + '…' : summary;
        copy.append(name, description);
        link.append(art, copy);
        row.append(link);
        list.append(row);
      }
      list.hidden = false;
    }).catch(() => {});
}

if (relatedPanel && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      observer.disconnect();
      loadRelatedProjects();
    }
  }, { rootMargin: '250px' });
  observer.observe(relatedPanel);
} else if (relatedPanel) {
  loadRelatedProjects();
}
