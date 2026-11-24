// Bounding box of the visible (non-transparent) pixels. Falls back to the whole image.
export function contentBox(image){
 const W=image.naturalWidth,H=image.naturalHeight,full={x:0,y:0,w:W,h:H};
 try{
  const S=Math.min(1,512/Math.max(W,H)),cw=Math.max(1,Math.round(W*S)),ch=Math.max(1,Math.round(H*S));
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const x=c.getContext('2d',{willReadFrequently:true});if(!x)return full;
  x.drawImage(image,0,0,cw,ch);const d=x.getImageData(0,0,cw,ch).data;
  let minX=cw,minY=ch,maxX=-1,maxY=-1;
  for(let y=0;y<ch;y++)for(let i=0;i<cw;i++){if(d[(y*cw+i)*4+3]>12){if(i<minX)minX=i;if(i>maxX)maxX=i;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
  if(maxX<0)return full;
  const pad=1,x0=Math.max(0,(minX-pad)/S),y0=Math.max(0,(minY-pad)/S),x1=Math.min(W,(maxX+1+pad)/S),y1=Math.min(H,(maxY+1+pad)/S);
  // Only trim when the margin is real. A logo that already fills its canvas is left alone.
  if((x1-x0)>W*.92&&(y1-y0)>H*.92)return full;
  return {x:x0,y:y0,w:x1-x0,h:y1-y0};
 }catch{return full;}
}
export async function prepareProjectImage(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG, or WebP logo.');
 if(file.size>10*1024*1024)throw Error('Choose a logo smaller than 10 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This logo could not be opened. Choose another file.'));img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Logo processing is unavailable. Please try another browser.');
  // Give every logo the same visual area while preserving its proportions and alpha.
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  // Trim empty transparent margins first, so a small mark inside a big blank canvas still fills its tile.
  const box=contentBox(image);
  const scale=464/Math.max(box.w,box.h);
  const w=box.w*scale,h=box.h*scale;
  ctx.drawImage(image,box.x,box.y,box.w,box.h,(512-w)/2,(512-h)/2,w,h);
  const fits=result=>Math.ceil((result.length-result.indexOf(',')-1)*3/4)<=500*1024;
  const png=canvas.toDataURL('image/png');if(fits(png))return png;
  for(const quality of [.94,.88,.8]){const result=canvas.toDataURL('image/webp',quality);if(fits(result))return result;}
  throw Error('This logo could not be optimized. Try a smaller PNG or WebP.');
 }finally{URL.revokeObjectURL(url);}
}
