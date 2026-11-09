"""Render a product-led Digivated desktop film from captured public pages."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, subprocess, wave
import numpy as np

OUT=Path(__file__).resolve().parent
W,H,FPS,DURATION=1280,720,24,22
REG='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
WHITE='#f7f4fc'; MUTED='#aaa3b2'; PURPLE='#b983ff'
logo=Image.open(OUT.parent/'public/digivated-favicon.png').convert('RGBA');logo.thumbnail((60,60))
shots={k:Image.open(OUT/f'live-{k}.png').convert('RGB') for k in ('home','projects','creators')}
detail=Image.open(OUT/'live-project-detail.png').convert('RGB').crop((430,122,1010,868))

def ft(size,bold=False):return ImageFont.truetype(BOLD if bold else REG,size)
def text(d,x,y,s,size=32,color=WHITE,bold=False):d.text((x,y),s,font=ft(size,bold),fill=color)
def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
def bg(t):
    return BACKGROUND.copy()
def add_logo(im,x=68,y=54):
    im.paste(logo,(x,y),logo)
    d=ImageDraw.Draw(im);text(d,x+73,y+13,'Digivated',27,bold=True)
def browser(im,shot,t,phase):
    # A stable capture of the live desktop page with restrained camera drift.
    sw=760+int(18*phase);sh=round(sw*900/1440)
    crop=shot.resize((sw,sh),Image.Resampling.LANCZOS)
    x=430-int(12*phase);y=129-int(8*phase)
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((x-9,y-34,x+sw+9,y+sh+9),radius=16,fill='#17131e',outline='#544069',width=2)
    for i,c in enumerate(('#b17b93','#b6a076','#88ad94')):d.ellipse((x+15+i*20,y-19,x+23+i*20,y-11),fill=c)
    im.paste(crop,(x,y))
    return im
def frame(n):
    t=n/FPS;im=bg(t);d=ImageDraw.Draw(im)
    add_logo(im)
    d=ImageDraw.Draw(im)
    if t<2.4:
        a=ease((t-.15)/.6)
        text(d,72,275,'Good projects deserve',46,WHITE,True)
        text(d,72,338,'to be discovered.',60,PURPLE,True)
        text(d,75,453,'Meet the builders. See the work. Join the conversation.',21,MUTED)
        d.line((74,520,74+int(425*a),520),fill=PURPLE,width=3)
    elif t<6.3:
        p=(t-2.4)/3.9;browser(im,shots['home'],t,p)
        d=ImageDraw.Draw(im);text(d,66,280,'A place for',37,bold=True);text(d,66,328,'what you build.',37,PURPLE,True)
        text(d,69,425,'Show your project.',19,MUTED);text(d,69,455,'Make it discoverable.',19,MUTED)
    elif t<10.2:
        p=(t-6.3)/3.9;browser(im,shots['projects'],t,p)
        d=ImageDraw.Draw(im);text(d,66,275,'Discover',40,bold=True);text(d,66,328,'independent work.',30,PURPLE,True)
        text(d,68,424,'Explore projects and',19,MUTED);text(d,68,454,'meet their makers.',19,MUTED)
    elif t<14.1:
        p=(t-10.2)/3.9
        d=ImageDraw.Draw(im)
        text(d,67,273,'Open the work.',38,bold=True)
        text(d,67,329,'Give feedback.',38,PURPLE,True)
        text(d,69,426,'Explore the details and',19,MUTED)
        text(d,69,456,'respond to the maker.',19,MUTED)
        dw=520;dh=round(dw*detail.height/detail.width)
        art=detail.resize((dw,dh),Image.Resampling.LANCZOS)
        x=615-int(13*p);y=87-int(20*p)
        d.rounded_rectangle((x-12,y-12,x+dw+12,y+dh+12),radius=20,fill='#1b1425',outline='#73528d',width=2)
        im.paste(art,(x,y))
    elif t<18:
        p=(t-14.1)/3.9;browser(im,shots['creators'],t,p)
        d=ImageDraw.Draw(im);text(d,66,274,'Build in public.',38,bold=True);text(d,66,329,'Get feedback.',38,PURPLE,True)
        text(d,68,425,'Share progress and',19,MUTED);text(d,68,455,'talk with creators.',19,MUTED)
    else:
        text(d,75,254,'Your next project',55,WHITE,True)
        text(d,75,330,'starts here.',72,PURPLE,True)
        text(d,78,458,'Share what you are making.',23,MUTED)
        d.rounded_rectangle((76,531,510,598),radius=32,fill='#793ac3',outline='#ba88ef',width=2)
        text(d,104,547,'Visit digivated.com  →',25,WHITE,True)
    d=ImageDraw.Draw(im)
    text(d,75,667,'DIGIVATED.COM',13,MUTED,True)
    d.line((995,677,1204,677),fill='#40304d',width=3)
    d.line((995,677,995+int(209*t/DURATION),677),fill=PURPLE,width=3)
    return im.convert('RGB')

def audio():
    sr=48000;t=np.arange(sr*DURATION,dtype=np.float64)/sr
    env=np.minimum(1,t/1.3)*np.minimum(1,(DURATION-t)/1.4)
    low=np.sin(2*np.pi*110*t)*.033+np.sin(2*np.pi*164.81*t)*.018+np.sin(2*np.pi*220*t)*.011
    shimmer=np.sin(2*np.pi*440*t+1.2*np.sin(2*np.pi*.11*t))*.004
    signal=(low+shimmer)*env
    for sec in (2.4,6.3,10.2,14.1,18):
        dt=t-sec;signal+=np.where((dt>=0)&(dt<.23),.018*np.sin(2*np.pi*(750-380*dt)*dt)*np.exp(-22*np.maximum(dt,0)),0)
    pcm=np.int16(np.clip(signal,-1,1)*32767)
    path=OUT/'digivated-product-film-audio.wav'
    with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes(pcm.tobytes())
    return path

BACKGROUND=Image.new('RGB',(W,H),'#09070d').convert('RGBA')
_g=Image.new('RGBA',(W,H));_d=ImageDraw.Draw(_g)
_d.ellipse((510,100,1210,800),fill=(112,44,180,68))
BACKGROUND=Image.alpha_composite(BACKGROUND,_g.filter(ImageFilter.GaussianBlur(135)))

if __name__=='__main__':
    for name,sec in [('product-film-cover.png',1.3),('product-film-projects.png',8.2),('product-film-feedback.png',11.7),('product-film-creators.png',15.6)]:frame(int(sec*FPS)).save(OUT/name,optimize=True)
    sound=audio()
    raw=OUT/'digivated-product-film-silent.mp4'
    cmd=['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',str(raw)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for i in range(DURATION*FPS):p.stdin.write(frame(i).tobytes())
    p.stdin.close()
    if p.wait():raise RuntimeError('Video render failed')
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(raw),'-i',str(sound),'-c:v','copy','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',str(OUT/'digivated-product-film.mp4')],check=True)
    raw.unlink();sound.unlink()
