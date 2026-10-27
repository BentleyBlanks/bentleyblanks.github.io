"""Lossless side-by-side AO atlas for scoped hardware and retained wheel bolts."""
import pathlib,os,struct,json,hashlib,io
import numpy as np
from PIL import Image
repo=pathlib.Path(__file__).resolve().parents[2]
asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']);source=pathlib.Path(os.environ['KI4_SOURCE_ROOT'])
base=repo/'tmp/NakajimaKi4/ReferenceV30/Model_NakajimaKi4Gray.glb'
blob=base.read_bytes();length=struct.unpack_from('<I',blob,12)[0];g=json.loads(blob[20:20+length]);binary=blob[28+length:]
material=next(m for m in g['materials'] if m['name']=='Material_OxidizedSteel');slot=material['occlusionTexture'];assert slot['texCoord']==1
image=g['images'][g['textures'][slot['index']]['source']];view=g['bufferViews'][image['bufferView']];old=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
legacy=Image.open(io.BytesIO(old)).convert('RGB');freshPath=source/'Textures/Texture_Ki4HardwareGeometryAoGame.png';fresh=Image.open(freshPath).convert('RGB')
assert fresh.size==(2048,2048)
changed=set(json.loads((asset/'Evidence/Data_HardwareHighAo.json').read_text())['partNames'])
def Accessor(i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]);width={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
    return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
parents={c:n['name'] for n in g['nodes'] for c in n.get('children',[])}
triangles=[];uvByAccessor={}
for ni,node in enumerate(g['nodes']):
    if 'mesh' not in node or not parents[ni].startswith('Pivot_Wheel'):continue
    p=g['meshes'][node['mesh']]['primitives'][0]
    if g['materials'][p['material']]['name']!='Material_OxidizedSteel':continue
    ai=p['attributes']['TEXCOORD_1'];uvByAccessor[ai]=Accessor(ai);ix=Accessor(p['indices']).ravel()
    for r in node['extras']['sourceDeltaParts']:
        rn=r.get('names') or [r['name']]
        if any(n in changed for n in rn):continue
        selected=ix[r['firstIndex']:r['firstIndex']+r['indexCount']]
        triangles.extend([(ai,tuple(map(int,selected[k:k+3]))) for k in range(0,len(selected),3)])
# Repack just the retained bolt islands at their original pixel resolution.
# No resampling of the4096px legacy aircraft atlas is permitted.
uf=list(range(len(triangles)));owners={}
def Find(i):
    while uf[i]!=i:uf[i]=uf[uf[i]];i=uf[i]
    return i
for ti,(ai,indices) in enumerate(triangles):
    for vi in indices:
        key=(ai,vi)
        if key in owners:uf[Find(ti)]=Find(owners[key])
        else:owners[key]=ti
islands={}
for ti,(ai,indices) in enumerate(triangles):
    group=islands.setdefault(Find(ti),set());group.update((ai,vi) for vi in indices)
rectangles=[]
for vertices in islands.values():
    uv=np.array([uvByAccessor[ai][vi] for ai,vi in vertices]);lo=np.floor(uv.min(0)*legacy.size-6).astype(int);hi=np.ceil(uv.max(0)*legacy.size+6).astype(int)
    lo=np.maximum(lo,0);hi=np.minimum(hi,legacy.size);rectangles.append({'vertices':vertices,'lo':lo,'hi':hi,'size':hi-lo})
rectangles.sort(key=lambda r:(-r['size'][1],-r['size'][0]));out=Image.new('RGB',(4096,2048),'white');out.paste(fresh,(0,0));x=y=rowHeight=0;uvMap={};placements=[]
for r in rectangles:
    w,h=map(int,r['size'])
    if x+w>2048:x=0;y+=rowHeight;rowHeight=0
    assert y+h<=2048,'Bolt islands do not fit without resampling'
    lo,hi=r['lo'],r['hi'];patch=legacy.crop((lo[0],lo[1],hi[0],hi[1]));destination=(2048+x,y);out.paste(patch,destination)
    assert np.array_equal(np.asarray(out.crop((*destination,destination[0]+w,destination[1]+h))),np.asarray(patch))
    for ai,vi in r['vertices']:
        u,v=uvByAccessor[ai][vi];uvMap.setdefault(str(ai),{})[str(vi)]=[(2048+x+float(u)*legacy.width-lo[0])/4096,(y+float(v)*legacy.height-lo[1])/2048]
    placements.append({'legacyBoxTopOrigin':[lo.tolist(),hi.tolist()],'newBoxTopOrigin':[2048+x,y,w,h]});x+=w;rowHeight=max(rowHeight,h)
path=source/'Textures/Texture_Ki4HardwareGeometryAoGameCombined.png';out.save(path)
decoded=np.asarray(Image.open(path).convert('RGB'));assert np.array_equal(decoded[:,:2048],np.asarray(fresh))
def Bilinear(p,uv):
    h,w=p.shape[:2];x=float(uv[0])*w-.5;y=float(uv[1])*h-.5;ix=int(np.floor(x));iy=int(np.floor(y));tx=x-ix;ty=y-iy
    at=lambda x,y:p[max(0,min(h-1,y)),max(0,min(w-1,x))].astype(float)
    return (at(ix,iy)*(1-tx)+at(ix+1,iy)*tx)*(1-ty)+(at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx)*ty
legacyPixels=np.asarray(legacy);maxSampleError=0.
for ai,values in uvMap.items():
    for vi,uv in values.items():maxSampleError=max(maxSampleError,float(max(abs(Bilinear(decoded,uv)-Bilinear(legacyPixels,uvByAccessor[int(ai)][int(vi)])))))
assert maxSampleError<1e-6,maxSampleError
sha=lambda data:hashlib.sha256(data).hexdigest()
result={'state':'DecodedRgbExactAoConcatenationAndBoltIslandRepack','path':str(path),'sha256':sha(path.read_bytes()),'freshAoSha256':sha(freshPath.read_bytes()),'legacyAoPayloadSha256':sha(old),'freshUvTransform':[.5,0],'legacyUvByAccessor':uvMap,'boltIslandPlacements':placements,'decodedPixelsExact':True,'maxRetainedUvBilinearByteError':maxSampleError,'scope':'New2048px hardware AO occupies the left half. Only retained wheel-bolt UV islands are copied from the4096px old atlas to the right half at native resolution with6px padding. glTF V uses the image top origin; every old UV sample independently checked. No image resampling; each copied pixel checked exactly. UV1 remaps are explicit, old37 image payloads untouched.'}
for folder in [asset/'Evidence',source/'Evidence']:(folder/'Data_HardwareAoAtlas.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ['legacyUvByAccessor','boltIslandPlacements']}))
