import { accountSession } from './account-session.js';

const announcement=document.getElementById('account-announcement');
if(announcement){
 const seenKey='digivated-announcement-seen-v2';
 const seen=()=>{try{return sessionStorage.getItem(seenKey)==='1';}catch{return false;}};
 const show=state=>{
  if(seen())return;
  if(state==='signed-in'){
   announcement.setAttribute('aria-label','Weekly email announcement');
   document.getElementById('announcement-title').textContent='Weekly project emails are live.';
   document.getElementById('announcement-description').textContent='Get a short email when new projects go live. Sign in and opt in from Your Projects. Unsubscribe anytime.';
   const link=document.getElementById('announcement-link');link.href='/account';link.firstChild.textContent='Manage weekly emails ';
  }
  announcement.hidden=false;
  try{sessionStorage.setItem(seenKey,'1');}catch{}
 };
 const close=()=>{
  announcement.hidden=true;
 };
 document.getElementById('account-announcement-close')?.addEventListener('click',close);
 accountSession().then(({state})=>show(state)).catch(()=>show('signed-out'));
}
