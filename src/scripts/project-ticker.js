const ticker=document.querySelector('[data-project-ticker]');
if(ticker){
 const track=ticker.querySelector('[data-ticker-track]');
 const createItem=project=>{
  const link=document.createElement('a');link.className='project-ticker-item';link.href=project.pageUrl||project.url;
  if(!project.pageUrl){link.target='_blank';link.rel='noopener noreferrer';}
  const image=document.createElement('img');image.src=project.image;image.alt='';image.width=28;image.height=28;
  image.addEventListener('error',()=>link.remove(),{once:true});
  const name=document.createElement('span');name.textContent=project.name;link.append(image,name);return link;
 };
 fetch('/api/projects?view=featured',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)})
  .then(response=>response.ok?response.json():Promise.reject())
  .then(({items})=>{
   const projects=items.filter(item=>item.image&&item.url&&item.name).slice(0,12);
   if(!projects.length){ticker.hidden=true;return;}
   const first=document.createElement('div'),second=document.createElement('div');
   first.className=second.className='project-ticker-group';
   // Fill a desktop viewport before cloning so the loop never shows an empty gap.
   const repeats=Math.max(1,Math.ceil((window.innerWidth+400)/(projects.length*155)));
   for(let repeat=0;repeat<repeats;repeat++) projects.forEach(project=>{first.append(createItem(project));second.append(createItem(project));});
   second.setAttribute('aria-hidden','true');second.inert=true;
   track.replaceChildren(first,second);ticker.dataset.ready='true';
  }).catch(()=>{ticker.hidden=true;});
}
