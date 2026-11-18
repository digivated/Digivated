import { accountSession } from './account-session.js';

const header=document.querySelector('.compact-site-header');
const link=document.getElementById('header-account-link');
const signup=document.getElementById('header-signup-link');
const menu=document.getElementById('header-account-menu');
const trigger=document.getElementById('header-account-trigger');
const panel=document.getElementById('header-account-panel');
const menuAccount=document.getElementById('menu-account-link');
const menuLogin=document.getElementById('menu-login-link');
const inboxBadge=document.getElementById('header-inbox-badge');
const notificationBadge=document.getElementById('header-notifications-badge');
const menuNotificationBadge=document.getElementById('menu-notifications-badge');
const panelNotifications=document.getElementById('header-menu-notifications');
const panelInbox=document.getElementById('header-menu-inbox');
const dot=document.getElementById('header-account-dot');
const counts={inbox:0,notifications:0};
const label=value=>value>9?'9+':String(value);
const showCounts=()=>{
 if(panelNotifications){panelNotifications.textContent=label(counts.notifications);panelNotifications.hidden=!counts.notifications;}
 if(panelInbox){panelInbox.textContent=label(counts.inbox);panelInbox.hidden=!counts.inbox;}
 if(dot){const total=counts.inbox+counts.notifications;dot.textContent=label(total);dot.hidden=!total;}
};

// Account dropdown: opens on click, closes on Escape, outside click, or focus leaving.
if(menu&&trigger&&panel){
 const items=()=>[...panel.querySelectorAll('[role=menuitem]')];
 const close=(focus=false)=>{if(panel.hidden)return;panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();};
 const open=(first=false)=>{panel.hidden=false;trigger.setAttribute('aria-expanded','true');if(first)items()[0]?.focus();};
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
if(link&&!(location.pathname.replace(/\/$/,'')==='/account'&&location.hash.includes('access_token='))){
 let request=0,signedIn=false;
 const update=async(fresh=false)=>{
  const current=++request;
  try{
   const {state,email,session}=await accountSession({fresh});
   if(current!==request)return;
   header?.removeAttribute('data-account-guess');
   signedIn=state==='signed-in';
   const hasAccount=state==='signed-in'||state==='unavailable'&&!!session;
   header?.setAttribute('data-account',hasAccount?'signed-in':'signed-out');
   // The text link stays as the fallback when the dropdown is unavailable.
   link.textContent=hasAccount?'My account':'Log In';
   link.href=hasAccount?'/account':'/login';
   if(state==='signed-in')link.setAttribute('aria-label',`My account, signed in as ${email}`);
   else if(hasAccount)link.setAttribute('aria-label','My account, account connection needs attention');
   else link.removeAttribute('aria-label');
   if(location.pathname.replace(/\/$/,'')===link.getAttribute('href'))link.setAttribute('aria-current','page');
   else link.removeAttribute('aria-current');
   if(menu){
    menu.hidden=!hasAccount;link.hidden=hasAccount;if(signup)signup.hidden=hasAccount;
    const address=email||session?.user?.email||'';
    document.getElementById('header-account-email').textContent=address;
    document.getElementById('header-account-avatar').textContent=(address||'D').slice(0,1).toUpperCase();
    document.getElementById('header-account-label').textContent=address?`Account menu for ${address}`:'Account menu';
   }
   if(menuAccount)(menuAccount.querySelector('span')||menuAccount).textContent=hasAccount?'Dashboard':'Your projects';
   if(menuLogin)menuLogin.hidden=hasAccount;
   // Inbox lives in the account menu; its unread count also shows on the avatar.
   if(inboxBadge||panelInbox){if(inboxBadge)inboxBadge.hidden=true;counts.inbox=0;if(state==='signed-in'){fetch('/api/creator-inbox?action=list',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'}).then(response=>response.ok?response.json():null).then(data=>{if(current!==request)return;const unread=(data?.conversations||[]).reduce((sum,item)=>sum+Number(item.unread||0),0);counts.inbox=unread;if(inboxBadge){inboxBadge.textContent=label(unread);inboxBadge.hidden=!unread;}showCounts();}).catch(()=>{});}}
   if(notificationBadge){notificationBadge.hidden=true;counts.notifications=0;if(menuNotificationBadge)menuNotificationBadge.hidden=true;if(state==='signed-in'){fetch('/api/notifications?action=summary',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'}).then(response=>response.ok?response.json():null).then(data=>{if(current!==request)return;const unread=Math.max(0,Number(data?.unread)||0);counts.notifications=unread;notificationBadge.textContent=label(unread);notificationBadge.hidden=!unread;if(menuNotificationBadge){menuNotificationBadge.textContent=unread>9?'9+ new':`${unread} new`;menuNotificationBadge.hidden=!unread;}showCounts();}).catch(()=>{});}}
   const points=document.getElementById('header-menu-points');
   if(points){points.hidden=true;if(state==='signed-in'){fetch('/api/feedback-points?action=me',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'}).then(response=>response.ok?response.json():null).then(data=>{if(current!==request||!data)return;points.textContent=String(data.total);points.hidden=false;document.dispatchEvent(new CustomEvent('digivated:points',{detail:data}));}).catch(()=>{});}}
   showCounts();
  }catch{
   // Keep the visible sign-in route available during a temporary outage.
   if(current===request&&header?.hasAttribute('data-account-guess')){
    header.removeAttribute('data-account-guess');header.setAttribute('data-account','signed-out');
    link.hidden=false;if(menu)menu.hidden=true;if(menuLogin)menuLogin.hidden=false;
   }
  }
 };
 document.addEventListener('digivated:notifications-updated',()=>update());
 update();
 window.addEventListener('pageshow',event=>{if(event.persisted)update(true);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update(true);});
 setInterval(()=>{if(!document.hidden&&signedIn)update();},90000);
}

document.addEventListener('digivated:points-awarded',event=>{const points=document.getElementById('header-menu-points');if(points&&Number.isFinite(event.detail?.total)){points.textContent=String(event.detail.total);points.hidden=false;}});
