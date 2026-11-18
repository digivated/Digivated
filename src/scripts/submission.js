import { prepareProjectImage } from './submission-image.js';
import { createClient } from '@supabase/supabase-js';
import { communityAuthOptions } from './community-auth.js';
import { projectStage, trackerElement } from './launch-tracker.js';
import { badgePicker } from './badge-picker.js';
const form = document.getElementById('project-form');
if (form) {
  let accountClient, accountVerified = false, instantConfig, pendingInstantId;
  const resumePanel = document.getElementById('instant-launch-resume');
  const checkout = document.getElementById('instant-launch-checkout');
  const verify = document.getElementById('instant-launch-verify');
  const paymentStatus = document.getElementById('instant-launch-status');
  const listing = document.getElementById('instant-launch-listing');
  // Instant flow: save the project, open checkout in a new tab, then publish
  // automatically as soon as the payment shows up (no extra clicks needed).
  let pollTimer, pollUntil = 0, checking = false, accountEmail = '';
  const checkoutHref = () => {
    const url = new URL(instantConfig.checkoutUrl);
    url.searchParams.set('wanted', 'true');
    if (accountEmail) url.searchParams.set('email', accountEmail);
    return url.href;
  };
  const stopPolling = () => { clearTimeout(pollTimer); pollUntil = 0; };
  const schedule = () => { clearTimeout(pollTimer); if (Date.now() < pollUntil) pollTimer = setTimeout(() => checkPayment(true), 5000); };
  const checkPayment = async quiet => {
    if (checking || !pendingInstantId) return;
    checking = true;
    if (!quiet) { verify.disabled = true; paymentStatus.textContent = 'Checking your payment…'; }
    try {
      const { data: { session } } = await accountClient.auth.getSession();
      if (!session) throw new Error('Your session expired. Sign in and resume from Your Projects.');
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'publish-instant', id: pendingInstantId }),
        signal: AbortSignal.timeout(26000)
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && /could not find an eligible payment/i.test(data.error || '')) {
        if (!quiet) paymentStatus.textContent = 'Payment not found yet. Finish checkout in the other tab — this page will publish your project as soon as it goes through.';
        if (!pollUntil) pollUntil = Date.now() + 15 * 60000;
        return schedule();
      }
      if (!response.ok) throw new Error(data.error || 'Could not verify the purchase.');
      showLive(data.pageUrl);
    } catch (error) {
      if (quiet) return schedule();
      paymentStatus.textContent = error.message || 'Could not verify your payment. Try again.';
    } finally {
      checking = false;
      verify.disabled = false;
    }
  };
  const cancelButton = document.getElementById('instant-launch-cancel');
  let checkoutTab = null;
  const showLive = pageUrl => {
    stopPolling();
    document.getElementById('instant-launch-title').textContent = 'Your project is live ⚡';
    document.getElementById('instant-launch-copy').textContent = 'Payment received. Your project is published and has an open homepage spot for 7 days.';
    paymentStatus.textContent = 'Your project is live.';
    listing.href = pageUrl;
    listing.hidden = false;
    checkout.hidden = true;
    verify.hidden = true;
    cancelButton.hidden = true;
    document.getElementById('instant-launch-cancel-note').hidden = true;
    listing.focus();
  };
  // Backing out: nothing is charged until checkout is completed. The server
  // double-checks with Gumroad first, and publishes instead if they did pay.
  cancelButton.addEventListener('click', async () => {
    if (!pendingInstantId) return;
    cancelButton.disabled = true;
    verify.disabled = true;
    stopPolling();
    paymentStatus.textContent = 'Cancelling…';
    try {
      const { data: { session } } = await accountClient.auth.getSession();
      if (!session) throw new Error('Your session expired. Sign in, then cancel from Your Projects.');
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'cancel-instant', id: pendingInstantId }),
        signal: AbortSignal.timeout(26000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not cancel. Try again.');
      if (data.published) return showLive(data.pageUrl);
      try { checkoutTab?.close(); } catch {}
      checkoutTab = null;
      pendingInstantId = undefined;
      paymentStatus.textContent = '';
      resumePanel.hidden = true;
      details.hidden = false;
      if (query.get('resume')) history.replaceState(null, '', location.pathname);
      status.textContent = 'Payment cancelled — you weren’t charged. Your details are still here: choose a launch option and submit again.';
      document.getElementById('sub-step-launch').scrollIntoView({ block: 'start' });
      (document.querySelector('[data-tiers] input:checked') || status).focus();
      document.dispatchEvent(new CustomEvent('digivated:notifications-updated'));
    } catch (error) {
      paymentStatus.textContent = error.message || 'Could not cancel. Try again.';
      pollUntil = Date.now() + 15 * 60000;
      schedule();
    } finally {
      cancelButton.disabled = false;
      verify.disabled = false;
    }
  });
  const showCheckout = (id, popup) => {
    checkoutTab = popup && !popup.closed ? popup : null;
    pendingInstantId = id;
    checkout.href = checkoutHref();
    if (popup && !popup.closed) popup.location.href = checkout.href;
    else popup?.close?.();
    document.getElementById('instant-launch-email').textContent = accountEmail || 'your account email';
    details.hidden = true;
    resumePanel.hidden = false;
    paymentStatus.textContent = popup && !popup.closed ? 'Waiting for your payment…' : 'Open checkout to pay. This page publishes your project as soon as payment goes through.';
    pollUntil = Date.now() + 15 * 60000;
    schedule();
    resumePanel.scrollIntoView({ block: 'start' });
    (popup && !popup.closed ? verify : checkout).focus();
  };
  checkout.addEventListener('click', () => { pollUntil = Date.now() + 15 * 60000; schedule(); paymentStatus.textContent = 'Waiting for your payment…'; });
  verify.addEventListener('click', () => checkPayment(false));
  // Coming back from the checkout tab triggers an immediate check.
  const onReturn = () => { if (!document.hidden && pollUntil && !resumePanel.hidden) checkPayment(true); };
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);
  document.getElementById('project-import').onclick=async()=>{
    const importButton=document.getElementById('project-import'),message=document.getElementById('project-import-status');
    if(!form.elements.url.reportValidity())return;
    importButton.disabled=true;message.textContent='Reading your website…';
    try{
      const {data:{session}}=await accountClient.auth.getSession();
      if(!session)throw Error('Sign in before importing project details.');
      const response=await fetch('/api/submissions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'read-site',url:form.elements.url.value}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Could not read that website.');
      let filled=0;for(const key of ['name','description'])if(!form.elements[key].value.trim()&&data[key]){form.elements[key].value=data[key];filled++;}
      form.dispatchEvent(new Event('input',{bubbles:true}));message.textContent=filled?'Details imported. Review the text, choose a category, and upload your logo.':'Existing details were kept. You can edit them below.';
    }catch(error){message.textContent=error.message||'Import unavailable. You can enter your details manually.';}finally{importButton.disabled=false;}
  };
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
  const badgePanel = document.getElementById('submission-badge');
  const badgePickerSlot = document.getElementById('submission-badge-picker');
  // "Check my website" right on the saved screen, using the same verify call as the dashboard.
  function setupBadgeCheck(item, signedIn) {
    const button = document.getElementById('submission-badge-verify');
    const note = document.getElementById('submission-badge-status');
    const dashboard = document.getElementById('submission-badge-dashboard');
    note.textContent = ''; note.dataset.tone = '';
    button.hidden = !signedIn;
    dashboard.classList.toggle('primary', !signedIn);
    if (!signedIn) { note.textContent = 'Confirm your email and sign in, then press “Check my website” in your dashboard.'; return; }
    let host = 'your website';
    try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
    button.onclick = async () => {
      button.disabled = true; button.textContent = 'Checking your website…'; note.dataset.tone = '';
      note.textContent = `Looking for your badge on ${host}. This can take up to 30 seconds.`;
      try {
        const { data: { session: current } } = await accountClient.auth.getSession();
        if (!current) throw Error('Your session expired. Sign in again, then check from your dashboard.');
        const response = await fetch('/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.access_token}` }, body: JSON.stringify({ action: 'verify-badge', id: item.id }), signal: AbortSignal.timeout(30000) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(result.error || 'Badge could not be verified. Try again.');
        const verified = { ...item, status: result.pageUrl ? 'approved' : item.status, launch: { ...item.launch, scheduledAt: result.scheduledAt || item.launch.scheduledAt, badgeVerifiedAt: new Date().toISOString() } };
        document.getElementById('submission-badge-tracker').replaceChildren(trackerElement(projectStage(verified)));
        const when = new Date(verified.launch.scheduledAt);
        note.dataset.tone = 'ok';
        note.textContent = result.pageUrl ? 'Badge verified. Your project is live!'
          : `Badge verified. Your launch is scheduled${Number.isFinite(when.getTime()) ? ' for ' + when.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''}. Keep the badge on your site.`;
        document.getElementById('submission-badge-title').textContent = result.pageUrl ? 'You’re live.' : 'Badge verified. You’re all set.';
        button.hidden = true; dashboard.classList.add('primary');
        if (result.pageUrl) { dashboard.href = result.pageUrl; dashboard.textContent = 'View your project →'; }
        document.dispatchEvent(new CustomEvent('digivated:notifications-updated'));
      } catch (error) {
        note.dataset.tone = 'error';
        note.textContent = error.name === 'TimeoutError' ? 'Your website took too long to respond. Make sure it is published, then try again.' : error.message;
      } finally { button.disabled = false; if (!button.hidden) button.textContent = 'Check my website'; }
    };
  }
  const intent = document.getElementById('submission-type');
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
    const help = {directory:'free-launch-help',instant:'instant-launch-help','founding-feature':'membership-fields'};
    intent.setAttribute('aria-describedby', help[intent.value] || help.directory);
    document.getElementById('free-launch-help').hidden = intent.value !== 'directory';
    document.getElementById('instant-launch-help').hidden = intent.value !== 'instant';
    if (membershipFields) membershipFields.hidden = intent.value !== 'founding-feature';
    syncTiers();
  };
  const query = new URLSearchParams(location.search);
  if (query.get('membership') === '1') intent.value = 'founding-feature';
  intent.addEventListener('change',()=>{ syncIntent(); updateButton(); syncTiers(); }); syncIntent();
  // Tier cards mirror the select: availability (Instant only shows once checkout is
  // ready), price, and the chosen option, in both directions.
  function syncTiers() {
    const tiers = document.querySelector('[data-tiers]');
    const instantOption = document.getElementById('submission-instant-option');
    if (!tiers) return;
    const instantCard = tiers.querySelector('[data-tier="instant"]');
    const ready = instantOption && !instantOption.disabled && !instantOption.hidden;
    instantCard.hidden = !ready;
    instantCard.querySelector('input').disabled = !ready;
    const price = instantOption?.textContent.match(/\(([^)]+)\)/)?.[1];
    if (price) instantCard.querySelector('[data-tier-price]').textContent = price;
    for (const card of tiers.querySelectorAll('[data-tier]')) {
      const input = card.querySelector('input');
      input.checked = card.dataset.tier === intent.value;
      card.classList.toggle('is-selected', input.checked);
    }
  }
  const tierGroup = document.querySelector('[data-tiers]');
  tierGroup?.addEventListener('change', event => {
    if (event.target.name !== 'dg-tier' || intent.value === event.target.value) return;
    intent.value = event.target.value;
    intent.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const instantChoice = document.getElementById('submission-instant-option');
  if (instantChoice) new MutationObserver(syncTiers).observe(instantChoice, { attributes: true, characterData: true, childList: true, subtree: true });
  syncTiers();
  const configureLaunch = async account => {
    try {
      const response = await fetch('/api/submissions?action=launch-options', { cache: 'no-store' });
      if (!response.ok) return;
      const { instant, nextFreeLaunch } = await response.json();
      if(nextFreeLaunch)document.getElementById('free-launch-date').textContent='Next free launch: '+new Date(nextFreeLaunch).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'})+' (UTC).';
      if (!instant) return;
      instantConfig = instant;
      const option = document.getElementById('submission-instant-option');
      option.disabled = false;
      option.hidden = false;
      const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', trailingZeroDisplay: 'stripIfInteger' }).format(instant.price / 100);
      option.textContent = `Instant Publishing (${price})`;
      if (account.email) accountEmail = account.email;
      const resumeId = query.get('resume');
      const pending = account.submissions?.find(item => item.awaitingInstantPayment && (!resumeId || item.id === resumeId)) || account.submissions?.find(item => item.awaitingInstantPayment);
      if (pending) showCheckout(pending.id);
      if (!pending && query.get('spot') === '1') intent.value = 'instant';
      syncIntent();
      updateButton();
    } catch {
      // Free submissions remain available if the optional checkout is unavailable.
    }
  };
  const updateButton = () => { button.disabled = !accountVerified; button.textContent=accountVerified?(intent.value==='instant'?`Continue to payment${instantConfig?.price?` — ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',trailingZeroDisplay:'stripIfInteger'}).format(instantConfig.price/100)}`:''} →`:intent.value==='directory'?'Save and get your badge':'Submit for review'):'Sign in to submit your project'; };
  updateButton();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!accountVerified) { status.innerHTML='Please <a href="/login">sign in or create an account</a> before submitting.'; return; }
    if (!form.reportValidity()) return;
    // Open the checkout tab now, while this tap still counts as a user action
    // (browsers block tabs opened later). It's pointed at checkout once saved.
    let popup = null;
    if (intent.value === 'instant' && instantConfig) {
      try { popup = window.open('', '_blank'); if (popup) { popup.opener = null; popup.document.title = 'Opening checkout…'; popup.document.body.style.cssText = 'background:#0b0b0b;color:#ccc;font:14px monospace;padding:24px'; popup.document.body.textContent = 'Opening secure checkout…'; } } catch { popup = null; }
    }
    button.disabled = true;
    status.textContent = intent.value === 'directory' ? 'Saving your project…' : 'Submitting your project…';
    try {
      const values = new FormData(form);
      const payload = Object.fromEntries([...values].filter(([key])=>key!=='image'));
      payload.consent = values.get('consent') === 'on';
      payload.activityNotifications = values.get('activityNotifications') === 'on';
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
      document.dispatchEvent(new CustomEvent('digivated:notifications-updated'));
      if (payload.submissionType === 'instant') {
        accountEmail = payload.email || accountEmail;
        showCheckout(data.id, popup);
        popup = null;
        return;
      }
      window.digivatedTrack?.('project_submit', {project_category:payload.category});
      const membership = payload.submissionType === 'founding-feature';
      form.reset();form.dispatchEvent(new Event('input'));if(session?.user?.email_confirmed_at)form.elements.email.value=session.user.email;syncIntent();updateImagePreview();
      if (data.launch) {
        if (data.launch.badge) {
          status.textContent = 'Project saved. Add and verify your website badge to join the launch cycle.';
          badgePickerSlot.replaceChildren(badgePicker(data.id, { label: `Badge styles for ${payload.name}` }));
          const scheduledDate = new Date(data.launch.scheduledAt);
          document.getElementById('submission-badge-launch').textContent = Number.isFinite(scheduledDate.getTime())
            ? `Launch date: ${scheduledDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'})}. Projects publish every Monday at 9:00 AM Eastern.`
            : 'Your scheduled launch date is shown in Your Projects.';
          badgePanel.hidden = false;
          form.classList.add('is-saved');
          const savedItem = { id: data.id, name: payload.name, url: payload.url, date: new Date().toISOString(), status: 'pending', launch: data.launch };
          document.getElementById('submission-badge-tracker').replaceChildren(trackerElement(projectStage(savedItem)));
          document.getElementById('submission-badge-dashboard').href = '/account#project-' + encodeURIComponent(data.id);
          setupBadgeCheck(savedItem, Boolean(session?.user?.email_confirmed_at));
          badgePanel.scrollIntoView({ block: 'start' });
          document.getElementById('submission-badge-title').focus();
        } else {
          status.replaceChildren('Project saved. ', Object.assign(document.createElement('a'), {
            href: '/account#account-submissions', textContent: 'Get your website badge in Your Projects →'
          }));
          status.focus();
        }
        return;
      }
      status.textContent = (membership ? 'Your included feature request has been received. It is not public yet. Review is required, and a feature is not guaranteed.' : 'Thank you — your project has been received for review. It is not public yet. Submitting does not guarantee a feature or repost.') + (session ? ' View its status and private feedback in Your Projects.' : ' To track future submissions, sign in before submitting.');
      status.focus();
    } catch (error) {
      popup?.close?.();
      status.textContent = error.name === 'TimeoutError' ? 'The response took too long. Your submission may have been received; please wait before trying again.' : (error.message || 'Unable to submit. Please try again.');
    } finally { updateButton(); }
  });
  // Live progress: each section is marked done once its required fields are valid.
  const progressItems = [...document.querySelectorAll('#submission-progress [data-progress]')];
  const sectionDone = id => {
    const section = document.getElementById(id);
    if (!section) return false;
    const fields = [...section.querySelectorAll('input,select,textarea')].filter(field => field.required && field.type !== 'checkbox');
    return fields.length ? fields.every(field => field.type === 'file' ? !!field.files?.length : field.checkValidity()) : !!intent.value;
  };
  const updateProgress = () => {
    let current = false, previousDone = true;
    for (const item of progressItems) {
      // A step only counts once every step before it is complete.
      const done = previousDone && sectionDone(item.dataset.progress);
      previousDone = done;
      item.classList.toggle('is-done', done);
      const isCurrent = !done && !current;
      item.classList.toggle('is-current', isCurrent);
      if (isCurrent) current = true;
      item.querySelector('.fl-progress-mark').textContent = done ? '[✓]' : '[ ]';
    }
  };
  form.addEventListener('input', updateProgress);
  form.addEventListener('change', updateProgress);
  updateProgress();
}
