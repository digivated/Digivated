import {discoverySelection,safeSearchHref} from '../lib/discovery-search.mjs';
import {cardIconMarkup} from '../lib/card-icons.mjs';
const $ = selector => document.querySelector(selector);
const make = (tag,text,cls) => {const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
const search = $('#discovery-search'), input = $('#unified-search-input'), results = $('#unified-results');
let records = JSON.parse($('#discovery-index').textContent), scope='all', searchTrigger, loading=false, projectsUnavailable=false;
const dedupe = entries => [...new Map(entries.map(record => [record.href,record])).values()];
const icons = {'/news':'book','/discover':'layers','/resources':'book','/submit-project':'share','/saved':'save','/membership':'sparkle','/account':'profile'};
function resultRow(record) {
  const a=make('a',undefined,'unified-result');a.href=safeSearchHref(record.href);a.title=record.title;
  const destination=new URL(a.href);
  if(destination.origin!==location.origin){a.target='_blank';a.rel='noopener noreferrer';}
  const mark=make('span',undefined,'unified-result-mark');mark.setAttribute('aria-hidden','true');
  const fallback=make('span',record.type==='project'?record.title.slice(0,2).toUpperCase():undefined);
  if(record.type!=='project')fallback.innerHTML=cardIconMarkup(record.type==='resource'?'book':icons[destination.pathname]||'arrow');
  mark.append(fallback);
  const image=safeSearchHref(record.image);
  if(image&&new URL(image,location.origin).origin===location.origin){
    const img=make('img');img.src=image;img.alt='';img.width=44;img.height=44;img.loading='lazy';
    img.addEventListener('error',()=>mark.replaceChildren(fallback),{once:true});mark.replaceChildren(img);
  }
  const copy=make('span',undefined,'unified-result-copy');copy.append(make('strong',record.title),make('small',record.description||record.category||''));
  const type=make('span',record.type==='project'?record.category||'Project':record.type==='resource'?'Guide':'Explore','search-result-type');
  const arrow=make('span',undefined,'unified-result-arrow');arrow.setAttribute('aria-hidden','true');arrow.innerHTML=cardIconMarkup(destination.origin===location.origin?'arrow':'external');
  a.append(mark,copy,type,arrow);
  if(record.type==='project')a.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0||destination.origin!==location.origin||destination.pathname!==location.pathname||!destination.hash.startsWith('#project-'))return;search.close();if(destination.href===location.href)window.dispatchEvent(new HashChangeEvent('hashchange'));});
  return a;
}
function renderSearch() {
  const {items,total,browsing}=discoverySelection(records,input.value,scope);
  results.replaceChildren(...items.map(resultRow));
  results.setAttribute('aria-busy',String(loading));
  const waiting=loading&&!items.length;
  if(waiting)for(let i=0;i<3;i++){const row=make('div',undefined,'search-skeleton');row.setAttribute('aria-hidden','true');row.append(make('span'),make('span'));results.append(row);}
  $('#search-shortcuts').hidden=!browsing||scope!=='all';
  $('#clear-discovery-search').hidden=!input.value;
  $('#unified-search-empty').hidden=items.length>0||loading;
  const title=browsing?(scope==='resource'?'Latest guides':'Recently added projects'):(total>items.length?`Showing ${items.length} of ${total} results`:`${total} result${total===1?'':'s'}`);
  $('#unified-search-status').textContent=waiting?'Searching…':title+(projectsUnavailable?' · Some content could not be loaded.':'');
  if(!items.length&&!loading){$('#unified-search-empty h3').textContent=projectsUnavailable?'Search is temporarily limited':browsing?'More to discover soon':'No matches found';$('#unified-search-empty p').textContent=projectsUnavailable?'Some results may be missing. Clear your search to browse projects and guides.':browsing?'Explore projects and guides, or search for a topic.':'Try a different name, builder, or a broader topic.';}
  for(const button of search.querySelectorAll('[data-search-type]'))button.setAttribute('aria-pressed',String(button.dataset.searchType===scope));
}
async function collection(url) {
  const items=[];let offset=0;
  do {const response=await fetch(`${url}${url.includes('?')?'&':'?'}offset=${offset}`,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Unavailable');const data=await response.json();items.push(...data.items);offset=data.next;}while(offset!==null && offset!==undefined);
  return items;
}
let requested=false;
async function enrichSearch() {
  if(requested||loading)return;requested=true;loading=true;projectsUnavailable=false;renderSearch();
  const merge=extra=>{records=dedupe([...records,...extra]);renderSearch();};
  const outcomes=await Promise.allSettled([
    collection('/api/projects').then(items=>merge(items.filter(p=>p.id&&p.name).map(p=>({type:'project',title:p.name,description:p.description,keywords:p.creator,image:p.image,category:p.category||'Project',href:safeSearchHref(p.pageUrl)||`/discover#project-${encodeURIComponent(p.id)}`})))),
    collection('/api/content?type=resource').then(items=>merge(items.filter(r=>safeSearchHref(r.url)).map(r=>({type:'resource',title:r.title,description:r.description,category:r.category,href:r.url})))),
  ]);
  projectsUnavailable=outcomes.some(result=>result.status==='rejected');requested=!projectsUnavailable;loading=false;renderSearch();
}
function openSearch(trigger) {if(document.querySelector('dialog[open],.wall-focus[role="dialog"]'))return;searchTrigger=trigger||document.activeElement;search.showModal();input.focus({preventScroll:true});search.scrollTop=0;renderSearch();enrichSearch();}
document.querySelectorAll('[data-open-search]').forEach(button=>button.addEventListener('click',()=>openSearch(button)));
search.querySelector('[data-close-search]').addEventListener('click',()=>search.close());
search.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();search.close();}});
search.addEventListener('close',()=>{const trigger=searchTrigger?.getClientRects().length?searchTrigger:document.querySelector('.header-search');trigger?.focus({preventScroll:true});});
input.addEventListener('input',()=>{renderSearch();results.parentElement.scrollTop=0;});
$('#clear-discovery-search').addEventListener('click',()=>{input.value='';renderSearch();input.focus();});
$('#reset-discovery-search').addEventListener('click',()=>{input.value='';scope='all';renderSearch();input.focus();enrichSearch();});
input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){const first=results.querySelector('a');if(first){event.preventDefault();first.focus();}}if(event.key==='Enter'){const first=results.querySelector('a');if(first){event.preventDefault();first.click();}}});
results.addEventListener('keydown',event=>{const links=[...results.querySelectorAll('a')],index=links.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=index+(event.key==='ArrowDown'?1:-1);if(next<0)input.focus();else links[Math.min(next,links.length-1)]?.focus();}});
search.querySelectorAll('[data-search-type]').forEach(button=>button.addEventListener('click',()=>{scope=button.dataset.searchType;renderSearch();results.parentElement.scrollTop=0;}));
document.addEventListener('keydown',event=>{
  const editing=event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  const shortcut=(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k';
  const slash=event.key==='/'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!editing;
  if((shortcut||slash)&&!document.querySelector('dialog[open],.wall-focus[role="dialog"]')){event.preventDefault();openSearch();}
});

search.addEventListener('click', event => {
  if (event.target !== search) return;
  const bounds = search.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) search.close();
});
