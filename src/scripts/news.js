import { cardIconMarkup } from '../lib/card-icons.mjs';

const root=document.querySelector('[data-news-page]');
if(root){
 const categories={'ai-tech':'AI & Tech',markets:'Markets',security:'Security'};
 const $=selector=>root.querySelector(selector);
 const feed=$('[data-news-feed]'),feature=$('[data-news-feature]'),status=$('[data-news-status]'),more=$('[data-news-more]'),refresh=$('[data-news-refresh]'),search=$('[data-news-search]');
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
 function sourceLink(story){const a=element('a',story.sourceName||new URL(story.sourceUrl).hostname,'news-source');a.href=safeLink(story.sourceUrl);a.target='_blank';a.rel='noopener noreferrer';const icon=element('span');icon.setAttribute('aria-hidden','true');icon.innerHTML=cardIconMarkup('external');a.append(icon);return a;}
 function storyContents(story,featuredStory=false){
  const frag=document.createDocumentFragment();
  const head=element('div',null,'news-story-head');head.append(element('span',categories[story.category],'news-story-category'));
  const activeBreaking=story.classification==='breaking'&&current(story)&&Date.now()-timestamp(story.sourcePublishedAt)<=6*3600000;
  head.append(element('span',activeBreaking?'Breaking':'Update','news-story-kind'+(activeBreaking?' news-story-kind--breaking':'')));
  if(featuredStory)head.append(element('span','In focus','news-story-kind'));
  if(story.sourceType==='issuer-release')head.append(element('span','Company announcement','news-story-kind'));
  for(const t of (Array.isArray(story.tickers)?story.tickers:[]).slice(0,8)){if(/^[A-Z][A-Z0-9.-]{0,11}$/.test(t.symbol)&&/^[A-Z]+$/.test(t.exchange))head.append(element('span',t.exchange+': '+t.symbol,'news-story-kind'));}
  frag.append(head,element(featuredStory?'h2':'h3',story.headline));
  if(story.locked){
   const lock=element('div',null,'news-lock');lock.append(element('span','Full briefing for Digivated members.'));const a=element('a','Read the member briefing ↗');a.href='/membership#member-sign-in';lock.append(a);frag.append(lock);
  }else if(typeof story.summary==='string'&&story.summary.trim())frag.append(element('p',story.summary,'news-summary'));
  frag.append(sourceLink(story));
  const dates=element('div',null,'news-story-times');for(const [label,value]of [['Source published',story.sourcePublishedAt],['Published here',story.publishedAt]]){const line=element('span');line.append(element('span',label+' ·'),time(value));dates.append(line);}frag.append(dates);
  if(story.correctedAt){const note=element('p',null,'news-market-footer');note.append(document.createTextNode('Corrected · '),time(story.correctedAt));frag.append(note);}
  return frag;
 }
 function renderStories(){
  feature.replaceChildren();feature.hidden=!featured;
  if(featured)feature.append(storyContents(featured,true));
  const shown=items.filter(story=>story.id!==featured?.id);
  feed.replaceChildren(...shown.map(story=>{const article=element('article',null,'news-story');article.id='news-'+story.id;article.append(storyContents(story));return article;}));
  more.hidden=next===null;
  $('[data-news-latest-title]').textContent=category==='all'?'Latest':categories[category];
  $('[data-news-member-note]').hidden=!featured?.locked&&!items.some(story=>story.locked);
 }
 function renderMarkets(markets){
  const quotes=$('[data-news-quotes]'),note=$('[data-news-market-note]'),footer=$('[data-news-market-footer]');quotes.replaceChildren();footer.replaceChildren();
  const rows=Array.isArray(markets?.items)?markets.items.filter(item=>typeof item.symbol==='string'&&(typeof item.displayValue==='string'||typeof item.value==='string'||Number.isFinite(item.value))&&timestamp(item.asOf)!==null):[];
  if(!rows.length){note.textContent='Market data is temporarily unavailable. No prices are estimated.';return;}
  const stale=markets.status==='stale';note.textContent=stale?'Last available snapshot · data may be delayed.':markets.label||'Latest available snapshot · not live prices.';
  for(const item of rows){
   const row=element('div',null,'news-quote'),dt=element('dt',item.label||item.symbol);dt.append(element('small',item.symbol));
   const dd=element('dd');dd.append(element('span',typeof item.displayValue==='string'?item.displayValue:typeof item.value==='string'?item.value:new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(item.value),'news-quote-value'));
   const change=Number.isFinite(item.changePercent)?item.changePercent:null;
   dd.append(element('span',typeof item.displayChange==='string'?item.displayChange:change===null?'—':(change>0?'+':'')+change.toFixed(2)+'%','news-quote-change'+(typeof item.displayChange==='string'?'':change>0?' news-quote-change--up':change<0?' news-quote-change--down':'')));
   const when=element('span',null,'news-quote-time');when.append(document.createTextNode('As of '),time(item.asOf));if(item.delayLabel)when.append(document.createTextNode(' · '+item.delayLabel));row.append(dt,dd,when);quotes.append(row);
  }
  const source=safeLink(markets.sourceUrl);
  if(source){const a=element('a',markets.sourceName||new URL(source).hostname);a.href=source;a.target='_blank';a.rel='noopener noreferrer';footer.append(document.createTextNode('Data: '),a);}
  else if(markets.sourceName)footer.textContent='Data: '+markets.sourceName;
  else footer.textContent='Market data is separate from editorial reporting.';
 }
 function renderPipeline(pipeline){
  const checked=$('[data-news-checked]');checked.replaceChildren();
  if(timestamp(pipeline?.lastCheckedAt)!==null&&pipeline?.lastCheckedAt){checked.append(document.createTextNode('Checked '),time(pipeline.lastCheckedAt));if(['failed','partial','paused'].includes(pipeline.status))checked.append(document.createTextNode(pipeline.status==='paused'?' · publishing paused':' · some sources unavailable'));}
  else checked.textContent='Awaiting the first completed source check';
 }
 function controls(){for(const button of root.querySelectorAll('[data-news-category]'))button.setAttribute('aria-pressed',String(button.dataset.newsCategory===category));}
 function updateLocation(){const u=new URL(location.href);if(category==='all')u.searchParams.delete('category');else u.searchParams.set('category',category);if(query)u.searchParams.set('q',query);else u.searchParams.delete('q');history.replaceState(null,'',u.pathname+u.search+u.hash);}
 async function load(reset=true){
  const request=++version;controller?.abort();controller=new AbortController();const cursor=reset?null:next;
  feed.setAttribute('aria-busy','true');refresh.disabled=true;more.disabled=true;status.textContent=reset?'Checking the latest stories…':'Loading more stories…';status.hidden=false;
  try{
   const params=new URLSearchParams({category});if(query)params.set('q',query);if(cursor!==null)params.set('cursor',cursor);
   const response=await fetch('/api/news?'+params,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
   if(!response.ok)throw Error('News unavailable');const data=await response.json();if(request!==version)return;
   if(!Array.isArray(data.items))throw Error('Invalid news response');
   const incoming=data.items.filter(valid),seen=new Set();items=(reset?incoming:[...items,...incoming]).filter(story=>{if(seen.has(story.id))return false;seen.add(story.id);return true;});
   if(reset)featured=valid(data.featured)&&current(data.featured)?data.featured:items.find(story=>story.featured&&current(story))||null;
   next=data.next==null||String(data.next)===cursor?null:String(data.next);
   renderStories();renderMarkets(data.markets);renderPipeline(data.pipeline);
   if(!items.length&&!featured){status.textContent=query||category!=='all'?'No stories match. Try another topic or category.':'No verified stories are published yet. New reporting will appear here after source checks.';status.hidden=false;}
   else{status.textContent='';status.hidden=true;}
  }catch(error){if(request!==version||error.name==='AbortError')return;status.textContent=items.length?'The feed could not refresh. Previously loaded stories are still shown.':'News is temporarily unavailable. Try Refresh in a moment.';status.hidden=false;if(!items.length){feature.hidden=true;more.hidden=true;renderMarkets(null);$('[data-news-checked]').textContent='Source-check status unavailable';}}
  finally{if(request===version){feed.setAttribute('aria-busy','false');refresh.disabled=false;more.disabled=false;}}
 }
 function change(){clearTimeout(timer);version++;controller?.abort();controls();updateLocation();timer=setTimeout(()=>load(true),220);}
 for(const button of root.querySelectorAll('[data-news-category]'))button.addEventListener('click',()=>{category=button.dataset.newsCategory;change();});
 search.addEventListener('input',()=>{query=search.value.trim().slice(0,120);change();});
 refresh.addEventListener('click',()=>{clearTimeout(timer);load(true);});more.addEventListener('click',()=>load(false));
 window.addEventListener('pagehide',()=>{controller?.abort();clearTimeout(timer);});
 controls();load(true);
}
