// Progressive specular lighting; does not alter navigation, form, or card state.
const surfaces='.project-card,.resource-card,.gumroad-card,.product-feature,.login-panel,.project-account-card,.submission-form,.wall-focus-panel';
if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&matchMedia('(pointer: fine)').matches){
 let current=null,frame=0,x=0,y=0;
 document.addEventListener('pointermove',event=>{
  const target=event.target instanceof Element?event.target.closest(surfaces):null;
  if(!target){current=null;return;}current=target;x=event.clientX;y=event.clientY;
  if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!current)return;const rect=current.getBoundingClientRect();if(rect.width&&rect.height){current.style.setProperty('--glass-x',`${(x-rect.left)/rect.width*100}%`);current.style.setProperty('--glass-y',`${(y-rect.top)/rect.height*100}%`);}});
 },{passive:true});
}
