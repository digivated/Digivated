"""Reproducible silent product promo. Python 3 + Pillow/numpy + FFmpeg.
Run from repository root: python3 media/digivated-promo/render.py
Assets: actual public Digivated screenshots captured Nov 8 2026; approved logo.
No customer data, generated claims, external footage, or copyrighted music.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np, subprocess, math
from functools import lru_cache
ROOT=Path(__file__).resolve().parents[2]; HERE=Path(__file__).parent
W,H,FPS,DURATION=1280,720,30,24
OUT=ROOT/'public/media';OUT.mkdir(exist_ok=True)
REG='/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf'
BOLD='/usr/share/fonts/truetype/open-sans/OpenSans-Semibold.ttf'
@lru_cache(maxsize=32)
def font(n,bold=False):return ImageFont.truetype(BOLD if bold else REG,n)
def ease(v):v=max(0,min(1,v));return 1-(1-v)**3
Y,X=np.mgrid[:H,:W];halo=np.exp(-((X-640)**2/(440**2)+(Y-370)**2/(260**2)))
bg=np.stack([5+10*halo,5+4*halo,7+22*halo],axis=-1).astype('uint8');BASE=Image.fromarray(bg).convert('RGBA')
assets={p.stem:Image.open(p).convert('RGBA') for p in (HERE/'assets').glob('*.png')}
logo=Image.open(ROOT/'public/digivated-logo.png').convert('RGBA')
def text(im,s,y,size=48,color='#f6f3fc',bold=True):
 d=ImageDraw.Draw(im);f=font(size,bold);box=d.textbbox((0,0),s,font=f);x=(W-(box[2]-box[0]))/2;d.text((x,y),s,font=f,fill=color)
def picture(im,asset,box,progress=1):
 x,y,w,h=box;src=asset.copy();src.thumbnail((int(w),int(h)),Image.Resampling.LANCZOS)
 layer=Image.new('RGBA',im.size);xx=int(x+(w-src.width)/2);yy=int(y+(h-src.height)/2+22*(1-ease(progress)));layer.alpha_composite(src,(xx,yy))
 if progress<1:layer.putalpha(layer.getchannel('A').point(lambda a:int(a*ease(progress))))
 im.alpha_composite(layer)
def reveal(im,copy,y,size,local,color='#f6f3fc',bold=True):
 k=ease(local/.45);layer=Image.new('RGBA',(W,H));text(layer,copy,y+int(18*(1-k)),size,color,bold)
 layer.putalpha(layer.getchannel('A').point(lambda a:int(a*k)));im.alpha_composite(layer)
def frame(t):
 im=BASE.copy()
 if t<3:
  reveal(im,'You built it.',230,66,t)
  reveal(im,'Now get it seen.',330,74,t-.65,'#c3a0ff')
 elif t<7:
  u=t-3
  reveal(im,'Start a conversation.',136,59,u)
  reveal(im,'Get feedback on what you’re building.',225,32,u-.25,'#c5bdd0',False)
  picture(im,assets['actions'].resize((1028,126),Image.Resampling.LANCZOS),(126,330,1028,126),u/.6)
  reveal(im,'Fresh perspectives. A stronger next version.',545,29,u-1,'#c3a0ff',False)
 elif t<11:
  u=t-7
  reveal(im,'Reach beyond your own feed.',54,48,u)
  row=assets['projects-row']
  for i in range(3):
   card=row.crop((int(i*row.width/3),0,int((i+1)*row.width/3),row.height))
   picture(im,card,(52+i*393,180,388,398),(u-i*.18)/.6)
  reveal(im,'Selected projects may be featured or reposted.',635,25,u-.65,'#c5bdd0',False)
 elif t<16:
  u=t-11
  reveal(im,'Build toward',120,47,u)
  reveal(im,'consistent traffic.',190,65,u-.25,'#c3a0ff')
  labels=['Get listed.','Share your link.','Invite feedback.']
  for i,label in enumerate(labels):
   k=ease((u-.65-i*.75)/.4)
   if k<=0:continue
   layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer);x=122+i*354
   d.rounded_rectangle((x,365,x+328,465),radius=16,fill='#15111d',outline='#513c6f',width=1)
   f=font(27,True);box=d.textbbox((0,0),label,font=f);d.text((x+(328-box[2])/2,394),label,font=f,fill='#f4effb')
   layer.putalpha(layer.getchannel('A').point(lambda a:int(a*k)));im.alpha_composite(layer)
  reveal(im,'Give the right people more ways to find your work.',555,29,u-2.55,'#c5bdd0',False)
 elif t<20:
  u=t-16
  reveal(im,'Put your project out there.',54,51,u)
  picture(im,assets['submit'],(180,155,920,440),u/.55)
  reveal(im,'Submit for free. Reviewed before publishing.',638,25,u-.4,'#c5bdd0',False)
 else:
  u=t-20;picture(im,logo,(550,90,180,180),u/.5)
  reveal(im,'Digivated',280,62,u)
  reveal(im,'Get seen. Get feedback. Keep building.',390,37,u-.25,'#c3a0ff',False)
  k=ease((u-.65)/.4);layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
  d.rounded_rectangle((365,505,915,589),radius=14,fill='#7543bc')
  text(layer,'Submit your project',525,33)
  layer.putalpha(layer.getchannel('A').point(lambda a:int(a*k)));im.alpha_composite(layer)
  reveal(im,'digivated.com',625,25,u-.65,'#c5bdd0',False)
 return im.convert('RGB')
if __name__=='__main__':
 cmd=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','21','-profile:v','main','-level','3.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-t',str(DURATION),'-movflags','+faststart',str(OUT/'digivated-promo-v2.mp4')]
 process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 for n in range(FPS*DURATION):process.stdin.write(frame(n/FPS).tobytes())
 process.stdin.close();assert process.wait()==0
 frame(21.5).save(OUT/'digivated-promo-v2-poster.jpg',quality=92)
 for second in [1,5,10,14,18,22]:frame(second).resize((640,360)).save(HERE/f'preview-{second}.jpg')
 print('Rendered',DURATION,'seconds at',W,H)
