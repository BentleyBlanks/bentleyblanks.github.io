"""Independent on-disk GLB audit; run with normal Python after Blender export."""
import json, struct, math, hashlib
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
asset=repo/'Taierzhuang1938/Model/Character'

def Read(path):
    raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0]
    assert struct.unpack_from('<I',raw,8)[0]==len(raw)
    return json.loads(raw[20:20+size]),raw[28+size:],raw

def Accessor(doc,blob,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    types={5121:('B',1),5123:('H',2),5125:('I',4),5126:('f',4)};fmt,size=types[a['componentType']]
    count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size*count)
    return [struct.unpack_from('<'+fmt*count,blob,offset+i*stride) for i in range(a['count'])]

source,_,_=Read(asset/'Model_TengxianNra05Facial.glb')
doc,blob,raw=Read(asset/'Model_TengxianCivilianWomanReference.glb')
contract=json.loads((asset/'Data_TengxianHumanoid.json').read_text(encoding='utf8'))
src={n['name']:n for n in source['nodes'] if 'name' in n};dst={n['name']:n for n in doc['nodes'] if 'name' in n}
def Parents(d):return {d['nodes'][c].get('name'):n.get('name') for n in d['nodes'] for c in n.get('children',[])}
sp=Parents(source);dp=Parents(doc)
report={'bodyBones':len(contract['bodyBones']),'faceBones':sum(n.startswith('Face_') for n in dst),'maximumBodyTranslationError':0,'maximumBodyQuaternionError':0,'meshes':[],'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
for bone in contract['bodyBones']:
    name=bone['name'];a=src[name];b=dst[name]
    if name!='GroundRoot':assert sp[name]==dp[name],(name,sp[name],dp[name])
    err=max(abs(x-y) for x,y in zip(a.get('translation',[0,0,0]),b.get('translation',[0,0,0])))
    report['maximumBodyTranslationError']=max(err,report['maximumBodyTranslationError'])
    aq=a.get('rotation',[0,0,0,1]);bq=b.get('rotation',[0,0,0,1]);qerr=min(max(abs(x-y) for x,y in zip(aq,bq)),max(abs(x+y) for x,y in zip(aq,bq)))
    report['maximumBodyQuaternionError']=max(qerr,report['maximumBodyQuaternionError'])
    assert err<.00001 and qerr<.00001,(name,err,qerr)
assert report['bodyBones']==53 and report['faceBones']==13,report
assert len(doc['materials'])==3,len(doc['materials'])
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        attrs=primitive['attributes'];assert 'JOINTS_0' in attrs and 'WEIGHTS_0' in attrs
        assert not primitive.get('targets'),'Morph targets are not allowed'
        weights=Accessor(doc,blob,attrs['WEIGHTS_0']);positions=Accessor(doc,blob,attrs['POSITION'])
        error=max(abs(sum(w)-1) for w in weights)
        assert error<.00001,(mesh.get('name'),error)
        assert all(math.isfinite(c) for p in positions for c in p)
        joints=Accessor(doc,blob,attrs['JOINTS_0']);assert max(i for j in joints for i in j)<66
        report['meshes'].append({'name':mesh.get('name'),'vertices':len(positions),'triangles':doc['accessors'][primitive['indices']]['count']//3,'maximumWeightError':error})
assert all('bufferView' in im and not im.get('uri') for im in doc['images'])
assert set(doc['extras']['facialRig']['bones'])=={n for n in dst if n.startswith('Face_')}
report['materials']=len(doc['materials']);report['embeddedImages']=len(doc['images']);report['animations']=[a['name'] for a in doc.get('animations',[])]
print(json.dumps(report,indent=2))
(repo/'tmp/CivilianWomanReference').mkdir(parents=True,exist_ok=True)
(repo/'tmp/CivilianWomanReference/Data_GlbAudit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
