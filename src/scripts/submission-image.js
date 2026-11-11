export async function prepareProjectImage(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG, or WebP logo.');
 if(file.size>10*1024*1024)throw Error('Choose a logo smaller than 10 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This logo could not be opened. Choose another file.'));img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Logo processing is unavailable. Please try another browser.');
  // Transparent padding, preserved proportions, and no enlargement of small originals.
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const scale=Math.min(1,464/image.naturalWidth,464/image.naturalHeight);
  const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  ctx.drawImage(image,(512-w)/2,(512-h)/2,w,h);
  const fits=result=>Math.ceil((result.length-result.indexOf(',')-1)*3/4)<=500*1024;
  const png=canvas.toDataURL('image/png');if(fits(png))return png;
  for(const quality of [.94,.88,.8]){const result=canvas.toDataURL('image/webp',quality);if(fits(result))return result;}
  throw Error('This logo could not be optimized. Try a smaller PNG or WebP.');
 }finally{URL.revokeObjectURL(url);}
}
