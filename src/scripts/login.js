import { accountSession } from './account-session.js';

const form=document.getElementById('login-email-form');
if(form){
 const $=id=>document.getElementById(id);
 const tabs=[$('login-tab-signin'),$('login-tab-signup')];
 const status=$('login-status'),submit=$('login-submit'),explanation=$('login-explanation'),password=form.elements.password,email=form.elements.email;
 const params=new URLSearchParams(location.search);
 const next=params.get('next');
 const safeNext=next&&(/^\/account#project-[a-z0-9_-]{1,100}$/i.test(next)||/^\/creator\?id=[a-f0-9-]{36}$/i.test(next)||/^\/inbox(?:\?id=[a-f0-9-]{36})?$/i.test(next)||/^\/(?:submit-project|notifications|account|saved|creators)$/.test(next)||/^\/(?:threads(?:\/(?:new|[a-z0-9][a-z0-9-]{0,99}))?(?:\?(?:forum|view|q|sort)=[a-z0-9 %-]{0,60})?|projects\/(?:listing\/)?[a-z0-9][a-z0-9-]{0,99})?(?:#(?:feedback|launching-next|comment-[a-f0-9-]{36}))?$/.test(next));
 const destination=safeNext?next:'/account';
 let mode=params.get('mode')==='signup'?'signup':'signin';
 let client=null,busy=false,unavailable='',pending=null;
 const codeForm=$('login-code-form'),code=$('login-code');
 const showCode=(challenge,address)=>{
  pending={challenge,address};
  $('login-code-email').textContent=address;
  form.hidden=true;explanation.hidden=true;$('login-terms').hidden=true;codeForm.hidden=false;
  code.value='';code.focus();
 };
 const hideCode=()=>{
  pending=null;code.value='';codeForm.hidden=true;form.hidden=false;explanation.hidden=false;
 };
 const copy={
  signin:{title:'Welcome back.',subtitle:'Sign in to track your launches and read feedback.',explain:'Sign in with your email and password.',submit:'Sign in',switchText:'New to Digivated? ',switchAction:'Create an account'},
  signup:{title:'Join Digivated.',subtitle:'Launch your project for free and get real feedback from builders.',explain:'Create your account with an email and password.',submit:'Create account',switchText:'Already have an account? ',switchAction:'Sign in'}
 };
 const say=(message,tone='')=>{status.textContent=message;status.dataset.tone=tone;};
 const render=()=>{
  const c=copy[mode];
  tabs.forEach((tab,index)=>{const selected=(index===0?'signin':'signup')===mode;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
  $('login-form-panel').setAttribute('aria-labelledby',mode==='signin'?'login-tab-signin':'login-tab-signup');
  $('login-title').textContent=c.title;$('login-subtitle').textContent=c.subtitle;
  explanation.textContent=c.explain;submit.textContent=c.submit;
  $('login-reset').hidden=mode!=='signin';$('login-alternative').hidden=mode!=='signin';
  $('login-password-hint').hidden=mode!=='signup';$('login-terms').hidden=mode!=='signup';
  $('login-switch').firstChild.textContent=c.switchText;$('login-switch-button').textContent=c.switchAction;
  password.autocomplete=mode==='signin'?'current-password':'new-password';password.minLength=mode==='signin'?1:10;
  document.title=(mode==='signin'?'Log in':'Create account')+' · Digivated';
  if(unavailable)say(unavailable,'error');else say('');
 };
 const setMode=value=>{if(busy)return;hideCode();mode=value;render();const url=new URL(location.href);if(mode==='signup')url.searchParams.set('mode','signup');else url.searchParams.delete('mode');history.replaceState(null,'',url);};
 tabs.forEach((tab,index)=>{tab.onclick=()=>setMode(index===0?'signin':'signup');tab.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const other=tabs[index===0?1:0];other.click();other.focus();};});
 $('login-switch-button').onclick=()=>{setMode(mode==='signin'?'signup':'signin');email.focus();};
 const toggle=$('login-show-password');
 toggle.onclick=()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.textContent=show?'Hide':'Show';toggle.setAttribute('aria-pressed',String(show));password.focus();};
 render();

 const friendly=error=>{
  const code=error?.code||'';
  if(code==='invalid_credentials')return 'That email and password don’t match. Check them, or use “Forgot password?”.';
  if(code==='email_not_confirmed')return 'Confirm your email with the verification link we sent first.';
  if(code==='over_request_rate_limit'||code==='over_email_send_rate_limit'||error?.status===429)return 'Too many attempts. Wait a minute, then try again.';
  if(error?.name==='TimeoutError'||error?.name==='TypeError')return 'We couldn’t reach Digivated. Check your connection and try again.';
  return error?.message||'Something went wrong. Please try again.';
 };
 const validEmail=()=>{const value=email.value.trim();if(!value){say('Enter your email address.','error');email.focus();return '';}if(!email.checkValidity()){say('Enter a valid email address, like you@example.com.','error');email.focus();return '';}return value;};
 async function action(button,work,{needsPassword=false}={}){
  if(busy)return;
  const address=validEmail();if(!address)return;
  if(needsPassword){
   if(!password.value){say('Enter your password.','error');password.focus();return;}
   if(mode==='signup'&&password.value.length<10){say('Use at least 10 characters for your password.','error');password.focus();return;}
  }
  if(!client){say('Account sign-in is temporarily unavailable. Please try again shortly.','error');return;}
  busy=true;button.disabled=true;button.setAttribute('aria-busy','true');
  const label=button.textContent;button.textContent=button===submit?(mode==='signup'?'Creating your account…':'Signing in…'):'Sending…';
  say('');
  try{await work(address);}catch(error){say(friendly(error),'error');}
  finally{busy=false;button.disabled=false;button.removeAttribute('aria-busy');button.textContent=button===submit?copy[mode].submit:label;}
 }
 form.onsubmit=event=>{
  event.preventDefault();
  if(pending)return;
  action(submit,async address=>{
   if(mode==='signup'){
    const result=await signupRequest({email:address});
    showCode(result.challenge,address);
    return;
   }
   const {data,error}=await client.auth.signInWithPassword({email:address,password:password.value});
   if(error)throw error;
   if(data.session){password.value='';say('Signed in. Taking you to your dashboard…','ok');location.replace(destination);return;}
   say('Please try signing in again.','error');
  },{needsPassword:true});
 };
 async function signupRequest(payload){
  const response=await fetch('/api/project-account?action=signup',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Signup is temporarily unavailable. Please try again.');
  if(!payload.challenge&&!result.challenge)throw Error('No verification code was sent. Try again.');
  return result;
 }
 codeForm.onsubmit=event=>{
  event.preventDefault();
  if(!pending)return;
  const {challenge,address}=pending;
  action(event.submitter||codeForm.querySelector('[type=submit]'),async()=>{
   await signupRequest({email:address,challenge,code:code.value,password:password.value});
   const {data}=await client.auth.signInWithPassword({email:address,password:password.value}).catch(()=>({}));
   password.value='';
   if(data?.session){location.replace(destination);return;}
   hideCode();mode='signin';render();
   say('Your account is verified. Sign in with your password to continue.', 'ok');
  });
 };
 $('login-resend-code').onclick=event=>{
  if(!pending)return;
  const {address}=pending;
  action(event.currentTarget,async()=>{
   const result=await signupRequest({email:address});
   showCode(result.challenge,address);
   say('We sent a new code. Check your inbox.','ok');
  });
 };
 $('login-change-email').onclick=()=>{if(!busy){setMode('signup');email.focus();}};
 $('login-email-link').onclick=event=>action(event.currentTarget,async address=>{const {error}=await client.auth.signInWithOtp({email:address,options:{shouldCreateUser:false,emailRedirectTo:`${location.origin}/account`}});if(error)throw error;say(`If ${address} has an account, a sign-in link is on its way. Check your inbox.`,'ok');});
 $('login-reset').onclick=event=>action(event.currentTarget,async address=>{const {error}=await client.auth.resetPasswordForEmail(address,{redirectTo:`${location.origin}/account`});if(error)throw error;say(`If ${address} has an account, a password reset link is on its way. Check your inbox.`,'ok');});
 $('login-google').onclick=async event=>{
  if(busy||!client)return;busy=true;event.currentTarget.disabled=true;say('Opening Google…');
  try{const redirectTo=`${location.origin}/login${safeNext?'?next='+encodeURIComponent(next):''}`;const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo}});if(error)throw error;}
  catch(error){say(friendly(error),'error');busy=false;event.currentTarget.disabled=false;}
 };

 async function boot(){
  const result=await accountSession();
  client=result.client;
  if(result.config?.google)$('login-google-group').hidden=false;
  const callback=new URLSearchParams(location.hash.slice(1));
  if(callback.get('error_description')){say('Google sign-in didn’t finish. Please try again or use your email.','error');history.replaceState(null,'',location.pathname+location.search);}
  if(result.state==='signed-in'){say('You’re already signed in. Taking you to your dashboard…','ok');location.replace(destination);return;}
  if(result.state==='unverified')say('Finish verifying your email with the link we sent, then sign in.','error');
  if(result.state==='unavailable')say('Account verification is temporarily unavailable. Please try again.','error');
 }
 boot().catch(error=>{unavailable=error.message||'Account sign-in is temporarily unavailable.';say(unavailable,'error');});
}
