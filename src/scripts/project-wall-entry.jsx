import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {adjacentProject,uniqueProjects} from './wall-catalog.js';
import {scanCardActions} from './card-actions.js';
import {observeProjectViews,viewLabel} from './project-views.js';
import {projectCategories} from '../data/community.mjs';
import {cardIconMarkup} from '../lib/card-icons.mjs';
import {projectFeedbackHref} from '../lib/project-links.mjs';

const safe=(value,fallback='/discover')=>{try{const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:fallback;}catch{return fallback;}};
const Icon=({name})=><span className="wall-action-icon" aria-hidden="true" dangerouslySetInnerHTML={{__html:cardIconMarkup(name)}}/>;
function ProjectArtwork({project}){const [failed,setFailed]=useState(false);const image=project.image?safe(project.image,''):'';return image&&!failed?<img src={image} alt={`${project.name} preview`} onError={()=>setFailed(true)}/>:<span className="wall-art-monogram">{project.name.slice(0,2).toUpperCase()}</span>;}
// Use original project artwork, with a safe fallback for unavailable images.
function ProjectPreview({project}) {
 const [failed,setFailed]=useState(false);
 const source=project.image?safe(project.image,''):'';
 return source&&!failed?<img src={source} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span className="wall-list-monogram" aria-hidden="true">{project.name.slice(0,2).toUpperCase()}</span>;
}
function ProjectActions({project}){return <div className="wall-card-actions" role="group" aria-label={`Feedback and upvotes for ${project.name}`}><a href={projectFeedbackHref(project.id,project.pageUrl)} data-comment-type="project" data-comment-id={project.id} aria-label={`Feedback for ${project.name}`}><Icon name="comment"/><span>Feedback</span><span className="card-feedback-count">0</span></a><button type="button" data-like-type="project" data-like-id={project.id} aria-label={`Upvote ${project.name}`} aria-pressed="false"><Icon name="like"/><span>Upvote</span><span data-like-count=""/></button></div>;}
function Wall({section}){
 const host=useRef(null),rail=useRef(null),scene=useRef(null),closeButton=useRef(null),returnFocus=useRef(null),catalogRef=useRef([]),positionRef=useRef(null);
 const [projects,setProjects]=useState([]),[status,setStatus]=useState('Loading projects…'),[selected,setSelected]=useState(null),[hovered,setHovered]=useState(null),[webgl]=useState(false),[compact,setCompact]=useState(()=>matchMedia('(max-width: 760px)').matches),[view,setView]=useState('grid'),[collection,setCollection]=useState(()=>section.dataset.wallDirectory==='true'&&new URLSearchParams(location.search).get('view')!=='featured'?'all':'featured'),[page,setPage]=useState(0),[query,setQuery]=useState(''),[category,setCategory]=useState(()=>{const value=new URLSearchParams(location.search).get('category');return projectCategories.includes(value)?value:'';}),[viewCounts,setViewCounts]=useState({});
 const directory=section.dataset.wallDirectory==='true';
 const chooseCollection=next=>{if(directory){const url=new URL(location.href);if(url.hash.startsWith('#project-'))url.hash='';url.searchParams.delete('feedback');if(next==='featured')url.searchParams.set('view','featured');else url.searchParams.delete('view');history.replaceState(null,'',url.pathname+url.search+url.hash);}setCollection(next);setPage(0);setSelected(null);setView('grid');setQuery('');setCategory('');};
 useEffect(()=>{if(!directory)return;const sync=()=>{let requested;try{requested=location.hash.startsWith('#project-')?decodeURIComponent(location.hash.slice(9)):null;}catch{return;}if(!requested){setSelected(null);return;}if(projects.some(project=>project.id===requested)){setCollection('all');setQuery('');setSelected(requested);}};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[directory,projects]);
 useEffect(()=>{if(directory)return;const sync=()=>{if(location.hash==='#featured-projects'||location.hash==='#project-wall'){setCollection('featured');setView('grid');setPage(0);setSelected(null);}};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[directory,compact]);
 useEffect(()=>{section.classList.toggle('wall-grid-view',view==='grid');return()=>section.classList.remove('wall-grid-view');},[section,view]);
 useEffect(()=>{
  const position=`${view}:${page}`;
  const previous=positionRef.current;
  positionRef.current=position;
  if(!directory||previous===null||previous===position)return;
  const frame=requestAnimationFrame(()=>{
   const header=document.querySelector('.platform-header');
   const headerHeight=header?.getBoundingClientRect().height||0;
   window.scrollTo({top:window.scrollY+section.getBoundingClientRect().top-headerHeight,behavior:'instant'});
  });
  return()=>cancelAnimationFrame(frame);
 },[section,view,page,directory]);
 useEffect(()=>{const media=matchMedia('(max-width: 760px)');const update=()=>setCompact(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{rail.current?.scrollTo({left:0,behavior:'instant'});},[page,query,collection]);
 const catalog=projects.filter(p=>(collection==='all'||p.status==='featured')&&(!category||p.category===category)&&`${p.name} ${p.creator||''} ${p.category||''}`.toLowerCase().includes(query.trim().toLowerCase()));
 catalogRef.current=catalog;
 const selectedIndex=catalog.findIndex(project=>project.id===selected);
 const isOpen=selectedIndex>=0;
 const moveSelection=direction=>setSelected(id=>adjacentProject(catalogRef.current,id,direction));
 const pageSize=12,pageCount=Math.max(1,Math.ceil(catalog.length/pageSize)),visible=catalog.slice(page*pageSize,(page+1)*pageSize);
 useEffect(()=>{if(selectedIndex>=0&&Math.floor(selectedIndex/pageSize)!==page)setPage(Math.floor(selectedIndex/pageSize));},[selectedIndex,page]);
 useEffect(()=>{let live=true;const controller=new AbortController();(async()=>{const items=[];try{let offset=0;do{const response=await fetch(`/api/projects?offset=${offset}`,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error('Projects unavailable');const data=await response.json();items.push(...(data.items||[]));if(!live)return;const valid=uniqueProjects(items);setProjects(valid);setStatus(valid.length?'':'No projects yet.');if(directory){const hash=location.hash.startsWith('#project-')?decodeURIComponent(location.hash.slice(9)):null;const feedback=new URLSearchParams(location.search).get('feedback');const target=feedback && valid.find(project=>project.id===feedback);if(target){location.replace(projectFeedbackHref(target.id,target.pageUrl));return;}const requested=hash;const index=valid.findIndex(project=>project.id===requested);if(index>=0){setCollection('all');setPage(Math.floor(index/12));setSelected(requested);}}offset=data.next;}while(offset!==null&&live);}catch{if(live&&!items.length)setStatus('Projects are temporarily unavailable.');}})();return()=>{live=false;controller.abort();};},[]);
 useEffect(()=>{scanCardActions();},[projects,view,collection,query,category,page,webgl]);
 useEffect(()=>{if(selected)scanCardActions(document.querySelector('.wall-focus'));},[selected]);
 useEffect(()=>{if(view==='grid'||!webgl)observeProjectViews();},[projects,view,collection,query,category,page,webgl]);
 useEffect(()=>{const update=event=>{const {id,views}=event.detail||{};if(id&&Number.isSafeInteger(views))setViewCounts(counts=>({...counts,[id]:views}));};document.addEventListener('digivated:project-view-updated',update);return()=>document.removeEventListener('digivated:project-view-updated',update);},[]);
 useEffect(()=>{if(!selected)return;const controller=new AbortController();fetch(`/api/project-views?id=${encodeURIComponent(selected)}`,{method:'POST',credentials:'omit',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])}).then(response=>response.ok?response.json():null).then(data=>{if(Number.isSafeInteger(data?.views))setViewCounts(counts=>({...counts,[selected]:data.views}));}).catch(()=>{});return()=>controller.abort();},[selected]);
 useEffect(()=>{if(!isOpen)return;document.body.classList.add('wall-modal-open');closeButton.current?.focus({preventScroll:true});const key=e=>{if(document.querySelector('.comment-dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();setSelected(null);}if(e.key==='ArrowLeft'){e.preventDefault();setSelected(id=>adjacentProject(catalogRef.current,id,-1));}if(e.key==='ArrowRight'){e.preventDefault();setSelected(id=>adjacentProject(catalogRef.current,id,1));}if(e.key==='Tab'){const panel=document.querySelector('.wall-focus-panel');if(!panel)return;const focusable=[...panel.querySelectorAll('button,a[href]')].filter(n=>!n.hidden&&!n.disabled&&n.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.classList.remove('wall-modal-open');if(returnFocus.current?.isConnected)returnFocus.current.focus({preventScroll:true});};},[isOpen]);
 useEffect(()=>{if(selected)document.querySelector('.wall-focus-panel')?.scrollTo({top:0,behavior:'instant'});},[selected]);
 const item=catalog[selectedIndex];
 const shown=visible;
 return <>
  {(view==='grid'||!webgl)&&shown.length>0&&<div ref={rail} className={`wall-grid wall-dom-grid ${view==='grid'?'wall-card-grid':''}`} aria-label="Projects">{shown.map(p=>{
    const href = /^\/projects\/(?:listing\/)?[a-z0-9][a-z0-9-]*$/.test(p.pageUrl || '') ? p.pageUrl : null;
    const OpenProject = href ? 'a' : 'button';
    const openProps = href ? { href, style: { textDecoration: 'none' } } : {
      type: 'button',
      onClick: event => { returnFocus.current = event.currentTarget; setSelected(p.id); }
    };
    return <article key={p.id} className={`wall-tile ${p.image?'':'wall-no-image'}`} data-project="" data-project-id={p.id} data-project-name={p.name} data-project-views-total={viewCounts[p.id]??p.views??0}><OpenProject {...openProps} className="wall-card-open" aria-label={`Open ${p.name}`}><span className="wall-card-media"><ProjectPreview key={p.id} project={p}/></span><span className="wall-tile-caption"><small>{p.category||'Project'}</small><strong>{p.name}</strong><span className="wall-list-summary">{p.description||'Explore this project and meet its maker.'}</span></span><span className="wall-open-label" aria-hidden="true"><Icon name="arrow"/></span></OpenProject><ProjectActions project={p} views={viewCounts[p.id]??p.views}/></article>;
  })}</div>}
  <div className="wall-navigation" aria-label="Navigate project wall"><div className="wall-mobile-heading"><strong>{collection==='featured'?'Featured projects':'All projects'}</strong><span>{collection==='featured'?'Projects in the spotlight':view==='grid'?'Browse every project':'Swipe to explore'}</span></div><label className="wall-search"><span className="sr-only">Search the wall</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);setSelected(null);}} placeholder="Find a project or builder" /></label>{directory&&<label className="wall-category"><span className="sr-only">Project category</span><select value={category} onChange={e=>{setCategory(e.target.value);setPage(0);setSelected(null);}}><option value="">All categories</option>{projectCategories.filter(name=>projects.some(p=>p.category===name)).map(name=><option key={name}>{name}</option>)}</select></label>}{directory&&<div className="wall-collection-controls" role="group" aria-label="Project collection"><button type="button" aria-pressed={collection==='featured'} onClick={()=>chooseCollection('featured')}>Featured</button><button type="button" aria-pressed={collection==='all'} onClick={()=>chooseCollection('all')}>All projects</button></div>}{pageCount>1&&<div className="wall-page-controls"><button type="button" onClick={()=>setPage(i=>Math.max(0,i-1))} disabled={page===0} aria-label="Previous group of projects"><Icon name="arrow-left"/><span>Previous</span></button><span className="sr-only" aria-live="polite">Page {page+1} of {pageCount}</span><button type="button" onClick={()=>setPage(i=>Math.min(pageCount-1,i+1))} disabled={page>=pageCount-1} aria-label="Next group of projects"><span>Next</span><Icon name="arrow"/></button></div>}</div>
  {!status&&catalog.length===0&&<div className="wall-status">{collection==='featured'&&!query&&!category?'No featured projects yet.':'No projects match. Try another category or search.'}</div>}
  <div className="wall-shade" aria-hidden="true"/>
  <div className="wall-intro"><p className="wall-overline"><span/> {section.dataset.wallLabel}</p>{directory?<h1 id="wall-title">{section.dataset.wallHeading}</h1>:<h2 id="wall-title">{section.dataset.wallHeading}</h2>}<p>{section.dataset.wallDescription}</p><div className="wall-intro-links">{directory?<button type="button" onClick={()=>{setView('grid');setSelected(null);section.scrollIntoView({behavior:'smooth',block:'start'});}}>Browse as a grid <span aria-hidden="true">↗</span></button>:<a href="/discover">Explore projects <span aria-hidden="true">↗</span></a>}{!directory&&<a href="/submit-project">Share your project <span aria-hidden="true">↗</span></a>}</div></div>
{hovered&&catalog.find(project=>project.id===hovered)&&<div className="wall-hover-caption" aria-live="off"><span>OPEN PROJECT ↗</span><strong>{catalog.find(project=>project.id===hovered).name}</strong></div>}
  {status&&<div className="wall-status" role="status">{status} {status!=='Loading projects…'&&<a href="/discover">Try again →</a>}</div>}
  {item&&createPortal(<div className="wall-focus" role="dialog" aria-modal="true" aria-labelledby="wall-focus-title"><button className="wall-focus-backdrop" aria-label="Close project" onClick={()=>setSelected(null)}/><div className="wall-focus-panel" data-project="" data-project-name={item.name} tabIndex={-1}><div className="wall-focus-controls"><button type="button" onClick={()=>moveSelection(-1)} disabled={selectedIndex===0} aria-label="Previous project"><Icon name="arrow-left"/></button><button type="button" onClick={()=>moveSelection(1)} disabled={selectedIndex===catalog.length-1} aria-label="Next project"><Icon name="arrow"/></button><button ref={closeButton} className="wall-focus-close" onClick={()=>setSelected(null)} aria-label="Close project"><Icon name="close"/></button></div><p className="wall-focus-category">{item.category||'Project'}</p><h2 id="wall-focus-title">{item.name}</h2><div className="wall-focus-art"><ProjectArtwork key={item.id} project={item}/></div><p className="wall-focus-maker">BY {item.creator||'AN INDEPENDENT BUILDER'}</p><p className="wall-focus-description">{item.description||'Explore this project and meet its maker.'}</p><ProjectActions project={item} views={viewCounts[item.id]??item.views}/><div className="wall-focus-actions">{item.pageUrl&&<a href={safe(item.pageUrl)} onClick={()=>{returnFocus.current=null;}}>View project page ↗</a>}{item.url&&<a href={safe(item.url,'/discover')} target="_blank" rel="noopener noreferrer">Visit website ↗</a>}</div></div></div>,document.body)}
 </>;
}
const section=document.querySelector('.project-wall');if(section){const root=section.querySelector('#wall-react-root');createRoot(root).render(<Wall section={section}/>);}
