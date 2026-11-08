import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AdminError } from './admin-auth.mjs';
import { CHECKOUT_KEY, OFFER_VERSION, checkoutStatus } from './membership-checkout.mjs';
import { membership } from '../src/data/membership.mjs';
const LOCK = 'digivated:membership:remap-lock';
const RELEASE = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
const retiredSlugs = new Set(['ui-prompt-package','digivated-promo','support-digivated']);
const accurateDescription = value => typeof value === 'string' && /project spotlight/i.test(value) && /News is not available yet/i.test(value);
const backupFields = ['id','name','price','currency','published','description','custom_summary','custom_receipt','max_purchase_count','custom_html','covers'];
export async function remapGumroadMembership({token,redis,fetcher=fetch,assets}) {
  if(typeof token!=='string'||!/[A-Za-z0-9]/.test(token)||!/^\S{20,500}$/.test(token)||/[^\x21-\x7e]/.test(token))throw new AdminError(400,'Enter a valid Gumroad seller API key.');
  const lease=randomUUID();
  if(await redis(['SET',LOCK,lease,'NX','EX',120])!=='OK')throw new AdminError(409,'A Gumroad update is already running. Wait, then check its status.');
  let phase='checking seller access';
  const timeout=AbortSignal.timeout(95000);
  async function api(method,path,body) {
    const response=await fetcher(`https://api.gumroad.com/v2${path}`,{
      method,redirect:'error',cache:'no-store',signal:AbortSignal.any([timeout,AbortSignal.timeout(10000)]),
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    if(!response.ok)throw new Error('Provider request failed');
    const data=await response.json();
    if(data.success!==true)throw new Error('Provider rejected request');
    return data;
  }
  try {
    const products=(await api('GET','/products')).products;
    if(!Array.isArray(products))throw new Error('Invalid product list');
    const product=products.find(p=>p.id===membership.gumroadProductId);
    if(!product||!['Digivated Founding Membership',membership.name].includes(product.name)||product.subscription_duration||product.is_tiered_membership)throw new AdminError(400,'This key must belong to the Digivated seller account with the existing one-time membership product.');
    const old=products.filter(p=>retiredSlugs.has(p.custom_permalink||p.permalink)&&p.id!==product.id&&!p.deleted);
    const offer=assets?.offer||JSON.parse(await readFile(new URL('../gumroad/membership-product.json',import.meta.url),'utf8'));
    const html=assets?.html||await readFile(new URL('../gumroad/storefront.html',import.meta.url),'utf8');
    if(offer.name!==membership.name||offer.price!==500||offer.price_currency_type!=='usd'||Object.hasOwn(offer,'subscription_duration'))throw new Error('Prepared offer mismatch');
    phase='checking storefront editing permission';
    const preview=await api('POST','/user/preview_custom_html',{custom_html:html});
    if(preview.sanitization_report?.truncated||!preview.custom_html?.includes('One membership.')||!preview.custom_html.includes('<style'))throw new Error('Storefront preview failed');
    const backupKey=`digivated:membership:backup:${lease}`;
    const snapshot={createdAt:new Date().toISOString(),products:[product,...old].map(p=>Object.fromEntries(backupFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])))};
    await redis(['SET',backupKey,JSON.stringify(snapshot),'EX',604800]);
    // Invalidate a previous checkout marker before changing the seller offer.
    await redis(['DEL',CHECKOUT_KEY]);
    const id=encodeURIComponent(product.id);
    phase='updating the membership product';
    await api('PUT',`/products/${id}`,{...offer,max_purchase_count:null});
    phase='uploading the matching cover and thumbnail';
    const covers=await api('POST',`/products/${id}/covers`,{url:'https://digivated.com/membership-cover.png'});
    const previousIds=new Set((product.covers||[]).map(c=>c.id));
    const cover=covers.covers?.find(c=>!previousIds.has(c.id));
    if(!cover?.id)throw new Error('Cover was not returned');
    await api('PUT',`/products/${id}`,{cover_ids:[cover.id]});
    await api('POST',`/products/${id}/thumbnail`,{url:'https://digivated.com/membership-thumbnail.png'});
    phase='publishing the matching storefront';
    const profile=await api('PUT','/user/custom_html',{custom_html:preview.custom_html});
    await redis(['SET',backupKey,JSON.stringify({...snapshot,previousProfileHtml:profile.previous_custom_html??null}),'EX',604800]);
    phase='publishing and verifying the membership';
    await api('PUT',`/products/${id}/enable`);
    const updated=(await api('GET',`/products/${id}`)).product;
    if(updated?.id!==product.id||updated.name!==membership.name||updated.price!==500||updated.currency!=='usd'||updated.subscription_duration!==null||updated.is_tiered_membership!==false||updated.max_purchase_count!==null||updated.published!==true||!accurateDescription(updated.description))throw new Error('Verification failed');
    phase='retiring the old standalone offers';
    for(const item of old)if(item.published)await api('PUT',`/products/${encodeURIComponent(item.id)}/disable`);
    const final=(await api('GET','/products')).products;
    if(!Array.isArray(final)||final.some(p=>old.some(item=>item.id===p.id)&&p.published)||!final.some(p=>p.id===product.id&&p.name===membership.name&&p.price===500&&p.currency==='usd'&&p.published===true&&p.subscription_duration===null&&p.is_tiered_membership===false&&p.max_purchase_count===null&&accurateDescription(p.description)))throw new Error('Final verification failed');
    await redis(['SET',CHECKOUT_KEY,JSON.stringify({version:OFFER_VERSION,productId:product.id,price:500,billing:'one-time',status:'ready',verifiedAt:new Date().toISOString()})]);
    return {...await checkoutStatus(redis),ok:true,message:'Gumroad is updated. Membership checkout is now open. Your API key was not saved.'};
  } catch(error) {
    if(error instanceof AdminError)throw error;
    // Never include provider errors, request headers, token, or response bodies.
    throw new AdminError(503,`Gumroad could not finish ${phase}. Check product/profile editing access and retry. An incomplete update does not open checkout.`);
  } finally {
    token='';
    try{await redis(['EVAL',RELEASE,1,LOCK,lease]);}catch{/* Lease expires independently. */}
  }
}
