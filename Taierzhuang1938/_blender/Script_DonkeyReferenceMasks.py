"""Guide-fill the actual tack footprint, including its dark, shaded rope edges."""
import numpy as np

def BuildOcclusionMasks(width=1536,height=1024):
    yy,xx=np.indices((height,width),dtype=np.float32);xx*=1536/width;yy*=1024/height
    side=(xx>565)&(xx<785)&(yy>230)&(yy<595)
    front=((xx>45)&(xx<270)&(yy>295)&(yy<575))|((xx>146)&(xx<170)&(yy>350))
    rear=(xx>1250)&(xx<1505)&(yy>180)&(yy<365)
    def Stroke(mask,points,radius):
        for a,b in zip(points,points[1:]):
            dx,dy=b[0]-a[0],b[1]-a[1]
            t=np.clip(((xx-a[0])*dx+(yy-a[1])*dy)/(dx*dx+dy*dy),0,1)
            mask|=(xx-(a[0]+t*dx))**2+(yy-(a[1]+t*dy))**2<radius*radius
    Stroke(side,[(521,134),(519,180),(502,235),(498,270),(509,309),(516,329),(507,340)],14)
    Stroke(side,[(498,270),(480,294),(460,316),(438,337),(429,345)],14)
    Stroke(side,[(359,317),(396,328),(434,339),(463,344)],11)
    Stroke(side,[(463,344),(443,375),(429,411),(425,437)],13)
    Stroke(front,[(110,175),(105,220),(100,270),(105,325)],13)
    Stroke(front,[(212,170),(220,225),(225,270),(217,325)],13)
    result={'Side':side,'Front':front,'Rear':rear}
    for u,v in ((519,180),(498,270),(516,329),(396,328),(581,524)):
        if not side[min(height-1,int(v*height/1024)),min(width-1,int(u*width/1536))]:raise RuntimeError('Observed reference tack pixel is not masked')
    for u,v in ((900,400),(900,560),(451,280)):
        if side[min(height-1,int(v*height/1024)),min(width-1,int(u*width/1536))]:raise RuntimeError('Visible reference coat was masked as tack')
    for u,v in ((1334,310),(1394,319)):
        if not rear[min(height-1,int(v*height/1024)),min(width-1,int(u*width/1536))]:raise RuntimeError('Observed rear-view collar pixel is not masked')
    return result

def BuildOcclusionWeights(width=1536,height=1024):
    result={};radius=4;size=radius*2+1
    for name,mask in BuildOcclusionMasks(width,height).items():
        values=mask.astype(np.float32)
        for repeat in range(2):
            padded=np.pad(values,((0,0),(radius,radius)),mode='edge');summed=np.pad(np.cumsum(padded,axis=1,dtype=np.float64),((0,0),(1,0)))
            values=(summed[:,size:]-summed[:,:-size])/size
            padded=np.pad(values,((radius,radius),(0,0)),mode='edge');summed=np.pad(np.cumsum(padded,axis=0,dtype=np.float64),((1,0),(0,0)))
            values=(summed[size:]-summed[:-size])/size
        result[name]=values.astype(np.float32)
    return result
