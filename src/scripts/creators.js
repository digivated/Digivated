import {accountSession} from './account-session.js';

const status=document.getElementById('creators-status'),list=document.getElementById('creators-grid'),search=document.getElementById('creator-search');
const tabs=[...document.querySelectorAll('[data-creator-filter]')];
let creators=[],filter='all',auth=null,following=new Set();
const profileUrl=id=>'/creator?id='+encodeURIComponent(id);
const render=()=>{
 const query=search.value.trim().toLowerCase();
 const visible=creators.filter(creator=>(filter==='all'||following.has(creator.id))&&(!query||(creator.name+' '+(creator.bio||'')).toLowerCase().includes(query)));
 status.textContent=visible.length?`${visible.length} ${visible.length===1?'creator':'creators'}`:filter==='following'?'You are not following any creators here yet.':query?'No creators match your search.':'No public creator profiles yet.';
 list.replaceChildren();
 for(const creator of visible){
  const card=document.createElement('article');card.className='creator-directory-card';
  const link=document.createElement('a');link.className='creator-directory-identity';link.href=profileUrl(creator.id);
  const avatar=document.createElement('span');avatar.className='creator-avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=creator.name.slice(0,1).toUpperCase();
  if(creator.logoUrl){const image=document.createElement('img');image.src=creator.logoUrl;image.alt='';avatar.replaceChildren(image);}
  const copy=document.createElement('span'),name=document.createElement('strong'),bio=document.createElement('span');name.textContent=creator.name;bio.textContent=creator.bio||'Building on Digivated.';copy.append(name,bio);link.append(avatar,copy);
  const actions=document.createElement('div');actions.className='creator-directory-actions';
  const visit=document.createElement('a');visit.href=profileUrl(creator.id);visit.textContent='View profile';actions.append(visit);
  if(auth?.state==='signed-in'&&auth.session.user.id!==creator.id){const follow=document.createElement('button');follow.type='button';follow.className='button';follow.textContent=following.has(creator.id)?'Following':'Follow';follow.onclick=async()=>{follow.disabled=true;try{const result=await fetch('/api/creator-profile?action=follow',{method:'POST',headers:{Authorization:`Bearer ${auth.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({id:creator.id,operation:following.has(creator.id)?'unfollow':'follow'})}),data=await result.json();if(!result.ok)throw Error(data.error||'Could not update follow.');if(data.following)following.add(creator.id);else following.delete(creator.id);render();}catch(error){status.textContent=error.message;follow.disabled=false;}};actions.append(follow);}
  card.append(link,actions);list.append(card);
 }
};
search.addEventListener('input',render);
for(const tab of tabs)tab.onclick=()=>{filter=tab.dataset.creatorFilter;for(const item of tabs)item.classList.toggle('active',item===tab);render();};
(async()=>{
 const response=await fetch('/api/creator-profile?action=discover',{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not load creators.');creators=data.creators;
 auth=await accountSession().catch(()=>null);
 if(auth?.state==='signed-in'){
  const own=await fetch('/api/creator-profile',{headers:{Authorization:`Bearer ${auth.session.access_token}`},cache:'no-store'}).then(r=>r.json()).catch(()=>null);
  for(const id of own?.followingIds||[])following.add(id);
 }else tabs.find(tab=>tab.dataset.creatorFilter==='following')?.setAttribute('hidden','');
 render();
})().catch(error=>{status.textContent=error.message;});
