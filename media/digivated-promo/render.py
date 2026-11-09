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
W,H,FPS,DURATION=1280,720,30,8
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
 picture(im,logo,(555,85,170,170),t/.5)
 if t<3.4:
  reveal(im,'Get your project seen.',300,67,t-.2)
 else:
  u=t-3.4
  reveal(im,'Submit your project.',290,66,u)
  reveal(im,'digivated.com',405,47,u-.25,'#c3a0ff')
  reveal(im,'Free to submit. Reviewed before publishing.',555,26,u-.5,'#c5bdd0',False)
 return im.convert('RGB')
if __name__=='__main__':
 cmd=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','21','-profile:v','main','-level','3.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-t',str(DURATION),'-movflags','+faststart',str(OUT/'digivated-promo-v3.mp4')]
 process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 for n in range(FPS*DURATION):process.stdin.write(frame(n/FPS).tobytes())
 process.stdin.close();assert process.wait()==0
 frame(5.5).save(OUT/'digivated-promo-v3-poster.jpg',quality=92)
 for second in [1,3,4,5,6,7]:frame(second).resize((640,360)).save(HERE/f'preview-{second}.jpg')
 print('Rendered',DURATION,'seconds at',W,H)
