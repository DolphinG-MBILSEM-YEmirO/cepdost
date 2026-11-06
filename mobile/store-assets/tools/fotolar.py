# Illustrated stand-in photos for the demo posts (gunbatimi, kahvalti,
# bisiklet). Real photos look better; drop them into foto/ with these names.
#   python3 fotolar.py   -> foto/*.jpg
import os
os.makedirs('foto', exist_ok=True)
os.chdir('foto')
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
W,H=1080,1350
rng=np.random.default_rng(3)
def grad(top,bot,h=H,w=W):
    t=np.linspace(0,1,h)[:,None,None]
    return (np.array(top)*(1-t)+np.array(bot)*t)*np.ones((h,w,3))
def noise(a,s=6): return np.clip(a+rng.normal(0,s,a.shape),0,255)
# 1 sunset over sea (Moda)
img=grad((255,140,90),(255,205,150)); hz=int(H*0.58)
sea=grad((60,90,140),(20,40,80),H-hz); img[hz:]=sea
im=Image.fromarray(noise(img).astype('uint8')); d=ImageDraw.Draw(im)
d.ellipse((W/2-110,hz-150,W/2+110,hz+70),fill=(255,235,190))
for i in range(40):
    y=hz+8+i*14; w=200-i*3
    if w>10: d.rectangle((W/2-w/2,y,W/2+w/2,y+4),fill=(255,200,150))
im.paste((255,140,90),(0,0,W,0))
im=im.filter(ImageFilter.GaussianBlur(1.2)); d=ImageDraw.Draw(im)
# silhouettes on shore
d.rectangle((0,H-170,W,H),fill=(25,25,40))
for x,h in [(140,260),(210,230),(820,250)]:
    d.ellipse((x-22,H-170-h,x+22,H-170-h+44),fill=(25,25,40)); d.rounded_rectangle((x-30,H-170-h+40,x+30,H-170),12,fill=(25,25,40))
im.save('gunbatimi.jpg',quality=88)
# 2 breakfast top-down
im=Image.fromarray(noise(grad((205,170,130),(185,145,105)),4).astype('uint8')); d=ImageDraw.Draw(im)
for i in range(0,H,90): d.line((0,i,W,i+30),fill=(175,135,95),width=3)
d.ellipse((140,260,940,1060),fill=(245,245,240)); d.ellipse((200,320,880,1000),fill=(250,250,248))
d.ellipse((330,450,520,640),fill=(255,255,255)); d.ellipse((385,505,465,585),fill=(255,180,40))
d.ellipse((560,430,760,560),fill=(200,40,40)); d.ellipse((600,600,800,760),fill=(90,140,60))
d.ellipse((380,700,560,860),fill=(240,220,150)); d.rectangle((560,800,780,900),fill=(250,240,200))
d.ellipse((760,1080,1010,1330),fill=(250,250,250)); d.ellipse((800,1120,970,1290),fill=(110,60,30))
d.ellipse((60,1050,260,1250),fill=(240,240,240)); d.ellipse((90,1080,230,1220),fill=(170,30,30))
im.filter(ImageFilter.GaussianBlur(2)).save('kahvalti.jpg',quality=88)
# 3 bike path by sea, daytime
img=grad((120,185,240),(200,230,250)); hz=int(H*0.5); img[hz:int(H*0.68)]=grad((40,120,180),(70,150,200),int(H*0.68)-hz)
img[int(H*0.68):]=grad((90,160,80),(60,120,55),H-int(H*0.68))
im=Image.fromarray(noise(img,5).astype('uint8')); d=ImageDraw.Draw(im)
d.polygon([(W*0.45,H*0.68),(W*0.55,H*0.68),(W*0.95,H),(W*0.05,H)],fill=(200,90,70))
d.line((W*0.5,H*0.7,W*0.5,H),fill=(250,250,250),width=6)
for cx,cy,r in [(200,180,60),(270,170,75),(340,185,55),(780,260,50),(840,250,65)]: d.ellipse((cx-r,cy-r*0.6,cx+r,cy+r*0.6),fill=(255,255,255))
d.ellipse((W-200,90,W-110,180),fill=(255,250,210))
im.filter(ImageFilter.GaussianBlur(1.5)).save('bisiklet.jpg',quality=88)
