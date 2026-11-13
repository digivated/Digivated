import { prepareProjectImage } from './submission-image.js';
import { createClient } from '@supabase/supabase-js';
import { communityAuthOptions } from './community-auth.js';
const form = document.getElementById('project-form');
if (form) {
  let accountClient, accountVerified = false, instantConfig, pendingInstantId;
  const resumePanel = document.getElementById('instant-launch-resume');
  const checkout = document.getElementById('instant-launch-checkout');
  const verify = document.getElementById('instant-launch-verify');
  const paymentStatus = document.getElementById('instant-launch-status');
  const listing = document.getElementById('instant-launch-listing');
  const showCheckout = id => {
    pendingInstantId = id;
    checkout.href = instantConfig.checkoutUrl;
    details.hidden = true;
    resumePanel.hidden = false;
    verify.focus();
  };
  verify.addEventListener('click', async () => {
    verify.disabled = true;
    paymentStatus.textContent = 'Verifying your payment…';
    try {
      const { data: { session } } = await accountClient.auth.getSession();
      if (!session) throw new Error('Your session expired. Sign in and resume from Your Projects.');
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'publish-instant', id: pendingInstantId }),
        signal: AbortSignal.timeout(26000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not verify the purchase.');
      paymentStatus.textContent = 'Your project is live.';
      listing.href = data.pageUrl;
      listing.hidden = false;
      checkout.hidden = true;
      verify.hidden = true;
      listing.focus();
    } catch (error) {
      paymentStatus.textContent = error.message || 'Could not verify your payment. Try again.';
    } finally {
      verify.disabled = false;
    }
  });
  const accountStatus=document.getElementById('submission-account-status');
  const details=document.getElementById('submission-details');
  fetch('/api/project-account?action=config',{cache:'no-store'}).then(r=>r.json()).then(async config=>{
    if(!config.ready)return;
    accountClient=createClient(config.url,config.key,{auth:communityAuthOptions});
    const {data:{session}}=await accountClient.auth.getSession();
    if(session?.user?.email_confirmed_at){
      const response=await fetch('/api/project-account',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
      if(response.ok){
        const account = await response.json();
        accountVerified=true;form.elements.email.value=session.user.email;form.elements.email.readOnly=true;document.getElementById('submission-account-callout').hidden=true;details.hidden=false;accountStatus.hidden=false;accountStatus.textContent=`Signed in as ${session.user.email}. This project will appear in your account.`;updateButton();
        configureLaunch(account);
      }
      else {accountStatus.hidden=false;accountStatus.innerHTML='To submit a project, <a href="/login">sign in or create an account</a> first.';}
    }
  }).catch(()=>{accountStatus.hidden=false;accountStatus.textContent='Accounts are temporarily unavailable. Please try again shortly.';});
  const button = form.querySelector('button[type=submit]');
  const status = document.getElementById('submission-status');
  const intent = document.getElementById('submission-type');
  const promotionFields = document.getElementById('promotion-fields');
  const membershipFields = document.getElementById('membership-fields');
  const imageInput = document.getElementById('project-image');
  const imagePreview = document.getElementById('project-image-preview');
  const imagePreviewPicture = imagePreview?.querySelector('img');
  const imageName = document.getElementById('project-image-name');
  let imagePreviewUrl;
  const updateImagePreview = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl = undefined;
    const file = imageInput?.files?.[0];
    imagePreview.hidden = !file;
    if (!file) { imagePreviewPicture.removeAttribute('src'); imageName.textContent = ''; return; }
    imageName.textContent = file.name;
    imagePreviewUrl = URL.createObjectURL(file);
    imagePreviewPicture.src = imagePreviewUrl;
  };
  imageInput?.addEventListener('change', updateImagePreview);
  const syncIntent = () => {
    const promotion = intent.value === 'promotion';
    promotionFields.hidden = !promotion;
    document.getElementById('instant-launch-help').hidden = intent.value !== 'instant';
    if (membershipFields) membershipFields.hidden = intent.value !== 'founding-feature';
    for (const input of promotionFields.querySelectorAll('input')) { input.disabled = !promotion; input.required = promotion; }
  };
  const query = new URLSearchParams(location.search);
  if (query.get('promotion') === '1') intent.value = 'promotion';
  if (query.get('membership') === '1') intent.value = 'founding-feature';
  intent.addEventListener('change',()=>{ syncIntent(); updateButton(); }); syncIntent();
  const configureLaunch = async account => {
    try {
      const response = await fetch('/api/submissions?action=launch-options', { cache: 'no-store' });
      if (!response.ok) return;
      const { instant } = await response.json();
      if (!instant) return;
      instantConfig = instant;
      const option = document.getElementById('submission-instant-option');
      option.disabled = false;
      option.hidden = false;
      const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(instant.price / 100);
      option.textContent = `Instant publishing · ${price} once`;
      if (!account.mailboxVerified) {
        const help = document.getElementById('instant-launch-help');
        help.replaceChildren('To use instant publishing, first sign in using an emailed link. ', Object.assign(document.createElement('a'), { href: '/login', textContent: 'Open sign-in' }));
      }
      const pending = account.submissions?.find(item => item.awaitingInstantPayment);
      if (pending && account.mailboxVerified) showCheckout(pending.id);
      if (pending && !account.mailboxVerified) intent.value = 'instant';
      syncIntent();
      updateButton();
    } catch {
      // Free submissions remain available if the optional checkout is unavailable.
    }
  };
  const updateButton = () => { button.disabled = !accountVerified; button.textContent=accountVerified?(intent.value==='instant'?'Save and continue to checkout':'Submit for review'):'Sign in to submit your project'; };
  updateButton();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!accountVerified) { status.innerHTML='Please <a href="/login">sign in or create an account</a> before submitting.'; return; }
    if (!form.reportValidity()) return;
    button.disabled = true;
    status.textContent = 'Sending your project for review…';
    try {
      const values = new FormData(form);
      const payload = Object.fromEntries([...values].filter(([key])=>key!=='image'));
      payload.promotionPurchased = values.get('promotionPurchased') === 'on';
      payload.consent = values.get('consent') === 'on';
      payload.emailOutreachConsent = values.get('emailOutreachConsent') === 'on';
      const file = values.get('image');
      if (!file?.size) throw new Error('Add your project logo.');
      if (file?.size) {
        
        payload.image = await prepareProjectImage(file);
      }
      const {data:{session}}=await accountClient.auth.getSession();
      if(!session?.user?.email_confirmed_at)throw new Error('Your session expired. Sign in again before submitting.');
      const response = await fetch('/api/submissions', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(session?.user?.email_confirmed_at?{Authorization:`Bearer ${session.access_token}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || 'Your project could not be submitted. Your details are still here; please try again.');
      if (payload.submissionType === 'instant') {
        showCheckout(data.id);
        return;
      }
      window.digivatedTrack?.('project_submit', {project_category:payload.category});
      const promotion = intent.value === 'promotion';
      const membership = intent.value === 'founding-feature';
      form.reset();form.dispatchEvent(new Event('input'));if(session?.user?.email_confirmed_at)form.elements.email.value=session.user.email;syncIntent();updateImagePreview();
      status.textContent = (membership ? 'Your included feature request has been received. It is not public yet. Review is required, and a feature is not guaranteed.' : promotion ? 'Your promotion request has been received. We will check your Gumroad purchase and review your project before preparing a feature. Keep your receipt and watch your email for any questions. Your project is not public yet.' : 'Thank you — your project has been received for review. It is not public yet. Submitting does not guarantee a feature or repost.') + (session ? ' View its status and private feedback in Your Projects.' : ' To track future submissions, sign in before submitting.');
      status.focus();
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'The response took too long. Your submission may have been received; please wait before trying again.' : (error.message || 'Unable to submit. Please try again.');
    } finally { updateButton(); }
  });
}
