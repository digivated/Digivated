const form=document.getElementById('project-form');
if(form){
 const panel=document.querySelector('.submission-preview-panel');
 const update=()=>{
  for(const [name,fallback] of [['name','Your project name'],['description','A clear description of what your project does and who it helps.'],['category','Category']])panel.querySelector('[data-listing-'+name+']').textContent=form.elements[name].value.trim()||fallback;
  let domain='your-project.com';try{domain=new URL(form.elements.url.value).hostname;}catch{}
  panel.querySelector('[data-listing-domain]').textContent=domain;
 };
 form.addEventListener('input',update);
 const image=panel.querySelector('[data-listing-image]'),placeholder=panel.querySelector('[data-listing-placeholder]');let imageUrl;
 form.elements.image.addEventListener('change',()=>{
  if(imageUrl)URL.revokeObjectURL(imageUrl);
  const file=form.elements.image.files[0];image.hidden=!file;placeholder.hidden=!!file;
  if(file){imageUrl=URL.createObjectURL(file);image.src=imageUrl;}else image.removeAttribute('src');
 });
 form.addEventListener('reset',()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);image.hidden=true;placeholder.hidden=false;image.removeAttribute('src');requestAnimationFrame(update);});
 update();
}
