import { observeResourceViews } from './resource-views.js';
import { resourcePathInfo } from '../data/learning-paths.mjs';
import { safeUrl, normalizeResourceCategory } from '../data/community.mjs';
import { cardIcon } from './card-actions.js';
import { categoryIcon, resourceStats } from '../lib/card-meta.mjs';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
function link(text,url){const node=el('a',text);node.href=url.startsWith('/')?url:safeUrl(url);if(!url.startsWith('/')){node.target='_blank';node.rel='noopener noreferrer';}return node;}
function thumbnail(url,alt){const img=el('img');img.src=url;img.alt=alt;img.width=640;img.height=400;img.loading='lazy';return img;}
function saveButton(type,id){const button=el('button','Save','button');button.type='button';button.dataset.saveType=type;button.dataset.saveId=id;return button;}
function cardButton(action,type,id,url,label){
 const button=el('button',undefined,'card-icon');button.type='button';button.dataset[action+'Type']=type;button.dataset[action+'Id']=id;
 if(url)button.dataset.shareUrl=url;button.setAttribute('aria-label',label);button.title=label;
 button.append(cardIcon(action),el('span',label,'sr-only'));return button;
}
function cardSave(type,id){const button=saveButton(type,id);button.className='card-icon card-save';button.textContent='';button.title='Save to collections';button.append(cardIcon('save'),el('span','Save','sr-only'));button.lastChild.dataset.saveLabel='';return button;}
function resourceActions(id,url){
 const row=el('div',undefined,'card-social card-actions');
 row.setAttribute('role','group');
 row.setAttribute('aria-label','Comment, share, like, and save');
 const like=cardButton('like','resource',id,null,'Like this resource');
 const count=el('span',undefined,'card-count');
 count.dataset.likeCount='';
 like.append(count);
 row.append(cardButton('comment','resource',id,null,'Read or leave a comment'),
  cardButton('share','resource',id,url,'Share this resource'),like,cardSave('resource',id));
 return row;
}
function statStrip(resource){
 const strip=el('div',undefined,'card-stats');strip.setAttribute('aria-label','Resource details');
 for(const stat of resourceStats(resource)){
  const item=el('span',undefined,'card-stat');item.title=stat.label;const icon=el('span',undefined,'stat-icon');icon.append(cardIcon(stat.icon));const value=el(stat.datetime?'time':'span',stat.text);
  if(stat.datetime)value.dateTime=stat.datetime;if(stat.viewId)value.dataset.resourceViews=stat.viewId;else value.setAttribute('aria-label',stat.label);
  item.append(icon,value);strip.append(item);
 }return strip;
}
function topicLabel(category){const topic=el('div',undefined,'card-topic');const icon=el('span',undefined,'topic-icon');icon.append(cardIcon(categoryIcon(category)));topic.append(icon,el('span',category,'tag'));return topic;}
function openLink(text,url,icon='arrow'){const anchor=link('',url);anchor.className='card-open';const arrow=el('span',undefined,'button-arrow');arrow.append(cardIcon(icon));anchor.append(el('span',text),arrow);return anchor;}
function resourceCard(resource){
 const category=normalizeResourceCategory(resource.category);const learning=resourcePathInfo({...resource,category});const card=el('article',undefined,'resource-card');card.dataset.learningGoal=learning.path?.id||'';card.dataset.resourceOrder=String(learning.order);card.dataset.resource='';card.dataset.resourceName=resource.title;card.dataset.resourceDate=resource.date||'';card.dataset.resourceReadingTime=String(resource.readingTime||'');card.dataset.resourceKind='guide';card.dataset.resourceViewId=resource.id;card.dataset.category=category;card.dataset.search=`${resource.title} ${resource.description} ${category} ${learning.keywords}`.toLowerCase();
 const copy=el('div',undefined,'resource-copy');copy.append(topicLabel(category));const title=el('h3');title.append(link(resource.title,resource.url));copy.append(title,el('p',resource.description,'resource-description'),statStrip(resource));const footer=el('div',undefined,'card-footer');footer.append(resourceActions(resource.id,resource.url),openLink('Read the guide',resource.url));copy.append(footer);card.append(copy);return card;
}
async function collection(url){
 const items=[];let offset=0;
 do{const response=await fetch(`${url}${url.includes('?')?'&':'?'}offset=${offset}`,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('unavailable');const data=await response.json();items.push(...data.items);offset=data.next;}while(offset!==null);
 return items;
}
async function loadResources(){
 const shelves=[...document.querySelectorAll('[data-live-resources]')];if(!shelves.length)return;
 try{
  const resources=await collection('/api/content?type=resource');
  for(const shelf of shelves){
   const list=shelf.querySelector('[data-live-list]');
   const builtins=[...list.querySelectorAll('[data-builtin-resource]')];
   const builtinUrls=new Set(builtins.map(card=>new URL(card.dataset.resourceUrl,location.origin).href));
   const published=resources.filter(resource=>{try{return !builtinUrls.has(new URL(resource.url,location.origin).href);}catch{return true;}});
   list.replaceChildren(...builtins,...published.map(resourceCard));
   list.hidden=list.children.length===0;
   shelf.querySelector('[data-live-empty]').hidden=list.children.length>0;
  }
 }catch{for(const shelf of shelves){const status=shelf.querySelector('[data-live-status]');if(status)status.textContent=shelf.querySelector('[data-builtin-resource]')?'Additional resources are temporarily unavailable. The published guides above are still available.':'Resources are temporarily unavailable. Please try again shortly.';}}
 observeResourceViews();
 document.dispatchEvent(new Event('digivated:collection-updated'));
}
async function loadArticle(){
 const root=document.getElementById('live-article');if(!root)return;
 const slug=new URLSearchParams(location.search).get('slug');const status=document.getElementById('article-status');
 if(!slug||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)){status.textContent='This article could not be found.';return;}
 try{
  const response=await fetch(`/api/content?type=resource&id=${encodeURIComponent(slug)}`,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});
  if(!response.ok){status.textContent=response.status===404?'This article is not available.':'This article is temporarily unavailable. Please try again shortly.';return;}
  const {item}=await response.json();document.title=`${item.title} · Digivated`;document.querySelector('link[rel="canonical"]').href=new URL(item.url,'https://digivated.com').href;document.querySelector('meta[name="description"]').content=item.description;document.getElementById('article-title').textContent=item.title;document.getElementById('article-category').textContent=normalizeResourceCategory(item.category);document.getElementById('article-description').textContent=item.description;document.getElementById('article-meta').replaceChildren(statStrip({...item,fullDate:true}));
  const body=document.getElementById('article-body');if(item.coverImage){const image=thumbnail(item.coverImage,'');image.className='article-cover';body.append(image);}
  item.content.split(/\n\s*\n/).filter(Boolean).forEach(block=>{const heading=block.startsWith('## ');body.append(el(heading?'h2':'p',heading?block.slice(3):block));});document.querySelector('.page-intro').append(resourceActions(item.id,item.url));root.hidden=false;status.textContent='';const header=document.querySelector('.page-intro');header.dataset.resourceViewId=item.id;observeResourceViews();
  if(item.related?.length){const all=await collection('/api/content?type=resource');const related=all.filter(r=>item.related.includes(r.id)&&r.id!==item.id);const section=document.getElementById('article-related');section.querySelector('.resource-grid').replaceChildren(...related.map(resourceCard));section.hidden=related.length===0;observeResourceViews();}
  document.dispatchEvent(new Event('digivated:collection-updated'));
 }catch{status.textContent='This article is temporarily unavailable. Please try again shortly.';}
}
loadResources();loadArticle();


