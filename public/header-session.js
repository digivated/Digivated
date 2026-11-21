// Show the signed-in header right away when this device has a saved session, so
// it doesn't flash "Log In" first. account-header.js confirms or reverts it.
(function(){try{
 for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);if(!/^sb-.+-auth-token$/.test(key||''))continue;
  var saved=JSON.parse(localStorage.getItem(key)||'null');if(!saved||!saved.access_token||!(saved.refresh_token||saved.expires_at*1000>Date.now()))continue;
  var header=document.querySelector('[data-site-header]'),link=document.getElementById('header-account-link'),menu=document.getElementById('header-account-menu');
  if(!header||!link||!menu)return;
  header.setAttribute('data-account','signed-in');header.setAttribute('data-account-guess','');link.hidden=true;menu.hidden=false;
  var email=saved.user&&saved.user.email||'';if(email)document.getElementById('header-account-avatar').textContent=email.slice(0,1).toUpperCase();
  var login=document.getElementById('menu-login-link');if(login)login.hidden=true;
  return;
 }
}catch(e){}})();
