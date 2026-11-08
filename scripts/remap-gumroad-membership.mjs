// Authenticated seller operation. Defaults to a read-only check; --apply publishes.
// Credentials are read from the environment and supplied to curl on stdin, never argv.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { membership } from '../src/data/membership.mjs';
const token = process.env.GUMROAD_ACCESS_TOKEN;
if (!token || /[\r\n]/.test(token)) throw new Error('Set GUMROAD_ACCESS_TOKEN securely with edit_products and profile-edit access. Do not put it in a command argument.');
const apply = process.argv.includes('--apply');
function request(method, path, body) {
  const lines = [`url = ${JSON.stringify(`https://api.gumroad.com/v2${path}`)}`,`request = ${JSON.stringify(method)}`,`header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,'header = "Accept: application/json"'];
  if (body !== undefined) lines.push('header = "Content-Type: application/json"',`data = ${JSON.stringify(JSON.stringify(body))}`);
  const result = spawnSync('curl',['--config','-','--silent','--show-error','--max-time','30','--write-out','\n%{http_code}'],{input:lines.join('\n'),encoding:'utf8',maxBuffer:8*1024*1024});
  if(result.status!==0)throw new Error('Gumroad could not be reached. No credentials are printed.');
  const end=result.stdout.lastIndexOf('\n'),status=Number(result.stdout.slice(end+1));
  let data;try{data=JSON.parse(result.stdout.slice(0,end));}catch{throw new Error(`Gumroad returned an unexpected response (${status}).`);}
  if(status<200||status>=300||data.success!==true){const error=new Error(`Gumroad rejected ${method} ${path} (${status}). Check seller access and scopes.`);error.status=status;error.optionalUnavailable=/do not have access to custom HTML pages/i.test(String(data.message||''));throw error;}
  return data;
}
const products=request('GET','/products').products;
const product=products.find(p=>p.id===membership.gumroadProductId);
if(!product||!['Digivated Founding Membership',membership.name].includes(product.name))throw new Error('The expected existing membership product was not found. No writes made.');
if(product.subscription_duration||product.is_tiered_membership)throw new Error('Expected a one-time product, not recurring billing. No writes made.');
const retiring=new Set(['ui-prompt-package','digivated-promo','support-digivated']);
const oldProducts=products.filter(p=>retiring.has(p.custom_permalink||p.permalink)&&p.id!==product.id&&!p.deleted);
console.info(JSON.stringify({mode:apply?'apply':'read-only',membership:product.name,retire:oldProducts.map(p=>p.name)}));
if(!apply)process.exit(0);
const backup=`/tmp/digivated-gumroad-before-${Date.now()}.json`;
writeFileSync(backup,JSON.stringify({products},null,2),{mode:0o600});
const payload=JSON.parse(readFileSync(new URL('../gumroad/membership-product.json',import.meta.url),'utf8'));
const html=readFileSync(new URL('../gumroad/storefront.html',import.meta.url),'utf8');
let preview=null;
try {preview=request('POST','/user/preview_custom_html',{custom_html:html});if(!preview.custom_html?.includes('<style'))preview=null;}
catch(error){if(![403,404].includes(error.status)&&!error.optionalUnavailable)throw error;}
if(!preview)console.info('Custom storefront is unavailable. The membership cover and thumbnail will still be updated; native colours are edited in Gumroad Settings > Profile > Design.');
const id=encodeURIComponent(product.id);
request('PUT',`/products/${id}`,{...payload,max_purchase_count:null});
const covers=request('POST',`/products/${id}/covers`,{url:'https://digivated.com/membership-cover.png'});
const oldCoverIds=new Set((product.covers||[]).map(c=>c.id));
const cover=covers.covers?.find(c=>!oldCoverIds.has(c.id));
if(!cover?.id)throw new Error('New cover was not returned. Checkout must remain disabled.');
request('PUT',`/products/${id}`,{cover_ids:[cover.id]});
request('POST',`/products/${id}/thumbnail`,{url:'https://digivated.com/membership-thumbnail.png'});
if(preview){
 try {const beforeProfile=request('PUT','/user/custom_html',{custom_html:preview.custom_html});writeFileSync(backup,JSON.stringify({products,previousProfileHtml:beforeProfile.previous_custom_html},null,2),{mode:0o600});}
 catch(error){if(![403,404].includes(error.status)&&!error.optionalUnavailable)throw error;console.info('Native storefront kept; custom HTML is not available.');}
}
request('PUT',`/products/${id}/enable`);
const updated=request('GET',`/products/${id}`).product;
if(updated.name!==membership.name||updated.price!==500||updated.currency!=='usd'||updated.subscription_duration||updated.max_purchase_count!=null||updated.published!==true)throw new Error('Product verification failed. Checkout must remain disabled.');
for(const old of oldProducts)if(old.published)request('PUT',`/products/${encodeURIComponent(old.id)}/disable`);
const final=request('GET','/products').products;
if(final.some(p=>oldProducts.some(old=>old.id===p.id)&&p.published))throw new Error('A retired product is still published. Review Gumroad before enabling checkout.');
console.info(JSON.stringify({updated:membership.name,price:'$5 USD once',checkout:membership.checkoutUrl,backup,checkoutReadyToEnable:true}));
