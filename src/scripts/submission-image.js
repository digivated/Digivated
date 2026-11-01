export async function prepareProjectImage(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG, or WebP image.');
 if(file.size>10*1024*1024)throw Error('Choose an image smaller than 10 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This image could not be opened. Choose another file.'));img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=750;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image processing is unavailable. Please try another browser.');
  ctx.fillStyle='#f3f5f6';ctx.fillRect(0,0,1200,750);
  const scale=Math.min(1200/image.naturalWidth,750/image.naturalHeight);
  const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  ctx.drawImage(image,(1200-w)/2,(750-h)/2,w,h);
  for(const quality of [.88,.76,.64,.5,.35]){const result=canvas.toDataURL('image/jpeg',quality);if(Math.ceil((result.length-result.indexOf(',')-1)*3/4)<=500*1024)return result;}
  throw Error('This image could not be optimized. Try a simpler screenshot.');
 }finally{URL.revokeObjectURL(url);}
}
