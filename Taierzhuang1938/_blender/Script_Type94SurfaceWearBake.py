"""Deterministic UV edge wear, run with ordinary Python after edge extraction."""
from pathlib import Path
import json,math,hashlib,os,numpy as np
from PIL import Image,ImageDraw
revision=os.environ.get('TYPE94_SURFACE_REVISION','SurfaceV36')
assert revision in ['SurfaceV34','SurfaceV36','SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']
suffix=revision.removeprefix('Surface')
root=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'));folder=root/('Textures/High'+revision);data=json.loads((root/('Acceptance/Data_SurfaceWearEdges'+suffix+'.json')).read_text());size=data['size'];maskScale=2 if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']else 1;mask=Image.new('L',(size*maskScale,size*maskScale));draw=ImageDraw.Draw(mask)
def Noise(point):
 q=np.floor(np.round(point,5)/.0025);v=math.sin(float(q@np.array([127.1,311.7,74.7])))*43758.5453;return v-math.floor(v)
for edge in data['edges']:
 exposure=edge['exposure'];probability=.06+.30*exposure;widthM=.00055+.00085*exposure
 if revision=='SurfaceV36':probability=.12+.40*exposure;widthM=.00085+.0011*exposure
 if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']:probability=.09+.40*exposure;widthM=.00065+.00165*exposure
 for segment in edge['segments']:
  uvA=np.array(segment['uvA']);uvB=np.array(segment['uvB']);a=np.array(segment['localA']);b=np.array(segment['localB']);count=max(1,math.ceil(edge['lengthM']/.0025));pixels=widthM*segment['pixelsPerMetre'];opacity=round(255*(.52+.30*exposure)*min(1,pixels));width=max(1,round(pixels))
  if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']:count=max(1,math.ceil(edge['lengthM']/.0042));opacity=round(255*(.85+.12*exposure))
  for i in range(count):
   t0=i/count;t1=(i+1)/count
   if Noise(a+(b-a)*(t0+t1)/2)>probability:continue
   if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']:
    # Tapered chips with unequal ends, rasterized at 2x then reduced. Metric
    # segment selection is still shared by the two incident UV charts.
    seed=Noise(a+(b-a)*(t0+t1)/2+np.array([.137,.287,.419]))
    start=t0+(t1-t0)*(.04+.22*seed);end=t1-(t1-t0)*(.05+.20*(1-seed))
    u=uvA+(uvB-uvA)*start;v=uvA+(uvB-uvA)*end
    p=np.array([u[0],1-u[1]])*(size-1)*maskScale;q=np.array([v[0],1-v[1]])*(size-1)*maskScale
    delta=q-p;length=np.linalg.norm(delta)
    if length<1e-8:continue
    normal=np.array([-delta[1],delta[0]])/length
    centre=p+delta*(.3+.4*seed);half=pixels*maskScale*(.28+.22*seed)
    polygon=[p,centre+normal*half,q,centre-normal*half*(.55+.35*seed)]
    draw.polygon([tuple(point)for point in polygon],fill=opacity)
   else:
    u=uvA+(uvB-uvA)*t0;v=uvA+(uvB-uvA)*t1;points=[(float(u[0]*(size-1)),float((1-u[1])*(size-1))),(float(v[0]*(size-1)),float((1-v[1])*(size-1)))]
    draw.line(points,fill=opacity,width=width)
if maskScale>1:mask=mask.resize((size,size),Image.Resampling.LANCZOS)
maskFile=folder/'Texture_Type94PaintEdgeWearMask.png';mask.save(maskFile)
m=np.asarray(mask,dtype=np.float32)/255.;base=np.array(Image.open(folder/'Texture_Type94PaintBase.png').convert('RGB'));orm=np.array(Image.open(folder/'Texture_Type94PaintOrm.png').convert('RGB'));originalAo=orm[:,:,0].copy()
def Linear(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def Srgb(v):return np.where(v<=.0031308,v*12.92,1.055*np.maximum(v,0)**(1/2.4)-.055)
for channel,value in enumerate([162,167,160] if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']else[112,118,108]):
 pigment=Linear(base[:,:,channel].astype(np.float32)/255.)
 if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']:pigment=pigment*.62+[.092,.102,.067][channel]*.38
 mixed=pigment*(1-m)+Linear(np.float32(value/255.))*m
 base[:,:,channel]=np.rint(np.clip(Srgb(mixed),0,1)*255).astype(np.uint8)
orm[:,:,1]=np.rint(orm[:,:,1]*(1-m)+.25*255*m).astype(np.uint8);orm[:,:,2]=np.maximum(orm[:,:,2],np.rint((.98 if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']else .92)*255*m).astype(np.uint8));assert np.array_equal(orm[:,:,0],originalAo)
outputs={}
for name,array in [('BaseWear',base),('OrmWear',orm)]:
 file=folder/('Texture_Type94Paint'+name+'.png');Image.fromarray(array).save(file);outputs[name]={'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
report={'method':'Metric-width strokes on the exact UVs of verified convex edges; deterministic local3D breakup. Albedo mixed in linear light; no albedo lighting or AO modification.','inputHashes':{name:hashlib.sha256((folder/name).read_bytes()).hexdigest()for name in ['Texture_Type94PaintBase.png','Texture_Type94PaintOrm.png']},'physicalEdgeCount':len(data['edges']),'affectedAtlasFraction':float(np.mean(m>0)),'meanNonzeroOpacity':float(m[m>0].mean())if np.any(m>0)else 0,'aoBytesUnchanged':True,'mask':str(maskFile),'outputs':outputs,'placementHistoricallyAccepted':False}
if revision in ['SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']:
 report['paintPigmentCompression']={'factor':.38,'towardsLinearRgb':[.092,.102,.067],'purpose':'Keep the olive repaint restrained while preserving the physical normal and roughness detail'}
 report['chipRasterization']='Unequal tapered physical-edge chips, 2x supersampled then LANCZOS reduced to the original 4096px atlas'
(root/('Acceptance/Data_SurfaceWearBake'+suffix+'.json')).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
