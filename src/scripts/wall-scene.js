import * as THREE from 'three';
export function createWallScene(host,projects,onSelect,onHover=()=>{}){
 let renderer;try{renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power',alpha:false});}catch{return null;}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.setClearColor(0xeef2f4);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const canvas=renderer.domElement;canvas.className='wall-canvas';canvas.setAttribute('aria-hidden','true');host.append(canvas);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,20),geometry=new THREE.PlaneGeometry(1,1),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(9,9);
 camera.position.z=10;
 let disposed=false,frame=0,last=0,visible=true,selected=-1,hovered=-1,phase=0,width=1,height=1;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const textures=[],meshes=[];
 function surface(project,image){
  const out=document.createElement('canvas');out.width=640;out.height=440;const ctx=out.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,640,440);ctx.fillStyle='#f2f5f6';ctx.fillRect(8,8,624,340);
  if(image){const scale=Math.min(624/image.width,340/image.height);const w=image.width*scale,h=image.height*scale;ctx.drawImage(image,8+(624-w)/2,8+(340-h)/2,w,h);}
  ctx.fillStyle='#2b3943';ctx.font='600 23px Arial';let title=project.name;while(ctx.measureText(title).width>580&&title.length>1)title=title.slice(0,-1);ctx.fillText(title+(title!==project.name?'…':''),24,386);
  ctx.fillStyle='#8a979f';ctx.font='14px Arial';ctx.fillText(String(project.category||'PROJECT').toUpperCase(),24,418);
  const texture=new THREE.CanvasTexture(out);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;return texture;
 }
 projects.forEach((project,i)=>{
  const texture=surface(project);textures[i]=texture;const material=new THREE.MeshBasicMaterial({map:texture});const mesh=new THREE.Mesh(geometry,material);mesh.userData={index:i,x:0,y:0};meshes.push(mesh);scene.add(mesh);
  if(project.image){const image=new Image();image.onload=()=>{if(disposed)return;const next=surface(project,image);textures[i].dispose();textures[i]=next;material.map=next;material.needsUpdate=true;draw();};image.onerror=()=>{};image.src=project.image;}
 });
 function draw(){if(!disposed&&visible&&!document.hidden)renderer.render(scene,camera);}
 function layout(){
  width=host.clientWidth||1;height=host.clientHeight||1;renderer.setSize(width,height,false);
  camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
  const cols=width<600?3:4,rows=Math.ceil(meshes.length/cols),gap=width<600?10:18,pad=width<600?14:28;
  const tileW=(width-pad*2-gap*(cols-1))/cols,tileH=Math.min(tileW*440/640,(height-pad*2-gap*(rows-1))/rows);
  meshes.forEach((mesh,i)=>{const col=i%cols,row=Math.floor(i/cols);mesh.scale.set(tileW,tileH,1);mesh.userData.x=-width/2+pad+tileW/2+col*(tileW+gap);mesh.userData.y=height/2-pad-tileH/2-row*(tileH+gap);mesh.position.set(mesh.userData.x,mesh.userData.y,0);});draw();
 }
 function schedule(){if(!frame&&!disposed&&visible&&!document.hidden&&!reduced&&selected<0)frame=requestAnimationFrame(animate);}
 function animate(time){frame=0;if(disposed||!visible||document.hidden||selected>=0)return;if(time-last>=33){const delta=Math.min(time-last,100);last=time;phase+=delta*.00022;meshes.forEach((mesh,i)=>{mesh.position.x=mesh.userData.x+Math.sin(phase+i*.45)*2;mesh.position.y=mesh.userData.y+Math.cos(phase+i*.45)*3;});draw();}schedule();}
 function locate(event){const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(meshes,false)[0];const index=hit?hit.object.userData.index:-1;if(index!==hovered){hovered=index;onHover(index);canvas.style.cursor=index>=0?'pointer':'default';}}
 const move=e=>locate(e),click=e=>{locate(e);if(hovered>=0)onSelect(hovered);},leave=()=>{hovered=-1;onHover(-1);};
 canvas.addEventListener('pointermove',move);canvas.addEventListener('click',click);canvas.addEventListener('pointerleave',leave);
 const resize=new ResizeObserver(layout);resize.observe(host);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible){cancelAnimationFrame(frame);frame=0;}else{draw();schedule();}});intersection.observe(host);
 const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{draw();schedule();}};document.addEventListener('visibilitychange',visibility);
 layout();schedule();
 return {setSelected(index){selected=index;if(index>=0){cancelAnimationFrame(frame);frame=0;}else schedule();},destroy(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('click',click);canvas.removeEventListener('pointerleave',leave);textures.forEach(t=>t.dispose());meshes.forEach(m=>m.material.dispose());geometry.dispose();renderer.dispose();canvas.remove();}};
}
