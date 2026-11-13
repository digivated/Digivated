import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
// Resolve once and pin the request to the checked address; redirects are checked again.
export function publicIPv4(address) {
 if(isIP(address)!==4)return false;
 const [a,b]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export async function readProjectSite(value, { resolve=lookup, transport=request }={}) {
 let url=new URL(value);const origin=url.origin,deadline=Date.now()+24000;
 for(let hop=0;hop<4;hop++){
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||isIP(url.hostname)||url.origin!==origin)throw Error('Use a public HTTPS project URL without cross-domain redirects.');
  if(Date.now()>=deadline)throw Error('The website took too long to check. Try its final page URL.');
  let dnsTimer;let addresses;try{addresses=await Promise.race([resolve(url.hostname,{family:4,all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('Website lookup timed out.')),Math.min(5000,deadline-Date.now()));})]);}finally{clearTimeout(dnsTimer);}
  if(!addresses.length||addresses.some(x=>!publicIPv4(x.address)))throw Error('This project URL cannot be checked.');
  const result=await new Promise((resolve,reject)=>{
   const req=transport(url,{headers:{Accept:'text/html','User-Agent':'Digivated project verifier'},lookup:(_host,options,cb)=>options?.all?cb(null,[{address:addresses[0].address,family:4}]):cb(null,addresses[0].address,4)},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
    if(res.statusCode!==200||!/^text\/html\b/i.test(res.headers['content-type']||'')){res.resume();reject(Error('The project page must return a public HTML page.'));return;}
    let size=0;const chunks=[];
    res.on('data',chunk=>{size+=chunk.length;if(size>512*1024){req.destroy(Error('The page is too large to check automatically.'));return;}chunks.push(chunk);});
    res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8'),url:url.href}));res.on('error',reject);
   });
   const timer=setTimeout(()=>req.destroy(Error('The project website took too long to respond.')),Math.min(7000,Math.max(1,deadline-Date.now())));
   req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
  if(result.html!==undefined)return result;
  if(!result.redirect)throw Error('The project website could not be checked.');
  url=new URL(result.redirect,url);
 }
 throw Error('Too many redirects. Use the final HTTPS page URL.');
}
const decode=s=>s.replace(/&(?:amp|quot|apos|lt|gt|#39);/g,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&#39;':"'"}[m]));
function attributes(tag){return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));}
export function siteDetails(html){
 const meta={};for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const a=attributes(tag);meta[(a.property||a.name||'').toLowerCase()]=a.content||'';}
 const plain=s=>decode(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
 return {name:plain(meta['og:site_name']||meta['og:title']||html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]).slice(0,120),description:plain(meta.description||meta['og:description']).slice(0,600)};
}
export function hasProjectBadge(html,id){
 // Ignore comments and inert script/style content. Require a real anchor to this listing.
 const source=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|textarea|template)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 return (source.match(/<a\b[^>]*>/gi)||[]).some(tag=>{const a=attributes(tag);return a.href===`https://digivated.com/projects/listing/${id}`&&a['data-digivated-project']===id&&!('hidden' in a);});
}
