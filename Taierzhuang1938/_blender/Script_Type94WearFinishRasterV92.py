"""Metric paint loss and burnishing on the current V91 atlas.

Inputs are real source faces/UVs. New marks are clipped to those faces; exposed
steel gets a smoother normal and lower roughness, without painted highlights.
"""
from pathlib import Path
import ast,hashlib,json,math,os
import numpy as np
from PIL import Image,ImageDraw

base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=Path(os.environ.get('TYPE94_FINISH_ROOT',str(base/'SurfaceV92')))
folder=root/'Textures/HighSurfaceV92Preview'
data=json.loads((root/'Acceptance/Data_FinishPreparationV92.json').read_text())
size,factor=4096,2
layers={name:Image.new('L',(size*factor,)*2)for name in ['Core','Scuff','Scratch']}
draws={name:ImageDraw.Draw(image)for name,image in layers.items()}
# Reuse only pure geometric clipping and colour-transfer helpers, never the
# older recipe's module-level production or its obsolete geometry records.
path=Path(__file__).with_name('Script_Type94WearRasterV77.py');syntax=ast.parse(path.read_text())
names=['Seed','Pixel','Cross2','Clip','Polygon','Stamp','Linear','Srgb']
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())

edgeMarks=0
for index,edge in enumerate(data['edges']):
    rng=np.random.default_rng(Seed('Finish92'+edge['owner']+str(index)))
    handling=any(s in edge['owner']for s in ['Hatch','Vent','Turret','Nose'])
    probability=.12+.42*edge['exposure']+(.12 if handling else 0)
    count=max(1,math.ceil(edge['lengthM']/.038))
    for part in range(count):
        if rng.random()>probability:continue
        t=(part+rng.uniform(.13,.87))/count
        length=min(edge['lengthM']/count*rng.uniform(.26,.87),.031)
        width=rng.uniform(.0025,.0085)*(1.3 if handling else .8)
        # Shared random morphology on both faces of one physical edge.
        stampSeed=int(rng.integers(0,2**32))
        for segment in edge['segments']:
            a,b=Pixel(segment['uvA']),Pixel(segment['uvB']);density=segment['pixelsPerMetre']*factor
            c=a+(b-a)*t
            Polygon(draws['Core'],c,b-a,length*density,width*density,np.random.default_rng(stampSeed),segment['clipUvTriangles'])
            Polygon(draws['Scuff'],c,b-a,length*density*1.6,width*density*2.2,np.random.default_rng(stampSeed+1),segment['clipUvTriangles'],180)
        edgeMarks+=1

groups={}
for tri in data['paintTriangles']:
    if not any(s in tri['owner']for s in ['Hatch','Vent','Turret']):continue
    p=np.asarray(tri['pointsWorldM']);n=np.cross(p[1]-p[0],p[2]-p[0]);n/=np.linalg.norm(n)
    if n[np.argmax(abs(n))]<0:n=-n
    key=(tri['owner'],*np.rint(n*10000).astype(int),round(float(n@p[0])*10000))
    groups.setdefault(key,[]).append(tri)

handlingMarks=0
for key,triangles in groups.items():
    n=np.asarray(key[1:4],float);n/=np.linalg.norm(n);origin=n*(key[4]/10000)
    u=np.array([0.,1.,0.]);u-=n*(u@n)
    if np.linalg.norm(u)<.1:u=np.array([1.,0.,0.]);u-=n*(u@n)
    u/=np.linalg.norm(u);v=np.cross(n,u);prepared=[];area=0
    for tri in triangles:
        p=np.asarray(tri['pointsWorldM']);xy=np.c_[(p-origin)@u,(p-origin)@v]
        matrix=np.column_stack((xy[1]-xy[0],xy[2]-xy[0]));det=np.linalg.det(matrix)
        if abs(det)>1e-12:prepared.append((tri,xy,np.linalg.inv(matrix)));area+=abs(det)/2
    if not prepared or area<.008:continue
    points=np.vstack([r[1]for r in prepared]);lo,hi=points.min(axis=0),points.max(axis=0)
    rng=np.random.default_rng(Seed('Handling92'+str(key)))
    for mark in range(min(60,int(area*42))):
        centre=rng.uniform(lo,hi);angle=rng.uniform(-math.pi,math.pi)
        direction=np.array([math.cos(angle),math.sin(angle)]);across=np.array([-direction[1],direction[0]])
        length=rng.uniform(.018,.065);width=rng.uniform(.002,.007)
        outline=np.asarray([centre+(direction*math.cos(t)*length+across*math.sin(t)*width)*rng.uniform(.3,.65)for t in np.linspace(0,2*math.pi,15,endpoint=False)])
        Stamp(prepared,outline,'Scuff',int(rng.integers(110,210)))
        for stroke in range(int(rng.integers(2,6))):
            c=centre+across*rng.uniform(-width,width);extent=length*rng.uniform(.4,.95);w=rng.uniform(.0009,.0023)
            polygon=np.asarray([c-direction*extent*.5,c-direction*extent*.25+across*w,c+direction*extent*.5,c+direction*extent*.15-across*w*.7])
            Stamp(prepared,polygon,'Scratch',int(rng.integers(190,255)))
            if rng.random()<.42:Stamp(prepared,polygon,'Core',255)
        handlingMarks+=1

rng=np.random.default_rng(9277)
grain=np.asarray(Image.fromarray(rng.integers(0,256,(1024,1024),dtype=np.uint8)).resize((size,size),Image.Resampling.BICUBIC),dtype=np.float32)/255
fine=rng.random((size,size),dtype=np.float32)
arrays={}
oldFolder=base/'SurfaceV77/Textures/HighSurfaceV77Preview'
for label,image in layers.items():
    fresh=np.asarray(image.resize((size,size),Image.Resampling.LANCZOS),dtype=np.float32)/255
    old=np.asarray(Image.open(oldFolder/('Texture_Type94PaintWear77'+label+'.png')).convert('L'),dtype=np.float32)/255
    if label=='Core':
        # Older fractional wear was visually halfway between paint and steel.
        # Consolidate the broken cores while keeping their irregular outline.
        old=np.clip((old-.035)*1.9,0,1)
        fresh*=np.clip((grain-.16)*3.3+fine*.12,0,1)
    arrays[label]=np.maximum(old,fresh)
core,scuff,scratch=[arrays[k]for k in ['Core','Scuff','Scratch']]
# Some old handling scuffs now break through the coating in broken patches.
# The parent scuff footprints already obey real-face clipping; there is no
# dilation into neighbouring UV islands or continuous white edge outline.
breakthrough=np.clip((scuff-.28)*4,0,1)*np.clip((grain-.48)*9,0,1)
core=np.maximum(core,breakthrough)
loss=np.rint(core*255)/255
# Older chipped regions retain a dark oxidized substrate; only interrupted
# inner lands are freshly rubbed steel. Broad silver scuff islands look like
# pale pigment, so exposed metallic cores occupy a fraction of each loss area.
core=loss*np.clip((grain-.57)*12,0,1)
# The archived 8-bit masks are the actual compositing inputs, including their
# antialias coverage. Quantization must not hide modified sub-byte texels.
core=np.rint(core*255)/255;scuff=np.rint(scuff*255)/255;scratch=np.rint(scratch*255)/255
arrays.update(Core=core,Scuff=scuff,Scratch=scratch,Loss=loss)
primer=np.maximum(np.clip(core*6,0,1)*np.clip((.87-core)*3.5,0,1)*.28,loss*(1-core)*.96)
height=1-loss
arrays.update(Primer=primer,Height=height)
masks={}
for label,pixels in arrays.items():
    file=folder/('Texture_Type94Paint'+label+'V92.png');Image.fromarray(np.rint(pixels*255).astype(np.uint8)).save(file);masks[label]=str(file)

for record in data['inputs'].values():assert hashlib.sha256(Path(record['file']).read_bytes()).hexdigest()==record['sha256']
inputBase=np.asarray(Image.open(data['inputs']['Base']['file']).convert('RGB'))
orm=np.array(Image.open(data['inputs']['Orm']['file']).convert('RGB'))
normal=np.asarray(Image.open(data['inputs']['Normal']['file']).convert('RGB'),dtype=np.float32)/127.5-1
pigment=Linear(inputBase.astype(np.float32)/255)
pigment*=1-scuff[:,:,None]*.025
oxide=np.array([.041,.037,.026],np.float32)
pigment=pigment*(1-primer[:,:,None])+oxide*primer[:,:,None]
steel=(.33+grain*.105+fine*.012)[:,:,None]*np.array([.94,.98,1.],np.float32)
pigment=pigment*(1-core[:,:,None])+steel*core[:,:,None]
newBase=np.rint(np.clip(Srgb(pigment),0,1)*255).astype(np.uint8)
rough=orm[:,:,1].astype(np.float32)/255
abrasion=np.maximum(scuff*.82,scratch*.84)
rough=rough*(1-abrasion)+(.38+grain*.13)*abrasion
rough=rough*(1-primer)+.66*primer
rough=rough*(1-core)+(.16+grain*.13)*core
metal=orm[:,:,2].astype(np.float32)/255
metal=metal*(1-primer)*(1-core)+.99*core
orm[:,:,1]=np.rint(np.clip(rough,0,1)*255).astype(np.uint8)
orm[:,:,2]=np.rint(np.clip(metal,0,1)*255).astype(np.uint8)

# Smooth the substrate where coating is lost. Keep the shallow recess and
# tooling response; no broad inflated rims or vertex displacement.
flatten=np.maximum(loss*.96,scuff*.40)
normal[:,:,:2]*=(1-flatten[:,:,None]);normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
density=np.load(base/'SurfaceV77/Acceptance/Data_AtlasDensityV77.npy').copy()
densityImage=Image.fromarray(density.astype(np.float32),'F');densityDraw=ImageDraw.Draw(densityImage)
for tri in data['paintTriangles']:
    uv=np.asarray(tri['uv']);p=np.asarray(tri['pointsWorldM'])
    worldArea=np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0]))/2;uvArea=abs(Cross2(uv[1]-uv[0],uv[2]-uv[0]))/2
    densityDraw.polygon([tuple(np.asarray(v)*[size-1,-(size-1)]+[0,size-1])for v in uv],fill=float(size*math.sqrt(uvArea/worldArea)))
density=np.asarray(densityImage)
gy,gx=np.gradient(height)
detail=np.stack((-gx*density*.00002,gy*density*.00002,np.ones_like(density)),axis=-1)
detail/=np.maximum(np.linalg.norm(detail,axis=2,keepdims=True),1e-8)
normal[:,:,2]+=1;detail[:,:,:2]*=-1
normal=normal*(np.sum(normal*detail,axis=2)/np.maximum(normal[:,:,2],1e-8))[:,:,None]-detail
normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
newNormal=np.rint(np.clip(normal*.5+.5,0,1)*255).astype(np.uint8)
# Preserve untouched texels exactly, including 8-bit flat-normal asymmetry.
touched=(loss>0)|(scuff>0)|(scratch>0)
normalOriginal=np.asarray(Image.open(data['inputs']['Normal']['file']).convert('RGB'))
newNormal[~touched]=normalOriginal[~touched];newBase[~touched]=inputBase[~touched]
outputs={}
for channel,pixels in [('Base',newBase),('Orm',orm),('Normal',newNormal)]:
    file=folder/('Texture_Type94Paint'+channel+'FinishV92.png');Image.fromarray(pixels).save(file)
    outputs[channel]=dict(file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
report=dict(outputs=outputs,masks=masks,physicalEdgeMarks=edgeMarks,handlingScuffClusters=handlingMarks,
    opaqueSteelAtlasFraction=float(np.mean(core>.9)),nonzeroSteelAtlasFraction=float(np.mean(core>0)),touchedAtlasFraction=float(np.mean(touched)),
    fullyExposedSteelRoughness=[.16,.29],fullyExposedSteelMetallic=.99,paintLossHeightM=.00002,
    coreNormalSmoothing=.96,oxidizedSubstrateSeparated=True,lossAtlasFraction=float(np.mean(loss>.9)),paintAoUnchanged=True,geometryUvAndRigUnchanged=True,newMarksClippedToSourceFaces=True,
    scope='Inferred selective paint loss and handling scratches; polished steel has a flatter normal and separate conducting response. Damage positions/amount are art direction, not historical evidence.')
(root/'Acceptance/Data_FinishRasterV92.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items()if k not in ['outputs','masks']},indent=2))
