const root=document.querySelector('[data-link-directory]');
if(root){
 const search=root.querySelector('[data-link-search]'),select=root.querySelector('[data-link-select]'),status=root.querySelector('[data-link-status]'),empty=root.querySelector('[data-link-empty]');
 const groups=[...root.querySelectorAll('[data-link-group]')],buttons=[...root.querySelectorAll('[data-link-category]')];
 const valid=new Set(groups.map(group=>group.dataset.linkGroup));
 let active=valid.has(new URL(location.href).searchParams.get('category'))?new URL(location.href).searchParams.get('category'):groups[0].dataset.linkGroup;
 let timer;
 function render(){
  const query=search.value.trim().toLocaleLowerCase().slice(0,100);let found=0,visibleGroups=0;
  for(const group of groups){let count=0;const inCategory=group.dataset.linkGroup===active;
   for(const item of group.querySelectorAll('[data-link-item]')){const match=(!query&&inCategory)||(!!query&&item.dataset.linkSearchText.includes(query));item.hidden=!match;if(match)count++;}
   group.hidden=count===0;if(count){found+=count;visibleGroups++;}
  }
  for(const button of buttons){button.setAttribute('aria-current',button.dataset.linkCategory===active?'true':'false');}
  select.value=active;empty.hidden=found!==0;
  status.textContent=query?`${found} ${found===1?'link':'links'} found${visibleGroups>1?` across ${visibleGroups} categories`:''}`:`${found} ${found===1?'link':'links'} in ${groups.find(group=>group.dataset.linkGroup===active)?.querySelector('h2')?.textContent||'this category'}`;
 }
 function choose(category){if(!valid.has(category))return;active=category;search.value='';const url=new URL(location.href);url.searchParams.set('category',category);history.replaceState(null,'',url.pathname+url.search);render();}
 for(const button of buttons)button.addEventListener('click',()=>choose(button.dataset.linkCategory));
 select.addEventListener('change',()=>choose(select.value));
 search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,120);});
 window.addEventListener('popstate',()=>{const url=new URL(location.href);active=valid.has(url.searchParams.get('category'))?url.searchParams.get('category'):groups[0].dataset.linkGroup;search.value='';render();});
 render();
}
