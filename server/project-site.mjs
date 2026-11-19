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
 let url=new URL(value);const siteHost=url.hostname.replace(/^www\./i,'').toLowerCase(),deadline=Date.now()+24000;
 for(let hop=0;hop<4;hop++){
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||isIP(url.hostname)||url.hostname.replace(/^www\./i,'').toLowerCase()!==siteHost)throw Error('Use a public HTTPS project URL without redirects to another site.');
  if(Date.now()>=deadline)throw Error('The website took too long to check. Try its final page URL.');
  let dnsTimer;let addresses;try{addresses=await Promise.race([resolve(url.hostname,{family:4,all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('Website lookup timed out.')),Math.min(5000,deadline-Date.now()));})]);}finally{clearTimeout(dnsTimer);}
  if(!addresses.length||addresses.some(x=>!publicIPv4(x.address)))throw Error('This project URL cannot be checked.');
  const result=await new Promise((resolve,reject)=>{
   const req=transport(url,{headers:{Accept:'text/html','User-Agent':'Digivated project verifier'},lookup:(_host,options,cb)=>options?.all?cb(null,[{address:addresses[0].address,family:4}]):cb(null,addresses[0].address,4)},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
    if([401,403,429,503].includes(res.statusCode)){res.resume();reject(Error(`Your site blocked our checker (status ${res.statusCode}). If you use Cloudflare or other bot protection, allow the “Digivated project verifier” user agent, then try again.`));return;}
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
// Extra details for website import: a clean product name, the X handle and
// icon candidates (best first). Kept separate so siteDetails stays minimal.
export function siteExtras(html,pageUrl){
 let page;try{page=new URL(pageUrl);}catch{return {name:'',social:'',icons:[]};}
 const meta={};for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const a=attributes(tag);meta[(a.property||a.name||'').toLowerCase()]=a.content||'';}
 const plain=s=>decode(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
 const label=page.hostname.replace(/^www\./i,'').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g,'');
 let name=plain(meta['og:site_name']||meta['application-name']);
 if(!name){
  const parts=plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||meta['og:title']).split(/\s+[|·•–—-]\s+|\s*[|·•]\s*/).map(s=>s.trim()).filter(Boolean);
  name=parts.find(p=>label&&p.toLowerCase().replace(/[^a-z0-9]/g,'').includes(label))||parts[0]||'';
 }
 const handle=(meta['twitter:site']||meta['twitter:creator']||'').trim().replace(/^@/,'');
 const social=/^\w{1,15}$/.test(handle)?`@${handle} on X`:'';
 const icons=[];
 const add=(href,score)=>{try{const u=new URL(href,page);if(u.protocol==='https:'&&!u.username&&!u.password)icons.push({href:u.href,score});}catch{}};
 for(const tag of html.match(/<link\b[^>]*>/gi)||[]){
  const a=attributes(tag),rel=(a.rel||'').toLowerCase();if(!a.href)continue;
  const size=Math.max(0,...String(a.sizes||'').split(/\s+/).map(s=>Number(s.split('x')[0])||0));
  if(rel.includes('apple-touch-icon'))add(a.href,1000+size);
  else if(/(?:^|\s)icon(?:\s|$)/.test(rel)){const type=(a.type||a.href).toLowerCase();add(a.href,/svg/.test(type)?900:/\.ico\b|x-icon/.test(type)?40:200+size*2);}
 }
 add('/apple-touch-icon.png',500);add('/favicon.ico',10);
 const seen=new Set();
 return {name:name.slice(0,120),social,icons:icons.sort((a,b)=>b.score-a.score).map(i=>i.href).filter(h=>!seen.has(h)&&seen.add(h)).slice(0,4)};
}
const IMAGE_TYPES=/^image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)\b/i;
// Fetch a small public image (a site icon) with the same address checks as
// readProjectSite. Any public HTTPS host is allowed, since icons often live on a CDN.
export async function readPublicImage(value,{resolve=lookup,transport=request,maxBytes=512*1024}={}){
 let url=new URL(value);const deadline=Date.now()+8000;
 for(let hop=0;hop<3;hop++){
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||isIP(url.hostname))throw Error('Icon URL not allowed.');
  let dnsTimer;let addresses;try{addresses=await Promise.race([resolve(url.hostname,{family:4,all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('Icon lookup timed out.')),Math.min(4000,Math.max(1,deadline-Date.now())));})]);}finally{clearTimeout(dnsTimer);}
  if(!addresses.length||addresses.some(x=>!publicIPv4(x.address)))throw Error('Icon host not allowed.');
  const result=await new Promise((resolve,reject)=>{
   const req=transport(url,{headers:{Accept:'image/*','User-Agent':'Digivated project verifier'},lookup:(_host,options,cb)=>options?.all?cb(null,[{address:addresses[0].address,family:4}]):cb(null,addresses[0].address,4)},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
    const type=(res.headers['content-type']||'').split(';')[0].trim().toLowerCase();
    if(res.statusCode!==200||!IMAGE_TYPES.test(type)){res.resume();reject(Error('Not an image.'));return;}
    let size=0;const chunks=[];
    res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(Error('Icon too large.'));return;}chunks.push(chunk);});
    res.on('end',()=>resolve({type,data:Buffer.concat(chunks).toString('base64')}));res.on('error',reject);
   });
   const timer=setTimeout(()=>req.destroy(Error('Icon took too long.')),Math.min(5000,Math.max(1,deadline-Date.now())));
   req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
  if(result.data!==undefined){if(!result.data)throw Error('Empty image.');return result;}
  if(!result.redirect)throw Error('Icon unavailable.');
  url=new URL(result.redirect,url);
 }
 throw Error('Too many redirects.');
}
// Builders often rewrite links slightly (http, www, a trailing slash, tracking
// parameters) or drop custom attributes, so match the listing link itself.
function listingId(href){
 try{const u=new URL(href);if(!/^https?:$/.test(u.protocol)||!/^(?:www\.)?digivated\.com$/i.test(u.hostname))return null;return /^\/projects\/listing\/([^/]+)\/?$/.exec(u.pathname)?.[1]??null;}catch{return null;}
}
function badgeLinks(html){
 // Ignore comments and inert script/style content. Require a real anchor to this listing.
 const source=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|textarea|template)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 return (source.match(/<a\b[^>]*>/gi)||[]).map(tag=>{
  const a=attributes(tag);
  // Boolean HTML attributes are active even when their value is "false".
  // Strip quoted values so words inside titles are not treated as attributes.
  const unquoted=tag.replace(/"[^"]*"|'[^']*'/g,'');
  const inactive=/(?:\s)(?:hidden|inert)(?:\s|=|>)/i.test(unquoted);
  const concealed=/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))(?:\s*!important)?\s*(?:;|$)/i.test(a.style||'');
  return {target:listingId(a.href||''),marker:a['data-digivated-project'],visible:!inactive&&!concealed,digivated:/digivated\.com/i.test(a.href||'')};
 });
}
const matches=(link,id)=>link.target===id&&(link.marker===undefined||link.marker===id);
export function hasProjectBadge(html,id){
 return badgeLinks(html).some(link=>link.visible&&matches(link,id));
}
// Explains a failed check in plain words, so makers know what to fix.
export function badgeProblem(html,id){
 const links=badgeLinks(html);
 if(links.some(link=>matches(link,id)))return 'Badge not found where people can see it. It looks hidden on your page. Make sure it is visible, publish, then try again.';
 if(links.some(link=>link.digivated))return 'Badge not found. We found a Digivated link, but it points to a different project. Copy the badge again from your dashboard.';
 if(/<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(html))return 'Badge not found. Your site looks like it loads with JavaScript (React, Vite, Lovable, Bolt), so we can’t see components. Paste the badge into index.html, inside <body>, publish, then try again.';
 return 'Badge not found on your project URL. Paste the badge into that page (the footer works well), publish, then try again.';
}
