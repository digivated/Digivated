"""Render Digivated's desktop marketing set. Requires Pillow and FFmpeg."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import math, subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent
W, H = 1600, 900
BG, PANEL, LINE = '#08070d', '#12101a', '#30283c'
WHITE, MUTED, PURPLE = '#f5f1fb', '#a49baa', '#ad6cff'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
logo = Image.open(ROOT / 'public/digivated-favicon.png').convert('RGBA')
logo = logo.crop(logo.getbbox())
logo.thumbnail((50,50))

def font(size, bold=False): return ImageFont.truetype(BOLD if bold else FONT, size)
def txt(d, xy, value, size, fill=WHITE, bold=False): d.text(xy, value, font=font(size,bold), fill=fill)
def roundbox(d, rect, fill=PANEL, outline=LINE, radius=26, width=2):
    d.rounded_rectangle(rect, radius=radius, fill=fill, outline=outline, width=width)
def base():
    im=Image.new('RGB',(W,H),BG)
    glow=Image.new('RGBA',(W,H)); gd=ImageDraw.Draw(glow)
    gd.ellipse((820,-410,1850,630),fill=(111,38,179,100))
    glow=glow.filter(ImageFilter.GaussianBlur(165))
    im=Image.alpha_composite(im.convert('RGBA'),glow)
    d=ImageDraw.Draw(im)
    for x in range(80,W,80): d.line((x,0,x,H), fill='#100d17',width=1)
    for y in range(50,H,80): d.line((0,y,W,y), fill='#100d17',width=1)
    return im
def mark(im,x=105,y=76,s=50):
    im.paste(logo,(x,y),logo)
    d=ImageDraw.Draw(im); txt(d,(x+s+18,y+7),'Digivated',28,bold=True)
def chrome(d,x,y,w,title):
    roundbox(d,(x,y,x+w,y+490),'#111018','#342944',22)
    for i,c in enumerate(('#8e566f','#c09b67','#6f9b80')): d.ellipse((x+22+i*22,y+20,x+31+i*22,y+29),fill=c)
    d.rounded_rectangle((x+w//2-145,y+12,x+w//2+145,y+39),radius=12,fill='#1b1722')
    txt(d,(x+w//2-67,y+18),title,13,MUTED)
def card(d,x,y,w,h,kicker,title,body):
    roundbox(d,(x,y,x+w,y+h),'#1a1523','#49385b',18)
    txt(d,(x+23,y+20),kicker.upper(),14,PURPLE,True)
    txt(d,(x+23,y+54),title,24,WHITE,True)
    txt(d,(x+23,y+96),body,16,MUTED)
def frame(t):
    im=BASE.copy(); d=ImageDraw.Draw(im); mark(im)
    d=ImageDraw.Draw(im)
    d.line((104,155,1496,155),fill=LINE,width=2)
    phase=min(3,int(t//4.5)); local=(t%4.5)/4.5
    if phase==0:
        txt(d,(108,245),'YOUR WORK DESERVES',54,WHITE,True)
        txt(d,(108,317),'TO BE SEEN.',83,PURPLE,True)
        txt(d,(112,445),'A home for independent builders and the projects they make.',26,MUTED)
        roundbox(d,(110,540,470,614),'#7d3ed0','#bc83ff',35)
        txt(d,(151,559),'Explore Digivated  →',24,WHITE,True)
        for i in range(3):
            p=(local*1.3+i/3)%1
            r=80+p*390
            color=(140,68,210,int((1-p)*85))
            overlay=Image.new('RGBA',(W,H)); od=ImageDraw.Draw(overlay)
            od.ellipse((1250-r,420-r,1250+r,420+r),outline=color,width=3)
            im=Image.alpha_composite(im,overlay)
        d=ImageDraw.Draw(im)
        d.ellipse((1213,383,1287,457),fill='#b574fc')
    elif phase==1:
        txt(d,(105,215),'01  /  SHARE',19,PURPLE,True)
        txt(d,(104,266),'Put your project',58,WHITE,True)
        txt(d,(104,342),'in front of builders.',58,WHITE,True)
        txt(d,(108,447),'Create a project page. Show what you are making.',25,MUTED)
        chrome(d,820,210,675,'digivated.com/submit')
        txt(d,(860,291),'Share your project',32,WHITE,True)
        roundbox(d,(855,359,1455,419),'#1d1825','#4c3b5f',11)
        txt(d,(877,375),'Project name',19,MUTED)
        roundbox(d,(855,445,1455,535),'#1d1825','#4c3b5f',11)
        txt(d,(877,461),'What does your project do?',19,MUTED)
        roundbox(d,(855,575,1090,631),'#7d3ed0','#bc83ff',27)
        txt(d,(893,591),'Submit project  →',18,WHITE,True)
    elif phase==2:
        txt(d,(105,215),'02  /  CONNECT',19,PURPLE,True)
        txt(d,(104,266),'Get useful',65,WHITE,True)
        txt(d,(104,348),'feedback.',70,PURPLE,True)
        txt(d,(108,461),'Meet makers, share progress, and start conversations.',24,MUTED)
        chrome(d,805,210,690,'digivated.com/creators')
        txt(d,(849,292),'Creators',33,WHITE,True)
        card(d,840,365,610,115,'Conversation','What are you building?','Share progress and ask for feedback.')
        card(d,840,495,610,115,'Project feedback','Specific ideas move work forward','Talk with the people behind projects.')
    else:
        txt(d,(105,222),'03  /  DISCOVER',19,PURPLE,True)
        txt(d,(105,281),'Find your audience.',55,WHITE,True)
        txt(d,(108,393),'Explore projects, join the conversation,',25,MUTED)
        txt(d,(108,432),'and give your work a place to be discovered.',25,MUTED)
        roundbox(d,(107,529,680,604),'#7d3ed0','#bc83ff',37)
        txt(d,(141,549),'Share your project at digivated.com  →',23,WHITE,True)
        chrome(d,805,210,690,'digivated.com')
        txt(d,(844,287),'Featured projects',31,WHITE,True)
        card(d,843,362,290,205,'Discover','Focus City','Independent projects')
        card(d,1150,362,290,205,'Discover','AppAtlas','Explore what is new')
    txt(d,(108,828),'DIGIVATED.COM',18,MUTED,True)
    d.line((W-400,838,W-108,838),fill=LINE,width=5)
    d.line((W-400,838,W-400+292*min(1,t/18),838),fill=PURPLE,width=5)
    return im.convert('RGB')

BASE=base()

if __name__=='__main__':
    OUT.mkdir(exist_ok=True)
    for name,sec in [('01-discover.png',1),('02-share.png',6),('03-feedback.png',11),('04-call-to-action.png',16)]:
        frame(sec).save(OUT/name,optimize=True)
    cmd=['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','24','-i','-','-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'digivated-desktop-demo.mp4')]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for n in range(18*24): proc.stdin.write(frame(n/24).tobytes())
    finally:
        proc.stdin.close()
    if proc.wait(): raise RuntimeError('FFmpeg render failed')
