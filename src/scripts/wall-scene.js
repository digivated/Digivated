import * as THREE from 'three';

const colors=[['#1d3336','#a3d7c9'],['#39342e','#e5bd8a'],['#263449','#9bbdec'],['#41303a','#dfaccb'],['#263a30','#b7dcaa'],['#353744','#cfcee8']];
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
function poster(project,index){
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=960;const ctx=canvas.getContext('2d');const [dark,light]=colors[index%colors.length];
 const gradient=ctx.createLinearGradient(0,0,768,960);gradient.addColorStop(0,dark);gradient.addColorStop(1,'#101619');ctx.fillStyle=gradient;ctx.fillRect(0,0,768,960);
 ctx.strokeStyle=light+'70';ctx.lineWidth=1;for(let i=0;i<15;i++){const radius=80+i*51;ctx.beginPath();ctx.arc(560,380,radius,0,Math.PI*2);ctx.stroke();}
 ctx.fillStyle=light;ctx.font='500 18px Arial';ctx.fillText('DIGIVATED   /   PROJECT '+String(index+1).padStart(2,'0'),48,68);
 ctx.fillStyle='#f3f1e9';ctx.font='650 78px Arial';const words=project.name.split(' ');let line='',y=730;for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>650&&line){ctx.fillText(line,48,y);y+=88;line=word;}else line=test;}ctx.fillText(line,48,y);
 ctx.fillStyle=light;ctx.fillRect(48,873,48,2);ctx.font='500 20px Arial';ctx.fillText(String(project.category||'INDEPENDENT WORK').toUpperCase().slice(0,34),112,880);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function createWallScene(host,projects,onSelect,onHover=()=>{}){
 let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{return null;}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0x080b0c);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.domElement.className='wall-canvas';renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(44,1,.1,100),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(9,9),worldPointer=new THREE.Vector3(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0),geometry=new THREE.PlaneGeometry(1,1),loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
 const meshes=[],textures=[];let frame=0,disposed=false,selected=-1,hovered=null,active=true,scroll=0,scrollTarget=0,width=1,height=1;
 const tiles=Array.from({length:Math.min(54,Math.max(36,projects.length))},(_,i)=>projects[i%projects.length]);
 tiles.forEach((project,i)=>{
  const placeholder=poster(project,i);textures.push(placeholder);const material=new THREE.MeshBasicMaterial({map:placeholder,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.userData={index:i%projects.length,base:new THREE.Vector3(),target:new THREE.Vector3(),order:i};scene.add(mesh);meshes.push(mesh);
  if(project.image){try{const url=new URL(project.image,location.origin);if(['https:','http:'].includes(url.protocol))loader.load(url.href,texture=>{if(disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);material.map=texture;material.needsUpdate=true;textures.push(texture);},undefined,()=>{});}catch{}}
 });
 function layout(){width=host.clientWidth||innerWidth;height=host.clientHeight||innerHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.position.set(0,0,width<700?13.5:15);camera.updateProjectionMatrix();
  const visibleH=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z,visibleW=visibleH*camera.aspect,columns=width<700?5:9,rows=Math.ceil(meshes.length/columns),cellW=visibleW/(columns-1.2),cellH=visibleH/(width<700?4.3:4.7);
  meshes.forEach((mesh,i)=>{const col=i%columns,row=Math.floor(i/columns),wide=(i*13)%7===0;mesh.scale.set(cellW*(wide?1.12:.82),cellH*(wide?.88:1.17),1);const x=(col-(columns-1)/2)*cellW+Math.sin(i*3.7)*cellW*.1,y=((rows-1)/2-row)*cellH+Math.cos(i*4.2)*cellH*.12,z=-((i*11)%6)*.28;mesh.userData.base.set(x,y,z);mesh.position.copy(mesh.userData.base);mesh.rotation.z=Math.sin(i*4.3)*.025;});renderer.render(scene,camera);}
 function locate(e){const box=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-box.left)/box.width*2-1,-(e.clientY-box.top)/box.height*2+1);raycaster.setFromCamera(pointer,camera);raycaster.ray.intersectPlane(plane,worldPointer);const hit=raycaster.intersectObjects(meshes,false)[0];const next=hit?.object||null;if(hovered!==next){hovered=next;onHover(hovered?.userData.index??-1);}renderer.domElement.style.cursor=hovered?'pointer':'crosshair';}
 const move=e=>locate(e),click=e=>{locate(e);if(hovered)onSelect(hovered.userData.index);},leave=()=>{pointer.set(9,9);hovered=null;onHover(-1);};
 const wheel=e=>{if(selected>=0)return;scrollTarget=clamp(scrollTarget+e.deltaY*.001,-.4,Math.max(0,Math.ceil(meshes.length/(width<700?5:9))-4)*1.65);};
 renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('click',click);renderer.domElement.addEventListener('pointerleave',leave);renderer.domElement.addEventListener('wheel',wheel,{passive:true});
 const observer=new ResizeObserver(layout);observer.observe(host);const intersection=new IntersectionObserver(entries=>{active=entries[0]?.isIntersecting&&!document.hidden;if(active&&!frame)animate();});intersection.observe(host);const visibility=()=>{active=!document.hidden&&host.getBoundingClientRect().bottom>0;if(active&&!frame)animate();};document.addEventListener('visibilitychange',visibility);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function animate(){frame=0;if(disposed||!active)return;scroll=THREE.MathUtils.lerp(scroll,scrollTarget,reduced?1:.045);const tx=pointer.x>2?0:pointer.x*(width<700?.18:.55),ty=pointer.y>2?0:pointer.y*.28+scroll;
  camera.position.x=THREE.MathUtils.lerp(camera.position.x,tx,reduced?1:.035);camera.position.y=THREE.MathUtils.lerp(camera.position.y,ty,reduced?1:.035);camera.lookAt(0,scroll*.35,0);
  for(const mesh of meshes){const base=mesh.userData.base,target=mesh.userData.target;let dx=0,dy=0;if(pointer.x<2&&!reduced&&selected<0){const vx=base.x-worldPointer.x,vy=base.y-worldPointer.y,d=Math.hypot(vx,vy)||1,push=(1-clamp(d/3.1,0,1))**2*1.1;dx=vx/d*push;dy=vy/d*push;}target.set(base.x+dx,base.y+dy,base.z+(mesh===hovered?.45:0));mesh.position.lerp(target,reduced?1:.075);mesh.rotation.y=THREE.MathUtils.lerp(mesh.rotation.y,mesh===hovered?.055:0,.06);mesh.material.opacity=selected>=0?.55:1;mesh.material.transparent=selected>=0;}
  renderer.render(scene,camera);frame=requestAnimationFrame(animate);
 }
 layout();animate();return {setSelected(i){selected=i;},destroy(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('click',click);renderer.domElement.removeEventListener('pointerleave',leave);renderer.domElement.removeEventListener('wheel',wheel);textures.forEach(t=>t.dispose());meshes.forEach(m=>m.material.dispose());geometry.dispose();renderer.dispose();renderer.domElement.remove();}};
}
