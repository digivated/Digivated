import { authCallbackState, communityAuthOptions } from './community-auth.js';

function needsAccountLookup() {
 const callback = authCallbackState(location);
 if (callback.incoming || callback.error) return true;
 try {
  for (let index = 0; index < localStorage.length; index++) {
   const key = localStorage.key(index);
   if (key && /^sb-.+-auth-token$/.test(key) && localStorage.getItem(key)) return true;
  }
  return false;
 } catch {
  return true;
 }
}

let connection;
export function accountConnection({optional=false}={}){
 if(optional && !needsAccountLookup()) return Promise.resolve(null);
 if(!connection)connection=(async()=>{
  const response=await fetch('/api/project-account?action=config',{cache:'no-store'});
  if(!response.ok)throw Error('Account sign-in is temporarily unavailable.');
  const config=await response.json();
  if(!config.ready)throw Error('Account sign-in is temporarily unavailable.');
  const { createClient } = await import('@supabase/supabase-js');
  return {client:createClient(config.url,config.key,{auth:communityAuthOptions}),config};
 })().catch(error=>{connection=null;throw error;});
 return connection;
}

let pending;
export function accountSession({fresh=false, optional=false}={}){
 if(optional && !needsAccountLookup()) return Promise.resolve({state:'signed-out',client:null,session:null});
 if(fresh)pending=null;
 if(pending)return pending;
 const request=(async()=>{
  const {client,config}=await accountConnection();
  const {data:{session},error}=await client.auth.getSession();
  if(error)throw error;
  if(!session?.access_token)return {state:'signed-out',client,session:null,config};
  try{
   const check=await fetch('/api/project-account?action=me',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
   if(check.ok){const data=await check.json();return {state:'signed-in',client,session,email:data.email,config};}
   return {state:check.status===401?'unverified':'unavailable',client,session,config};
  }catch{return {state:'unavailable',client,session,config};}
 })().catch(error=>{if(pending===request)pending=null;throw error;});
 pending=request;
 return request;
}
