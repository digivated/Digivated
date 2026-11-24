import { cardIconMarkup } from '../lib/card-icons.mjs';
import { NEWS_CATEGORIES, NEWS_CATEGORY_ICONS, newsStoryPath, relativeTime } from '../lib/news-story.mjs';

const root=document.querySelector('[data-news-page]');
if(root){
 const categories=NEWS_CATEGORIES;
 const $=selector=>root.querySelector(selector);
 const feed=$('[data-news-feed]'),feature=$('[data-news-feature]'),status=$('[data-news-status]'),more=$('[data-news-more]'),topLink=$('[data-news-top]'),refresh=$('[data-news-refresh]'),search=$('[data-news-search]');
 const toolbar=$('.news-toolbar'),layout=$('.news-layout'),accessStatus=$('[data-news-access-status]'),sidebar=$('[data-news-sidebar]');
 const url=new URL(location.href);
 let category=Object.hasOwn(categories,url.searchParams.get('category'))?url.searchParams.get('category'):'all';
 let query=(url.searchParams.get('q')||'').slice(0,120),items=[],featured=null,next=null,controller,version=0,timer;
 search.value=query;
 const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);if(cls)e.className=cls;return e;};
 const safeLink=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 const timestamp=value=>{const n=Date.parse(value);return Number.isFinite(n)?n:null;};
 const current=story=>{const t=timestamp(story.sourcePublishedAt);return t!==null&&t<=Date.now()+300000&&Date.now()-t<=86400000;};
 const valid=story=>story&&typeof story.id==='string'&&typeof story.headline==='string'&&story.headline.trim()&&Object.hasOwn(categories,story.category)&&safeLink(story.sourceUrl)&&timestamp(story.sourcePublishedAt)!==null&&timestamp(story.publishedAt)!==null;
 function time(value){const t=element('time');const n=timestamp(value);if(n===null){t.textContent='Time unavailable';return t;}t.dateTime=new Date(n).toISOString();t.title=new Date(n).toISOString();t.textContent=new Intl.DateTimeFormat(undefined,/^\d{4}-\d{2}-\d{2}$/.test(value)?{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(n);return t;}
 function sourceLink(story){const a=element('a',story.sourceName||new URL(story.sourceUrl).hostname,'news-source');a.href=safeLink(story.sourceUrl);a.target='_blank';a.rel='noopener noreferrer';a.title='Open the original on '+a.textContent;const icon=element('span');icon.setAttribute('aria-hidden','true');icon.innerHTML=cardIconMarkup('external');a.append(icon);return a;}
 function ago(value){const t=element('time');const n=timestamp(value);if(n===null)return t;t.dateTime=new Date(n).toISOString();t.title=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(n);t.textContent=relativeTime(value);return t;}
 function tile(story,cls){const icon=element('span',null,cls);icon.dataset.newsCat=story.category;icon.setAttribute('aria-hidden','true');icon.innerHTML=cardIconMarkup(NEWS_CATEGORY_ICONS[story.category]);return icon;}
 function labels(story,head){
  const activeBreaking=story.classification==='breaking'&&current(story)&&Date.now()-timestamp(story.sourcePublishedAt)<=6*3600000;
  if(activeBreaking)head.append(element('span','Breaking','news-story-kind news-story-kind--breaking'));
  if(story.sourceType==='issuer-release')head.append(element('span','Company announcement','news-story-kind'));
  for(const t of (Array.isArray(story.tickers)?story.tickers:[]).slice(0,8)){if(/^[A-Z][A-Z0-9.-]{0,11}$/.test(t.symbol)&&/^[A-Z]+$/.test(t.exchange))head.append(element('span',t.exchange+': '+t.symbol,'news-story-kind news-story-kind--ticker'));}
 }
 function headline(story,tag){const h=element(tag);const a=element('a',story.headline,'news-story-link');a.href=newsStoryPath(story);a.addEventListener('click',()=>window.digivatedTrack?.('news_story_open',{news_category:story.category}));h.append(a);return h;}
 function meta(story){const line=element('div',null,'news-story-meta');line.append(sourceLink(story),element('span','·','news-dot'),ago(story.sourcePublishedAt));if(story.correctedAt)line.append(element('span','·','news-dot'),element('span','Corrected','news-story-corrected'));return line;}
 function featureContents(story){
  const frag=document.createDocumentFragment();
  const head=element('div',null,'news-feature-top');head.append(element('span','Top story','news-feature-label'),element('span',categories[story.category],'news-story-category'));labels(story,head);
  frag.append(head,headline(story,'h2'));
  if(typeof story.summary==='string'&&story.summary.trim())frag.append(element('p',story.summary,'news-summary'));
  const foot=element('div',null,'news-feature-foot');foot.append(meta(story));const go=element('span',null,'news-feature-go');go.setAttribute('aria-hidden','true');go.append(document.createTextNode('Read story'));const arrow=element('span');arrow.innerHTML=cardIconMarkup('arrow');go.append(arrow);foot.append(go);frag.append(foot);
  return frag;
 }
 function storyRow(story){
  const article=element('article',null,'news-story');article.id='news-'+story.id;article.dataset.newsCat=story.category;
  const main=element('div',null,'news-story-main');
  const head=element('div',null,'news-story-head');head.append(element('span',categories[story.category],'news-story-category'));labels(story,head);
  main.append(head,headline(story,'h3'));
  if(typeof story.summary==='string'&&story.summary.trim())main.append(element('p',story.summary,'news-summary'));
  main.append(meta(story));
  const go=element('span',null,'news-story-go');go.setAttribute('aria-hidden','true');go.innerHTML=cardIconMarkup('arrow');
  article.append(tile(story,'news-story-icon'),main,go);return article;
 }
 function dayLabel(n){const day=new Date(n);day.setHours(0,0,0,0);const today=new Date();today.setHours(0,0,0,0);const diff=Math.round((today-day)/86400000);return diff===0?'Today':diff===1?'Yesterday':day.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});}
 function renderStories(){
  feature.replaceChildren();feature.hidden=!featured;
  if(featured){feature.dataset.newsCat=featured.category;feature.append(featureContents(featured));}
  const shown=items.filter(story=>story.id!==featured?.id);
  const groups=document.createDocumentFragment();let lastDay='';
  for(const story of shown){const date=timestamp(story.sourcePublishedAt),day=date===null?'':dayLabel(date);if(day!==lastDay){groups.append(element('h3',day,'news-day'));lastDay=day;}groups.append(storyRow(story));}
  feed.replaceChildren(groups);
  more.hidden=next===null;
  topLink.hidden=items.length<20;
  $('[data-news-latest-title]').textContent=category==='all'?'Latest':categories[category];
 }
 // Small trend line from recent daily closes. Drawn only when there are enough points.
 function spark(values,direction){
  const nums=(Array.isArray(values)?values:[]).filter(Number.isFinite).slice(-22);
  if(nums.length<4)return null;
  const w=72,h=24,min=Math.min(...nums),max=Math.max(...nums),span=max-min||1;
  const pts=nums.map((v,i)=>[(i/(nums.length-1))*w,h-2-((v-min)/span)*(h-4)]);
  const d=pts.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('class','news-spark news-spark--'+direction);svg.setAttribute('aria-hidden','true');
  const area=document.createElementNS(ns,'path');area.setAttribute('d',`${d} L${w} ${h} L0 ${h} Z`);area.setAttribute('class','news-spark-area');
  const line=document.createElementNS(ns,'path');line.setAttribute('d',d);line.setAttribute('class','news-spark-line');
  const [lx,ly]=pts.at(-1),dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',lx.toFixed(1));dot.setAttribute('cy',ly.toFixed(1));dot.setAttribute('r','2');dot.setAttribute('class','news-spark-dot');
  svg.append(area,line,dot);return svg;
 }
 const RATE_NAMES={UST10Y:'10-year Treasury',UST2Y:'2-year Treasury',USDBROAD:'U.S. dollar index'};
 function renderMarkets(markets){
  const quotes=$('[data-news-quotes]'),note=$('[data-news-market-note]'),footer=$('[data-news-market-footer]');quotes.replaceChildren();footer.replaceChildren();
  const rows=Array.isArray(markets?.items)?markets.items.filter(item=>typeof item.symbol==='string'&&(typeof item.displayValue==='string'||typeof item.value==='string'||Number.isFinite(item.value))&&timestamp(item.asOf)!==null):[];
  if(!rows.length){note.textContent='Rates are temporarily unavailable. Nothing is estimated.';note.hidden=false;return;}
  note.hidden=markets.status!=='stale';note.textContent='Last available data. It may be a few days old.';
  for(const item of rows){
   const bps=Number.isFinite(item.basisPointChange)?item.basisPointChange:null,pct=Number.isFinite(item.changePercent)?item.changePercent:null,move=bps??pct;
   const direction=move===null||move===0?'flat':move>0?'up':'down';
   const row=element('div',null,'news-rate news-rate--'+direction);
   const dt=element('dt');dt.append(element('span',RATE_NAMES[item.symbol]||item.label||item.symbol,'news-rate-name'));
   const when=element('span',null,'news-rate-when');const at=time(item.asOf);when.append(document.createTextNode('Close · '),at);dt.append(when);
   const dd=element('dd');
   const value=typeof item.displayValue==='string'?item.displayValue:typeof item.value==='string'?item.value:new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(item.value);
   const change=typeof item.displayChange==='string'?item.displayChange:pct===null?'':(pct>0?'+':'')+pct.toFixed(2)+'%';
   dd.append(element('span',value,'news-rate-value'));
   if(change){const chip=element('span',null,'news-rate-change');chip.append(element('span',direction==='up'?'▲':direction==='down'?'▼':'•','news-rate-arrow'),document.createTextNode(change.replace(/^[+−-]/,'')));chip.setAttribute('aria-label',(direction==='up'?'Up ':direction==='down'?'Down ':'Unchanged ')+change);dd.append(chip);}
   const chart=spark(item.history,direction);
   row.append(dt);if(chart)row.append(chart);row.append(dd);quotes.append(row);
  }
  const source=safeLink(markets.sourceUrl);
  if(source){const a=element('a','FRED');a.href=source;a.target='_blank';a.rel='noopener noreferrer';footer.append(document.createTextNode('Rates from '),a,document.createTextNode(', St. Louis Fed. Daily closes.'));}
  else footer.textContent='Daily closes from the St. Louis Fed.';
 }
 function renderStocks(stocks){
  const block=$('[data-news-stocks-block]'),list=$('[data-news-stocks]');list.replaceChildren();
  const rows=(Array.isArray(stocks)?stocks:[]).filter(s=>s&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(s.symbol)&&/^[A-Z]+$/.test(s.exchange)&&Number.isInteger(s.stories)&&s.stories>0).slice(0,6);
  block.hidden=!rows.length;if(!rows.length)return;
  const top=Math.max(...rows.map(s=>Number(s.score)||s.stories));
  for(const stock of rows){
   const li=element('li');const button=element('button',null,'news-watch-row');button.type='button';
   const name=String(stock.name||stock.symbol).slice(0,40);
   button.setAttribute('aria-label',`${name} (${stock.symbol}), ${stock.stories} ${stock.stories===1?'story':'stories'}. Show stories about ${name}.`);
   const sym=element('span',stock.symbol,'news-watch-symbol');
   const text=element('span',null,'news-watch-text');text.append(element('span',name,'news-watch-name'),element('span',`${stock.exchange} · ${stock.stories} ${stock.stories===1?'story':'stories'}`,'news-watch-meta'));
   const meter=element('span',null,'news-watch-meter');meter.setAttribute('aria-hidden','true');const fill=element('span');fill.style.width=Math.max(18,Math.round(((Number(stock.score)||stock.stories)/top)*100))+'%';meter.append(fill);
   button.append(sym,text,meter);
   button.addEventListener('click',()=>{query=name;search.value=name;window.digivatedTrack?.('news_stock_select',{symbol:stock.symbol});change(true);root.querySelector('.news-toolbar')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
   li.append(button);list.append(li);
  }
 }
 function controls(){for(const button of root.querySelectorAll('[data-news-category]'))button.setAttribute('aria-pressed',String(button.dataset.newsCategory===category));}
 function updateLocation(push=false){const u=new URL(location.href);if(category==='all')u.searchParams.delete('category');else u.searchParams.set('category',category);if(query)u.searchParams.set('q',query);else u.searchParams.delete('q');history[push?'pushState':'replaceState'](null,'',u.pathname+u.search+u.hash);}
 async function load(reset=true){
  const request=++version;controller?.abort();controller=new AbortController();const cursor=reset?null:next;
  feed.setAttribute('aria-busy','true');refresh.disabled=true;more.disabled=true;status.textContent=reset?'Checking the latest stories…':'Loading more stories…';status.hidden=false;
  try{
   const params=new URLSearchParams({category});if(query)params.set('q',query);if(cursor!==null)params.set('cursor',cursor);
   const response=await fetch('/api/news?'+params,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
   if(!response.ok)throw Error('News unavailable');const data=await response.json();if(request!==version)return;
   if(!Array.isArray(data.items))throw Error('Invalid news response');
   toolbar.hidden=false;layout.hidden=false;sidebar.hidden=false;accessStatus.hidden=true;$('[data-news-paused]').hidden=data.pipeline?.status!=='paused';
   const incoming=data.items.filter(valid),seen=new Set();items=(reset?incoming:[...items,...incoming]).filter(story=>{if(seen.has(story.id))return false;seen.add(story.id);return true;});
   if(reset)featured=valid(data.featured)&&current(data.featured)?data.featured:items.find(story=>story.featured&&current(story))||null;
   next=data.next==null||String(data.next)===cursor?null:String(data.next);
   renderStories();renderMarkets(data.markets);if(reset)renderStocks(data.stocks);updated(data.updatedAt);
   const results=$('[data-news-results]');results.hidden=!query;results.textContent=query?(items.length?`Results for “${query}”`:`No results for “${query}”`):'';
   if(!items.length&&!featured){status.textContent=query||category!=='all'?'No stories match. Try another topic or category.':'No verified stories are published yet. New reporting will appear here after source checks.';status.hidden=false;}
   else{status.textContent='';status.hidden=true;}
  }catch(error){if(request!==version||error.name==='AbortError')return;items=[];featured=null;next=null;feed.replaceChildren();feature.replaceChildren();feature.hidden=true;more.hidden=true;topLink.hidden=true;toolbar.hidden=true;layout.hidden=true;accessStatus.textContent='News is temporarily unavailable. Try refreshing.';accessStatus.hidden=false;$('[data-news-paused]').hidden=true;}
  finally{if(request===version){feed.setAttribute('aria-busy','false');refresh.disabled=false;more.disabled=false;}}
 }
 function change(push=false){clearTimeout(timer);version++;controller?.abort();controls();updateLocation(push);timer=setTimeout(()=>load(true),220);}
 for(const button of root.querySelectorAll('[data-news-category]'))button.addEventListener('click',()=>{if(category===button.dataset.newsCategory)return;category=button.dataset.newsCategory;window.digivatedTrack?.('news_category_select',{news_category:category});change(true);});
 search.addEventListener('input',()=>{query=search.value.trim().slice(0,120);change();});
 refresh.addEventListener('click',()=>{clearTimeout(timer);load(true);});more.addEventListener('click',()=>load(false));
 window.addEventListener('popstate',()=>{const u=new URL(location.href);category=Object.hasOwn(categories,u.searchParams.get('category'))?u.searchParams.get('category'):'all';query=(u.searchParams.get('q')||'').slice(0,120);search.value=query;controls();clearTimeout(timer);load(true);});
 window.addEventListener('pagehide',()=>{controller?.abort();clearTimeout(timer);});
 controls();load(true);
}
