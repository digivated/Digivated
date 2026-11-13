import { homeLaunchGroups } from '../lib/home-launches.mjs';
import { launchBounds, launchTimestamp } from '../lib/launch-calendar.mjs';
const root=document.querySelector('[data-home-launches]');
if(root){
 const status=root.querySelector('[data-home-launch-status]');
 let projects=[],busy=false;const limits={current:10,previous:6,archive:6};
 const el=(tag,value,className)=>{const node=document.createElement(tag);if(value)node.textContent=value;if(className)node.className=className;return node;};
 const href=(value,fallback='/discover')=>{try{const url=new URL(value,location.origin);return /^https?:$/.test(url.protocol)?url.href:fallback;}catch{return fallback;}};
 const liked=p=>{try{return localStorage.getItem('digivated:liked:project:'+p.id)==='1';}catch{return false;}};
 const date=value=>new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 function render(){
  const groups=homeLaunchGroups(projects);
  for(const section of root.querySelectorAll('[data-launch-group]')){
   const key=section.dataset.launchGroup,items=groups[key],period=key==='current'?'weekly':'all',list=section.querySelector('[data-group-list]');
   const bounds=launchBounds(key);
   section.querySelector('[data-group-date]').textContent=key==='archive'?'THE ALL-TIME COLLECTION':`${date(bounds.start)} – ${date(bounds.end-86400000)} · UTC`;
   section.querySelector('[data-group-summary]').textContent=items.length?`${items.length} ${items.length===1?'project':'projects'} · ranked by ${period==='weekly'?'this week’s':'all-time'} upvotes`:key==='current'?'A fresh week starts here. Be the first to launch.':'No projects in this group yet.';
   list.replaceChildren();
   for(const p of items.slice(0,limits[key])){
    const row=el('li',null,'home-launch-row');row.dataset.launchId=p.id;
    const art=el('a',null,'home-launch-art');art.href=href(p.pageUrl);art.setAttribute('aria-label','Explore '+p.name);
    const fallback=el('span',p.name.slice(0,2).toUpperCase());fallback.setAttribute('aria-hidden','true');art.append(fallback);
    if(p.image){const img=el('img');img.src=href(p.image);img.alt='';img.width=64;img.height=64;img.loading='lazy';img.decoding='async';img.onerror=()=>img.remove();art.append(img);}
    const copy=el('div',null,'home-launch-copy'),heading=el('h3'),link=el('a',p.name);link.href=href(p.pageUrl);heading.append(link);
    const meta=el('p',null,'home-launch-meta');meta.append(el('span',p.category||'Project'));if(Number.isFinite(launchTimestamp(p)))meta.append(el('span',(p.publishedAt?'Published ':'Listed ')+date(launchTimestamp(p))));
    const feedback=el('a','Feedback →');feedback.href=href(p.pageUrl)+'#feedback';meta.append(feedback);
    copy.append(heading,el('p',p.description||'Explore this project and meet its maker.','home-launch-description'),meta);
    const vote=el('button',null,'home-launch-vote');vote.type='button';vote.setAttribute('aria-label','Upvote '+p.name);vote.setAttribute('aria-pressed',String(liked(p)));vote.disabled=busy;
    vote.append(el('span','^'),el('strong',String(p.votes?.[period]||0)),el('small','upvote'));
    vote.onclick=async()=>{if(busy)return;busy=true;root.querySelectorAll('.home-launch-vote').forEach(b=>b.disabled=true);status.hidden=false;status.textContent='Saving your upvote…';
     try{const response=await fetch('/api/card-interactions',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'project',id:p.id,action:liked(p)?'remove-upvote':'upvote'}),signal:AbortSignal.timeout(12000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save your upvote.');try{localStorage.setItem('digivated:liked:project:'+p.id,result.liked?'1':'0');}catch{}
      await load();status.hidden=false;status.textContent=result.liked?'Upvote saved.':'Upvote removed.';
     }catch(error){status.hidden=false;status.textContent=error.message||'Unable to save your upvote. Try again.';}finally{busy=false;root.querySelectorAll('.home-launch-vote').forEach(b=>b.disabled=false);root.querySelector(`[data-launch-id="${CSS.escape(p.id)}"] .home-launch-vote`)?.focus({preventScroll:true});}
    };
    row.append(art,copy,vote);list.append(row);
   }
   const more=section.querySelector('[data-group-more]');more.hidden=items.length<=limits[key];more.onclick=()=>{limits[key]+=10;render();};
  }
 }
 async function load(){const items=[],seen=new Set();let offset=0;do{if(seen.has(offset))throw Error('Could not load the launch feed. Please refresh.');seen.add(offset);const response=await fetch('/api/projects?ranking=1&offset='+offset,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Launches are temporarily unavailable. Please try again.');const page=await response.json();items.push(...(page.items||[]));offset=page.next;}while(offset!=null);projects=items;render();status.hidden=true;}
 load().catch(error=>{status.hidden=false;status.replaceChildren(error.message+' ',Object.assign(el('a','Browse the directory →'),{href:'/discover'}));});
}
