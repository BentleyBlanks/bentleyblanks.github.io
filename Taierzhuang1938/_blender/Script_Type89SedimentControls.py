"""Create the four compacted-clay masks and the sediment grain control."""
from pathlib import Path

import cv2
import numpy as np

from Script_Type89BattleWearMasks import Quantize, SaveRgb, Smooth
from Script_Type89Sediment import TRACK_CONTROL, GRAIN


# Shoe-local X/Y radii and heights in metres. Branching lobes avoid a single
# uniform brown stripe across all four visible tread states.
LOBES = [
    [(-.102,-.019,.046,.027,.0034),(.020,.007,.034,.028,.0034),(.117,.018,.035,.024,.0025),
     (-.044,.037,.057,.022,.0038)],
    [(-.120,.025,.052,.033,.0048),(-.075,-.007,.081,.032,.0055),(-.041,.038,.058,.032,.0058),
     (.053,.020,.049,.036,.0049),(.115,-.021,.039,.029,.0040),(.125,.052,.037,.019,.0045)],
    [(-.11,.016,.067,.043,.0063),(-.051,-.025,.063,.045,.0063),(-.015,.031,.082,.045,.0073),
     (.046,.006,.064,.045,.0068),(.100,-.033,.044,.035,.0061),(.106,.033,.050,.037,.0064),
     (.005,.053,.048,.019,.0050),(-.095,-.057,.064,.024,.0068)],
    [(-.126,-.032,.053,.042,.0071),(-.087,.023,.075,.046,.0079),(-.057,.052,.058,.029,.0069),
     (-.004,-.008,.086,.062,.0081),(.050,.018,.088,.047,.0082),(.089,.047,.049,.030,.0072),
     (.132,.005,.047,.040,.0071),(.089,-.046,.051,.031,.0062),
     (-.052,-.057,.082,.029,.0073),(.103,-.062,.057,.025,.0066)]
]


def Grain(seed,size,steps):
    rng = np.random.default_rng(seed)
    result = np.zeros((size,size),np.float32)
    for width,weight in steps:
        noise = rng.random((width,width),dtype=np.float32)*2-1
        result += cv2.resize(noise,(size,size),interpolation=cv2.INTER_CUBIC)*weight
    return np.clip(result,-1,1)


def Build(directory):
    directory.mkdir(parents=True,exist_ok=True)
    size = 512
    x = ((np.arange(size,dtype=np.float32)[None,:]+.5)/size-.5)*.350
    y = (.5-(np.arange(size,dtype=np.float32)[:,None]+.5)/size)*.184
    atlas = np.empty((2*size,2*size,3),np.uint16)
    for variant,rows in enumerate(LOBES):
        coarse = Grain(971+variant,size,[(9,.76),(26,.24)])
        edge = Grain(1538+variant,size,[(38,.65),(89,.35)])
        grit = Grain(962+variant,size,[(106,.57),(211,.43)])
        cake = np.zeros((size,size),np.float32)
        height = np.zeros_like(cake)
        rng = np.random.default_rng(237+variant)
        for xx,yy,rx,ry,rh in rows:
            angle = rng.uniform(-.54,.51)
            cs,sn = np.cos(angle),np.sin(angle)
            u = ((x-xx)*cs+(y-yy)*sn)/rx
            v = (-(x-xx)*sn+(y-yy)*cs)/ry
            radius = np.hypot(u,v)+coarse*.21+edge*.14+grit*.038
            field = 1-Smooth(.52,1.23,radius)
            np.maximum(cake,field,out=cake)
            np.maximum(height,rh*field**1.30,out=height)
        # Small loss of adhesion near the crust edge leaves distinct chips.
        cake = np.clip(cake*(.94+coarse*.17+edge*.082),0,1)
        height += cake*(coarse*.0018+edge*.00115+grit*.00042)
        cake *= (.70,.85,.97,1)[variant]
        height *= (.64,.83,.96,1)[variant]
        rim = Smooth(.039,.28,cake)*(1-Smooth(.41,.81,cake))
        sediment = (1-Smooth(.29,.66,cake))*Smooth(.04,.64,coarse+edge*.40)
        powder = np.clip(.69*rim+.25*sediment,0,1)
        row,column = (variant//2)*size,(variant%2)*size
        atlas[row:row+size,column:column+size] = Quantize(np.stack((cake,np.clip(.5+height/.017,0,1),powder),axis=-1))
    SaveRgb(directory/TRACK_CONTROL,atlas)
    field = [
        .5+.5*Grain(791,768,[(21,.48),(49,.32),(105,.20)]),
        .5+.5*Grain(497,768,[(111,.48),(214,.35),(382,.17)]),
        .5+.5*Grain(642,768,[(13,.63),(38,.25),(96,.12)]),
    ]
    SaveRgb(directory/GRAIN,Quantize(np.stack(field,axis=-1)))
