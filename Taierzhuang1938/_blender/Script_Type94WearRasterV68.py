"""Metric edge chips, clipped handling scratches and actual shoe-land polish."""
from pathlib import Path
import hashlib,json,math,os
import numpy as np
from PIL import Image,ImageDraw
root=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV68'));folder=root/'Textures/HighSurfaceV68Preview';edges=json.loads((root/'Acceptance/Data_WearEdgesV68.json').read_text());surfaces=json.loads((root/'Acceptance/Data_WearSurfacesV68.json').read_text());size=4096;factor=2
core=Image.new('L',(size*factor,)*2);scuff=Image.new('L',core.size);scratch=Image.new('L',core.size);dc,ds,dx=ImageDraw.Draw(core),ImageDraw.Draw(scuff),ImageDraw.Draw(scratch)
def Noise(p):
    q=np.floor(np.asarray(p)/.0025);v=math.sin(float(q@np.array([127.1,311.7,74.7])))*43758.5453;return v-math.floor(v)
def Pixel(uv):return np.array([uv[0],1-uv[1]])*(size-1)*factor
def Chip(draw,a,b,width,seed):
    v=b-a;length=np.linalg.norm(v)
    if length<1e-6:return
    n=np.array([-v[1],v[0]])/length;c=a+v*(.3+.4*seed);half=width*factor*.5;draw.polygon([tuple(p)for p in [a,c+n*half,b,c-n*half*(.65+.3*seed)]],fill=255)
chips=0;halos=0
for edge in edges['edges']:
    e=edge['exposure'];salt=np.array([int(hashlib.sha256(edge['owner'].encode()).hexdigest()[i:i+4],16)/65535 for i in [0,4,8]])
    count=max(1,math.ceil(edge['lengthM']/(.009+.006*(1-e))))
    for i in range(count):
        t0=i/count;t1=(i+1)/count;first=edge['segments'][0];a=np.array(first['localA']);b=np.array(first['localB']);seed=Noise(a+(b-a)*(t0+t1)/2+salt);bare=seed<.10+.65*e;halo=seed<.30+.55*e
        if not halo:continue
        for segment in edge['segments']:
            ua=np.array(segment['uvA']);ub=np.array(segment['uvB']);start=t0+(t1-t0)*(.03+.14*seed);end=t1-(t1-t0)*(.04+.13*(1-seed));p=Pixel(ua+(ub-ua)*start);q=Pixel(ua+(ub-ua)*end);density=segment['pixelsPerMetre'];Chip(ds,p,q,(.005+.009*e)*density,seed);halos+=1
            if bare:Chip(dc,p,q,(.0022+.0045*e)*density,seed);chips+=1

# Coplanar groups share a metric sampling grid, so triangulation is not drawn.
groups={}
for tri in surfaces['paintTriangles']:
    p=np.array(tri['pointsWorldM']);n=np.cross(p[1]-p[0],p[2]-p[0]);n/=np.linalg.norm(n)
    if n[np.argmax(abs(n))]<0:n=-n
    q=np.rint(n*10000).astype(int);d=round(float(n@p[0])*10000);key=(tri['owner'],*q,d);groups.setdefault(key,[]).append(tri)
strokes=0
for key,triangles in groups.items():
    n=np.array(key[1:4],float);n/=np.linalg.norm(n);origin=n*(key[4]/10000);u=np.array([.0,1.,.0]);u-=n*(u@n)
    if np.linalg.norm(u)<.1:u=np.array([1.,0,0]);u-=n*(u@n)
    u/=np.linalg.norm(u);v=np.cross(n,u);prepared=[]
    for tri in triangles:
        p=np.array(tri['pointsWorldM']);xy=np.c_[(p-origin)@u,(p-origin)@v];matrix=np.column_stack((xy[1]-xy[0],xy[2]-xy[0]));
        if abs(np.linalg.det(matrix))>1e-12:prepared.append((tri,xy,np.linalg.inv(matrix)))
    if not prepared:continue
    allPoints=np.vstack([p[1]for p in prepared]);low=np.floor((allPoints.min(axis=0)-.045)/.045).astype(int);high=np.ceil((allPoints.max(axis=0)+.045)/.045).astype(int);exposure=max(t['exposure']for t in triangles)
    for iy in range(low[1],high[1]+1):
        for ix in range(low[0],high[0]+1):
            centre=np.array([(ix+.5)*.045,(iy+.5)*.045]);world=origin+u*centre[0]+v*centre[1];seed=Noise(world+np.array([.437,.127,.733]))
            if key[0]=='Geometry_Hull_Paint'and .65<world[2]<1.05 and abs(world[0])>.55 and -.35<world[1]<.65:exposure=max(exposure,.72)
            if seed>.018+.12*exposure:continue
            angle=(Noise(world+[.11,.22,.33])-.5)*1.1;direction=np.array([math.cos(angle),math.sin(angle)]);perp=np.array([-direction[1],direction[0]]);length=.018+.045*Noise(world+[.7,.2,.4]);lines=1+int(Noise(world+[.5,.9,.3])*3)
            for line in range(lines):
                c=centre+perp*(line-(lines-1)/2)*.0035
                for tri,xy,inverse in prepared:
                    b=inverse@(c-xy[0]);s=inverse@direction;weights=np.array([1-b.sum(),b[0],b[1]]);slope=np.array([-s.sum(),s[0],s[1]]);lo,hi=-length/2,length/2
                    for w,k in zip(weights,slope):
                        if abs(k)<1e-12:
                            if w<0:hi=-1;lo=1;break
                        elif k>0:lo=max(lo,-w/k)
                        else:hi=min(hi,-w/k)
                    if hi<=lo:continue
                    uv=np.array(tri['uv']);ends=[]
                    for t in [lo,hi]:
                        z=b+s*t;ends.append(Pixel(uv[0]+(uv[1]-uv[0])*z[0]+(uv[2]-uv[0])*z[1]))
                    area3=np.linalg.norm(np.cross(np.array(tri['pointsWorldM'])[1]-tri['pointsWorldM'][0],np.array(tri['pointsWorldM'])[2]-tri['pointsWorldM'][0]))/2;areaUv=abs(np.linalg.det(np.column_stack((uv[1]-uv[0],uv[2]-uv[0]))))/2;density=size*math.sqrt(areaUv/max(area3,1e-12));width=max(1,round((.0012+.0015*seed)*density*factor));dx.line([tuple(e)for e in ends],fill=230,width=width)
                    strokes+=1

masks={}
for label,image in [('Core',core),('Scuff',scuff),('Scratch',scratch)]:
    image=image.resize((size,size),Image.Resampling.LANCZOS);file=folder/('Texture_Type94PaintWear68'+label+'.png');image.save(file);masks[label]=str(file)
mc=np.array(Image.open(masks['Core']),dtype=np.float32)/255.;ms=np.array(Image.open(masks['Scuff']),dtype=np.float32)/255.;mx=np.array(Image.open(masks['Scratch']),dtype=np.float32)/255.;height=np.rint(np.clip(1-mc-.04*mx,0,1)*255).astype(np.uint8);heightFile=folder/'Texture_Type94PaintWear68Height.png';Image.fromarray(height).save(heightFile);masks['Height']=str(heightFile)
def Linear(x):return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
def Srgb(x):return np.where(x<=.0031308,x*12.92,1.055*np.maximum(x,0)**(1/2.4)-.055)
base=np.array(Image.open(folder/'Texture_Type94PaintBase.png').convert('RGB'));orm=np.array(Image.open(folder/'Texture_Type94PaintOrm.png').convert('RGB'));ao=orm[:,:,0].copy();pigment=Linear(base.astype(np.float32)/255.)*.62+np.array([.092,.102,.067],np.float32)*.38;scuffAlpha=.28*ms;pigment=pigment*(1-scuffAlpha[:,:,None])+Linear(np.array([112,119,96],np.float32)/255.)*scuffAlpha[:,:,None];pigment=pigment*(1-mc[:,:,None])+Linear(np.array([155,163,153],np.float32)/255.)*mc[:,:,None];base=np.rint(np.clip(Srgb(pigment),0,1)*255).astype(np.uint8);rough=orm[:,:,1].astype(np.float32)*(1-np.maximum(ms*.70,mx*.80))+.63*255*np.maximum(ms*.70,mx*.80);orm[:,:,1]=np.rint(rough*(1-mc)+.24*255*mc).astype(np.uint8);orm[:,:,2]=np.maximum(orm[:,:,2],np.rint(.98*255*mc).astype(np.uint8));assert np.array_equal(orm[:,:,0],ao);outputs={}
for label,array in [('PaintBase',base),('PaintOrm',orm)]:
    file=folder/('Texture_Type94'+label+'Wear68.png');Image.fromarray(array).save(file);outputs[label]=dict(file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
trackSize=2048;contact=Image.new('L',(trackSize,)*2);draw=ImageDraw.Draw(contact)
for face in surfaces['trackContactFaces']:draw.polygon([(u*(trackSize-1),(1-v)*(trackSize-1))for u,v in face['uv']],fill=round(face['value']*255))
mt=np.array(contact,dtype=np.float32)/255.;tb=np.array(Image.open(folder/'Texture_Type94TrackBase.png').convert('RGB'));to=np.array(Image.open(folder/'Texture_Type94TrackOrm.png').convert('RGB'));ta=to[:,:,0].copy();lin=Linear(tb.astype(np.float32)/255.);target=np.maximum(lin,np.array([.31,.33,.30]));tb=np.rint(np.clip(Srgb(lin*(1-mt[:,:,None]*.65)+target*mt[:,:,None]*.65),0,1)*255).astype(np.uint8);to[:,:,1]=np.rint(to[:,:,1]*(1-mt)+np.minimum(to[:,:,1],.18*255)*mt).astype(np.uint8);to[:,:,2]=np.maximum(to[:,:,2],np.rint(.97*255*mt).astype(np.uint8));assert np.array_equal(to[:,:,0],ta)
for label,array in [('TrackBase',tb),('TrackOrm',to)]:
    file=folder/('Texture_Type94'+label+'Wear68.png');Image.fromarray(array).save(file);outputs[label]=dict(file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
report=dict(outputs=outputs,masks=masks,physicalEdgeChipSegments=chips,physicalEdgeScuffSegments=halos,clippedScratchSegments=strokes,coreAtlasFraction=float(np.mean(mc>.5)),coreNonzeroFraction=float(np.mean(mc>0)),scuffAtlasFraction=float(np.mean(ms>0)),scratchAtlasFraction=float(np.mean(mx>0)),paintAoUnchanged=True,trackAoUnchanged=True,referenceSha256=surfaces['referenceSha256'],scope='Art-directed inferred wear on actual convex edges, coplanar metric handling marks and authored track contact lands. Paint loss height200micrometres, no geometric displacement or historical damage-position claim.')
(root/'Acceptance/Data_WearBakeV68.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
