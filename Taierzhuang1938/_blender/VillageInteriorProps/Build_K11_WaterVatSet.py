"""K11-C reference iteration. Reuses ClayWaterVat from the project pack.
Blender Z-up / front +Y; GLB Y-up / front -Z; metres, vat bottom centre.
Run from this task worktree using scripts/Script_BlenderMcp.mjs exec --file.
Source geometry: Jar by National Heritage Administration, CC BY 4.0:
https://sketchfab.com/3d-models/jar-41af1b457d1047c993e3c96622896b88
https://creativecommons.org/licenses/by/4.0/
The selected C concept and finish, dimensions, lid, gourd and repairs are
reconstructions, not direct historical evidence. The aged ceramic wrap and
retained lid/pith sources came from built-in imagegen; the retained gourd
exterior came from Lovart. All sources and the validated-state gourd UV bake
snapshot are preserved locally with SHA256.
"""
import bpy, bmesh, math, json, os, subprocess, hashlib
from pathlib import Path
from datetime import datetime
from uuid import uuid4
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

repo = Path(os.getcwd())
base = Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K11_WaterVatSet')
source = repo/'Taierzhuang1938/Model/Model_ChineseLifeSet.glb'
licensePath = repo/'Taierzhuang1938/_import/Source/Model_SketchfabStorageJarTall/license.txt'
ceramicSource = base/'TextureSource/Texture_K11_CeramicAgedImagegenWrap_C.png'
surfaceSourcePaths={
    'CeramicMacro':ceramicSource,
    'CeramicMicro':base/'TextureSource/Texture_K11_CeramicMicroSource_C.png',
    'Wood':base/'TextureSource/Texture_K11_WoodPlanedReference_C.png',
    'Gourd':base/'TextureSource/Texture_K11_GourdLovartSurface_C.png',
    'WoodEnd':base/'TextureSource/Texture_K11_WoodEndSource_C.png',
    'GourdInner':base/'TextureSource/Texture_K11_GourdInnerSource_C.png',
    'LidFace':base/'TextureSource/Texture_K11_LidCentralBoardSource_C.png'}
sourceHashes={'CeramicMacro':'3e0f22c062fff85b83a886416cac65a40fb4521553b75ee7d7b9da61dd1b4afb',
    'CeramicMicro':'a451a0f91d16427d4a426f488fb52c1e53108823d8dce5bef748fe72cca68ac4',
    'Wood':'22611ff582a5ccf05c45b9d6a8f834854ac811e89e67b312abaf78e46bc3b245',
    'Gourd':'e299c0ebe0a0808408cac0a82fbe975b4b0b4f5bc851f0b03ab12e53f82a9459',
    'WoodEnd':'374efdca3966f3a7242d7b847646dc5ad199872fadd6e1048d9fccdc11a6c22c',
    'GourdInner':'4ea1ee27efd1b6dd318c17814964e199d6088670a52bc91d9ca19673c7fae000',
    'LidFace':'27f8035326859ffca80ffb50cddbcb2568b93cffcede1f0f2c87bfac2d49b486'}
for kind,path in surfaceSourcePaths.items():
    if hashlib.sha256(path.read_bytes()).hexdigest()!=sourceHashes[kind]:raise RuntimeError('Surface source hash mismatch: '+kind)
reviewTriangleLimit=80000  # User requested denser near-view geometry on 2026-11-02; local review source, not integrated gameplay budget.
lidAtlasRegions={'Top':[4,4,2044,2044],'Batten0':[2052,4,2556,1020],'Batten1':[2564,4,3068,1020],'Frame':[2052,1028,4092,1532],'End':[3076,4,4092,1020]}
preservedGourdDirectory=base/'TextureSource/GourdPreserved_20261103'
out = base/('Build_C_ImagegenCeramicAge_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'_'+uuid4().hex[:6])
out.mkdir(parents=True, exist_ok=False)
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
for group in (bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.images):
    for block in list(group):
        if block.users == 0: group.remove(block)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('K11SourceWorld');scene.world.use_nodes=False;scene.world.color=(.16,.16,.16)

# Cropping/colour preparation and deterministic PBR derivation are part of the
# one builder. The full unmodified source remains in OneDrive/TextureSource.
textureBake = r'''
from PIL import Image
from pathlib import Path
import numpy as np,sys,json,hashlib,gc,shutil
macroPath,microPath,woodPath,gourdPath,endPath,innerPath,lidPath,out=map(Path,sys.argv[1:9]);atlasRegions=json.loads(sys.argv[9]);referencePath=Path(sys.argv[10])

def Blur(a,sigma):
    h,w=a.shape[:2];fy=np.fft.fftfreq(h)[:,None];fx=np.fft.fftfreq(w)[None,:]
    kernel=np.exp(-2*(np.pi*sigma)**2*(fx*fx+fy*fy))
    if a.ndim==2:return np.fft.irfft2(np.fft.rfft2(a)*kernel[:,:w//2+1],s=(h,w)).astype(np.float32)
    return np.stack([Blur(a[:,:,i],sigma) for i in range(a.shape[2])],axis=-1)

def Linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
def Srgb(a):
    a=np.clip(a,0,1);return np.where(a<=.0031308,a*12.92,1.055*a**(1/2.4)-.055)
def Photo(path,size):return np.asarray(Image.open(path).convert('RGB').resize(size,Image.Resampling.LANCZOS),np.float32)/255

def Seam(a,width=24):
    a=a.copy();h,w=a.shape[:2]
    for k in range(min(width,h//8,w//8)):
        f=(1-k/width)*.5;l=a[:,k].copy();r=a[:,-k-1].copy();a[:,k]=l*(1-f)+r*f;a[:,-k-1]=r*(1-f)+l*f
        t=a[k].copy();b=a[-k-1].copy();a[k]=t*(1-f)+b*f;a[-k-1]=b*(1-f)+t*f
    return a

def TilePhoto(path,size,repeats):
    w,h=size;tw,th=max(32,round(w/repeats[0])),max(32,round(h/repeats[1]));tile=Seam(Photo(path,(tw,th)),min(24,tw//12,th//12));return np.tile(tile,(int(np.ceil(h/th))+1,int(np.ceil(w/tw))+1,1))[:h,:w]

def UnitDetail(a,small,large):
    d=Blur(a,small)-Blur(a,large);return np.clip(d/max(float(d.std()),1e-5),-3,3)

def CompactFeature(lum,dark=True):
    # Hessian eigenvalues reject the one-dimensional valleys that produced
    # worm-like ridges. Compact pits/grit have curvature in both directions.
    a=Blur(lum if dark else 1-lum,.85)
    xx=np.roll(a,1,1)+np.roll(a,-1,1)-2*a;yy=np.roll(a,1,0)+np.roll(a,-1,0)-2*a
    xy=(np.roll(np.roll(a,-1,0),-1,1)-np.roll(np.roll(a,-1,0),1,1)-np.roll(np.roll(a,1,0),-1,1)+np.roll(np.roll(a,1,0),1,1))*.25
    root=np.sqrt(np.maximum((xx-yy)**2+4*xy*xy,0));low=(xx+yy-root)*.5;high=(xx+yy+root)*.5
    shape=np.clip((low/np.maximum(high,.0001)-.18)/.50,0,1)*np.clip(low/.008,0,1)
    contrast=np.clip((Blur(a,5)-a-.010)/.09,0,1)
    return np.clip(Blur(shape*contrast,.65),0,1)

def Cavity(height,physical):
    h,w=height.shape;ao=np.zeros_like(height)
    for pixels in (1,2,4,8):
        for axis,spacing in ((0,physical[1]/h),(1,physical[0]/w)):
            for sign in (-1,1):
                higher=np.roll(height,pixels*sign,axis=axis)-height
                ao+=np.clip((higher-.000035)/(pixels*spacing),0,2)/16
    return np.clip(np.exp(-2.2*ao),.32,1)

def Pack(name,base,height,rough,physical):
    if not all(np.isfinite(a).all() for a in (base,height,rough)):raise RuntimeError('Non-finite PBR source: '+name)
    height=height.astype(np.float32);h,w=height.shape
    # File rows increase downwards. Tangent UV V increases upwards.
    # OpenGL normal = (-dH/dU, -dH/dV, 1) = (-dx, +dy, 1).
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))/(2*physical[0]/w)
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))/(2*physical[1]/h)
    n=np.stack((-dx,dy,np.ones_like(height)),axis=-1);n/=np.linalg.norm(n,axis=-1,keepdims=True)
    ao=Cavity(height,physical);orm=np.stack((ao,np.clip(rough,.35,.98),np.zeros_like(height)),axis=-1)
    # A restrained sub-texel diffuse cavity term preserves natural fibre/pore
    # contrast; the full cavity map is also exported in standard glTF ORM R.
    base=np.clip(base*(.94+.06*ao[:,:,None]),0,1)
    for channel,data in [('Base',Srgb(base)),('Normal',n*.5+.5),('Orm',orm)]:
        Image.fromarray(np.uint8(np.clip(data,0,1)*255)).save(out/('Texture_K11_'+name+channel+'.png'))
    lo,hi=float(height.min()),float(height.max());encoded=np.uint16(np.clip((height-lo)/max(hi-lo,1e-9),0,1)*65535)
    Image.fromarray(encoded).save(out/('Texture_K11_'+name+'Height.png'))
    return {'outputPixels':[w,h],'physicalSpan_m':list(physical),'heightRange_m':[lo,hi],'normalConvention':'OpenGL_YPlus_ImageUp','normalRgStd':n[:,:,:2].std((0,1)).tolist(),'roughnessRange':[float(rough.min()),float(rough.max())],'cavityRange':[float(ao.min()),float(ao.max())]}

stats={}
# Entire circumference carries nonrepeating macro wear. A separate generated
# ceramic material source supplies physically scaled grain and pores.
size=(4096,1408);micro=TilePhoto(microPath,size,(8,3));macro=Seam(Photo(macroPath,size),32)
lum=micro.mean(2);grain=Blur(np.random.default_rng(11021938).normal(0,1,lum.shape).astype(np.float32),1.2);detail=np.clip(grain/max(float(grain.std()),1e-5),-3,3);pore=CompactFeature(lum);aggregate=CompactFeature(lum,False)
# Small grain lies below worn glaze. Sparse real depressions must not turn
# every albedo dark pixel into a millimetre-deep crater.
macroLum=macro.mean(2);warm=np.clip((macro[:,:,0]-macro[:,:,2]-.035)/.16,0,1)
wear=np.clip(.60*np.clip((macroLum-.31)/.28,0,1)+.40*warm,0,1)
height=detail*(.000012+.000055*wear)+aggregate**.65*(.00006+.00022*wear)-pore**.65*(.00015+.00055*wear)
microLinear=Linear(micro);microPigment=microLinear-Blur(microLinear,9)
macroLinear=Linear(macro);macroSoft=Blur(macroLinear,10);macroBroad=Blur(macroLinear,80)
macroBalanced=macroSoft+(macroLinear-macroSoft)*.55+(macroLinear.mean((0,1))[None,None,:]-macroBroad)*.48
base=np.maximum(Linear(macro),0)**.65*.90
finePigment=microLinear-Blur(microLinear,6);compactWeight=np.clip((pore+aggregate)*4,.12,1)
base=np.clip(base+finePigment*compactWeight[:,:,None]*.08,0,1)
rough=np.clip(.54+.34*wear+.06*pore+.02*aggregate,.50,.95)
z=np.linspace(1,0,size[1])[:,None];foot=np.clip((.18-z)*9,0,.94)*np.clip((Blur(lum,2)-.20)*4,.12,.95)
clay=Linear(np.array([.57,.51,.42],np.float32))[None,None,:]*np.clip(1+detail[:,:,None]*.10,.65,1.4)
# Full reference-age colour, including uneven foot abrasion, stays in the
# new panorama. Do not replace it with the former uniform clay-foot blend.
stats['Ceramic']=Pack('Ceramic',base,height,rough,(2.50,.86));del micro,microLinear,microPigment,macro,macroLinear,macroSoft,macroBroad,macroBalanced,lum,detail,pore,aggregate,height,base,grain,finePigment,compactWeight,macroLum,warm,wear;gc.collect()

size=(2048,2048);photo=Seam(Photo(lidPath,size),24);lum=photo.mean(2);fiber=UnitDetail(lum,1.1,5.0);fissure=np.clip((Blur(lum,14)-Blur(lum,1.4)-.040)/.19,0,1)
height=np.clip(fiber*.000020-np.clip(Blur(fissure,1.8),0,1)**.85*.00045+UnitDetail(lum,3,24)*.000035,-.00070,.00028)
photoLinear=Linear(photo);base=Blur(photoLinear,3)+(photoLinear-Blur(photoLinear,3))*.60
base=base*np.array([.69,.65,.61]);base=base*.78+base.mean(2)[:,:,None]*.22;rough=np.clip(.73+.09*fissure+.035*np.minimum(abs(fiber),2),.70,.91)
stats['Wood']=Pack('Wood',base,height,rough,(.336,.756))
for variant,tint in [('Dark',(.72,.75,.79)),('Replacement',(2.0,1.94,1.77))]:
    Image.fromarray(np.uint8(np.clip(Srgb(base*np.array(tint)),0,1)*255)).save(out/('Texture_K11_Wood'+variant+'Base.png'))
del photo,lum,fiber,fissure,height,base;gc.collect()

size=(1024,1024);photo=Seam(Photo(endPath,size),20);lum=photo.mean(2);detail=UnitDetail(lum,1.0,3.8);vessels=np.clip((Blur(lum,5)-Blur(lum,1.2)-.038)/.19,0,1)
height=np.clip(detail*.000018-np.clip(Blur(vessels,1.2),0,1)**.8*.00024,-.00035,.00012);base=Linear(photo)*np.array([.94,.94,.93]);base=base*.82+base.mean(2)[:,:,None]*.18;rough=np.clip(.83+.10*vessels+.015*abs(detail),.80,.96)
stats['WoodEnd']=Pack('WoodEnd',base,height,rough,(.126,.12));del photo,lum,detail,vessels,height,base;gc.collect()

size=(2048,2048);photo=Seam(Photo(gourdPath,size),24);lum=photo.mean(2);detail=UnitDetail(lum,.7,2.0);pores=CompactFeature(lum)
height=np.clip(detail*.000010-pores**.7*.00024,-.00030,.00006)
photoLinear=Linear(photo);base=Blur(photoLinear,2)+(photoLinear-Blur(photoLinear,2))*.65;base=np.maximum(base,0)**.91*np.array([.95,.93,.89]);base=base*.80+base.mean(2)[:,:,None]*.20;rough=np.clip(.67+.08*pores+.01*abs(detail),.63,.82)
stats['Gourd']=Pack('Gourd',base,height,rough,(.30,.30))
for channel in ('Base','Normal','Orm','Height'):shutil.copy2(out/('Texture_K11_Gourd'+channel+'.png'),out/('Texture_K11_GourdSource'+channel+'.png'))
del photo,photoLinear,lum,detail,pores,height,base;gc.collect()
# Scraped pith has its own material source; it is not the exterior skin
# darkened and reused on the inside of the ladle.
photo=TilePhoto(innerPath,size,(3,2));lum=photo.mean(2);fiber=UnitDetail(lum,1.0,5);pores=np.clip((Blur(lum,6)-Blur(lum,1.1)-.045)/.20,0,1)
height=np.clip(fiber*.000026-np.clip(Blur(pores,1.1),0,1)**.8*.00020,-.00035,.00018)
base=Linear(photo)*np.array([.59,.59,.57]);base=base*.80+base.mean(2)[:,:,None]*.20;rough=np.clip(.84+.08*pores+.02*abs(fiber),.82,.97)
stats['GourdInner']=Pack('GourdInner',base,height,rough,(.60,.40))
for channel in ('Base','Normal','Orm','Height'):shutil.copy2(out/('Texture_K11_GourdInner'+channel+'.png'),out/('Texture_K11_GourdInnerSource'+channel+'.png'))
del photo,lum,fiber,pores,height,base;gc.collect()

# One dedicated atlas separates reference-aligned board colour/wear, the two
# applied battens, the round frame and cut end grain. Contact darkening is a
# reconstructed grime/albedo term plus analytic contact AO, not baked lighting.
atlasSize=(4096,2048);atlasBase=np.full((2048,4096,3),.10,np.float32);atlasNormal=np.zeros_like(atlasBase);atlasNormal[:]=(.5,.5,1);atlasOrm=np.zeros_like(atlasBase);atlasOrm[:]=(1,.9,0)
lidPhoto=Seam(Photo(lidPath,(1254,1254)),24)
referencePhoto=np.asarray(Image.open(referencePath).convert('RGB').crop((1020,7,1534,525)),np.float32)/255
referenceLinear=Linear(referencePhoto);referenceMean=Blur(referenceLinear,3.4)
referenceDetail=np.clip((Blur(referenceLinear,.6)-referenceMean)/np.maximum(referenceMean,.025),-.6,.6)
def SampleReference(px,py):
    h,w=referenceDetail.shape[:2];px=np.clip(px,0,w-1.001);py=np.clip(py,0,h-1.001);x=px.astype(int);y=py.astype(int);fx=(px-x)[:,:,None];fy=(py-y)[:,:,None]
    return (referenceDetail[y,x]*(1-fx)+referenceDetail[y,x+1]*fx)*(1-fy)+(referenceDetail[y+1,x]*(1-fx)+referenceDetail[y+1,x+1]*fx)*fy
def SampleLid(u,v):
    h,w=lidPhoto.shape[:2];u=np.mod(u,1)*(w-1);v=np.mod(v,1)*(h-1);x=u.astype(int);y=v.astype(int);fx=(u-x)[:,:,None];fy=(v-y)[:,:,None]
    return (lidPhoto[y,x]*(1-fx)+lidPhoto[y,np.minimum(x+1,w-1)]*fx)*(1-fy)+(lidPhoto[np.minimum(y+1,h-1),x]*(1-fx)+lidPhoto[np.minimum(y+1,h-1),np.minimum(x+1,w-1)]*fx)*fy
def LidRelief(photo,physical,strength=1):
    lum=photo.mean(2);fiber=UnitDetail(lum,1.1,5);checks=np.clip((Blur(lum,9)-Blur(lum,1.1)-.045)/.20,0,1)
    height=(fiber*.000016-np.clip(Blur(checks,1.1),0,1)**.85*.00024)*strength
    return height,fiber,checks
lidStats={}
def PutLid(name,base,height,rough,physical,contact=None):
    if not all(np.isfinite(a).all() for a in (base,height,rough)):raise RuntimeError('Invalid lid atlas '+name)
    h,w=height.shape;dx=(np.roll(height,-1,1)-np.roll(height,1,1))/(2*physical[0]/w);dy=(np.roll(height,-1,0)-np.roll(height,1,0))/(2*physical[1]/h)
    normal=np.stack((-dx,dy,np.ones_like(height)),2);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    ao=Cavity(height,physical)
    if contact is not None:ao*=1-np.clip(contact,0,.65)
    base=Srgb(np.clip(base*(.96+.04*ao[:,:,None]),0,1));orm=np.stack((ao,np.clip(rough,.45,.97),np.zeros_like(height)),2)
    x0,y0,x1,y1=atlasRegions[name]
    for target,data in ((atlasBase,base),(atlasNormal,normal*.5+.5),(atlasOrm,orm)):
        target[y0-4:y1+4,x0-4:x1+4]=np.pad(data,((4,4),(4,4),(0,0)),mode='edge')
    lidStats[name]={'pixels':[w,h],'physicalSpan_m':list(physical),'heightRange_m':[float(height.min()),float(height.max())],'roughnessRange':[float(rough.min()),float(rough.max())],'aoRange':[float(ao.min()),float(ao.max())]}

x0,y0,x1,y1=atlasRegions['Top'];h=y1-y0;w=x1-x0
xx,yy=np.meshgrid((np.arange(w)/(w-1)-.5)*.72,(.5-np.arange(h)/(h-1))*.72)
bounds=np.array([-.358,-.235,-.114,.004,.116,.236,.358])*.330/.358;indices=np.clip(np.searchsorted(bounds,xx)-1,0,5)
left=bounds[indices];right=bounds[indices+1]
photo=SampleLid(xx/.32+.49+indices*.193,.49-yy/.72-indices*.127)
height,fiber,checks=LidRelief(photo,(.756,.756));base=Linear(photo)
# Camera faces local -Z: positive local X is on the left in the C comparison.
# The pale replacement is consequently board 1, not board 4.
tints=np.array([[.64,.61,.56],[.74,.70,.64],[.69,.68,.64],[.70,.68,.63],[.61,.60,.57],[.68,.64,.58]])
base*=tints[indices];base=base*.68+base.mean(2)[:,:,None]*.32;base*=np.array([.94,.98,1.045])
# High-pass reference colour transfers the millimetre/centimetre wear scale.
# Narrow clean patches avoid the reference's battens, joints and object edge;
# broad lighting gradients are removed before sampling. Fine wood grain still
# comes from the dedicated higher-resolution generated material source.
referenceRects=np.array([[420,145,442,370],[322,85,362,425],[258,75,298,435],[226,75,256,435],[165,100,202,415],[90,155,119,365]])
rect=referenceRects[indices];ru=np.mod(np.clip((right-xx)/(right-left),0,1)*(right-left)/(.00165*(rect[:,:,2]-rect[:,:,0])),1);rv=np.mod(np.clip(yy/.72+.5,0,1)*.72/(.00165*(rect[:,:,3]-rect[:,:,1])),1)
refDetail=SampleReference(rect[:,:,0]+ru*(rect[:,:,2]-rect[:,:,0]),rect[:,:,1]+rv*(rect[:,:,3]-rect[:,:,1]))
base*=np.clip(1+refDetail*.32,.80,1.20);refLum=refDetail.mean(2)
height+=refLum*.00012
edgeDistance=np.maximum(np.minimum(xx-left,right-xx),0);joint=np.exp(-edgeDistance/.0025)
rim=np.exp(-np.maximum(.330-np.hypot(xx,yy),0)/.0045);batten=np.zeros_like(xx)
for center in (-.18,.18):
    distance=np.hypot(np.maximum(abs(xx-center)-.030,0),np.maximum(abs(yy)-.235,0));batten=np.maximum(batten,np.exp(-distance/.0035))
dirt=np.clip(.48*joint+.30*rim+.42*batten,0,.78)*(np.clip(.9+fiber*.04,.72,1.1))
patina=np.clip((Blur(photo.mean(2),7)-Blur(photo.mean(2),35))/.065+.25,0,1)
base*=np.exp(-1.25*dirt[:,:,None]);film=Linear(np.array([.31,.295,.265]))[None,None,:]
base=base*(1-patina[:,:,None]*.17)+film*patina[:,:,None]*.17
rough=np.clip(.79+.07*checks+.15*dirt-.15*patina,.60,.95)
# Sparse reference-like worn pinholes and one small old knot, with shallow
# reconstructed normal relief. These marks are not historical evidence.
for cx,cy,rx,ry in ((.060,.015,.004,.0055),(-.040,.205,.0012,.0016),(.190,-.155,.0011,.0015),(-.245,.055,.001,.0013)):
    q=((xx-cx)/rx)**2+((yy-cy)/ry)**2;mark=np.exp(-q*2.2)
    base*=1-.83*mark[:,:,None];height-=mark*.0010;rough=np.minimum(.94,rough+mark*.10)
PutLid('Top',base,height,rough,(.756,.756),np.clip(.32*joint+.21*rim+.42*batten,0,.65))
del xx,yy,photo,height,fiber,checks,base,rough,indices,left,right,edgeDistance,joint,rim,batten,dirt,patina,rect,ru,rv,refDetail,refLum;gc.collect()

for k in (0,1):
    x0,y0,x1,y1=atlasRegions['Batten'+str(k)];h=y1-y0;w=x1-x0
    x,y=np.meshgrid((np.arange(w)/(w-1)-.5)*.060,(.5-np.arange(h)/(h-1))*.470)
    photo=SampleLid(x/.32+.12+k*.37,.52-y/.72+k*.23);height,fiber,checks=LidRelief(photo,(.063,.4935),.8)
    dist=np.minimum(.030-abs(x),.235-abs(y));wear=np.exp(-np.maximum(dist,0)/.003)
    base=Linear(photo)*np.array([.70,.69,.65]);base=base*.72+base.mean(2)[:,:,None]*.28
    base=base*(1-wear[:,:,None]*.30)+Linear(np.array([.42,.38,.31]))[None,None,:]*wear[:,:,None]*.30
    ru=(x/.060+.5);rv=y/.470+.5
    refDetail=SampleReference((131 if k==1 else 382)+ru*17,145+rv*236)
    base*=np.clip(1+refDetail*.28,.82,1.18);height+=refDetail.mean(2)*.00010
    rough=np.clip(.73+.07*checks-.10*wear,.57,.90);PutLid('Batten'+str(k),base,height,rough,(.063,.4935))

x0,y0,x1,y1=atlasRegions['Frame'];h=y1-y0;w=x1-x0
u,v=np.meshgrid(np.arange(w)/(w-1),1-np.arange(h)/(h-1));photo=SampleLid(v*.275+.26,-u*3.002+.18)
height,fiber,checks=LidRelief(photo,(2.269,.09),.9);base=Linear(photo)*np.array([.43,.45,.46]);base=base*.68+base.mean(2)[:,:,None]*.32
wear=np.clip((np.sin(u*np.pi*18)+np.cos(u*np.pi*31))*2-.8,0,1)
wear*=np.exp(-((v-.25)/.12)**2);wear*=np.clip(.85+fiber*.10,.5,1.2)
base+=Linear(np.array([.22,.21,.18]))[None,None,:]*wear[:,:,None]*.70
chip=np.clip((Blur(photo.mean(2),2)-Blur(photo.mean(2),6)-.012)/.08,0,1)*wear;height-=chip*.00020
angle=u*np.pi*2;crossOffset=np.cos(v*np.pi*2)*4
refDetail=SampleReference(256-(208+crossOffset)*np.cos(angle),258+(214+crossOffset)*np.sin(angle))
base*=np.clip(1+refDetail*.24,.84,1.16);height+=refDetail.mean(2)*.00012
contact=np.clip(np.exp(-((v-.5)/.07)**2)*.30+np.exp(-(v/.065)**2)*.16,0,.45)
base*=1-contact[:,:,None]*.45;rough=np.clip(.76+.06*checks-.13*wear,.56,.91);PutLid('Frame',base,height,rough,(2.269,.09),contact)
x0,y0,x1,y1=atlasRegions['End'];photo=Seam(Photo(endPath,(x1-x0,y1-y0)),20);lum=photo.mean(2);detail=UnitDetail(lum,1,4)
height=detail*.000012-np.clip((Blur(lum,5)-Blur(lum,1)-.04)/.2,0,1)*.00016;rough=np.clip(.83+.02*abs(detail),.80,.96)
PutLid('End',Linear(photo)*np.array([.75,.71,.64]),height,rough,(.126,.12))
for channel,data in (('Base',atlasBase),('Normal',atlasNormal),('Orm',atlasOrm)):
    Image.fromarray(np.uint8(np.clip(data,0,1)*255)).save(out/('Texture_K11_LidAtlas'+channel+'.png'))
stats['LidAtlas']={'outputPixels':list(atlasSize),'heightRange_m':[min(v['heightRange_m'][0] for v in lidStats.values()),max(v['heightRange_m'][1] for v in lidStats.values())],'normalRgStd':(atlasNormal[:,:,:2]*2-1).std((0,1)).tolist(),'roughnessRange':[float(atlasOrm[:,:,1].min()),float(atlasOrm[:,:,1].max())],'cavityRange':[float(atlasOrm[:,:,0].min()),float(atlasOrm[:,:,0].max())],'regions':atlasRegions,'regionRecipes':lidStats}
recipe={'revision':'LidMaterialAtlas20261102','normalConventionCalibration':'OpenGL normal Y is +image-row height derivative; checked against an actual geometric pit','method':'Lid-only reference correction: separate board/batten/frame/end-grain atlas; correct pale-board side; planed central-board source; high-pass wear detail projected from clean C reference patches with large lighting gradients removed; reconstructed grime and analytic contact AO. Other components unchanged. Heights/AO are artistic reconstruction, not scans or path-traced AO.','referenceDetailProjection':{'crop':[1020,7,1534,525],'boardPatches':referenceRects.tolist(),'filterPixels':[.6,3.4],'largeLightingGradientRemoved':True},'sourceFiles':{str(p):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'nativePixels':list(Image.open(p).size)} for p in (macroPath,microPath,woodPath,gourdPath,endPath,innerPath,lidPath,referencePath)},'maps':stats}
(out/'Data_SurfaceDetailRecipe.json').write_text(json.dumps(recipe,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
recipe['revision']='LovartSurface20261103';recipe['method']='Lovart credit-API exterior sources for ceramic/gourd. Ceramic: low-frequency nonrepeating colour plus compact pore/grit masks, isotropic microrelief, physical heights and roughness; no elongated-ridge height extraction. Gourd: unique UV atlas and object-space blend baked to standard PBR. Lid recipe and colour correction retained unchanged. Height/roughness reconstruction is artistic, not a measured scan.'
(out/'Data_SurfaceDetailRecipe.json').write_text(json.dumps(recipe,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
preservedGourd=referencePath.parent.parent/'TextureSource/GourdPreserved_20261103'
preservedRecord=json.loads((preservedGourd/'Data_PreservedSurface.json').read_text(encoding='utf8'))
for name,expected in preservedRecord['images'].items():
    source=preservedGourd/name
    if hashlib.sha256(source.read_bytes()).hexdigest()!=expected:raise RuntimeError('Preserved gourd map changed: '+name)
    shutil.copy2(source,out/name)
recipe['revision']='ImagegenCeramicAge20261103';recipe['method']='Ceramic-only imagegen reference-C age restoration. The new nonrepeating wrap retains its complete old glaze, buff/gray abrasion, exposed clay, mineral patina and worn-foot colour layers with no broad blur or grayscale flattening. Roughness/relief differ between retained glaze and worn exposed clay. Gourd maps/UV are preserved from the previous validated surface; lid unchanged.'
(out/'Data_SurfaceDetailRecipe.json').write_text(json.dumps(recipe,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
print('SURFACE_DETAIL_MAPS_READY',json.dumps({k:v['outputPixels'] for k,v in stats.items()}))

'''
subprocess.run(['python','-c',textureBake,*(str(surfaceSourcePaths[k]) for k in ('CeramicMacro','CeramicMicro','Wood','Gourd','WoodEnd','GourdInner','LidFace')),str(out),json.dumps(lidAtlasRegions),str(base/'Concept/K11_C.png')],check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))

def Material(name,kind,tint=(1,1,1),normalStrength=1):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    def Tex(channel,data=False):
        variant=('Dark' if 'DarkBoard' in name else ('Replacement' if 'ReplacementBoard' in name else '')) if kind=='Wood' and channel=='Base' else ('Inner' if kind=='Gourd' and 'GourdInner' in name else '')
        node=nodes.new('ShaderNodeTexImage');node.image=bpy.data.images.load(str(out/('Texture_K11_'+kind+variant+channel+'.png')),check_existing=True)
        node.image.colorspace_settings.name='Non-Color' if data else 'sRGB';node.image.pack();return node
    base=Tex('Base');normalTex=Tex('Normal',True);orm=Tex('Orm',True)
    links.new(base.outputs['Color'],bsdf.inputs['Base Color'])
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=normalStrength
    links.new(normalTex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    channels=nodes.new('ShaderNodeSeparateColor');links.new(orm.outputs['Color'],channels.inputs['Color']);links.new(channels.outputs['Green'],bsdf.inputs['Roughness']);links.new(channels.outputs['Blue'],bsdf.inputs['Metallic'])
    group=bpy.data.node_groups.get('glTF Material Output_K11_Surface')
    if group is None:
        group=bpy.data.node_groups.new('glTF Material Output_K11_Surface','ShaderNodeTree')
        group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
        group.nodes.new('NodeGroupInput');group.nodes.new('NodeGroupOutput')
    output=nodes.new('ShaderNodeGroup');output.node_tree=group
    links.new(channels.outputs['Red'],output.inputs['Occlusion'])
    return mat


def Plain(name,color,rough,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes['Principled BSDF'];b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal;return m

ceramic=Material('HouseholdCeramic_K11_CoarseAged','Ceramic',normalStrength=1.0)
wood=Material('VillageTimber_K11_Weathered','Wood',normalStrength=1.0)
woodDark=Material('VillageTimber_K11_DarkBoard','Wood',(.71,.69,.66),1.0)
woodReplacement=Material('VillageTimber_K11_ReplacementBoard','Wood',(1.20,1.16,1.08),1.0)
woodEnd=Material('VillageTimber_K11_EndGrain','WoodEnd',normalStrength=1.0)
lidSurface=Material('LidTimber_K11_ReferenceAtlas','LidAtlas',normalStrength=1.0)

gourd=Material('GourdShell_K11_Natural','Gourd',normalStrength=1.0)
gourdInner=Material('GourdInner_K11_Worn','Gourd',(.65,.64,.61),1.0)
clay=Plain('Ceramic_K11_ExposedClay',(.19,.12,.075),.92)
crack=Plain('Ceramic_K11_Crack',(.025,.017,.012),.96)
iron=Plain('Iron_K11_OldStaples',(.18,.115,.062),.72,.30)
water=Plain('Water_K11_Still',(.065,.077,.069),.065)
b=water.node_tree.nodes['Principled BSDF'];b.inputs['IOR'].default_value=1.333;b.inputs['Transmission Weight'].default_value=.25

credit=('This work is based on Jar (https://sketchfab.com/3d-models/jar-41af1b457d1047c993e3c96622896b88) by National Heritage Administration (https://sketchfab.com/NHA_Asset), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).')

def Root(name,parent=None):
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.parent=parent;return o

def Mesh(name,vertices,faces,material,parent):
    m=bpy.data.meshes.new(name+'_Mesh');m.from_pydata(vertices,[],faces);m.update();o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);o.parent=parent;m.materials.append(material);return o

def Children(root):
    return [root]+[x for child in root.children for x in Children(child)]

def Tube(name,points,radius,material,parent,resolution=1):
    c=bpy.data.curves.new(name+'_Curve','CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=resolution;c.use_fill_caps=True
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.parent=parent;c.materials.append(material);return o

def SmoothProfile(xs,ys,query):
    xs=np.asarray(xs,float);ys=np.asarray(ys,float);q=np.asarray(query,float)
    widths=np.diff(xs);slopes=np.diff(ys)/widths;tangents=np.zeros(len(xs),float)
    tangents[0]=slopes[0];tangents[-1]=slopes[-1]
    for i in range(1,len(xs)-1):
        if slopes[i-1]*slopes[i]>0:
            a=2*widths[i]+widths[i-1];b=widths[i]+2*widths[i-1]
            tangents[i]=(a+b)/(a/slopes[i-1]+b/slopes[i])
    indices=np.clip(np.searchsorted(xs,q,side='right')-1,0,len(xs)-2)
    h=widths[indices];t=np.clip((q-xs[indices])/h,0,1)
    return (2*t**3-3*t**2+1)*ys[indices]+(t**3-2*t**2+t)*h*tangents[indices]+(-2*t**3+3*t**2)*ys[indices+1]+(t**3-t**2)*h*tangents[indices+1]

def Vat(parent):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(source));imported=set(bpy.data.objects)-before
    o=next(x for x in imported if x.name=='ClayWaterVat' and x.type=='MESH')
    for x in imported:
        if x!=o:bpy.data.objects.remove(x,do_unlink=True)
    o.name='ClayWaterVat_Reused';world=o.matrix_world.copy()
    for v in o.data.vertices:v.co=world@v.co
    o.matrix_world=Matrix.Identity(4);o.parent=parent
    a=np.asarray([v.co[:] for v in o.data.vertices]);lo=a.min(0);hi=a.max(0)
    radial=.8/max(hi[0]-lo[0],hi[1]-lo[1]);vertical=.9/(hi[2]-lo[2])
    for v in o.data.vertices:
        v.co.x=(v.co.x-(hi[0]+lo[0])/2)*radial;v.co.y=(v.co.y-(hi[1]+lo[1])/2)*radial;v.co.z=(v.co.z-lo[2])*vertical
        # Preserve source clay shape/inner wall, widen the neck to match C.
        s=float(np.interp(v.co.z,[0,.12,.35,.55,.70,.80,.86,.90],[1.045,1.025,1,1,1.035,1.13,1.22,1.25]))
        v.co.x*=s;v.co.y*=s
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
    smooth=[v for v in bm.verts if .025<v.co.z]
    for i in range(2):bmesh.ops.smooth_vert(bm,verts=smooth,factor=.20,use_axis_x=True,use_axis_y=True,use_axis_z=True)
    bm.normal_update();bm.to_mesh(o.data);bm.free();o.data.update()
    a=np.asarray([v.co[:] for v in o.data.vertices]);lo=a.min(0);hi=a.max(0)
    for v in o.data.vertices:
        v.co.x*=.8/(hi[0]-lo[0]);v.co.y*=.8/(hi[1]-lo[1]);v.co.z=(v.co.z-lo[2])*.9/(hi[2]-lo[2])
    o.data.materials.clear();o.data.materials.append(ceramic);o.data.materials.append(clay)
    chipCount=0
    for v in o.data.vertices:
        p=v.co;r=math.hypot(p.x,p.y);theta=math.atan2(p.y,p.x)
        d=abs((theta-1.98+math.pi)%math.tau-math.pi)
        w=max(0,1-d/.075)*max(0,min(1,(p.z-.876)/.022))*max(0,min(1,(r-.326)/.023))
        if w>0:
            p.z-=.007*w;p.x*=1-.004*w;p.y*=1-.004*w;chipCount+=1
    for p in o.data.polygons:
        if all(o.data.vertices[i].co.z>.874 for i in p.vertices):
            c=p.center;d=abs((math.atan2(c.y,c.x)-1.98+math.pi)%math.tau-math.pi)
            if d<.08:p.material_index=1
        p.use_smooth=True
    o.data.update()
    # Morph the retained scan shell to the selected C's fuller upper belly.
    # A common radial offset preserves the source wall thickness at each level.
    points=[v.co.copy() for v in o.data.vertices]
    levels=np.linspace(0,.9,73);outer=[]
    edges=[(points[e.vertices[0]],points[e.vertices[1]]) for e in o.data.edges]
    for level in levels:
        radii=[]
        for a,b in edges:
            if abs(a.z-level)<1e-5:radii.append(math.hypot(a.x,a.y))
            if (a.z-level)*(b.z-level)<0:
                t=(level-a.z)/(b.z-a.z);q=a+(b-a)*t;radii.append(math.hypot(q.x,q.y))
        if not radii:
            near=sorted(points,key=lambda p:abs(p.z-level))[:20];radii=[math.hypot(p.x,p.y) for p in near]
        outer.append(max(radii))
    targetZ=[0,.015,.030,.055,.15,.30,.45,.58,.70,.80,.86,.90]
    targetR=[.266,.276,.270,.282,.310,.359,.392,.400,.394,.374,.350,.349]
    for v in o.data.vertices:
        r=math.hypot(v.co.x,v.co.y)
        if r>.15:
            newRadius=r+float(SmoothProfile(targetZ,targetR,v.co.z))-float(np.interp(v.co.z,levels,outer))
            v.co.x*=newRadius/r;v.co.y*=newRadius/r
    a=np.asarray([v.co[:] for v in o.data.vertices]);lo=a.min(0);hi=a.max(0)
    for v in o.data.vertices:
        v.co.x=(v.co.x-(lo[0]+hi[0])/2)*.8/(hi[0]-lo[0]);v.co.y=(v.co.y-(lo[1]+hi[1])/2)*.8/(hi[1]-lo[1])
    o.data.update()
    o['reference_profile']='C fuller upper belly; source shell/inner wall retained by common radial displacement'
    subdivision=o.modifiers.new('SmoothNearViewCeramicShell','SUBSURF');subdivision.subdivision_type='CATMULL_CLARK';subdivision.levels=1
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=subdivision.name)
    dense=np.asarray([v.co[:] for v in o.data.vertices]);denseLo=dense.min(0);denseHi=dense.max(0)
    for v in o.data.vertices:
        v.co.x=(v.co.x-(denseLo[0]+denseHi[0])/2)*.8/(denseHi[0]-denseLo[0]);v.co.y=(v.co.y-(denseLo[1]+denseHi[1])/2)*.8/(denseHi[1]-denseLo[1]);v.co.z=(v.co.z-denseLo[2])*.9/(denseHi[2]-denseLo[2])
    o.data.update()
    o['source_credit']=credit;o['source_modifications']='Retained source shell/inner wall, smooth Hermite C profile, Catmull-Clark near-view subdivision, rim nick and PBR surface.'
    o['rim_chip_modified_vertices']=chipCount
    return o

def RolledRim(parent):
    # A rolled ceramic lip matching the selected C reference. The scan-derived
    # body is retained; this local refinement covers its thin faceted edge.
    rings=160;cross=24;major=.345;vertices=[]
    for i in range(rings):
        a=math.tau*i/rings
        for j in range(cross):
            b=math.tau*j/cross;r=major+.023*math.cos(b)
            nick=max(0,1-abs((a-1.98+math.pi)%math.tau-math.pi)/.075)*max(0,(math.sin(b)+.15)/1.15)
            vertices.append((r*math.cos(a),r*math.sin(a),.877+.023*math.sin(b)-.006*nick))
    faces=[(i*cross+j,((i+1)%rings)*cross+j,((i+1)%rings)*cross+(j+1)%cross,i*cross+(j+1)%cross) for i in range(rings) for j in range(cross)]
    o=Mesh('ClayWaterVat_RolledRim',vertices,faces,ceramic,parent);o.data.materials.append(clay)
    for p in o.data.polygons:
        p.use_smooth=True
        if abs((math.atan2(p.center.y,p.center.x)-1.98+math.pi)%math.tau-math.pi)<.065 and p.center.z>.888:p.material_index=1
    return o


def Repair(parent,vat):
    bpy.context.view_layer.update();tree=BVHTree.FromObject(vat,bpy.context.evaluated_depsgraph_get())
    def Surface(x,z,lift=.001):
        hit,n,idx,d=tree.ray_cast(Vector((x,1.1,z)),Vector((0,-1,0)),2.2)
        if hit is None:raise RuntimeError('Repair ray missed')
        return (x,hit.y+lift,z)
    path=[]
    for i in range(20):
        z=.882-i*.010;x=-.155+.003*math.sin(i*1.31)+max(0,i-11)*.0006;path.append(Surface(x,z))
    Tube('RepairHairline_Main',path,.00065,crack,parent)
    Tube('RepairHairline_Branch',[Surface(-.15,.744),Surface(-.119,.728),Surface(-.115,.712)],.00055,crack,parent)
    for i,z in enumerate((.785,.832)):
        pts=[Surface(-.175,z-.006,.0003),Surface(-.175,z,.003),Surface(-.136,z,.003),Surface(-.136,z-.006,.0003)]
        Tube('RepairStaple_'+str(i),pts,.0022,iron,parent,3)

def Lid(parent,opened):
    root=Root('Lid_Opened' if opened else 'Lid_Closed',parent);r=.330;thick=.024
    bounds=[x*r/.358 for x in [-.358,-.235,-.114,.004,.116,.236,.358]]
    for k in range(6):
        left=bounds[k]+(.0013 if k else 0);right=bounds[k+1]-(.0015 if k<5 else 0)
        a=math.acos(max(-1,min(1,right/r)));b=math.acos(max(-1,min(1,left/r)))
        arcSteps=16
        top=[(r*math.cos(a+(b-a)*i/arcSteps),r*math.sin(a+(b-a)*i/arcSteps)) for i in range(arcSteps+1)]
        lh,rh=top[-1][1],top[0][1]
        if k in (1,4):
            splitIndex=arcSteps//2;x,y=top[splitIndex]
            # Open V end split, built into the board contour and its thickness.
            # It remains a narrow local crack rather than a shattered lid.
            top=top[:splitIndex]+[(x+.0035,y),(x+.0003,y-(.055 if k==1 else .070)),(x-.0035,y)]+top[splitIndex+1:]
        ls=[(left+.0012*math.sin(i*1.83+k),lh*(1-2*i/5)) for i in range(1,5)] if lh>.00001 else []
        rs=[(right+.0011*math.sin(i*1.63+k),rh*(-1+2*i/5)) for i in range(1,5)] if rh>.00001 else []
        points=top+ls+[(x,-y) for x,y in reversed(top)]+rs
        ring=[]
        for x,y in points:
            # Slightly abraded hand-cut perimeter, intact functional lid.
            rr=math.hypot(x,y);shrink=.0035*(.5+.5*math.sin(31*x+27*y+k)) if rr>r-.004 else 0
            if rr:x*=1-shrink/rr;y*=1-shrink/rr
            if not ring or math.dist((x,y),ring[-1])>1e-7:ring.append((x,y))
        if math.dist(ring[0],ring[-1])<1e-7:ring.pop()
        n=len(ring);v=[]
        for topSide in (0,1):
            for x,y in ring:
                v.append((x,y,thick*topSide))
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        o=Mesh('LidPlank_'+str(k),v,faces,lidSurface,root);o.data.materials.append(wood)
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True)
        for vertex in bm.verts:
            x,y,z=vertex.co;warp=.0018*math.sin(10*y+k)+.0011*math.sin(18*x+8*y)
            edgeWear=max(0,math.sin(71*x+52*y+k)*math.cos(29*x-57*y))**2*.0045 if math.hypot(x,y)>r-.006 else 0
            vertex.co.z=z+warp-edgeWear*(z/thick)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
        for face in o.data.polygons:
            face.material_index=0 if face.normal.z>.5 or abs(face.normal.y)>.65 else 1
            face.use_smooth=True
        bevel=o.modifiers.new('SoftWornBoardEdges','BEVEL');bevel.width=.0018;bevel.segments=4;bevel.harden_normals=True;bevel.material=0
        weighted=o.modifiers.new('BoardBroadFaceNormals','WEIGHTED_NORMAL');weighted.keep_sharp=True;weighted.weight=35
    frameRings=160;frameCross=16;frameMajor=.344;frameRadius=.014;vertices=[]
    for i in range(frameRings):
        angle=math.tau*i/frameRings
        for j in range(frameCross):
            crossAngle=math.tau*j/frameCross;radius=frameMajor+frameRadius*math.cos(crossAngle)
            wear=.00055*math.sin(7*angle+.3)*math.sin(3*crossAngle+angle)
            vertices.append((radius*math.cos(angle),radius*math.sin(angle),.021+frameRadius*math.sin(crossAngle)+wear))
    faces=[(i*frameCross+j,((i+1)%frameRings)*frameCross+j,((i+1)%frameRings)*frameCross+(j+1)%frameCross,i*frameCross+(j+1)%frameCross) for i in range(frameRings) for j in range(frameCross)]
    frame=Mesh('LidFrame_RoundEdge',vertices,faces,lidSurface,root)
    for face in frame.data.polygons:face.use_smooth=True
    frame['reference_detail']='Raised circular timber edge visible in selected C lid view; construction is artistic reconstruction.'
    for k,x in enumerate((-.18,.18)):
        vertices=[]
        for z in (thick-.0006,thick+.026):
            for xx,yy in [(-.030,-.234),(.030,-.232),(.030,.234),(-.030,.236)]:vertices.append((x+xx,yy,z+.001*math.sin(17*yy+k)))
        o=Mesh('LidBatten_'+str(k),vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],lidSurface,root)
        for f in o.data.polygons:f.use_smooth=True
        m=o.modifiers.new('BattenEdgeWear','BEVEL');m.width=.0035;m.segments=4;m.harden_normals=True
        weighted=o.modifiers.new('BattenBroadFaceNormals','WEIGHTED_NORMAL');weighted.keep_sharp=True
        # Visible dowel plugs are wood, with modest end grain contrast.
        for y in (-.18,.18):
            bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.004,depth=.0015,location=(x,y,thick+.026))
            peg=bpy.context.object;peg.name='WoodPeg';peg.parent=root;peg.data.materials.append(lidSurface)
            m=peg.modifiers.new('RoundedDowelRim','BEVEL');m.width=.00025;m.segments=2
    # A few narrow end splits, rather than a mathematical uniform disk.
    for k,x in enumerate((-.108,.121,.239)):
        end=math.sqrt(r*r-x*x)
        Tube('WoodEndSplit_'+str(k),[(x,end-.004,thick+.001),(x+.001,end-.038,thick+.0005),(x-.001,end-.071,thick)],.00055,crack,root,0)
    if opened:
        root.rotation_euler.y=math.radians(-76);root.location=(-.46,0,.35)
    else:root.location.z=.9
    return root

def Gourd(parent):
    # One continuous natural gourd shell: deep rounded bulb blends into the
    # narrow curved neck. The bulb is cut above its equator; it is not a bowl
    # with a separately attached cylindrical wooden handle.
    xs=[-.100,-.096,-.087,-.074,-.056,-.034,-.010,.014,.038,.058,.074,.088,.104,.124,.149,.177,.207,.237,.258]
    rs=[.004,.030,.050,.068,.081,.088,.091,.089,.082,.071,.054,.034,.023,.017,.015,.0155,.017,.018,.010]
    controlXs=xs;controlRs=rs;xs=np.linspace(xs[0],xs[-1],64).tolist();rs=SmoothProfile(controlXs,controlRs,xs).tolist()
    centers=[.0+.005*max(0,(x-.07)/.19)+.004*math.sin(max(0,x)*12) for x in xs]
    seg=64;verts=[];cut=.048;thickness=.004
    for inner in (False,True):
        for j,(x,r,center) in enumerate(zip(xs,rs,centers)):
            radius=max(.001,r-(thickness if inner else 0))
            theta=math.acos(max(-1,min(1,(cut-center)/radius))) if radius>cut-center else 0
            for i in range(seg+1):
                ang=theta+(math.tau-2*theta)*i/seg
                # Slight asymmetric shell and a hand-cut uneven mouth edge.
                rr=radius*(1+.018*math.sin(3*ang+7*x)+.009*math.sin(5*ang-11*x))
                xx=x+(thickness if j==0 and inner else (-thickness if j==len(xs)-1 and inner else 0))
                y=rr*math.sin(ang);z=center+rr*math.cos(ang)
                if theta>0 and i in (0,seg):z=cut+.0008*math.sin((x+.1)/.358*18*2.31)
                verts.append((xx,y,z))
    stride=len(xs)*(seg+1);faces=[];mats=[]
    for shell in (0,1):
        for j in range(len(xs)-1):
            for i in range(seg):
                a=shell*stride+j*(seg+1)+i;b=a+1;c=b+seg+1;d=a+seg+1
                faces.append((a,b,c,d) if shell==0 else (d,c,b,a));mats.append(shell)
        for j,reverse in ((0,True),(len(xs)-1,False)):
            ring=[shell*stride+j*(seg+1)+i for i in range(seg)]
            if shell==0 and j==len(xs)-1:
                tip=len(verts);verts.append((xs[-1]+.004,0,centers[-1]))
                for i in range(seg):faces.append((ring[i],ring[(i+1)%seg],tip));mats.append(shell)
            else:
                faces.append(tuple(reversed(ring)) if reverse!=(shell==1) else tuple(ring));mats.append(shell)
    for j in range(len(xs)-1):
        if rs[j] <= cut-centers[j] and rs[j+1] <= cut-centers[j+1]:
            continue
        for i in (0,seg):
            a=j*(seg+1)+i;b=(j+1)*(seg+1)+i
            faces.append((a,b,b+stride,a+stride) if i==0 else (a+stride,b+stride,b,a));mats.append(0)
    o=Mesh('GourdLadle_ContinuousShell',verts,faces,gourd,parent);o.data.materials.append(gourdInner)
    for p,idx in zip(o.data.polygons,mats):p.material_index=idx;p.use_smooth=True
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    deg=[f for f in bm.faces if f.calc_area()<1e-12]
    if deg:bmesh.ops.delete(bm,geom=deg,context='FACES')
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bm.verts.index_update()
    faceGroups={}
    for f in bm.faces:faceGroups.setdefault(tuple(sorted(v.index for v in f.verts)),[]).append(f)
    folded=[f for group in faceGroups.values() if len(group)>1 for f in group]
    if folded:bmesh.ops.delete(bm,geom=folded,context='FACES')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.validate(verbose=True);o.data.update()
    o['construction']='One continuous dried gourd shell; irregular oval cut mouth and integral natural neck'
    return o

def State(opened):
    root=Root('WaterVatSet_Opened' if opened else 'WaterVatSet_Intact');root['source_credit']=credit;root['historical_note']='C selected by user; finish, repairs, exact dimensions and assembly are reconstruction'
    root['surface_source_sha256']=json.dumps(sourceHashes);root['surface_detail_revision']='LidMaterialAtlas20261102'
    vat=Vat(root);RolledRim(root);Repair(root,vat);lid=Lid(root,opened);ladleRoot=Root('LadlePose',root);ladle=Gourd(ladleRoot)
    if opened:
        ladleRoot.location=(.12,0,.904);ladleRoot.rotation_euler.y=math.radians(-1.5)
        # The inside wall at .85 m is measured on the reused/morphed source.
        bpy.context.view_layer.update();tree=BVHTree.FromObject(vat,bpy.context.evaluated_depsgraph_get())
        radii=[]
        waterSegments=128
        for i in range(waterSegments):
            a=math.tau*i/waterSegments;direction=Vector((math.cos(a),math.sin(a),0));hit,n,idx,d=tree.ray_cast(Vector((0,0,.85)),direction,.7)
            if hit is None:raise RuntimeError('Water boundary ray missed the inner wall')
            radii.append(math.hypot(hit.x,hit.y)+.001)
        verts=[(0,0,.85)]+[(r*math.cos(math.tau*i/waterSegments),r*math.sin(math.tau*i/waterSegments),.85) for i,r in enumerate(radii)]
        Mesh('WaterSurface',verts,[(0,i+1,(i+1)%waterSegments+1) for i in range(waterSegments)],water,root)
    else:ladleRoot.location=(.04,0,1.014);ladleRoot.rotation_euler.y=math.radians(16)
    return root

closed=State(False);opened=State(True)

def LidUv(region,u,v):
    x0,y0,x1,y1=lidAtlasRegions[region]
    return ((x0+.5+u*(x1-x0-1))/4096,1-(y1-.5-v*(y1-y0-1))/2048)

def Finish(root):
    for ob in list(Children(root)):
        if ob.type not in ('MESH','CURVE'):continue
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        if ob.type=='CURVE':bpy.ops.object.convert(target='MESH');ob=bpy.context.object
        for m in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=m.name)
        mesh=ob.data;bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces))
        deg=[f for f in bm.faces if f.calc_area()<1e-13]
        if deg:bmesh.ops.delete(bm,geom=deg,context='FACES')
        bm.to_mesh(mesh);bm.free();mesh.update()
        uv=mesh.uv_layers.active or mesh.uv_layers.new(name='K11SurfaceUV')
        for face in mesh.polygons:
            pts=[mesh.vertices[mesh.loops[i].vertex_index].co for i in face.loop_indices];n=face.normal
            cyl=False
            if mesh.materials[face.material_index]==lidSurface:
                if ob.name.startswith('LidPlank'):
                    if n.z>.35:coords=[LidUv('Top',p.x/.72+.5,p.y/.72+.5) for p in pts]
                    else:
                        boardIndex=int(ob.name.split('_')[1].split('.')[0]);edgeBounds=[x*.330/.358 for x in [-.358,-.235,-.114,.004,.116,.236,.358]]
                        left,right=edgeBounds[boardIndex:boardIndex+2]
                        coords=[LidUv('End',.1+.8*(p.x-left)/(right-left),.2+.6*p.z/.024) for p in pts]
                elif ob.name.startswith('LidBatten'):
                    k=int(ob.name.split('_')[1].split('.')[0]);center=(-.18,.18)[k]
                    if abs(n.y)>.65:coords=[LidUv('End',(p.x-center)/.060+.5,(p.z-.024)/.026) for p in pts]
                    else:coords=[LidUv('Batten'+str(k),(p.x-center)/.060+.5 if abs(n.z)>=abs(n.x) else (p.z-.024)/.026,p.y/.470+.5) for p in pts]
                elif ob.name.startswith('LidFrame'):
                    local=[(math.atan2(p.y,p.x)/math.tau%1,math.atan2(p.z-.021,math.hypot(p.x,p.y)-.344)/math.tau%1) for p in pts]
                    for axis in (0,1):
                        if max(c[axis] for c in local)-min(c[axis] for c in local)>.5:local=[tuple(value+1 if a==axis and value<.5 else value for a,value in enumerate(c)) for c in local]
                    coords=[LidUv('Frame',u,v) for u,v in local]
                else:
                    axis=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=axis];coords=[LidUv('End',p[axes[0]]/.012+.5,p[axes[1]]/.012+.5) for p in pts]
            elif ob.name.startswith('ClayWaterVat') and abs(n.z)<.80:
                coords=[(math.atan2(p.y,p.x)/math.tau%1,p.z/.9) for p in pts];cyl=True
            elif ob.name.startswith('LidFrame'):
                coords=[(math.atan2(p.z-.021,math.hypot(p.x,p.y)-.344)/math.tau%1,math.atan2(p.y,p.x)/math.tau%1) for p in pts]
                for axis in (0,1):
                    if max(c[axis] for c in coords)-min(c[axis] for c in coords)>.5:coords=[tuple(value+1 if a==axis and value<.5 else value for a,value in enumerate(c)) for c in coords]
                coords=[(u*(math.tau*.014/.32),v*(math.tau*.344/.72)) for u,v in coords]
            elif ob.name.startswith('GourdLadle'):
                coords=[(math.atan2(p.y,p.z)/math.tau%1,(p.x+.1)/.4) for p in pts];cyl=True
            else:
                axis=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=axis]
                # Grain follows board Y. Different board cuts see different
                # source regions, with proper UV for edge and end-grain faces.
                scale=(.12,.12) if mesh.materials[face.material_index]==woodEnd else ((.32,.72) if 'Lid' in ob.name else (.5,.5))
                coords=[(p[axes[0]]/scale[0]+.51,p[axes[1]]/scale[1]+.49) for p in pts]
            if ob.name.startswith('LidPlank') and mesh.materials[face.material_index]!=lidSurface:
                boardIndex=int(ob.name.split('_')[1].split('.')[0]);coords=[(u+boardIndex*.193,v-boardIndex*.127) for u,v in coords]
            if cyl and max(c[0] for c in coords)-min(c[0] for c in coords)>.5:coords=[(u+1 if u<.5 else u,v) for u,v in coords]
            a,b,c=coords;area=abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
            if area<1e-12:
                axis=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=axis];coords=[(p[axes[0]]/.5,p[axes[1]]/.5) for p in pts]
                if mesh.materials[face.material_index]==lidSurface:
                    center=sum(pts,Vector())/3;coords=[LidUv('End',(p[axes[0]]-center[axes[0]])/.12+.5,(p[axes[1]]-center[axes[1]])/.12+.5) for p in pts]
            for li,c in zip(face.loop_indices,coords):uv.data[li].uv=c
        mesh.update();mesh.calc_tangents(uvmap=uv.name)
        if any(not all(math.isfinite(x) for x in l.tangent) or l.tangent.length<.5 for l in mesh.loops):raise RuntimeError('Invalid tangents '+ob.name)
        mesh.free_tangents()

def BakePhysicalSize(root):
    # Keep each lid and ladle canonical geometry identical across states.
    # Scale in the part's own basis, then move that rigid part into its pose.
    physical=Matrix.Diagonal((1.05,1.05,.86/.9,1.0))
    objects=Children(root);original={o:o.matrix_world.copy() for o in objects};groups={}
    for o in objects:
        group=root;ancestor=o
        while ancestor is not None and ancestor!=root:
            if ancestor.type=='EMPTY' and ancestor.name.startswith(('Lid_','LadlePose')):
                group=ancestor;break
            ancestor=ancestor.parent
        groups[o]=group
    groupTargets={g:Matrix.Translation(physical@original[g].translation)@original[g].to_quaternion().to_matrix().to_4x4() for g in set(groups.values())}
    targets={}
    for o in objects:
        relative=original[groups[o]].inverted()@original[o]
        targets[o]=groupTargets[groups[o]]@Matrix.Translation(physical@relative.translation)@relative.to_quaternion().to_matrix().to_4x4()
    for o in objects:
        if o.type=='MESH':
            transform=targets[o].inverted()@groupTargets[groups[o]]@physical@original[groups[o]].inverted()@original[o]
            o.data.transform(transform);o.data.update()
        o.matrix_world=targets[o];bpy.context.view_layer.update()
    for o in objects:
        if o.type=='MESH':o.data.calc_tangents(uvmap=o.data.uv_layers.active.name);o.data.free_tangents()
    root['physical_size_note']='Vat actual diameter 0.84m, height 0.86m, refined from approximate 0.8m / 0.9m to C proportions; unit node scales; lid and ladle shapes remain rigid across states.'

Finish(closed);Finish(opened);bpy.context.view_layer.update()
BakePhysicalSize(closed);BakePhysicalSize(opened);bpy.context.view_layer.update()

def BakeGourdObjectSurface():
    # Replace the cylindrical angle pole with a unique chart atlas. Object-space
    # box blending is baked into ordinary glTF maps, so UV seams do not become
    # visible colour seams and no runtime triplanar shader is required.
    target=next(o for o in Children(closed) if o.name.startswith('GourdLadle'))
    counterpart=next(o for o in Children(opened) if o.name.startswith('GourdLadle'))
    if preservedGourdDirectory.is_dir():
        record=json.loads((preservedGourdDirectory/'Data_PreservedSurface.json').read_text(encoding='utf8'))
        uvFile=preservedGourdDirectory/record['uvFile']
        assert hashlib.sha256(uvFile.read_bytes()).hexdigest()==record['uvSha256']
        saved=np.load(uvFile);positions=saved['positions'];oldLoops=saved['loopVertex'];oldUv=saved['uv']
        for ob in (target,counterpart):
            current=np.asarray([v.co[:] for v in ob.data.vertices],np.float32)
            assert current.shape==positions.shape and np.max(abs(current-positions))<.000002,'Preserved gourd geometry no longer matches'
            loops=np.asarray([l.vertex_index for l in ob.data.loops],np.int32)
            assert np.array_equal(loops,oldLoops),'Preserved gourd topology no longer matches'
            for a,b in zip(ob.data.uv_layers.active.data,oldUv):a.uv=b
            ob.data.calc_tangents(uvmap=ob.data.uv_layers.active.name);ob.data.free_tangents()
        # Both old material regions use the same already-baked atlas.
        images={}
        for node in gourd.node_tree.nodes:
            if node.type=='TEX_IMAGE':images['Normal' if 'Normal' in node.image.name else ('Orm' if 'Orm' in node.image.name else 'Base')]=node.image
        for node in gourdInner.node_tree.nodes:
            if node.type=='TEX_IMAGE':node.image=images['Normal' if 'Normal' in node.image.name else ('Orm' if 'Orm' in node.image.name else 'Base')]
        info=dict(record['bakeInfo']);info['preservedFrom']=record['source'];info['preservedUvSha256']=record['uvSha256'];info['preservedMapSha256']=record['images']
        recipe=json.loads((out/'Data_SurfaceDetailRecipe.json').read_text(encoding='utf8'));recipe['gourdObjectSurfaceBake']=info
        (out/'Data_SurfaceDetailRecipe.json').write_text(json.dumps(recipe,ensure_ascii=False,indent=2),encoding='utf8');(out/'Data_GourdObjectSurfaceBake.json').write_text(json.dumps(info,indent=2),encoding='utf8')
        return info
    for o in bpy.context.scene.objects:o.select_set(False)
    target.select_set(True);bpy.context.view_layer.objects.active=target
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.025,area_weight=0)
    bpy.ops.uv.average_islands_scale();bpy.ops.uv.pack_islands(rotate=True,margin=.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    assert [l.vertex_index for l in target.data.loops]==[l.vertex_index for l in counterpart.data.loops]
    uv=target.data.uv_layers.active;other=counterpart.data.uv_layers.active
    for a,b in zip(uv.data,other.data):b.uv=a.uv
    for ob in (target,counterpart):ob.data.calc_tangents(uvmap=ob.data.uv_layers.active.name);ob.data.free_tangents()
    recipe=json.loads((out/'Data_SurfaceDetailRecipe.json').read_text(encoding='utf8'))
    originalMaterials=[gourd,gourdInner];kinds=['Gourd','GourdInner'];sources=[]
    for mat,kind in zip(originalMaterials,kinds):
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;nodes.clear()
        output=nodes.new('ShaderNodeOutputMaterial');bsdf=nodes.new('ShaderNodeBsdfPrincipled');bsdf.inputs['Roughness'].default_value=.8
        links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
        coord=nodes.new('ShaderNodeTexCoord');scale=nodes.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs['Scale'].default_value=1/.30;links.new(coord.outputs['Object'],scale.inputs[0])
        imageNodes={}
        for channel in ('Base','Orm','Height'):
            tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(out/('Texture_K11_'+kind+'Source'+channel+'.png')),check_existing=True)
            tex.image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';tex.image.pack();tex.projection='BOX';tex.projection_blend=.35;tex.extension='REPEAT';links.new(scale.outputs['Vector'],tex.inputs['Vector']);imageNodes[channel]=tex
        bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=1
        low,high=recipe['maps'][kind]['heightRange_m'];bump.inputs['Distance'].default_value=high-low
        links.new(imageNodes['Height'].outputs['Color'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal']);links.new(imageNodes['Base'].outputs['Color'],bsdf.inputs['Base Color'])
        emission=nodes.new('ShaderNodeEmission');bakeNode=nodes.new('ShaderNodeTexImage');nodes.active=bakeNode
        sources.append({'mat':mat,'output':output,'bsdf':bsdf,'images':imageNodes,'emission':emission,'target':bakeNode})
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.bake.margin=16;scene.render.bake.use_selected_to_active=False
    baked={};size=2048;normalRepair={}
    for channel in ('Base','Orm','Normal'):
        for old in list(bpy.data.images):
            if old.users==0 and Path(old.filepath).name=='Texture_K11_Gourd'+channel+'.png':bpy.data.images.remove(old)
        path=out/('Texture_K11_Gourd'+channel+'.png');im=bpy.data.images.new(path.stem,size,size,alpha=False)
        im.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color'
        background={'Base':(.18,.14,.08,1),'Orm':(1,.85,0,1),'Normal':(.5,.5,1,1)}[channel]
        pixels=np.tile(np.array(background,np.float32),(size*size,1));im.pixels.foreach_set(pixels.ravel());im.update();del pixels
        for sourceMat in sources:
            nodes=sourceMat['mat'].node_tree.nodes;links=sourceMat['mat'].node_tree.links;output=sourceMat['output']
            for link in list(output.inputs['Surface'].links):links.remove(link)
            if channel=='Normal':links.new(sourceMat['bsdf'].outputs['BSDF'],output.inputs['Surface'])
            else:
                links.new(sourceMat['images'][channel].outputs['Color'],sourceMat['emission'].inputs['Color']);links.new(sourceMat['emission'].outputs['Emission'],output.inputs['Surface'])
            sourceMat['target'].image=im;nodes.active=sourceMat['target']
        bpy.ops.object.bake(type='NORMAL' if channel=='Normal' else 'EMIT',normal_space='TANGENT',use_clear=False,margin=16)
        if channel=='Normal':
            # Bake chart transitions can average vectors or return the back
            # hemisphere near thin rims. Runtime height-field normals must be
            # unit vectors in the front hemisphere; do not relax the audit.
            rgba=np.array(im.pixels[:],np.float32).reshape(size,size,4);vector=rgba[:,:,:3]*2-1;length=np.linalg.norm(vector,axis=2)
            weak=length<.25;back=vector[:,:,2]<0
            normalRepair={'backHemispherePixels':int(back.sum()),'nearZeroPixels':int(weak.sum()),'renormalized':True}
            vector[:,:,2]=np.abs(vector[:,:,2]);vector[weak]=np.array([0,0,1],np.float32);vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-8)
            rgba[:,:,:3]=vector*.5+.5;rgba[:,:,3]=1;im.pixels.foreach_set(rgba.ravel());im.update()
        im.filepath_raw=str(path);im.file_format='PNG';im.save();im.pack();baked[channel]=im
        print('GOURD_BOX_BAKED',channel,str(path))
    # Both material regions occupy one unique atlas. Preserve material names
    # while replacing temporary source graphs with standard Base/Normal/ORM.
    for sourceMat,kind in zip(sources,kinds):
        old=sourceMat['mat'];name=old.name;old.name=name+'_ObjectSource';old.use_fake_user=True
        # Inner and outer share baked images; their independent source colour,
        # pith relief and roughness have already been evaluated into UV regions.
        replacement=Material(name,'Gourd',normalStrength=1)
        if kind=='GourdInner':
            for node in replacement.node_tree.nodes:
                if node.type=='TEX_IMAGE':
                    channel='Normal' if 'Normal' in node.image.name else ('Orm' if 'Orm' in node.image.name else 'Base')
                    node.image=baked[channel]
        for ob in (target,counterpart):
            for i,slot in enumerate(ob.data.materials):
                if slot==old:ob.data.materials[i]=replacement
    data=np.array(baked['Normal'].pixels[:],np.float32).reshape(size,size,4);normalStd=(data[:,:,:2]*2-1).std((0,1))
    assert normalStd.min()>.002,('Gourd baked normal unexpectedly flat',normalStd)
    info={'uv':'unique Smart UV atlas, no cylindrical pole','surfaceSampling':'object-space box blend 0.35 at 0.30 metre period, baked offline','source':'Lovart exterior; retained pith source','maps':['Base','Normal','Orm'],'pixels':[size,size],'normalRgStd':normalStd.tolist(),'normalAtlasRepair':normalRepair,'sameUvAtlasAcrossStates':True,'heightPngNote':'GourdSourceHeight/GourdInnerSourceHeight are the flat source relief; runtime uses the baked normal atlas.'}
    recipe['gourdObjectSurfaceBake']=info;(out/'Data_SurfaceDetailRecipe.json').write_text(json.dumps(recipe,ensure_ascii=False,indent=2),encoding='utf8')
    (out/'Data_GourdObjectSurfaceBake.json').write_text(json.dumps(info,indent=2),encoding='utf8')
    return info

gourdSurfaceBake=BakeGourdObjectSurface()
# Make the opened lid rest on the floor; shift it until its top contacts the
# actual jar, using evaluated source geometry rather than a nominal radius.
lid=next(o for o in Children(opened) if o.name=='Lid_Opened')
points=[o.matrix_world@v.co for o in Children(lid) if o.type=='MESH' for v in o.data.vertices]
lid.location.z-=min(p.z for p in points);bpy.context.view_layer.update()
# Closed gourd fits its rounded bulb and integral neck onto the actual lid.
pose=next(o for o in Children(closed) if o.name=='LadlePose');g=next(o for o in Children(pose) if o.type=='MESH')
lidRoot=next(o for o in Children(closed) if o.name=='Lid_Closed')
lidBoards=[o for o in Children(lidRoot) if o.type=='MESH' and o.name.startswith('LidPlank')]
def WorldTree(objects):
    verts=[];faces=[]
    for o in objects:
        off=len(verts);verts.extend(o.matrix_world@v.co for v in o.data.vertices);faces.extend(tuple(off+i for i in f.vertices) for f in o.data.polygons)
    return BVHTree.FromPolygons(verts,faces,all_triangles=True)
def FitClearance(movingRoot, staticMeshes, direction, maximum, requireContact=False):
    moving=[o for o in Children(movingRoot) if o.type=='MESH']
    fixed=WorldTree(staticMeshes);start=movingRoot.location.copy();direction=Vector(direction)
    def Intersects(amount):
        movingRoot.location=start+direction*amount;bpy.context.view_layer.update()
        return bool(fixed.overlap(WorldTree(moving)))
    clearAtStart=not Intersects(0)
    if clearAtStart and not requireContact:return {'shift_m':0.0,'triangle_intersections':0}
    if clearAtStart:
        low,high=-maximum,0.
        if not Intersects(low):raise RuntimeError('Cannot bracket physical contact for '+movingRoot.name)
    else:
        low,high=0.,maximum
        if Intersects(high):raise RuntimeError('Cannot bracket physical clearance for '+movingRoot.name)
    for _ in range(23):
        mid=(low+high)*.5
        if Intersects(mid):low=mid
        else:high=mid
    Intersects(high+.00001)
    if fixed.overlap(WorldTree(moving)):raise RuntimeError('Assembly intersection remains: '+movingRoot.name)
    return {'shift_m':high+.00001,'triangle_intersections':0}

closedJar=[o for o in Children(closed) if o.type=='MESH' and o.name.startswith('ClayWaterVat')]
openedJar=[o for o in Children(opened) if o.type=='MESH' and o.name.startswith('ClayWaterVat')]
contactReport={}
contactReport['closed_lid']=FitClearance(lidRoot,closedJar,(0,0,1),.05,True)
contactReport['opened_lid']=FitClearance(lid,openedJar,(-1,0,0),.15,True)
lidTree=WorldTree([o for o in Children(lidRoot) if o.type=='MESH'])
def StoredSupports(angle,apply=False):
    pose.rotation_euler.y=angle;pose.location=(.042,0,0);bpy.context.view_layer.update()
    support={'bulb':[],'neck':[]}
    for v in g.data.vertices:
        p=g.matrix_world@v.co
        if abs(p.x)<.35 and abs(p.y)<.12:
            hit,n,idx,d=lidTree.ray_cast(Vector((p.x,p.y,1.3)),Vector((0,0,-1)),.7)
            if hit is not None:support['bulb' if v.co.x<.0945 else 'neck'].append(hit.z-p.z)
    bulb,neck=max(support['bulb']),max(support['neck'])
    if apply:pose.location.z=max(bulb,neck)+.00002;bpy.context.view_layer.update()
    return bulb-neck
lowAngle,highAngle=math.radians(-10),math.radians(35)
if StoredSupports(lowAngle)*StoredSupports(highAngle)>0:raise RuntimeError('Cannot bracket two-support gourd pose')
for i in range(24):
    angle=(lowAngle+highAngle)*.5
    if StoredSupports(angle)>0:lowAngle=angle
    else:highAngle=angle
StoredSupports((lowAngle+highAngle)*.5,True)
contactReport['stored_support_angle_degrees']=math.degrees(pose.rotation_euler.y)
contactReport['stored_gourd']=FitClearance(pose,[o for o in Children(lidRoot) if o.type=='MESH'],(0,0,1),.05)
openedPose=next(o for o in Children(opened) if o.name.startswith('LadlePose'))
contactReport['floating_gourd']=FitClearance(openedPose,openedJar,(0,0,1),.06)
gourdObject=next(o for o in Children(openedPose) if o.type=='MESH')
contactReport['floating_gourd']['immersion_m']=.85*(.86/.9)-min((gourdObject.matrix_world@v.co).z for v in gourdObject.data.vertices)
if contactReport['floating_gourd']['immersion_m']<=0:raise RuntimeError('Ladle must retain water immersion')



def Measure(root):
    points=[];tris=0;mats=set()
    for o in Children(root):
        if o.type!='MESH':continue
        points.extend(o.matrix_world@v.co for v in o.data.vertices);tris+=len(o.data.polygons);mats.update(m.name for m in o.data.materials)
    if not points:return None
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    return dict(bounds_blender_m=[lo,hi],dimensions_blender_m=[hi[i]-lo[i] for i in range(3)],triangles=tris,materials=sorted(mats))

def Manifold(o):
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    result=dict(signed_volume_m3=bm.calc_volume(signed=True),vertices=len(bm.verts),edges=len(bm.edges),boundary_edges=sum(len(e.link_faces)==1 for e in bm.edges),nonmanifold_edges=sum(len(e.link_faces)!=2 for e in bm.edges));bm.free();return result

report=dict(physical_size_basis={'requirement_approx_m':{'diameter':.8,'height':.9},'C_refined_actual_m':{'diameter':.84,'height':.86},'baked_size_factors':[1.05,1.05,.86/.9],'placement_scale_used':False,'rigid_parts_preserved_across_states':True},contact_fit=contactReport,source_glb=str(source),source_glb_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),builder_sha256=hashlib.sha256((repo/'Taierzhuang1938/_blender/VillageInteriorProps/Build_K11_WaterVatSet.py').read_bytes()).hexdigest(),source_credit=licensePath.read_text(encoding='utf-8'),surface_source_paths={k:str(v) for k,v in surfaceSourcePaths.items()},surface_source_sha256=sourceHashes,surface_detail_recipe=json.loads((out/'Data_SurfaceDetailRecipe.json').read_text(encoding='utf-8')),selected_concept=str(base/'Concept/K11_C.png'),reconstruction='C silhouette adjustment, glaze abrasion, timber construction, integral gourd shell, repair and water level are creative reconstruction.',coordinate='metres; Blender Z-up/front +Y; glTF Y-up/front -Z; origin at vat bottom centre',states={})
report['geometry_revision']={'id':'DenseReference20261102','local_review_triangle_limit':reviewTriangleLimit,'prior_review_triangles':{'Intact':7924,'Opened':7988},'authorization':'User requested more geometric detail and less polygonal appearance, plus continued material matching to concept C. Local review only; no runtime integration.','vat':'Hermite reference profile; retained shell with applied Catmull-Clark level 1; removed decimation','lip_segments':[160,24],'gourd_profile_and_cross_segments':[64,64],'lid':'16 arc samples per plank end, subdivided physically warped caps, 4-segment bevels, stable broad-face normals','water_circle_segments':128}
for root in (closed,opened):
    bpy.context.view_layer.update();info=Measure(root)
    vat=next(o for o in Children(root) if o.name.startswith('ClayWaterVat'));info['vat_manifold']=Manifold(vat)
    if info['vat_manifold']['nonmanifold_edges']:raise RuntimeError('Vat geometric shell is not closed')
    info['gourd_manifold']=Manifold(next(o for o in Children(root) if o.name.startswith('GourdLadle')))
    if info['gourd_manifold']['nonmanifold_edges']:raise RuntimeError('Gourd shell must be manifold: '+str(info['gourd_manifold']))
    info['nodes']={o.name:Measure(o) for o in Children(root) if o.type in ('MESH','EMPTY') and Measure(o)}
    if info['triangles']>reviewTriangleLimit:raise RuntimeError('Set exceeds the user-authorized dense review geometry limit: '+str(info['triangles']))
    bpy.ops.object.select_all(action='DESELECT')
    for o in Children(root):o.select_set(True)
    bpy.context.view_layer.objects.active=root
    path=out/('Model_K11_'+root.name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_tangents=True,export_apply=True,export_extras=True,export_animations=False)
    info['glb']=str(path);info['bytes']=path.stat().st_size;report['states'][root.name]=info
for o in Children(opened):o.hide_set(True);o.hide_render=True
blend=out/'Scene_K11_WaterVatSet_C.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));report['blend']=str(blend)
(out/'Data_K11_ModelReport.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('K11_OUTPUT_DIRECTORY',str(out));print('K11_SUMMARY',json.dumps({k:{x:v[x] for x in ('triangles','dimensions_blender_m','bytes','vat_manifold')} for k,v in report['states'].items()}))
