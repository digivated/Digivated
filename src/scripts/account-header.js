import { accountSession } from './account-session.js';

const header=document.querySelector('[data-site-header]');
const link=document.getElementById('header-account-link');
const signup=document.getElementById('header-signup-link');
const menu=document.getElementById('header-account-menu');
const trigger=document.getElementById('header-account-trigger');
const panel=document.getElementById('header-account-panel');
const notificationBadge=document.getElementById('header-notifications-badge');
const menuNotificationBadge=document.getElementById('menu-notifications-badge');
const panelNotifications=document.getElementById('header-menu-notifications');
const dot=document.getElementById('header-account-dot');
const avatar=document.getElementById('header-account-avatar');
let notificationCount=0;
const label=value=>value>9?'9+':String(value);
const showCounts=()=>{
 if(panelNotifications){panelNotifications.textContent=label(notificationCount);panelNotifications.hidden=!notificationCount;}
 if(dot){dot.textContent=label(notificationCount);dot.hidden=!notificationCount;}
};

const avatarCacheKey = 'digivated:header-avatar';
let avatarAccount = avatar?.dataset.account || '';
let avatarLoaded = false;
let avatarRequest = 0;

function saveAvatar(account, src) {
 try {
  if (account && src && src.length <= 350000) sessionStorage.setItem(avatarCacheKey, JSON.stringify({account, src}));
  else sessionStorage.removeItem(avatarCacheKey);
 } catch { /* The photo still works when storage is unavailable. */ }
}

function imageData(blob) {
 return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
 });
}

async function updateAvatar(address, session, {verified, refresh}) {
 if (!avatar) return;
 const account = session?.user?.id || '';
 const initial = (address || 'D').slice(0,1).toUpperCase();
 if (account !== avatarAccount) {
  avatarAccount = account;
  avatarLoaded = false;
  avatarRequest++;
  avatar.textContent = initial;
  saveAvatar();
 } else if (!avatar.querySelector('img')) {
  avatar.textContent = initial;
 }
 if (refresh) avatarLoaded = false;
 if (!verified || !session || avatarLoaded) return;

 const current = ++avatarRequest;
 try {
  const response = await fetch('/api/creator-profile?action=avatar', {
   headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store',signal:AbortSignal.timeout(8000),
  });
  if (current !== avatarRequest) return;
  if (response.status === 204) {
   avatar.textContent = initial;
   avatarLoaded = true;
   saveAvatar();
   return;
  }
  if (!response.ok) return;
  const blob = await response.blob();
  if (!['image/png','image/jpeg','image/webp'].includes(blob.type)) return;
  const src = await imageData(blob);
  const image = new Image();
  image.alt = '';
  image.src = src;
  await image.decode();
  if (current !== avatarRequest) return;
  avatar.replaceChildren(image);
  avatarLoaded = true;
  saveAvatar(account, src);
 } catch { /* Keep the last photo until the server confirms it was removed. */ }
}

// Account dropdown: opens on click, closes on Escape, outside click, or focus leaving.
if(menu&&trigger&&panel){
 const items=()=>[...panel.querySelectorAll('[role=menuitem]')];
 const close=(focus=false)=>{if(panel.hidden)return;panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();};
 const open=(first=false)=>{
  if(location.pathname.replace(/\/$/,'')==='/dashboard'){
   const activeTab=new URLSearchParams(location.search).get('tab');
   panel.querySelectorAll('a[href^="/dashboard"]').forEach(item=>{
    const settings=item.getAttribute('href')==='/dashboard?tab=settings';
    if(settings===(activeTab==='settings')) item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
   });
  }
  panel.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  if(first)items()[0]?.focus();
 };
 trigger.addEventListener('click',()=>panel.hidden?open():close());
 trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();open(true);}});
 panel.addEventListener('keydown',event=>{
  const list=items(),index=list.indexOf(document.activeElement);
  if(event.key==='Escape'){event.preventDefault();close(true);}
  else if(event.key==='ArrowDown'){event.preventDefault();list[(index+1)%list.length]?.focus();}
  else if(event.key==='ArrowUp'){event.preventDefault();list[(index-1+list.length)%list.length]?.focus();}
  else if(event.key==='Tab')close();
 });
 document.addEventListener('click',event=>{if(!menu.contains(event.target))close();});
 menu.addEventListener('focusout',event=>{if(event.relatedTarget&&!menu.contains(event.relatedTarget))close();});
 document.getElementById('header-sign-out')?.addEventListener('click',async()=>{
  try{const {client}=await accountSession();const {error}=await client.auth.signOut();if(error)throw error;location.replace('/login');}
  catch{close(true);alert('Could not sign out. Please try again.');}
 });
}

// Let an incoming email callback establish its session on the account page first.
if(link&&!(location.pathname.replace(/\/$/,'')==='/dashboard'&&location.hash.includes('access_token='))){
 let request=0,signedIn=false;
 const update=async(fresh=false,refreshAvatar=false)=>{
  const current=++request;
  try{
   const {state,email,session}=await accountSession({fresh,optional:true});
   if(current!==request)return;
   header?.removeAttribute('data-account-guess');
   signedIn=state==='signed-in';
   const hasAccount=state==='signed-in'||state==='unavailable'&&!!session;
   header?.setAttribute('data-account',hasAccount?'signed-in':'signed-out');
   // The text link stays as the fallback when the dropdown is unavailable.
   link.textContent=hasAccount?'My account':'Log In';
   link.href=hasAccount?'/dashboard':'/login';
   if(state==='signed-in')link.setAttribute('aria-label',`My account, signed in as ${email}`);
   else if(hasAccount)link.setAttribute('aria-label','My account, account connection needs attention');
   else link.removeAttribute('aria-label');
   if(location.pathname.replace(/\/$/,'')===link.getAttribute('href'))link.setAttribute('aria-current','page');
   else link.removeAttribute('aria-current');
   if(menu){
    menu.hidden=!hasAccount;link.hidden=hasAccount;if(signup)signup.hidden=hasAccount;
    const address=email||session?.user?.email||'';
    const accountEmail=document.getElementById('header-account-email');
    accountEmail.textContent=address;
    accountEmail.title=address;
    void updateAvatar(address,hasAccount?session:null,{verified:signedIn,refresh:refreshAvatar});
    document.getElementById('header-account-label').textContent=address?`Account menu for ${address}`:'Account menu';
   }
   if(notificationBadge){notificationBadge.hidden=true;notificationCount=0;if(menuNotificationBadge)menuNotificationBadge.hidden=true;if(state==='signed-in'){fetch('/api/notifications?action=summary',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'}).then(response=>response.ok?response.json():null).then(data=>{if(current!==request)return;const unread=Math.max(0,Number(data?.unread)||0);notificationCount=unread;notificationBadge.textContent=label(unread);notificationBadge.hidden=!unread;if(menuNotificationBadge){menuNotificationBadge.textContent=unread>9?'9+ new':`${unread} new`;menuNotificationBadge.hidden=!unread;}showCounts();}).catch(()=>{});}}
   const points=document.getElementById('header-menu-points');
   if(points){points.hidden=true;if(state==='signed-in'){fetch('/api/feedback-points?action=me',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'}).then(response=>response.ok?response.json():null).then(data=>{if(current!==request||!data)return;points.textContent=String(data.total);points.hidden=false;document.dispatchEvent(new CustomEvent('digivated:points',{detail:data}));}).catch(()=>{});}}
   showCounts();
  }catch{
   // Keep the visible sign-in route available during a temporary outage.
   if(current===request&&header?.hasAttribute('data-account-guess')&&!avatar?.querySelector('img')){
    header.removeAttribute('data-account-guess');header.setAttribute('data-account','signed-out');
    link.hidden=false;if(menu)menu.hidden=true;
   }
  }
 };
 document.addEventListener('digivated:notifications-updated',()=>update());
 document.addEventListener('digivated:profile-logo-updated',()=>update(false,true));
 update();
 window.addEventListener('pageshow',event=>{if(event.persisted)update(true);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update(true);});
 setInterval(()=>{if(!document.hidden&&signedIn)update();},90000);
}

document.addEventListener('digivated:points-awarded',event=>{const points=document.getElementById('header-menu-points');if(points&&Number.isFinite(event.detail?.total)){points.textContent=String(event.detail.total);points.hidden=false;}});
