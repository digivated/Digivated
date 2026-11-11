const status = document.querySelector('[data-share-status]');
const url = location.origin + location.pathname;
document.querySelector('[data-copy-link]')?.addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(url); status.textContent='Link copied.'; }
  catch { status.replaceChildren(document.createTextNode('Copy this link: '));const input=document.createElement('input');input.value=url;input.readOnly=true;input.setAttribute('aria-label','Project link');status.append(input);input.focus();input.select(); }
});
const share=document.querySelector('[data-native-share]');
if(share && navigator.share){share.hidden=false;share.addEventListener('click',async()=>{try{await navigator.share({title:document.title,url});status.textContent='';}catch(error){if(error.name!=='AbortError')status.textContent='Sharing is unavailable. Use Copy link instead.';}});}
document.querySelectorAll('.launch-shot img').forEach(img=>img.addEventListener('error',()=>{const note=document.createElement('p');note.textContent='Screenshot currently unavailable.';img.replaceWith(note);},{once:true}));

const logo = document.querySelector('.launch-identity img');
if (logo) {
  if (logo.complete && !logo.naturalWidth) logo.remove();
  else logo.addEventListener('error', () => logo.remove(), { once: true });
}

const featuredPanel = document.querySelector('[data-launch-featured]');
if (featuredPanel) {
  const currentId = featuredPanel.dataset.launchFeatured;
  fetch('/api/projects?view=featured', { signal: AbortSignal.timeout(8000) })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (!Array.isArray(data?.items)) return;
      const projects = data.items.filter(project => project.id !== currentId && project.status === 'featured'
        && /^\/projects\/(?:listing\/)?[a-z0-9][a-z0-9-]*$/.test(project.pageUrl || '')).slice(0, 4);
      if (!projects.length) return;
      const list = featuredPanel.querySelector('ul');
      for (const project of projects) {
        const row = document.createElement('li');
        const link = document.createElement('a');
        link.href = project.pageUrl;
        const art = document.createElement('span');
        art.className = 'launch-featured-art';
        art.setAttribute('aria-hidden', 'true');
        art.textContent = project.name.slice(0, 2).toUpperCase();
        if (project.image === '/api/projects?image=' + project.id) {
          const image = document.createElement('img');
          image.src = project.image;
          image.alt = '';
          image.loading = 'lazy';
          image.addEventListener('error', () => image.remove(), { once: true });
          art.append(image);
        }
        const copy = document.createElement('span');
        copy.className = 'launch-featured-copy';
        const name = document.createElement('strong');
        name.textContent = project.name;
        const description = document.createElement('small');
        description.textContent = project.description;
        copy.append(name, description);
        link.append(art, copy);
        row.append(link);
        list.append(row);
      }
      featuredPanel.hidden = false;
    }).catch(() => {});
}
