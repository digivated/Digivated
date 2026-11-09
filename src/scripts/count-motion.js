// A single observer covers native DOM and React-rendered counters without
// changing their content, ownership, request cadence, or accessible labels.
const selector='[data-project-views],[data-resource-views],[data-site-visits],[data-site-online]';
const previous=new WeakMap(), running=new WeakMap(), active=new Set();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let observer;
const value=element=>element.textContent.replace(/[^0-9]/g,'');
function refresh(element){
 const next=value(element),before=previous.get(element);previous.set(element,next);
 if(before===undefined||!before||!next||before===next)return;
 running.get(element)?.cancel();
 if(reduced.matches||document.hidden||!element.isConnected||!element.animate)return;
 const bounds=element.getBoundingClientRect();
 if(!bounds.width||!bounds.height||bounds.bottom<=0||bounds.top>=innerHeight||bounds.right<=0||bounds.left>=innerWidth)return;
 const animation=element.animate([
  {transform:'translateY(5px)',opacity:.55,color:'#c3a0ff'},
  {transform:'translateY(-1px)',opacity:1,color:'#c3a0ff',offset:.55},
  {transform:'translateY(0)',opacity:1},
 ],{duration:420,easing:'cubic-bezier(.2,.7,.25,1)'});
 running.set(element,animation);active.add(animation);
 const release=()=>{active.delete(animation);if(running.get(element)===animation)running.delete(element);};
 animation.onfinish=release;animation.oncancel=release;
}
function start(){
 observer?.disconnect();document.querySelectorAll(selector).forEach(element=>previous.set(element,value(element)));
 observer=new MutationObserver(records=>{
  const counters=new Set();
  for(const record of records){
   const target=record.target.nodeType===Node.ELEMENT_NODE?record.target:record.target.parentElement;
   const counter=target?.closest(selector);if(counter)counters.add(counter);
   for(const node of record.addedNodes){
    if(node.nodeType!==Node.ELEMENT_NODE)continue;
    if(node.matches(selector))counters.add(node);
    node.querySelectorAll(selector).forEach(element=>counters.add(element));
   }
  }
  counters.forEach(refresh);
 });
 observer.observe(document.body,{subtree:true,childList:true,characterData:true});
}
const stopMotion=()=>{for(const animation of [...active])animation.cancel();};
reduced.addEventListener('change',()=>{if(reduced.matches)stopMotion();});
window.addEventListener('pagehide',()=>{observer?.disconnect();stopMotion();});
window.addEventListener('pageshow',event=>{if(event.persisted)start();});
start();
