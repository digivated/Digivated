import { accountSession } from './account-session.js';

const state=document.getElementById('account-state');
if(state){
 const form=document.getElementById('account-sign-in'),panel=document.getElementById('account-signed-in'),list=document.getElementById('account-submissions');
 const callback=new URLSearchParams(location.hash.slice(1));
 const arrivingFromEmail=callback.has('access_token');
 const callbackError=callback.get('error_description');
 const recovering=callback.get('type')==='recovery'||new URLSearchParams(location.search).get('reset')==='password';
 const show=message=>{state.textContent=message;};
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function boot(){
  const {state:authState,client,session,email}=await accountSession();
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  if(recovering){
   document.querySelector('h1').textContent='Choose a new password.';
   document.querySelector('.page-intro .lede').textContent='Save a new password to get back to your Digivated account.';
   if(callbackError||!session||authState!=='signed-in'){
    form.hidden=false;show('This password reset link could not be verified. Request a fresh link from the login page.');return;
   }
   history.replaceState(null,'','/account?reset=password');
   const reset=document.getElementById('account-password-reset'),submit=reset.querySelector('button');
   reset.hidden=false;show('Your reset link is verified. Choose your new password below.');
   reset.elements.password.focus();
   reset.onsubmit=async event=>{
    event.preventDefault();
    if(reset.elements.password.value!==reset.elements.confirmation.value){show('The passwords do not match. Please check them.');reset.elements.confirmation.focus();return;}
    submit.disabled=true;show('Saving your new password…');
    try{
     const {error}=await client.auth.updateUser({password:reset.elements.password.value});
     if(error)throw error;
     reset.reset();location.replace('/account');
    }catch(error){show(error.message||'Your password could not be saved. Please try again.');submit.disabled=false;}
   };
   return;
  }
  document.getElementById('account-sign-out').onclick=async()=>{const {error}=await client.auth.signOut();if(error){show('Could not sign out. Please try again.');return;}location.replace('/login');};
  if(authState==='signed-out'||authState==='unverified'){
   form.hidden=false;
   show(callbackError?'That link has expired or was already used. Request a new one below.':authState==='unverified'?'Use an emailed sign-in link to finish verifying this account.':'Sign in to view your projects. You can browse the site without an account.');
   return;
  }
  panel.hidden=false;
  document.getElementById('account-email').textContent=email||session?.user?.email||'';
  if(authState==='unavailable'){show('You have a session, but we could not verify your account right now. Please try again shortly.');list.textContent='Your submissions could not be loaded.';return;}
  if(arrivingFromEmail){location.replace('/discover?view=featured&signed_in=1');return;}
  show(`You're logged in as ${email}.`);
  const profileForm=document.getElementById('creator-profile-form'),profileStatus=document.getElementById('creator-profile-status'),profileLink=document.getElementById('creator-profile-link');
  const logoInput=document.getElementById('creator-logo-input'),logoPreview=document.getElementById('creator-logo-preview');let profileSaved=false;
  const profileHeaders={Authorization:`Bearer ${session.access_token}`};
  const setLogo=(src,name)=>{logoPreview.replaceChildren();if(src){const image=document.createElement('img');image.src=src;image.alt='';logoPreview.append(image);}else logoPreview.textContent=(name||'D').slice(0,1).toUpperCase();};
  const showProfile=async({profile,id})=>{profileSaved=!!profile?.name;profileForm.elements.name.value=profile?.name||'';profileForm.elements.bio.value=profile?.bio||'';profileForm.elements.website.value=profile?.website||'';profileForm.elements.social.value=profile?.social||'';profileForm.elements.public.checked=!!profile?.public;profileLink.href='/creator?id='+encodeURIComponent(id);profileLink.hidden=!profile?.public;if(profile?.hasLogo){try{const response=await fetch('/api/creator-profile?logo='+encodeURIComponent(id),{headers:profileHeaders,cache:'no-store'});if(response.ok){setLogo(URL.createObjectURL(await response.blob()),profile.name);return;}}catch{}}setLogo('',profile?.name);};
  try{const response=await fetch('/api/creator-profile',{headers:profileHeaders,cache:'no-store'}),data=await response.json();if(response.ok)await showProfile(data);else profileStatus.textContent=data.error||'Profile is temporarily unavailable.';}catch{profileStatus.textContent='Profile is temporarily unavailable.';}
  const uploadLogo=async file=>{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2_000_000)throw Error('Choose a PNG, JPG or WebP under 2 MB.');const image=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d');context.clearRect(0,0,256,256);const scale=Math.min(256/image.width,256/image.height),width=image.width*scale,height=image.height*scale;context.drawImage(image,(256-width)/2,(256-height)/2,width,height);image.close();const dataUri=canvas.toDataURL('image/webp',.82);const response=await fetch('/api/creator-profile?action=logo',{method:'POST',headers:{...profileHeaders,'Content-Type':'application/json'},body:JSON.stringify({image:dataUri})}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not upload logo.');setLogo(dataUri,profileForm.elements.name.value);logoInput.value='';};
  logoInput.onchange=async()=>{if(!logoInput.files?.[0])return;if(!profileSaved){profileStatus.textContent='Save your profile, then upload your logo.';return;}profileStatus.textContent='Uploading logo…';logoInput.disabled=true;try{await uploadLogo(logoInput.files[0]);profileStatus.textContent='Logo updated.';}catch(error){profileStatus.textContent=error.message;}finally{logoInput.disabled=false;}};
  profileForm.onsubmit=async event=>{event.preventDefault();const button=profileForm.querySelector('button[type=submit]');button.disabled=true;profileStatus.textContent='Saving profile…';try{const response=await fetch('/api/creator-profile',{method:'POST',headers:{...profileHeaders,'Content-Type':'application/json'},body:JSON.stringify({name:profileForm.elements.name.value,bio:profileForm.elements.bio.value,website:profileForm.elements.website.value,social:profileForm.elements.social.value,public:profileForm.elements.public.checked})}),data=await response.json();if(!response.ok)throw Error(data.error||'Profile could not be saved.');await showProfile(data);if(logoInput.files?.[0])await uploadLogo(logoInput.files[0]);profileStatus.textContent=data.profile.public?'Profile saved and visible to everyone.':'Profile saved privately.';}catch(error){profileStatus.textContent=error.message;}finally{button.disabled=false;}};
  try{const response=await fetch('/api/creator-profile?action=feed',{headers:profileHeaders,cache:'no-store'}),data=await response.json();const feed=document.getElementById('creator-feed'),feedStatus=document.getElementById('creator-feed-status');if(!response.ok)throw Error(data.error||'Feed unavailable.');feedStatus.textContent=data.items.length?`${data.items.length} recent projects`:'Follow creators to see their published projects here.';for(const project of data.items){const card=document.createElement('article'),link=document.createElement('a'),title=document.createElement('h3'),description=document.createElement('p');link.href=project.url;link.target='_blank';link.rel='noopener noreferrer';title.textContent=project.name;description.textContent=project.description;link.append(title,description);card.append(link);feed.append(card);}}catch{document.getElementById('creator-feed-status').textContent='Could not load followed creators right now.';}
  const weekly=document.getElementById('weekly-email'),toggle=document.getElementById('weekly-toggle'),weeklyStatus=document.getElementById('weekly-status');
  try{
   const headers={Authorization:`Bearer ${session.access_token}`};
   const response=await fetch('/api/return-emails?action=status',{headers,cache:'no-store'});
   if(response.ok){const preference=await response.json();let subscribed=preference.subscribed;weekly.hidden=false;if(!preference.available){toggle.hidden=true;weeklyStatus.textContent='Weekly emails are being set up. Check back soon.';}const update=()=>{toggle.textContent=subscribed?'Stop weekly emails':'Get weekly emails';};update();toggle.onclick=async()=>{toggle.disabled=true;weeklyStatus.textContent='Saving…';try{const result=await fetch(`/api/return-emails?action=${subscribed?'off':'on'}`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'}),data=await result.json();if(!result.ok)throw Error(data.error||'Try again.');subscribed=data.subscribed;update();weeklyStatus.textContent=data.pending?'Check your inbox and confirm your subscription.':subscribed?'Weekly emails are on.':'Weekly emails are off.';}catch(error){weeklyStatus.textContent=error.message;}finally{toggle.disabled=false;}};}
  }catch{}
  try{
   const response=await fetch('/api/project-account',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
   const data=await response.json();
   if(!response.ok){list.textContent=data.error||'Your submissions could not be loaded. Try again shortly.';return;}
   list.innerHTML=data.submissions.length?data.submissions.map(item=>`<article class="account-item"><h3>${escape(item.name)}</h3><p class="quiet">Submitted ${escape(new Date(item.date).toLocaleDateString())} · ${escape(item.awaitingInstantPayment?'Awaiting payment':item.status==='featured'?'Featured':item.status==='approved'?'Published':item.status==='rejected'?'Not selected':item.status==='archived'?'Archived':item.launch?.badgeVerifiedAt?'Scheduled':item.launch?'Awaiting badge':'In review')}</p>${['approved','featured'].includes(item.status)?`<p><a class="button" href="${escape(item.pageUrl||'/projects/listing/'+encodeURIComponent(item.id))}">View project and feedback</a></p>`:''}${item.awaitingInstantPayment?`<p><a class="button" href="/submit-project?resume=${encodeURIComponent(item.id)}">Finish publishing</a></p>`:''}${item.launch&&item.status==='pending'?`<div class="account-launch"><p>Scheduled launch: ${escape(new Date(item.launch.scheduledAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}))} (UTC). ${item.launch.badgeVerifiedAt?'Badge verified. Your project publishes automatically on or after this date.':'Add this text badge to your project website, publish it, then verify below.'}</p>${!item.launch.badgeVerifiedAt?`<label>Website badge<textarea readonly rows="4" aria-label="Website badge for ${escape(item.name)}">${escape(item.launch.badge)}</textarea></label><button type="button" data-verify-badge="${escape(item.id)}">[ Verify website badge ]</button><p role="status" data-badge-status></p>`:''}</div>`:''}${item.feedback?`<p class="review-feedback"><strong>Review feedback</strong><br>${escape(item.feedback)}</p>`:'<p>There is no review feedback yet.</p>'}</article>`).join(''):'<p>No submissions are linked to this account yet. Browse featured projects or submit with this verified email to track your work here.</p>';
   list.querySelectorAll('[data-verify-badge]').forEach(button=>button.onclick=async()=>{
    const message=button.parentElement.querySelector('[data-badge-status]');button.disabled=true;message.textContent='Checking your website…';
    try{
      const {data:{session:current}}=await client.auth.getSession();if(!current)throw Error('Sign in again to verify your badge.');
      const response=await fetch('/api/submissions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${current.access_token}`},body:JSON.stringify({action:'verify-badge',id:button.dataset.verifyBadge}),signal:AbortSignal.timeout(30000)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Badge could not be verified.');
      message.textContent=result.pageUrl?'Badge verified. Your project is live.':'Badge verified. Your scheduled launch is confirmed.';button.hidden=true;
      if(result.pageUrl)message.append(' ',Object.assign(document.createElement('a'),{href:result.pageUrl,textContent:'View project →'}));
    }catch(error){message.textContent=error.message||'Verification failed. Try again.';}finally{button.disabled=false;}
   });
  }catch{list.textContent='Your submissions could not be loaded. Try again shortly.';}
 }
 boot().catch(error=>{if(location.hash)history.replaceState(null,'',location.pathname+location.search);form.hidden=false;show(error.message||'Accounts are temporarily unavailable.');});
}
