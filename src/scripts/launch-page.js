import { mountDiscussion } from './discussion.js';
import { projectLogo, resolveProjectLogo } from './project-logo.js';

const comments = document.querySelector('[data-project-comments]');
// The server renders a placeholder; the discussion replaces it once scripts run.
if (comments) mountDiscussion(comments, { type: 'project', id: comments.dataset.projectComments });
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

const identity = document.querySelector('.launch-identity');
if (identity) resolveProjectLogo(identity);

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
        const art = projectLogo(project, 'launch-related-art');
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
