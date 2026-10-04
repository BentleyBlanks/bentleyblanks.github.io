"""Trace the approved paper artwork into mesh UV boundaries; do not repaint it."""
from pathlib import Path
import math, json
import numpy as np
from PIL import Image
game=Path(__file__).resolve().parents[1]
pixels=np.array(Image.open(game/'Texture/Texture_CommandRoomLetterImage.webp').convert('RGB')).astype(float)
h,w=pixels.shape[:2]
paper=(pixels[:,:,0]-pixels[:,:,2]>8)&(pixels[:,:,2]<232)
outline=[]
for i in range(640):
    a=math.tau*i/640;dx,dy=math.cos(a),math.sin(a)
    r=.503/max(abs(dx),abs(dy))
    for step in range(240):
        u=.5+r*dx;v=.5+r*dy
        x=int(u*(w-1));y=int((1-v)*(h-1))
        if 0<=x<w and 0<=y<h and paper[y,x]:break
        r-=.00045
    assert .015<u<.99 or .003<v<.998
    # A subpixel inset excludes the photographic white background at the rim.
    r-=.0007
    outline.append([round(.5+r*dx,6),round(.5+r*dy,6)])
target=game/'_blender/Data_CommandRoomPaperOutline.json'
target.write_text(json.dumps({'source':'Texture_CommandRoomLetterImage.webp','uvOutline':outline},separators=(',',':'))+'\n',encoding='utf-8')
print(json.dumps({'vertices':len(outline),'target':str(target)}))
