import { inLaunchBatch, launchTimestamp, launchBatchLabel, readRankingPeriod } from '../lib/launch-calendar.mjs';
import { aiGroups, aiTopics } from '../lib/project-taxonomy.mjs';
import { cardIconMarkup } from '../lib/card-icons.mjs';
const root=document.querySelector('[data-launch-directory]');
if(root){
 const list=root.querySelector('[data-launch-list]'),status=root.querySelector('[data-launch-status]'),more=root.querySelector('[data-launch-more]');
 const launchBatch = root.querySelector('[data-launch-batch]');
 const params = new URLSearchParams(location.search);
 const initialBatch = ['current','previous'].includes(params.get('launch')) ? params.get('launch') : '';
 if (launchBatch) launchBatch.value = initialBatch;
 let projects=[],period=readRankingPeriod(params.get('period'), initialBatch),category=params.get('category')||'All',query=params.get('q')||'',limit=30;
 function syncUrl(){
   const url=new URL(location.href);
   for(const [key,value] of Object.entries({launch:launchBatch?.value||'',period,category:category==='All'?'':category,q:query})){
     if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
   }
   history.replaceState(null,'',url);
 }
 const ai=root.dataset.ai==='true';
 const countdown=root.querySelector('[data-ranking-countdown]'),countdownLabel=root.querySelector('[data-ranking-countdown-label]');
 const nextReset=now=>{const d=new Date(now),midnight=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());if(period==='daily')return midnight+86400000;if(period==='weekly')return midnight+((8-d.getUTCDay())%7||7)*86400000;if(period==='monthly')return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);return null;};
 function updateCountdown(){if(ai||!countdown)return;const target=nextReset(Date.now());if(target===null){countdown.closest('.rankings-countdown').hidden=true;return;}countdown.closest('.rankings-countdown').hidden=false;countdownLabel.textContent=`Next ${period==='daily'?'daily':period==='weekly'?'weekly':'monthly'} reset`;const seconds=Math.max(0,Math.ceil((target-Date.now())/1000));countdown.dateTime=new Date(target).toISOString();countdown.title=`Ranking period resets at ${new Date(target).toISOString().slice(0,16).replace('T',' ')} UTC`;countdown.textContent=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');}
 const countdownInterval=setInterval(updateCountdown,1000);updateCountdown();document.addEventListener('visibilitychange',updateCountdown);
 const groups=aiGroups;
 const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
 const safe=value=>{try{const u=new URL(value,location.origin);return /^https?:$/.test(u.protocol)?u.href:'/discover';}catch{return '/discover';}};
 const liked=p=>{try{return localStorage.getItem('digivated:liked:project:'+p.id)==='1';}catch{return false;}};
 function renderPicks(){
  if(ai)return;
  const host=root.querySelector('[data-ranking-picks]'),count=root.querySelector('[data-ranking-picks-count]');
  const picks=projects.filter(liked);
  count.textContent=picks.length?String(picks.length):'';
  host.replaceChildren();
  if(!picks.length){host.append(text('span','Upvote a project to keep it close.'));return;}
  for(const project of picks){const link=text('a',project.name);link.href=safe(project.pageUrl||'/discover#project-'+encodeURIComponent(project.id));link.title='Explore '+project.name;host.append(link);}
 }
 function renderOverview(){
  const host=root.querySelector('[data-ai-overview]');host.replaceChildren();
  for(const [name,pattern] of groups){
   const items=projects.filter(p=>aiTopics(p).includes(name));
   if(!items.length)continue;
   const card=text('a','','ai-category-card');card.href='/ai-tools?category='+encodeURIComponent(name);
   card.append(text('h2',name),text('p','Explore independent '+name.toLowerCase()+' tools and the people building them.'),text('span',items.length+(items.length===1?' tool':' tools'),'ai-category-count'));
   for(const p of items.slice(0,3)){const row=text('div','','ai-category-preview'),image=document.createElement('img');image.src=safe(p.image);image.alt='';image.loading='lazy';row.append(image,text('span',p.name));card.append(row);}
   card.append(text('b','View all '+name.toLowerCase()+' tools →'));host.append(card);
  }
 }
 function render(){
  syncUrl();
  const overview=ai&&category==='All'&&!query;
  root.querySelector('[data-ai-overview]').hidden=!overview;
  root.querySelector('[data-list-heading]').hidden=overview;
  list.hidden=overview;
  if(overview)renderOverview();
  const matches=projects.filter(p=>inLaunchBatch(p, launchBatch?.value)).filter(p=>category==='All'||(ai?aiTopics(p).includes(category):p.category===category)).filter(p=>(p.name+' '+p.description+' '+p.creator).toLowerCase().includes(query));
  matches.sort((a,b)=>(b.votes?.[period]||0)-(a.votes?.[period]||0)||(launchTimestamp(b)||0)-(launchTimestamp(a)||0)||a.id.localeCompare(b.id));
  root.querySelector('[data-launch-total]').textContent=matches.length+(ai?(matches.length===1?' tool':' tools'):(matches.length===1?' project':' projects'));
  if(!ai){
   const votes=matches.reduce((sum,p)=>sum+(p.votes?.[period]||0),0);
   root.querySelector('[data-ranking-votes]').textContent=votes.toLocaleString()+(votes===1?' upvote':' upvotes');
   root.querySelector('[data-ranking-context]').textContent=(launchBatch?.value ? launchBatchLabel(launchBatch.value)+' · ' : 'All launch dates · ')+{daily:'Upvotes received today · resets at 00:00 UTC',weekly:'Upvotes received this week · weeks start Monday (UTC)',monthly:'Upvotes received this month · calendar month (UTC)',all:'Every upvote, including votes before period tracking'}[period];
   updateCountdown();
  }
  root.querySelector('[data-ranking-title]').textContent=!ai&&launchBatch?.value ? launchBatchLabel(launchBatch.value) : ai?(category==='All'?'All AI tools':category+' tools'):{daily:"Today's rankings",weekly:"This week's rankings",monthly:"This month's rankings",all:"All-time rankings"}[period];
  root.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===period)));
  root.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
  list.replaceChildren();status.textContent=matches.length?'':'No projects match yet. Try another category or search.';
  for(const [i,p] of matches.slice(0,limit).entries()){
   const row=text('li','','launch-row');row.dataset.projectId=p.id;if(!ai&&i<3)row.classList.add('ranking-front-runner');row.append(text('span',String(i+1).padStart(2,'0'),'launch-rank'));
   const image=document.createElement('img');image.className='launch-logo';image.src=safe(p.image);image.alt='';image.loading=i<3?'eager':'lazy';image.width=64;image.height=64;image.onerror=()=>{image.hidden=true;};
   if(ai)row.append(image);else{const artwork=text('a','','ranking-artwork');artwork.href=safe(p.pageUrl||'/discover#project-'+p.id);artwork.setAttribute('aria-label','Explore '+p.name);artwork.append(image,text('span',p.name.slice(0,1).toUpperCase(),'ranking-image-fallback'));row.append(artwork);}
   const copy=text('div','','launch-copy'),heading=text('h3',''),link=text('a',p.name);link.href=safe(p.pageUrl||'/discover#project-'+p.id);heading.append(link);copy.append(heading,text('p',p.description||''));
   const meta=text('div','','launch-meta');meta.append(text('span',p.category||'Project'));if(!ai&&Number.isFinite(launchTimestamp(p))){const date=text('time',(p.publishedAt?'Published ':'Listed ')+new Date(launchTimestamp(p)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}));date.dateTime=new Date(launchTimestamp(p)).toISOString();meta.append(date);}const visit=text('a',ai?'Visit website ↗':'Visit website');if(!ai){const icon=text('span','');icon.innerHTML=cardIconMarkup('external');visit.append(icon);}visit.href=safe(p.url);visit.target='_blank';visit.rel='noopener noreferrer';meta.append(visit);copy.append(meta);row.append(copy);
   const vote=text('button','','launch-vote');vote.type='button';vote.setAttribute('aria-pressed',String(liked(p)));vote.setAttribute('aria-label','Upvote '+p.name);const voteIcon=text('span','');voteIcon.innerHTML=cardIconMarkup('like');vote.append(voteIcon,text('span',String(p.votes?.[period]||0)));
   if(!ai)vote.append(text('span','Upvote','ranking-vote-label'));
   vote.onclick=async()=>{
    vote.disabled=true;const was=liked(p);
    try{const response=await fetch('/api/card-interactions',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'project',id:p.id,action:was?'remove-upvote':'upvote'}),signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to vote. Please try again.');
     try{localStorage.setItem('digivated:liked:project:'+p.id,data.liked?'1':'0');}catch{}
     // Reload authoritative period totals; legacy votes may have no timestamp.
     await load();status.textContent=data.liked?'Upvote saved.':'Upvote removed.';
     if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const updated=[...list.children].find(item=>item.dataset.projectId===p.id);updated?.classList.add('ranking-vote-confirmed');}
    }catch(error){status.textContent=error.message;}finally{vote.disabled=false;}
   };row.append(vote);list.append(row);
  }more.hidden=overview||matches.length<=limit;
  renderPicks();
 }
 async function load(){
  let offset=0;const items=[];do{const response=await fetch('/api/projects?ranking=1&offset='+offset,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Projects are temporarily unavailable. Please refresh to try again.');const page=await response.json();items.push(...page.items);offset=page.next;}while(offset!=null);
  projects=[...new Map(items.filter(p=>p.image&&p.url&&(!ai||aiTopics(p).length>0)).map(p=>[p.id,p])).values()];categories();render();
 }
 const categoryHost=root.querySelector('[data-launch-categories]');
 window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);if(launchBatch)launchBatch.value=['current','previous'].includes(p.get('launch'))?p.get('launch'):'';period=readRankingPeriod(p.get('period'),launchBatch?.value);category=p.get('category')||'All';query=p.get('q')||'';root.querySelector('[data-launch-search]').value=query;limit=30;render();});
 function categories(){const names=['All',...(ai?groups.filter(([name])=>projects.some(p=>aiTopics(p).includes(name))).map(([name])=>name):[...new Set(projects.map(p=>p.category).filter(Boolean))].sort())];categoryHost.replaceChildren();for(const name of names){const b=text('button',name);b.type='button';b.dataset.category=name;b.setAttribute('aria-pressed',String(name===category));b.onclick=()=>{category=name;limit=30;render();};categoryHost.append(b);}}
 launchBatch?.addEventListener('change', () => {
   period = launchBatch.value === 'current' ? 'weekly' : launchBatch.value === 'previous' ? 'all' : 'daily';
   limit = 30;
   render();
 });
 root.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period;limit=30;render();});
 root.querySelector('[data-launch-search]').value=query;
 root.querySelector('[data-launch-search]').oninput=e=>{query=e.target.value.trim().toLowerCase();limit=30;render();};
 more.onclick=()=>{limit+=30;render();};
 if(!ai)root.querySelector('[data-ranking-share]').onclick=async()=>{
  const target=new URL(location.pathname+location.search,location.origin).href,feedback=root.querySelector('[data-ranking-share-status]');
  try{if(navigator.share){await navigator.share({title:'Digivated project rankings',url:target});feedback.textContent='';return;}if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(target);feedback.textContent='Link copied.';}
  catch(error){if(error?.name==='AbortError')return;feedback.textContent='Share this link: '+target;}
 };
 load().catch(error=>{status.textContent=error.message;});
 window.addEventListener('pagehide',()=>clearInterval(countdownInterval),{once:true});
}
