"""Reproducible silent product promo. Python 3 + Pillow/numpy + FFmpeg.
Run from repository root: python3 media/digivated-promo/render.py
Assets: actual public Digivated screenshots captured Nov 8 2026; approved logo.
No customer data, generated claims, external footage, or copyrighted music.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np, subprocess, math
ROOT=Path(__file__).resolve().parents[2]; HERE=Path(__file__).parent
W,H,FPS,DURATION=1280,720,30,24
OUT=ROOT/'public/media';OUT.mkdir(exist_ok=True)
REG='/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf'
BOLD='/usr/share/fonts/truetype/open-sans/OpenSans-Semibold.ttf'
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
def frame(t):
 im=BASE.copy()
 if t<3:
  k=ease(t/.65);f=Image.new('RGBA',(W,H));text(f,'Built something good?',278+int(22*(1-k)),66);text(f,'Let people find it.',380,42,'#b997f6',False);f.putalpha(f.getchannel('A').point(lambda a:int(a*k)));im.alpha_composite(f)
 elif t<8:
  u=t-3;text(im,'Discover independent projects.',64,45);picture(im,assets['projects-row'],(60,190,1160,432),u/.65)
 elif t<12:
  u=t-8;text(im,'Find tools for your next idea.',56,44)
  # A slow vertical reveal moves from creation tools to workflow tools.
  crop=assets['ai'].crop((100,int(10+80*ease(u/3.3)),1180,int(10+80*ease(u/3.3))+640))
  picture(im,crop,(120,160,1040,515),u/.55)
 elif t<16:
  u=t-12;text(im,'Good feedback moves work forward.',158,43)
  text(im,'Explore. Upvote. Join the conversation.',232,28,'#bcb3c9',False)
  picture(im,assets['actions'],(140,320,1000,130),u/.55)
  # Semantic emphasis resolves onto the existing feedback/upvote controls.
  if u>1.3:text(im,'Help builders make their next version better.',505,27,'#c7a9ff',False)
 elif t<20:
  u=t-16;text(im,"Share what you're building.",62,48)
  src=assets['submit'];picture(im,src,(180,155,920,440),u/.6)
  text(im,'Submit for free. Reviewed before publishing.',638,24,'#bcb3c9',False)
 else:
  u=t-20;picture(im,logo,(540,110,200,200),u/.6);text(im,'Digivated',318,64)
  text(im,'Good projects deserve to be discovered.',414,33,'#c3a0ff',False)
  text(im,'Explore digivated.com',540,30,'#f6f3fc',False)
 return im.convert('RGB')
if __name__=='__main__':
 cmd=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','21','-profile:v','main','-level','3.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-t',str(DURATION),'-movflags','+faststart',str(OUT/'digivated-intro.mp4')]
 process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 for n in range(FPS*DURATION):process.stdin.write(frame(n/FPS).tobytes())
 process.stdin.close();assert process.wait()==0
 frame(21.5).save(OUT/'digivated-intro-poster.jpg',quality=92)
 for second in [1,5,10,14,18,22]:frame(second).resize((640,360)).save(HERE/f'preview-{second}.jpg')
 print('Rendered',DURATION,'seconds at',W,H)
