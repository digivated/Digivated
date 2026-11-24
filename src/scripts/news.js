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
 const symbolOk=value=>/^[A-Z][A-Z0-9.-]{0,11}$/.test(value||'');
 let stock=symbolOk(url.searchParams.get('stock'))?url.searchParams.get('stock'):'',stockNames={},openStock='';
 search.value=query;
 const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);if(cls)e.className=cls;return e;};
 const safeLink=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 const timestamp=value=>{const n=Date.parse(value);return Number.isFinite(n)?n:null;};
 const current=story=>{const t=timestamp(story.sourcePublishedAt);return t!==null&&t<=Date.now()+300000&&Date.now()-t<=86400000;};
 const valid=story=>story&&typeof story.id==='string'&&typeof story.headline==='string'&&story.headline.trim()&&Object.hasOwn(categories,story.category)&&safeLink(story.sourceUrl)&&timestamp(story.sourcePublishedAt)!==null&&timestamp(story.publishedAt)!==null;
 function time(value){const t=element('time');const n=timestamp(value);if(n===null){t.textContent='Time unavailable';return t;}t.dateTime=new Date(n).toISOString();t.title=new Date(n).toISOString();t.textContent=new Intl.DateTimeFormat(undefined,/^\d{4}-\d{2}-\d{2}$/.test(value)?{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(n);return t;}
 function sourceLink(story){const a=element('a',story.sourceName||new URL(story.sourceUrl).hostname,'news-source');a.href=safeLink(story.sourceUrl);a.target='_blank';a.rel='noopener noreferrer';a.title='Open the original on '+a.textContent+' (new tab)';return a;}
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
  const foot=element('div',null,'news-feature-foot');foot.append(meta(story));const go=element('span','Read story','news-feature-go');go.setAttribute('aria-hidden','true');foot.append(go);frag.append(foot);
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
 // Stocks in the news: tap a company to see its headlines right in the card,
 // or filter the whole feed to it. Matching is by company, so Google stories count for Alphabet.
 function buzzBars(buzz){
  const wrap=element('span',null,'news-buzz');wrap.setAttribute('aria-hidden','true');
  const days=(Array.isArray(buzz)?buzz:[]).map(n=>Number(n)||0).slice(-3);const peak=Math.max(1,...days);
  for(const count of days){const bar=element('span');bar.style.height=Math.max(3,Math.round(count/peak*18))+'px';if(!count)bar.className='is-empty';wrap.append(bar);}
  return wrap;
 }
 function showStock(symbol){stock=symbol;query='';search.value='';openStock='';window.digivatedTrack?.('news_stock_select',{symbol});change(true);root.querySelector('.news-toolbar')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
 function renderStocks(stocks){
  const block=$('[data-news-stocks-block]'),list=$('[data-news-stocks]');if(!block||!list)return;list.replaceChildren();
  const rows=(Array.isArray(stocks)?stocks:[]).filter(s=>s&&symbolOk(s.symbol)&&/^[A-Z]+$/.test(s.exchange)&&Number.isInteger(s.stories)&&s.stories>0).slice(0,6);
  block.hidden=!rows.length;if(!rows.length)return;
  for(const item of rows){
   const name=String(item.name||item.symbol).slice(0,40);stockNames[item.symbol]=name;
   const li=element('li','', 'news-watch-item');li.dataset.newsCat=Object.hasOwn(categories,item.topic)?item.topic:'ai-tech';
   const button=element('button',null,'news-watch-row');button.type='button';
   const panelId='news-stock-'+item.symbol.replace(/[^A-Z0-9]/g,'');
   button.setAttribute('aria-expanded',String(openStock===item.symbol));button.setAttribute('aria-controls',panelId);
   button.title=`${name} · ${item.exchange}: ${item.symbol}`;
   const sym=element('span',item.symbol,'news-watch-symbol');
   const text=element('span',null,'news-watch-text');text.append(element('span',name,'news-watch-name'),element('span',`${item.stories} ${item.stories===1?'story':'stories'} · 3 days`,'news-watch-meta'));
   const chevron=element('span',null,'news-watch-chevron');chevron.setAttribute('aria-hidden','true');chevron.innerHTML=cardIconMarkup('chevron');
   button.append(sym,text,buzzBars(item.buzz),chevron);
   const panel=element('div',null,'news-watch-panel');panel.id=panelId;panel.hidden=openStock!==item.symbol;
   const heads=element('ul',null,'news-watch-heads');
   for(const h of (Array.isArray(item.headlines)?item.headlines:[]).filter(h=>h&&typeof h.id==='string'&&typeof h.headline==='string').slice(0,3)){
    const row=element('li');const a=element('a',h.headline);a.href=newsStoryPath(h);if(h.sourceName)row.append(a,element('span',h.sourceName,'news-watch-source'));else row.append(a);heads.append(row);
   }
   const all=element('button',item.stories>1?`Show all ${item.stories} in the feed`:'Show in the feed','news-watch-all');all.type='button';all.addEventListener('click',()=>showStock(item.symbol));
   panel.append(heads,all);
   button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';for(const other of list.querySelectorAll('.news-watch-row[aria-expanded="true"]')){other.setAttribute('aria-expanded','false');document.getElementById(other.getAttribute('aria-controls')).hidden=true;}button.setAttribute('aria-expanded',String(open));panel.hidden=!open;openStock=open?item.symbol:'';});
   li.append(button,panel);list.append(li);
  }
 }
 function renderFilter(){
  const results=$('[data-news-results]');results.replaceChildren();
  if(stock){
   const chip=element('span',null,'news-filter-chip');chip.append(element('span',`Stories about ${stockNames[stock]||stock}`),element('span',stock,'news-filter-symbol'));
   const clear=element('button',null,'news-filter-clear');clear.type='button';clear.setAttribute('aria-label','Show all stories');clear.innerHTML=cardIconMarkup('close');clear.addEventListener('click',()=>{stock='';change(true);});
   chip.append(clear);results.append(chip);results.hidden=false;return;
  }
  results.hidden=!query;results.textContent=query?(items.length?`Results for “${query}”`:`No results for “${query}”`):'';
 }
 function updated(value){const line=$('[data-news-updated]');if(!line)return;const text=relativeTime(value);line.hidden=!text;line.replaceChildren();if(text){line.append(element('span',null,'news-live-dot'),document.createTextNode('Checked '+text.toLowerCase()));}}
 function controls(){for(const button of root.querySelectorAll('[data-news-category]'))button.setAttribute('aria-pressed',String(button.dataset.newsCategory===category));}
 function updateLocation(push=false){const u=new URL(location.href);if(category==='all')u.searchParams.delete('category');else u.searchParams.set('category',category);if(query)u.searchParams.set('q',query);else u.searchParams.delete('q');if(stock)u.searchParams.set('stock',stock);else u.searchParams.delete('stock');history[push?'pushState':'replaceState'](null,'',u.pathname+u.search+u.hash);}
 async function load(reset=true){
  const request=++version;controller?.abort();controller=new AbortController();const cursor=reset?null:next;
  feed.setAttribute('aria-busy','true');refresh.disabled=true;more.disabled=true;status.textContent=reset?'Checking the latest stories…':'Loading more stories…';status.hidden=false;
  try{
   const params=new URLSearchParams({category});if(query)params.set('q',query);if(stock)params.set('stock',stock);if(cursor!==null)params.set('cursor',cursor);
   const response=await fetch('/api/news?'+params,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
   if(!response.ok)throw Error('News unavailable');const data=await response.json();if(request!==version)return;
   if(!Array.isArray(data.items))throw Error('Invalid news response');
   toolbar.hidden=false;layout.hidden=false;sidebar.hidden=false;accessStatus.hidden=true;$('[data-news-paused]').hidden=data.pipeline?.status!=='paused';
   const incoming=data.items.filter(valid),seen=new Set();items=(reset?incoming:[...items,...incoming]).filter(story=>{if(seen.has(story.id))return false;seen.add(story.id);return true;});
   if(reset)featured=valid(data.featured)&&current(data.featured)?data.featured:items.find(story=>story.featured&&current(story))||null;
   next=data.next==null||String(data.next)===cursor?null:String(data.next);
   renderStories();if(reset)renderStocks(data.stocks);updated(data.updatedAt);
   renderFilter();
   if(!items.length&&!featured){status.textContent=query||stock||category!=='all'?'No stories match. Try another topic or category.':'No verified stories are published yet. New reporting will appear here after source checks.';status.hidden=false;}
   else{status.textContent='';status.hidden=true;}
  }catch(error){if(request!==version||error.name==='AbortError')return;items=[];featured=null;next=null;feed.replaceChildren();feature.replaceChildren();feature.hidden=true;more.hidden=true;topLink.hidden=true;toolbar.hidden=true;layout.hidden=true;accessStatus.textContent='News is temporarily unavailable. Try refreshing.';accessStatus.hidden=false;$('[data-news-paused]').hidden=true;}
  finally{if(request===version){feed.setAttribute('aria-busy','false');refresh.disabled=false;more.disabled=false;}}
 }
 function change(push=false){clearTimeout(timer);version++;controller?.abort();controls();updateLocation(push);timer=setTimeout(()=>load(true),220);}
 for(const button of root.querySelectorAll('[data-news-category]'))button.addEventListener('click',()=>{if(category===button.dataset.newsCategory)return;category=button.dataset.newsCategory;window.digivatedTrack?.('news_category_select',{news_category:category});change(true);});
 search.addEventListener('input',()=>{query=search.value.trim().slice(0,120);if(query)stock='';change();});
 refresh.addEventListener('click',()=>{clearTimeout(timer);load(true);});more.addEventListener('click',()=>load(false));
 window.addEventListener('popstate',()=>{const u=new URL(location.href);category=Object.hasOwn(categories,u.searchParams.get('category'))?u.searchParams.get('category'):'all';query=(u.searchParams.get('q')||'').slice(0,120);stock=symbolOk(u.searchParams.get('stock'))?u.searchParams.get('stock'):'';search.value=query;controls();clearTimeout(timer);load(true);});
 window.addEventListener('pagehide',()=>{controller?.abort();clearTimeout(timer);});
 controls();load(true);
}
