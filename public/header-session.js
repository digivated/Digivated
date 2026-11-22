// Show the signed-in header right away when this device has a saved session, so
// it doesn't flash "Log In" first. account-header.js confirms or reverts it.
(function(){try{
 for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);if(!/^sb-.+-auth-token$/.test(key||''))continue;
  var saved=JSON.parse(localStorage.getItem(key)||'null');if(!saved||!saved.access_token||!(saved.refresh_token||saved.expires_at*1000>Date.now()))continue;
  var header=document.querySelector('[data-site-header]'),link=document.getElementById('header-account-link'),menu=document.getElementById('header-account-menu');
  if(!header||!link||!menu)return;
  header.setAttribute('data-account','signed-in');header.setAttribute('data-account-guess','');link.hidden=true;menu.hidden=false;
  var avatar=document.getElementById('header-account-avatar'),user=saved.user;
  if(!avatar||!user)return;
  if(user.email)avatar.textContent=user.email.slice(0,1).toUpperCase();
  var cached=JSON.parse(sessionStorage.getItem('digivated:header-avatar')||'null');
  if(cached&&user.id&&cached.account===user.id&&typeof cached.src==='string'&&cached.src.length<=350000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(cached.src)){
   var image=new Image();image.alt='';image.src=cached.src;
   avatar.dataset.account=user.id;avatar.replaceChildren(image);
  }
  return;
 }
}catch(e){}})();
