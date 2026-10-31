import * as THREE from 'three';

const palette=[0x344b51,0x755d55,0x35473c,0x38455d,0x6d6556,0x3b515b];
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function createWallScene(host,projects,onSelect){
 let renderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{return null;}
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0x08090a,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.domElement.className='wall-canvas';renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,100),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(9,9),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0),worldPointer=new THREE.Vector3();
 const geometry=new THREE.PlaneGeometry(1,1),loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
 const meshes=[],textures=[];let width=1,height=1,frame=0,disposed=false,selected=-1,hovered=null,active=true;
 const tiles=Array.from({length:Math.min(60,Math.max(30,projects.length))},(_,i)=>projects[i%projects.length]);
 tiles.forEach((project,i)=>{const material=new THREE.MeshBasicMaterial({color:palette[i%palette.length],side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.userData={index:i%projects.length,order:i,base:new THREE.Vector3(),target:new THREE.Vector3()};scene.add(mesh);meshes.push(mesh);
  if(project.image){try{const url=new URL(project.image,location.origin);if(['https:','http:'].includes(url.protocol)){loader.load(url.href,texture=>{if(disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);material.map=texture;material.color.set(0xffffff);material.needsUpdate=true;textures.push(texture);renderOnce();},undefined,()=>{});}}catch{}}
 });
 function layout(){width=host.clientWidth||innerWidth;height=host.clientHeight||innerHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.position.set(0,0,width<700?13:15);camera.updateProjectionMatrix();
  const visibleH=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z,visibleW=visibleH*camera.aspect;
  const cols=width<700?5:10,rows=Math.ceil(meshes.length/cols),cellW=visibleW/(cols-1.25),cellH=visibleH/(Math.min(rows,6)-.55);
  meshes.forEach((mesh,i)=>{const col=i%cols,row=Math.floor(i/cols),size=((i*7)%5===0?1.25:1),aspect=((i*3)%4===0?.76:1.42);mesh.scale.set(cellW*.84*size,cellH*.86*size/aspect,1);const x=(col-(cols-1)/2)*cellW+Math.sin(i*9.7)*cellW*.11,y=((rows-1)/2-row)*cellH+Math.cos(i*4.2)*cellH*.1;mesh.userData.base.set(x,y,-((i*13)%5)*.08);mesh.position.copy(mesh.userData.base);});renderOnce();}
 function renderOnce(){if(!disposed)renderer.render(scene,camera);}
 function locate(event){const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);raycaster.ray.intersectPlane(plane,worldPointer);const hit=raycaster.intersectObjects(meshes,false)[0];hovered=hit?.object||null;renderer.domElement.style.cursor=hovered?'pointer':'default';}
 const move=event=>locate(event),click=event=>{locate(event);if(hovered)onSelect(hovered.userData.index);};
 renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('click',click);const leave=()=>{pointer.set(9,9);hovered=null;renderer.domElement.style.cursor='default';};renderer.domElement.addEventListener('pointerleave',leave);
 const observer=new ResizeObserver(layout);observer.observe(host);const intersection=new IntersectionObserver(entries=>{active=entries[0]?.isIntersecting&&!document.hidden;if(active&&!frame)animate();});intersection.observe(host);
 const onVisibility=()=>{active=!document.hidden&&host.getBoundingClientRect().bottom>0;if(active&&!frame)animate();};document.addEventListener('visibilitychange',onVisibility);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function animate(){frame=0;if(disposed||!active)return;const wantsX=pointer.x>2?0:pointer.x*.29,wantsY=pointer.y>2?0:pointer.y*.18;
  camera.position.x=THREE.MathUtils.lerp(camera.position.x,wantsX,.045);camera.position.y=THREE.MathUtils.lerp(camera.position.y,wantsY,.045);camera.lookAt(0,0,0);
  for(const mesh of meshes){const base=mesh.userData.base,target=mesh.userData.target;let dx=0,dy=0;if(pointer.x<2&&!reduced&&selected<0){const vx=base.x-worldPointer.x,vy=base.y-worldPointer.y,d=Math.hypot(vx,vy)||1,force=Math.pow(clamp(1-d/3.5,0,1),2)*.7;dx=vx/d*force;dy=vy/d*force;}target.set(base.x+dx,base.y+dy,base.z+(mesh===hovered?.25:0));mesh.position.lerp(target,reduced?1:.08);mesh.material.opacity=selected>=0?.42:1;mesh.material.transparent=selected>=0;}
  renderer.render(scene,camera);frame=requestAnimationFrame(animate);
 }
 layout();animate();
 return {setSelected(index){selected=index;},destroy(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',onVisibility);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('click',click);renderer.domElement.removeEventListener('pointerleave',leave);textures.forEach(texture=>texture.dispose());meshes.forEach(mesh=>mesh.material.dispose());geometry.dispose();renderer.dispose();renderer.domElement.remove();}};
}
