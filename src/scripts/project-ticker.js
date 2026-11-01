document.querySelectorAll('[data-project-ticker]').forEach(ticker=>{
 const track=ticker.querySelector('[data-ticker-track]');
 const createItem=project=>{
  const link=document.createElement('a');link.className='project-ticker-item';link.href=project.pageUrl||project.url;
  if(!project.pageUrl){link.target='_blank';link.rel='noopener noreferrer';}
  const image=document.createElement('img');image.src=project.image;image.alt='';image.width=28;image.height=28;
  image.addEventListener('error',()=>link.remove(),{once:true});
  const name=document.createElement('span');name.textContent=project.name;link.append(image,name);return link;
 };
 fetch(ticker.dataset.tickerView==='all'?'/api/projects':'/api/projects?view=featured',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)})
  .then(response=>response.ok?response.json():Promise.reject())
  .then(async page=>{
   const items=[...page.items];
   while(ticker.dataset.tickerView==='all' && page.next!=null){
    const response=await fetch('/api/projects?offset='+encodeURIComponent(page.next),{credentials:'omit',signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error('Project page unavailable');
    page=await response.json();items.push(...page.items);
   }
   const projects=items.filter(item=>item.image&&item.url&&item.name);
   if(!projects.length){ticker.hidden=true;return;}
   const first=document.createElement('div'),second=document.createElement('div');
   first.className=second.className='project-ticker-group';
   // Fill a desktop viewport before cloning so the loop never shows an empty gap.
   const repeats=Math.max(1,Math.ceil((window.innerWidth+400)/(projects.length*155)));
   for(let repeat=0;repeat<repeats;repeat++) projects.forEach(project=>{first.append(createItem(project));second.append(createItem(project));});
   second.setAttribute('aria-hidden','true');second.inert=true;
   track.style.animationDuration=`${Math.max(23,projects.length*3.5*repeats)}s`;
   track.replaceChildren(first,second);ticker.dataset.ready='true';
  }).catch(()=>{ticker.hidden=true;});
});
