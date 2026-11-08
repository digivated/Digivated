import test from 'node:test';
import assert from 'node:assert/strict';
import { remapGumroadMembership } from '../server/gumroad-membership.mjs';
import { CHECKOUT_KEY, OFFER_VERSION, checkoutStatus, makeMembershipCheckoutHandler } from '../server/membership-checkout.mjs';
import { membership } from '../src/data/membership.mjs';
import { makeAdminHandler } from '../server/admin-handler.mjs';
import { adminConfig, createSession, ADMIN_COOKIE } from '../server/admin-auth.mjs';
const key='Gumroad-SECRET-fixture-1234567890';
function storage(){const map=new Map(),writes=[];const redis=async c=>{const[op,k,v,...args]=c;if(op==='GET')return map.get(k)||null;if(op==='SET'){if(args.includes('NX')&&map.has(k))return null;map.set(k,v);writes.push(c);return'OK'}if(op==='DEL'){map.delete(k);return 1}if(op==='EVAL'){if(map.get(c[3])===c[4])map.delete(c[3]);return 1}throw Error('Unexpected command');};return{map,writes,redis}}
function provider(failAt='',failureStatus=403){
 const product={id:membership.gumroadProductId,name:'Digivated Founding Membership',price:500,currency:'usd',published:true,subscription_duration:null,is_tiered_membership:false,max_purchase_count:25,covers:[{id:'old-cover'}]};
 const products=[product,...['ui-prompt-package','digivated-promo','support-digivated'].map((slug,i)=>({id:'old'+i,name:slug,custom_permalink:slug,published:true})),{id:'unrelated',name:'Other draft',custom_permalink:'unrelated',published:true}];
 const calls=[];
 const fetcher=async(url,opts)=>{const path=new URL(url).pathname.slice(3),body=opts.body?JSON.parse(opts.body):null;calls.push({path,method:opts.method,body,auth:opts.headers.Authorization});assert.equal(new URL(url).origin,'https://api.gumroad.com');assert.equal(opts.redirect,'error');
  if(`${opts.method} ${path}`===failAt)return new Response(JSON.stringify({success:false,error:key}),{status:failureStatus});
  let data={success:true};
  if(path==='/products'&&opts.method==='GET')data.products=products;
  else if(path==='/user/preview_custom_html')data={success:true,custom_html:'<style>body{color:white}</style><h1>One membership.</h1>',sanitization_report:{truncated:false}};
  else if(path==='/user/custom_html')data.previous_custom_html='<p>Previous storefront</p>';
  else if(opts.method==='DELETE'&&path.endsWith('/covers/old-cover'))data.covers=[{id:'new-cover'}];
  else if(path.endsWith('/covers'))data.covers=[{id:'old-cover'},{id:'new-cover'}];
  else if(path.endsWith('/thumbnail')){}
  else if(path.endsWith('/disable'))products.find(p=>path.includes(encodeURIComponent(p.id))).published=false;
  else if(path.endsWith('/enable'))product.published=true;
  else if(path==='/products/'+encodeURIComponent(product.id)){if(opts.method==='PUT')Object.assign(product,body);else data.product=product;}
  else throw Error('Unexpected provider request '+path);
  return new Response(JSON.stringify(data),{status:200});
 };return{fetcher,calls,products,product};
}
const assets={offer:{name:membership.name,price:500,price_currency_type:'usd',description:'One project spotlight. News is not available yet.'},html:'<style>body{background:black}</style><h1>One membership.</h1>'};
test('seller remap publishes the exact one-time offer, retires only known products, and never persists the key',async()=>{
 const db=storage(),p=provider();const result=await remapGumroadMembership({token:key,redis:db.redis,fetcher:p.fetcher,assets});
 assert.equal(result.ready,true);assert.equal(result.checkoutUrl,membership.checkoutUrl);
 assert.equal(p.calls.some(c=>c.method==='DELETE'&&c.path.endsWith('/covers/old-cover')),true);
 assert.equal(p.calls.some(c=>c.method==='DELETE'&&c.path.endsWith('/covers/new-cover')),false);
 assert.equal(p.product.price,500);assert.equal(p.product.max_purchase_count,null);
 assert.equal(p.products.find(p=>p.id==='unrelated').published,true);
 assert.equal(p.products.filter(p=>p.id.startsWith('old')).every(p=>!p.published),true);
 assert.equal(JSON.stringify(db.writes).includes(key),false);assert.equal(JSON.stringify(result).includes(key),false);
 for(const call of p.calls){assert.equal(call.auth,'Bearer '+key);assert.equal(Object.hasOwn(call.body||{},'files'),false);assert.equal(Object.hasOwn(call.body||{},'rich_content'),false);}
 const updates=p.calls.filter(c=>c.method==='PUT'&&c.path.includes('/products/'));assert.equal(updates.some(c=>c.path.endsWith('/disable')),true);
 assert.equal((await checkoutStatus(db.redis)).ready,true);
});
for(const phase of ['DELETE /products/'+encodeURIComponent(membership.gumroadProductId)+'/covers/old-cover','PUT /products/'+encodeURIComponent(membership.gumroadProductId),'POST /products/'+encodeURIComponent(membership.gumroadProductId)+'/thumbnail'])test('provider failure does not leak credentials or enable incomplete checkout: '+phase,async()=>{
 const db=storage(),p=provider(phase);await assert.rejects(remapGumroadMembership({token:key,redis:db.redis,fetcher:p.fetcher,assets}),e=>e.status===503&&!e.message.includes(key));
 assert.equal((await checkoutStatus(db.redis)).ready,false);assert.equal(JSON.stringify(db.writes).includes(key),false);
 assert.equal(p.products.filter(p=>p.id.startsWith('old')).every(p=>p.published),true);
});
test('invalid token and an occupied setup lease cannot make provider calls',async()=>{
 const db=storage();let calls=0;const fetcher=async()=>{calls++;throw Error('must not run')};
 for(const token of ['', 'short',key+'\n'])await assert.rejects(remapGumroadMembership({token,redis:db.redis,fetcher,assets}),e=>e.status===400);
 db.map.set('digivated:membership:remap-lock','another-operation');await assert.rejects(remapGumroadMembership({token:key,redis:db.redis,fetcher,assets}),e=>e.status===409);assert.equal(calls,0);
});
test('public readiness fails closed, never returns private data, and rejects writes',async()=>{
 const db=storage();assert.deepEqual(await checkoutStatus(db.redis),{ready:false});
 db.map.set(CHECKOUT_KEY,JSON.stringify({version:OFFER_VERSION,productId:membership.gumroadProductId,price:500,billing:'monthly',status:'ready',token:key}));assert.deepEqual(await checkoutStatus(db.redis),{ready:false});
 const handler=makeMembershipCheckoutHandler({redis:db.redis});const headers={};let output;
 await handler({method:'POST'},{setHeader:(k,v)=>headers[k]=v,end:v=>output=JSON.parse(v)});assert.deepEqual(output,{ready:false});assert.equal(headers.Allow,'GET');
});
test('admin session, same-origin and CSRF are required before the key is used',async()=>{
 const db=storage();const origin='https://digivated.com';const env={DIGIVATED_ADMIN_PASSWORD_HASH:'scrypt:'+'1'.repeat(32)+':'+'2'.repeat(128),DIGIVATED_ADMIN_SESSION_SECRET:'a'.repeat(64),DIGIVATED_ADMIN_ORIGIN:origin};
 const cfg=adminConfig(env),session=await createSession(db.redis,cfg);let calls=0;
 const handler=makeAdminHandler({redis:db.redis,env,remapGumroadMembership:async({token})=>{calls++;assert.equal(token,key);return{ready:true}}});
 async function invoke(headers){let body;const res={statusCode:200,setHeader(){},end(v){body=JSON.parse(v)}};await handler({method:'POST',url:'/api/admin',headers:{'content-type':'application/json',origin,...headers},body:{action:'gumroad-membership',gumroadToken:key}},res);return{status:res.statusCode,body};}
 assert.equal((await invoke({'x-admin-csrf':session.csrf})).status,401);
 assert.equal((await invoke({cookie:`${ADMIN_COOKIE}=${session.token}`})).status,403);
 assert.equal((await invoke({cookie:`${ADMIN_COOKIE}=${session.token}`,'x-admin-csrf':session.csrf,origin:'https://other.invalid'})).status,403);
 assert.equal(calls,0);const ok=await invoke({cookie:`${ADMIN_COOKIE}=${session.token}`,'x-admin-csrf':session.csrf});assert.equal(ok.status,200);assert.equal(calls,1);assert.equal(JSON.stringify(ok).includes(key),false);
});

test('an incorrect buyer-facing description cannot open checkout',async()=>{
 const db=storage(),p=provider();const fetcher=async(url,opts)=>{
  const response=await p.fetcher(url,opts);
  if(opts.method==='GET'&&new URL(url).pathname==='/v2/products/'+encodeURIComponent(membership.gumroadProductId)){
   const value=await response.json();value.product.description='Old product offer';return new Response(JSON.stringify(value),{status:200});
  }
  return response;
 };
 await assert.rejects(remapGumroadMembership({token:key,redis:db.redis,fetcher,assets}),e=>e.status===503);
 assert.equal((await checkoutStatus(db.redis)).ready,false);
});

test('an unavailable custom storefront does not block the verified membership and cover update',async()=>{
 const db=storage(),p=provider('POST /user/preview_custom_html',403);
 const result=await remapGumroadMembership({token:key,redis:db.redis,fetcher:p.fetcher,assets});
 assert.equal(result.ready,true);assert.equal(result.warnings.length,1);
 assert.match(result.warnings[0],/native storefront was kept/);
 assert.equal(p.calls.some(c=>c.path==='/user/custom_html'),false);
 assert.equal(JSON.stringify(db.writes).includes(key),false);
});
test('an invalid token gives a useful safe error before any product mutation',async()=>{
 const db=storage(),p=provider('GET /products',401);
 await assert.rejects(remapGumroadMembership({token:key,redis:db.redis,fetcher:p.fetcher,assets}),e=>e.status===401&&/access token/.test(e.message)&&!e.message.includes(key));
 assert.equal(p.calls.length,1);assert.equal((await checkoutStatus(db.redis)).ready,false);
 assert.equal(JSON.stringify(db.writes).includes(key),false);
});
