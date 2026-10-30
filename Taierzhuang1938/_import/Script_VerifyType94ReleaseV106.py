"""Independent byte/JSON and Pillow pixel audit of canonical packaging."""
from pathlib import Path
import hashlib,io,json,struct,numpy as np
from PIL import Image
repo=Path(__file__).resolve().parents[2];folder=repo/'Taierzhuang1938/Model/Type94Tankette';record=json.loads((folder/'Data_ReleaseV106.json').read_text());checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
def Read(file):
    raw=Path(file).read_bytes();assert raw[:4]==b'glTF'and struct.unpack_from('<I',raw,8)[0]==len(raw);n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
    def View(i):
        v=doc['bufferViews'][i];return binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    return raw,doc,View
a,da,va=Read(record['sourceGlb']);b,db,vb=Read(folder/'Model_Type94Tankette.glb');Check(hashlib.sha256(a).hexdigest()==record['sourceSha256'],'Verified raw source identity');Check(hashlib.sha256(b).hexdigest()==record['output']['sha256'],'Actual canonical packaged identity')
for key in ['nodes','meshes','materials','accessors','scenes','scene','samplers']:Check(da.get(key)==db.get(key),'Exact scene semantics: '+key)
imageViews={i['bufferView']for i in da['images']};Check(len(da['bufferViews'])==len(db['bufferViews']),'Buffer-view count preserved')
for i in range(len(da['bufferViews'])):
    if i not in imageViews:Check(va(i)==vb(i),'Exact non-image buffer bytes: '+str(i))
pixels=[]
for i,(source,target)in enumerate(zip(da['images'],db['images'])):
    x=Image.open(io.BytesIO(va(source['bufferView']))).convert('RGBA');y=Image.open(io.BytesIO(vb(target['bufferView']))).convert('RGBA');same=x.size==y.size and x.tobytes()==y.tobytes();Check(same,'Pillow exact RGBA and dimensions: '+str(i));pixels.append(dict(name=target.get('name'),size=list(y.size),mimeType=target['mimeType'],pixelsExact=same))
def TextureSource(t):return t.get('source',t.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))
Check([TextureSource(t)for t in da['textures']]==[TextureSource(t)for t in db['textures']],'Every actual material texture resolves to the same image index');Check(len(pixels)==12,'Exactly twelve runtime images');Check(sum(n.get('name','').startswith('TrackLink_Left_')for n in db['nodes'])==80 and sum(n.get('name','').startswith('TrackLink_Right_')for n in db['nodes'])==80,'Both actual eighty-link belts retained')
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=record['output']['sha256'],sourceSha256=record['sourceSha256'],images=pixels,wholeReferenceAccepted=False,scope='No geometry/UV/tangent/pose/control/material semantics changed; independent raw RGBA decoding is exact for PNG and WebP. Movement is separately checked in the real browser.')
out=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/DeliveryV106/Acceptance/Data_DeliveryVerificationV106.json');out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),sha256=report['sha256'],failed=[r for r in checks if not r['passed']])));assert report['passed']
