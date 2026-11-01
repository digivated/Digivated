const root=document.querySelector('[data-launch-directory]');
if(root){
 const list=root.querySelector('[data-launch-list]'),status=root.querySelector('[data-launch-status]'),more=root.querySelector('[data-launch-more]');
 let projects=[],period='daily',category='All',query='',limit=30;
 const ai=root.dataset.ai==='true';
 const aiPattern=/\bai\b|artificial intelligence|machine learning|llm|gpt|chatbot|generative/i;
 const groups=[['Video',/video|film|animation/i],['Images & design',/image|design|photo|illustrat/i],['Writing',/writing|writer|copywriting|blog/i],['Coding',/code|coding|developer|programming/i],['Voice & audio',/voice|audio|music|speech/i],['Research',/research|search|knowledge/i],['Productivity',/productivity|workflow|automation|assistant|agent/i]];
 const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
 const safe=value=>{try{const u=new URL(value,location.origin);return /^https?:$/.test(u.protocol)?u.href:'/discover';}catch{return '/discover';}};
 const liked=p=>{try{return localStorage.getItem('digivated:liked:project:'+p.id)==='1';}catch{return false;}};
 function render(){
  const matches=projects.filter(p=>category==='All'||(ai?groups.find(([name])=>name===category)?.[1].test(p.name+' '+p.description+' '+p.category):p.category===category)).filter(p=>(p.name+' '+p.description+' '+p.creator).toLowerCase().includes(query));
  matches.sort((a,b)=>(b.votes?.[period]||0)-(a.votes?.[period]||0)||String(b.date||'').localeCompare(String(a.date||''))||a.id.localeCompare(b.id));
  root.querySelector('[data-launch-total]').textContent=matches.length+' projects';
  root.querySelector('[data-ranking-title]').textContent={daily:"Today's rankings",weekly:"This week's rankings",monthly:"This month's rankings",all:"All-time rankings"}[period];
  root.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===period)));
  root.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
  list.replaceChildren();status.textContent=matches.length?'':'No projects match yet. Try another category or search.';
  for(const [i,p] of matches.slice(0,limit).entries()){
   const row=text('li','','launch-row');row.append(text('span',String(i+1).padStart(2,'0'),'launch-rank'));
   const image=document.createElement('img');image.className='launch-logo';image.src=safe(p.image);image.alt='';image.loading='lazy';image.width=64;image.height=64;image.onerror=()=>{image.hidden=true;};row.append(image);
   const copy=text('div','','launch-copy'),heading=text('h3',''),link=text('a',p.name);link.href=safe(p.pageUrl||'/discover#project-'+p.id);heading.append(link);copy.append(heading,text('p',p.description||''));
   const meta=text('div','','launch-meta');meta.append(text('span',p.category||'Project'));const visit=text('a','Visit website ↗');visit.href=safe(p.url);visit.target='_blank';visit.rel='noopener noreferrer';meta.append(visit);copy.append(meta);row.append(copy);
   const vote=text('button','','launch-vote');vote.type='button';vote.setAttribute('aria-pressed',String(liked(p)));vote.setAttribute('aria-label','Upvote '+p.name);vote.append(text('span','△'),text('span',String(p.votes?.[period]||0)));
   vote.onclick=async()=>{
    vote.disabled=true;const was=liked(p);
    try{const response=await fetch('/api/card-interactions',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'project',id:p.id,action:was?'unlike':'like'}),signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to vote. Please try again.');
     try{localStorage.setItem('digivated:liked:project:'+p.id,data.liked?'1':'0');}catch{}
     // Reload authoritative period totals; legacy votes may have no timestamp.
     await load();status.textContent=data.liked?'Upvote saved.':'Upvote removed.';
    }catch(error){status.textContent=error.message;}finally{vote.disabled=false;}
   };row.append(vote);list.append(row);
  }more.hidden=matches.length<=limit;
 }
 async function load(){
  let offset=0;const items=[];do{const response=await fetch('/api/projects?ranking=1&offset='+offset,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Projects are temporarily unavailable. Please refresh to try again.');const page=await response.json();items.push(...page.items);offset=page.next;}while(offset!=null);
  projects=[...new Map(items.filter(p=>p.image&&p.url&&(!ai||aiPattern.test(p.category+' '+p.name+' '+p.description))).map(p=>[p.id,p])).values()];render();
 }
 const categoryHost=root.querySelector('[data-launch-categories]');
 function categories(){const names=['All',...(ai?groups.map(([name])=>name):[...new Set(projects.map(p=>p.category).filter(Boolean))].sort())];categoryHost.replaceChildren();for(const name of names){const b=text('button',name);b.type='button';b.dataset.category=name;b.setAttribute('aria-pressed',String(name===category));b.onclick=()=>{category=name;limit=30;render();};categoryHost.append(b);}}
 root.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period;limit=30;render();});
 root.querySelector('[data-launch-search]').oninput=e=>{query=e.target.value.trim().toLowerCase();limit=30;render();};
 more.onclick=()=>{limit+=30;render();};
 load().then(categories).catch(error=>{status.textContent=error.message;});
}
