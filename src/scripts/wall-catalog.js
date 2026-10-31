export function uniqueProjects(items) {
 const seen=new Set();
 return items.filter(project=>{
  if(!project?.id||!project?.name||seen.has(project.id))return false;
  seen.add(project.id);return true;
 }).sort((a,b)=>Number(b.status==='featured')-Number(a.status==='featured'));
}

export function adjacentProject(catalog,id,direction) {
 if(!catalog.length)return null;
 const index=catalog.findIndex(project=>project.id===id);
 if(index<0)return catalog[0].id;
 return catalog[Math.min(catalog.length-1,Math.max(0,index+direction))].id;
}
