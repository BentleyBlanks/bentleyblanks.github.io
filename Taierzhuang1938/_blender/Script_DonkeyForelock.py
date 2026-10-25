"""Extract the actual forelock silhouette while excluding projected pinnas."""
import numpy as np

def ExtractForelock(rgb,rootZ,earTriangles,halfWidth=.065,height=.165,below=.010,ppm=(925-302)/1.10):
    size=128;columns=np.arange(size);rows=np.arange(size)
    x=-halfWidth+2*halfWidth*columns/(size-1);z=rootZ+height-(height+below)*rows/(size-1)
    uu=np.broadcast_to(156.5-ppm*x,(size,size));vv=np.broadcast_to((925-ppm*z)[:,None],(size,size))
    ix=np.clip(uu.astype(int),0,1534);iy=np.clip(vv.astype(int),0,1022);fx=(uu-ix)[:,:,None];fy=(vv-iy)[:,:,None]
    colour=(rgb[iy,ix]*(1-fx)+rgb[iy,ix+1]*fx)*(1-fy)+(rgb[iy+1,ix]*(1-fx)+rgb[iy+1,ix+1]*fx)*fy
    def Linear(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
    luminance=Linear(colour)@np.array([.2126,.7152,.0722]);background=float(np.median(Linear(rgb[65:95,146:170])@np.array([.2126,.7152,.0722])))
    matte=np.clip((background-luminance)/max(.10,background-.008),0,1)
    matte=np.clip((matte-.08)/.62,0,1)
    guard=np.zeros((size,size),bool)
    for triangle in earTriangles:
        p=np.asarray(triangle);uv=np.column_stack(((p[:,0]+halfWidth)/(2*halfWidth)*(size-1),(rootZ+height-p[:,2])/(height+below)*(size-1)))
        a,b,c=uv;ab=b-a;ac=c-a;det=ab[0]*ac[1]-ab[1]*ac[0]
        if abs(det)<1e-10:continue
        lo=np.maximum(0,np.floor(uv.min(axis=0)).astype(int));hi=np.minimum(size-1,np.ceil(uv.max(axis=0)).astype(int))
        if np.any(lo>hi):continue
        yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];dx=xx+.5-a[0];dy=yy+.5-a[1];v=(dx*ac[1]-dy*ac[0])/det;w=(ab[0]*dy-ab[1]*dx)/det
        guard[yy,xx]|=(v>=0)&(w>=0)&(v+w<=1)
    for _ in range(2):
        padded=np.pad(guard,1);guard=np.logical_or.reduce([padded[y:y+size,x:x+size] for y in range(3) for x in range(3)])
    matte[guard]=0
    profile=[]
    for column in range(size):
        active=np.where(matte[:,column]>.32)[0];profile.append(max(0,height-(height+below)*int(active[0])/(size-1)) if len(active) else 0)
    profile=np.asarray(profile);smooth=np.convolve(np.pad(profile,(2,2),mode='edge'),np.ones(5)/5,mode='valid')
    candidates=[i for i in range(3,size-3) if smooth[i]>=max(smooth[i-3:i]) and smooth[i]>max(smooth[i+1:i+4]) and smooth[i]>max(.025,float(smooth.max())*.40)]
    selected=[]
    for column in sorted(candidates,key=lambda i:-smooth[i]):
        if all(abs(column-i)>=18 for i in selected):selected.append(column)
        if len(selected)==3:break
    selected.sort();groups=[]
    for column in selected:
        left=right=column
        while left>0 and column-left<10 and profile[left-1]>.60*profile[column]:left-=1
        while right<size-1 and right-column<10 and profile[right+1]>.60*profile[column]:right+=1
        groups.append(list(range(left,right+1)))
    if not groups:raise RuntimeError('Reference forelock contains no independent visible lobe')
    record={'method':'source-gap background matting with projected-pinna exclusion and separated contour maxima; no pinna pixels reused as forelock','backgroundLinearLuminance':background,'sourceHalfWidthM':halfWidth,'sourceSize':[size,size],'peakColumns':selected,'peakSourcePixelX':[float(156.5-ppm*x[i]) for i in selected],'lobeColumns':[[g[0],g[-1]] for g in groups],'nonemptyColumns':int(np.count_nonzero(profile>.006)),'sourceGuardPixels':int(np.count_nonzero(guard))}
    return colour.astype(np.float32),matte.astype(np.float32),profile.tolist(),groups,record
